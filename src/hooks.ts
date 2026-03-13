import fs from 'fs';
import path from 'path';
import type { HookCallback, PreCompactHookInput, PreToolUseHookInput, PostToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import {
  formatTranscriptMarkdown,
  generateFallbackName,
  getSessionSummary,
  parseTranscript,
  sanitizeFilename,
} from './transcript.js';
import type { ClarificationOption, ClarificationQuestion, FileDiffInfo } from './types.js';

const SECRET_ENV_VARS = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'];

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

function normalizeClarificationQuestions(input: Record<string, unknown>): ClarificationQuestion[] {
  const raw = input.questions;
  if (!Array.isArray(raw)) return [];

  const result: ClarificationQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.question !== 'string' || typeof rec.header !== 'string' || !Array.isArray(rec.options)) continue;

    const normalizedOptions: ClarificationOption[] = [];
    for (const opt of rec.options) {
      if (!opt || typeof opt !== 'object') continue;
      const o = opt as Record<string, unknown>;
      if (typeof o.label === 'string' && typeof o.description === 'string') {
        normalizedOptions.push({ label: o.label, description: o.description });
      }
    }
    if (normalizedOptions.length < 2) continue;

    result.push({
      question: rec.question,
      header: rec.header,
      options: normalizedOptions,
      multiSelect: rec.multiSelect ? true : undefined,
    });
  }
  return result;
}

export function createAskUserQuestionHook(
  onClarification?: (request: {
    toolUseId: string;
    questions: ClarificationQuestion[];
  }) => Promise<Record<string, string>>,
): HookCallback {
  return async (input, toolUseId, _context) => {
    if (!onClarification || !toolUseId) return {};

    const preInput = input as PreToolUseHookInput;
    const toolInput = preInput.tool_input as Record<string, unknown>;

    const questions = normalizeClarificationQuestions(toolInput);
    if (questions.length === 0) return {};

    const answers = await onClarification({ toolUseId, questions });

    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput: {
          ...toolInput,
          answers,
        },
      },
    };
  };
}

const FILE_LANG: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
  '.json': 'json', '.md': 'markdown', '.yaml': 'yaml', '.yml': 'yaml',
  '.css': 'css', '.html': 'html', '.py': 'python', '.sh': 'bash',
  '.sql': 'sql', '.xml': 'xml', '.txt': 'plaintext', '.csv': 'csv',
  '.env': 'plaintext', '.toml': 'toml', '.ini': 'ini',
};

export function createPostToolUseHook(
  onFileDiff?: (diff: FileDiffInfo) => void,
): HookCallback {
  return async (input, _toolUseId, _context) => {
    if (!onFileDiff) return {};

    const postInput = input as PostToolUseHookInput;
    const toolName = postInput.tool_name;
    if (toolName !== 'Edit' && toolName !== 'Write') return {};

    const resp = postInput.tool_response as Record<string, unknown> | undefined;
    if (!resp) return {};

    const filePath = (resp.filePath as string) || '';
    if (!filePath) return {};

    const ext = path.extname(filePath).toLowerCase();
    const structuredPatch = resp.structuredPatch as FileDiffInfo['hunks'] | undefined;
    const gitDiff = resp.gitDiff as { additions?: number; deletions?: number } | undefined;

    let additions = gitDiff?.additions ?? 0;
    let deletions = gitDiff?.deletions ?? 0;
    if (!gitDiff && structuredPatch) {
      for (const hunk of structuredPatch) {
        for (const line of hunk.lines) {
          if (line.startsWith('+')) additions++;
          else if (line.startsWith('-')) deletions++;
        }
      }
    }

    let diffType: FileDiffInfo['diffType'];
    if (toolName === 'Edit') {
      diffType = 'edit';
    } else {
      diffType = (resp.type as string) === 'create' ? 'create' : 'update';
    }

    onFileDiff({
      filePath,
      fileName: path.basename(filePath),
      language: FILE_LANG[ext],
      diffType,
      additions,
      deletions,
      hunks: structuredPatch || [],
      timestamp: new Date().toISOString(),
    });

    return {};
  };
}
