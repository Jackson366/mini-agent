export interface AgentInput {
  prompt: string;
  sessionId?: string;
  workspace: string;
  isScheduledTask?: boolean;
  assistantName?: string;
}

export interface AgentOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

export interface ScheduledTask {
  id: string;
  workspace: string;
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
}

export interface SseMessageOut {
  type: 'assistant' | 'status' | 'error' | 'task_message' | 'session';
  text?: string;
  status?: string;
  sessionId?: string;
  taskId?: string;
  workspace?: string;
}
