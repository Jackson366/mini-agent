import fs from 'fs';
import path from 'path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { MessageStream } from './message-stream.js';
import { createPreCompactHook, createSanitizeBashHook } from './hooks.js';
import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type {
  AgentInput,
  AgentOutput,
  ClarificationOption,
  ClarificationQuestion,
  RunQueryResult,
} from './types.js';
import { AgentRegistry } from './registry.js';

export interface RunAgentOptions {
  input: AgentInput;
  agentDir: string;
  globalDir: string;
  dataDir: string;
  mcpServerPath: string;
  onOutput: (output: AgentOutput) => void;
  onClarification?: (request: {
    toolUseId: string;
    questions: ClarificationQuestion[];
  }) => Promise<Record<string, string>>;
  stream: MessageStream;
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

function loadSubAgents(baseDir: string): Record<string, AgentDefinition> {
  // const agents: Record<string, AgentDefinition> = {};
  // const expertDirs = [
  //   'requirement-analyst',
  //   'platform-operations',
  //   'buyer-domain',
  //   'seller-domain',
  //   'service-provider-domain',
  //   'ui-expert',
  //   'ux-expert',

  // ];
  // for (const id of expertDirs) {
  //   const mdPath = path.join(baseDir, id, 'CLAUDE.md');
  //   if (fs.existsSync(mdPath)) {
  //     agents[id] = {
  //       description: fs.readFileSync(mdPath, 'utf-8').split('\n').slice(0, 3).join(' ').replace(/#/g, '').trim(),
  //       prompt: fs.readFileSync(mdPath, 'utf-8'),
  //       disallowedTools: ['Write', 'Edit'],
  //       model: 'inherit',
  //     };
  //   }
  // }
  return new AgentRegistry().list();
}

export async function runAgent(options: RunAgentOptions): Promise<RunQueryResult> {
  const {
    input,
    agentDir,
    globalDir,
    dataDir,
    mcpServerPath,
    onOutput,
    onClarification,
    stream,
  } = options;

  let newSessionId: string | undefined;
  let lastAssistantUuid: string | undefined;
  let messageCount = 0;
  let resultCount = 0;

  const log = (msg: string) => console.error(`[agent] ${msg}`);

  const isMainAgent = agentDir === globalDir;

  let systemPromptAppend: string | undefined;
  if (!isMainAgent) {
    const globalClaudeMdPath = path.join(globalDir, 'CLAUDE.md');
    if (fs.existsSync(globalClaudeMdPath)) {
      systemPromptAppend = fs.readFileSync(globalClaudeMdPath, 'utf-8');
    }
  }

  const extraDirs: string[] = [];
  if (!isMainAgent && fs.existsSync(globalDir)) {
    extraDirs.push(globalDir);
  }

  const subAgents = isMainAgent ? loadSubAgents(globalDir) : undefined;

  const sdkEnv: Record<string, string | undefined> = { ...process.env };

  const mcpEnv: Record<string, string> = {
    MINI_AGENT_ID: input.agentId,
    MINI_AGENT_DATA_DIR: dataDir,
  };

  const buildOptions = (resume?: string) => ({
    cwd: agentDir,
    additionalDirectories: extraDirs.length > 0 ? extraDirs : undefined,
    resume,
    systemPrompt: systemPromptAppend
      ? { type: 'preset' as const, preset: 'claude_code' as const, append: systemPromptAppend }
      : undefined,
    ...(subAgents && Object.keys(subAgents).length > 0 ? { agents: subAgents } : {}),
    allowedTools: [
      'Bash',
      'Read', 'Write', 'Edit', 'Glob', 'Grep',
      'WebSearch', 'WebFetch',
      'Task', 'TaskOutput', 'TaskStop',
      'SendMessage',
      'TodoWrite', 'ToolSearch', 'Skill',
      'NotebookEdit',
      'AskUserQuestion',
      'mcp__nanoclaw__*',
    ],
    canUseTool: (async (toolName, toolInput, toolOptions) => {
      if (toolName !== 'AskUserQuestion' || !onClarification) {
        return { behavior: 'allow' as const, updatedInput: toolInput };
      }

      const questions = normalizeClarificationQuestions(toolInput);
      if (questions.length === 0) {
        return { behavior: 'allow' as const, updatedInput: toolInput };
      }

      const answers = await onClarification({
        toolUseId: toolOptions.toolUseID,
        questions,
      });

      return {
        behavior: 'allow' as const,
        toolUseID: toolOptions.toolUseID,
        updatedInput: {
          questions: toolInput.questions,
          answers,
        },
      };
    }) satisfies CanUseTool,
    env: {
      ...sdkEnv,
      "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic",
      "ANTHROPIC_AUTH_TOKEN": "d7a8f1c1ca33434ca66897e6010a556e.DYOFlZnzpTNSRQ8h"
    },
    permissionMode: 'bypassPermissions' as const,
    allowDangerouslySkipPermissions: true,
    settingSources: ['project', 'user'] as ('project' | 'user')[],
    mcpServers: {
      nanoclaw: {
        command: mcpServerPath.endsWith('.ts') ? 'tsx' : 'node',
        args: [mcpServerPath],
        env: mcpEnv,
      },
    },
    hooks: {
      PreCompact: [{ hooks: [createPreCompactHook(log, agentDir, input.assistantName)] }],
      PreToolUse: [{ matcher: 'Bash', hooks: [createSanitizeBashHook()] }],
    },
  });

  let resumeId: string | undefined = input.sessionId;
  let retried = false;

  outer: while (true) {
    for await (const message of query({ prompt: stream, options: buildOptions(resumeId) })) {
      messageCount++;
      const msgType = message.type === 'system' ? `system/${(message as { subtype?: string }).subtype}` : message.type;
      log(`[msg #${messageCount}] type=${msgType} message=${JSON.stringify(message)}`);

      if (message.type === 'assistant' && 'uuid' in message) {
        lastAssistantUuid = (message as { uuid: string }).uuid;
      }

      if (message.type === 'system' && message.subtype === 'init') {
        newSessionId = message.session_id;
        log(`Session initialized: ${newSessionId}`);
        onOutput({ status: 'success', result: null, newSessionId });
      }

      if (message.type === 'result') {
        resultCount++;
        const textResult = 'result' in message ? (message as { result?: string }).result : null;
        const errors = 'errors' in message ? (message as { errors?: string[] }).errors : null;
        log(`Result #${resultCount}: subtype=${message.subtype}${textResult ? ` text=${textResult.slice(0, 200)}` : ''}${errors?.length ? ` errors=${JSON.stringify(errors)}` : ''}`);

        if (
          !retried &&
          message.subtype === 'error_during_execution' &&
          errors?.some(e => e.includes('No conversation found with session ID'))
        ) {
          log(`Session not found, retrying as new session`);
          retried = true;
          resumeId = undefined;
          messageCount = 0;
          stream.reset();
          continue outer;
        }

        onOutput({
          status: 'success',
          result: textResult || null,
          newSessionId,
        });
      }
    }
    break;
  }

  log(`Query done. Messages: ${messageCount}, results: ${resultCount}`);
  return { newSessionId, lastAssistantUuid };
}
