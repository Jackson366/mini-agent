import type { MessageStream } from './message-stream.js';
import type { ClarificationQuestion } from './types.js';
import type { SseManager } from './services/sse-manager.js';
import type { StreamFilter } from './services/stream-filter.js';
import type { SessionManager } from './services/session-manager.js';

export interface ServerOptions {
  port: number;
  workspaceBaseDir: string;
  globalDir: string;
  mcpServerPath: string;
  dataDir: string;
}

export interface ActiveSession {
  stream: MessageStream;
  agentId: string;
  pendingClarifications: Map<string, {
    questions: ClarificationQuestion[];
    resolve: (answers: Record<string, string>) => void;
    reject: (err: Error) => void;
  }>;
}

export interface ServerContext {
  options: ServerOptions;
  sseManager: SseManager;
  streamFilter: StreamFilter;
  sessionManager: SessionManager;
}
