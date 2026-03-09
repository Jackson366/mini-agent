import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

export interface AgentInput {
  prompt: string;
  sessionId?: string;
  agentId: string;
  isScheduledTask?: boolean;
  assistantName?: string;
}

export interface AgentOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
  checkpoint?: CheckpointInfo;
}

export interface ClarificationOption {
  label: string;
  description: string;
}

export interface ClarificationQuestion {
  question: string;
  header: string;
  options: ClarificationOption[];
  multiSelect?: boolean;
}

export interface ScheduledTask {
  id: string;
  agent_id: string;
  prompt: string;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;
  context_mode: string;
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  status: string;
  created_at: string;
}

export interface TaskRunLog {
  task_id: string;
  run_at: string;
  duration_ms: number;
  status: string;
  result: string | null;
  error: string | null;
}

export interface SDKUserMessage {
  type: 'user';
  message: { role: 'user'; content: string };
  parent_tool_use_id: null;
  session_id: string;
}

export interface ParsedMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SessionsIndex {
  entries: SessionEntry[];
}

export interface SessionEntry {
  sessionId: string;
  fullPath: string;
  summary: string;
  firstPrompt: string;
}

export interface RunQueryResult {
  newSessionId?: string;
  lastAssistantUuid?: string;
  checkpoints?: CheckpointInfo[];
}

export interface CheckpointInfo {
  checkpointId: string;
  sessionId: string;
  turnIndex: number;
  timestamp: string;
}

export interface CheckpointRecord {
  id: string;
  agent_id: string;
  session_id: string;
  checkpoint_id: string;
  turn_index: number;
  description: string;
  created_at: string;
}

export interface SseMessageOut {
  type: 'assistant' | 'status' | 'error' | 'task_message' | 'session' | 'clarification_request' | 'related_files' | 'checkpoint_created';
  text?: string;
  status?: string;
  sessionId?: string;
  taskId?: string;
  agentId?: string;
  toolUseId?: string;
  questions?: ClarificationQuestion[];
  files?: RelatedFile[];
  checkpoint?: { id: string; checkpointId: string; turnIndex: number; description: string; createdAt: string };
}

export interface RelatedFile {
  path: string;
  name: string;
  language?: string;
}

export interface FilePreviewResponse {
  path: string;
  name: string;
  content: string;
  language: string;
  size: number;
  truncated: boolean;
}

export type AgentRegistrySource = {
  list(): Record<string, AgentDefinition>;
};