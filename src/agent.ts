import fs from 'fs';
import path from 'path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { MessageStream } from './message-stream.js';
import { createMainReadOnlyGuardHook, createPreCompactHook, createSanitizeBashHook } from './hooks.js';
import { MAIN_AGENT_ID } from './agent-context.js';
import type { AgentInput, AgentOutput, RunQueryResult } from './types.js';

export interface RunAgentOptions {
  input: AgentInput;
  agentDir: string;
  mainDir: string;
  agentId: string;
  dataDir: string;
  mcpServerPath: string;
  onOutput: (output: AgentOutput) => void;
  stream: MessageStream;
}

export async function runAgent(options: RunAgentOptions): Promise<RunQueryResult> {
  const {
    input,
    agentDir,
    mainDir,
    agentId,
    dataDir,
    mcpServerPath,
    onOutput,
    stream,
  } = options;

  let newSessionId: string | undefined;
  let lastAssistantUuid: string | undefined;
  let messageCount = 0;
  let resultCount = 0;

  const log = (msg: string) => console.error(`[agent] ${msg}`);

  let mainClaudeMd: string | undefined;
  const mainClaudeMdPath = path.join(mainDir, 'CLAUDE.md');
  if (fs.existsSync(mainClaudeMdPath)) {
    mainClaudeMd = fs.readFileSync(mainClaudeMdPath, 'utf-8');
  }

  let agentClaudeMd: string | undefined;
  const agentClaudeMdPath = path.join(agentDir, 'CLAUDE.md');
  if (agentId !== MAIN_AGENT_ID && fs.existsSync(agentClaudeMdPath)) {
    agentClaudeMd = fs.readFileSync(agentClaudeMdPath, 'utf-8');
  }

  const mergedClaudeMd = [mainClaudeMd, agentClaudeMd].filter(Boolean).join('\n\n').trim() || undefined;

  const extraDirs: string[] = [];
  if (mainDir !== agentDir && fs.existsSync(mainDir)) {
    extraDirs.push(mainDir);
  }

  const sdkEnv: Record<string, string | undefined> = { ...process.env };

  const mcpEnv: Record<string, string> = {
    MINI_AGENT_ID: agentId,
    MINI_AGENT_WORKSPACE: agentId,
    MINI_AGENT_DATA_DIR: dataDir,
  };

  const buildOptions = (resume?: string) => ({
    cwd: agentDir,
    additionalDirectories: extraDirs.length > 0 ? extraDirs : undefined,
    resume,
    systemPrompt: mergedClaudeMd
      ? { type: 'preset' as const, preset: 'claude_code' as const, append: mergedClaudeMd }
      : undefined,
    allowedTools: [
      'Bash',
      'Read', 'Write', 'Edit', 'Glob', 'Grep',
      'WebSearch', 'WebFetch',
      'Task', 'TaskOutput', 'TaskStop',
      'TeamCreate', 'TeamDelete', 'SendMessage',
      'TodoWrite', 'ToolSearch', 'Skill',
      'NotebookEdit',
      'mcp__nanoclaw__*',
    ],
    env: {
      ...sdkEnv,
      "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic",
      "ANTHROPIC_AUTH_TOKEN": "d7a8f1c1ca33434ca66897e6010a556e.DYOFlZnzpTNSRQ8h"
    },
    permissionMode: 'acceptEdits' as const,
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
      PreToolUse: [
        { matcher: 'Write', hooks: [createMainReadOnlyGuardHook(log, agentDir, mainDir, agentId === MAIN_AGENT_ID)] },
        { matcher: 'Edit', hooks: [createMainReadOnlyGuardHook(log, agentDir, mainDir, agentId === MAIN_AGENT_ID)] },
        { matcher: 'Bash', hooks: [createMainReadOnlyGuardHook(log, agentDir, mainDir, agentId === MAIN_AGENT_ID), createSanitizeBashHook()] },
      ],
    },
  });

  let resumeId: string | undefined = input.sessionId;
  let retried = false;

  outer: while (true) {
    for await (const message of query({ prompt: stream, options: buildOptions(resumeId) })) {
      messageCount++;
      const msgType = message.type === 'system' ? `system/${(message as { subtype?: string }).subtype}` : message.type;
      log(`[msg #${messageCount}] type=${msgType}`);

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
