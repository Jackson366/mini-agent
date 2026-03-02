import fs from 'fs';
import path from 'path';
import type { HookCallback, PreCompactHookInput, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import {
  formatTranscriptMarkdown,
  generateFallbackName,
  getSessionSummary,
  parseTranscript,
  sanitizeFilename,
} from './transcript.js';

const SECRET_ENV_VARS = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'];
const WRITE_DENY_REASON = 'Permission denied: child agent can read Main but cannot modify Main files.';
const MUTATING_BASH_PATTERN = /\b(rm|mv|cp|mkdir|touch|install|ln|truncate|dd|tee)\b|>>?|sed\s+-i|perl\s+-i/;
const BASH_PATH_TOKEN_PATTERN = /(?:"([^"]+)"|'([^']+)'|([^\s]+))/g;

export function createPreCompactHook(log: (message: string) => void, workspaceDir: string, assistantName?: string): HookCallback {
  return async (input, _toolUseId, _context) => {
    const preCompact = input as PreCompactHookInput;
    const transcriptPath = preCompact.transcript_path;
    const sessionId = preCompact.session_id;

    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
      log('No transcript found for archiving');
      return {};
    }

    try {
      const content = fs.readFileSync(transcriptPath, 'utf-8');
      const messages = parseTranscript(content);

      if (messages.length === 0) {
        log('No messages to archive');
        return {};
      }

      const summary = getSessionSummary(sessionId, transcriptPath, log);
      const name = summary ? sanitizeFilename(summary) : generateFallbackName();

      const conversationsDir = path.join(workspaceDir, 'conversations');
      fs.mkdirSync(conversationsDir, { recursive: true });

      const date = new Date().toISOString().split('T')[0];
      const filename = `${date}-${name}.md`;
      const filePath = path.join(conversationsDir, filename);

      const markdown = formatTranscriptMarkdown(messages, summary, assistantName);
      fs.writeFileSync(filePath, markdown);

      log(`Archived conversation to ${filePath}`);
    } catch (err) {
      log(`Failed to archive transcript: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {};
  };
}

export function createSanitizeBashHook(): HookCallback {
  return async (input, _toolUseId, _context) => {
    const preInput = input as PreToolUseHookInput;
    const command = (preInput.tool_input as { command?: string })?.command;
    if (!command) return {};

    const unsetPrefix = `unset ${SECRET_ENV_VARS.join(' ')} 2>/dev/null; `;
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput: {
          ...(preInput.tool_input as Record<string, unknown>),
          command: unsetPrefix + command,
        },
      },
    };
  };
}

function isPathInside(baseDir: string, targetPath: string): boolean {
  const rel = path.relative(path.resolve(baseDir), path.resolve(targetPath));
  return rel.length === 0 || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function resolveToolPath(candidate: string, cwd: string): string {
  if (path.isAbsolute(candidate)) return path.resolve(candidate);
  return path.resolve(cwd, candidate);
}

function collectPaths(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPaths(item, out);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key.toLowerCase().includes('path') || key.toLowerCase().includes('file')) {
        collectPaths(child, out);
      }
    }
  }
}

function extractBashCandidatePaths(command: string): string[] {
  const result: string[] = [];
  BASH_PATH_TOKEN_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BASH_PATH_TOKEN_PATTERN.exec(command)) !== null) {
    const token = match[1] || match[2] || match[3] || '';
    if (!token) continue;
    if (token.startsWith('-')) continue;
    if (token.includes('://')) continue;
    if (!token.includes('/') && token !== '.' && token !== '..') continue;
    result.push(token);
  }
  return result;
}

function shouldDenyWriteToMain(paths: string[], cwd: string, mainDir: string, agentDir: string): boolean {
  for (const candidate of paths) {
    const resolved = resolveToolPath(candidate, cwd);
    const inMain = isPathInside(mainDir, resolved);
    if (!inMain) continue;
    const inAgent = isPathInside(agentDir, resolved);
    if (!inAgent) return true;
  }
  return false;
}

export function createMainReadOnlyGuardHook(
  log: (message: string) => void,
  agentDir: string,
  mainDir: string,
  isMainAgent: boolean,
): HookCallback {
  return async (input, _toolUseId, _context) => {
    if (isMainAgent) return {};

    const preInput = input as PreToolUseHookInput;
    const toolName = preInput.tool_name;
    const toolInput = preInput.tool_input;

    if (toolName === 'Write' || toolName === 'Edit') {
      const rawPaths: string[] = [];
      collectPaths(toolInput, rawPaths);
      if (rawPaths.length === 0) return {};
      if (shouldDenyWriteToMain(rawPaths, agentDir, mainDir, agentDir)) {
        log(`Blocked ${toolName}: attempted write on Main from child agent`);
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: WRITE_DENY_REASON,
          },
        };
      }
      return {};
    }

    if (toolName === 'Bash') {
      const command = (toolInput as { command?: string })?.command || '';
      if (!command || !MUTATING_BASH_PATTERN.test(command)) return {};

      const bashPaths = extractBashCandidatePaths(command);
      const hasTraversalToParent = command.includes('../');
      const denyByPath = shouldDenyWriteToMain(bashPaths, agentDir, mainDir, agentDir);
      const denyByTraversal = hasTraversalToParent && MUTATING_BASH_PATTERN.test(command);

      if (denyByPath || denyByTraversal) {
        log('Blocked Bash: attempted mutating command on Main from child agent');
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: WRITE_DENY_REASON,
          },
        };
      }
    }

    return {};
  };
}
