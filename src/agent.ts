import fs from 'fs';
import path from 'path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { MessageStream } from './message-stream.js';
import { createPreCompactHook, createSanitizeBashHook, createAskUserQuestionHook, createPostToolUseHook } from './hooks.js';
import type { CanUseTool } from '@anthropic-ai/claude-agent-sdk';
import type {
  AgentInput,
  AgentOutput,
  ClarificationQuestion,
  RunQueryResult,
  StreamDelta,
  FileDiffInfo,
} from './types.js';
import { debug } from 'util';

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
  onStreamDelta?: (delta: StreamDelta) => void;
  onFileDiff?: (diff: FileDiffInfo) => void;
  onTurnEnd?: () => void;
  stream: MessageStream;
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
    onStreamDelta,
    onFileDiff,
    onTurnEnd,
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

  const sdkEnv: Record<string, string | undefined> = { ...process.env };

  const mcpEnv: Record<string, string> = {
    MINI_AGENT_ID: input.agentId,
    MINI_AGENT_DATA_DIR: dataDir,
  };

  const buildOptions = (resume?: string) => ({
    cwd: agentDir,
    debug: true,
    debugFile: './log.txt',
    additionalDirectories: extraDirs.length > 0 ? extraDirs : undefined,
    resume,
    includePartialMessages: true,
    extraArgs: { 'replay-user-messages': null },
    systemPrompt: systemPromptAppend
      ? { type: 'preset' as const, preset: 'claude_code' as const, append: systemPromptAppend }
      : undefined,
    allowedTools: [
      'Bash',
      'Read', 'Write', 'Edit', 'Glob', 'Grep', 'AskUserQuestion',
      'WebSearch', 'WebFetch',
      'Task', 'TaskOutput', 'TaskStop',
      'SendMessage',
      'TodoWrite', 'ToolSearch', 'Skill',
      'AskUserQuestion',
      'mcp__clara__*',
    ],
    canUseTool: (async (_toolName, toolInput, _toolOptions) => {
      return { behavior: 'allow' as const, updatedInput: toolInput };
    }) satisfies CanUseTool,
    env: {
      ...sdkEnv,
      "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic",
      "ANTHROPIC_AUTH_TOKEN": "d7a8f1c1ca33434ca66897e6010a556e.DYOFlZnzpTNSRQ8h",
    },
    permissionMode: 'bypassPermissions' as const,
    allowDangerouslySkipPermissions: true,
    settingSources: ['project', 'user'] as ('project' | 'user')[],
    mcpServers: {
      clara: {
        command: mcpServerPath.endsWith('.ts') ? 'tsx' : 'node',
        args: [mcpServerPath],
        env: mcpEnv,
      },
    },
    hooks: {
      PreCompact: [{ hooks: [createPreCompactHook(log, agentDir, input.assistantName)] }],
      PreToolUse: [
        { matcher: 'Bash', hooks: [createSanitizeBashHook()] },
        { matcher: 'AskUserQuestion', hooks: [createAskUserQuestionHook(onClarification)] },
      ],
      PostToolUse: [{ hooks: [createPostToolUseHook(onFileDiff)] }],
    },
  });

  let resumeId: string | undefined = input.sessionId;
  let retried = false;

  outer: while (true) {
    for await (const message of query({ prompt: stream, options: buildOptions(resumeId) })) {
      console.log('message', JSON.stringify(message));
      messageCount++;
      const msgType = message.type === 'system' ? `system/${(message as { subtype?: string }).subtype}` : message.type;
      log(`[msg #${messageCount}] type=${msgType}`);

      if (message.type === 'assistant' && 'uuid' in message) {
        lastAssistantUuid = (message as { uuid: string }).uuid;
      }

      if (message.type === 'stream_event') {
        const evt = (message as any).event;
        const parentToolUseId = (message as any).parent_tool_use_id;
        if (parentToolUseId !== null) continue;

        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          onStreamDelta?.({ event: 'delta', text: evt.delta.text });
        } else if (evt.type === 'content_block_stop') {
          onStreamDelta?.({ event: 'end' });
        }
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

        onTurnEnd?.();
      }
    }
    break;
  }

  log(`Query done. Messages: ${messageCount}, results: ${resultCount}`);
  return { newSessionId, lastAssistantUuid };
}
