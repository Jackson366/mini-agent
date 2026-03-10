import type { ActiveSession } from '../server-context.js';
import type { SseManager } from './sse-manager.js';
import type { StreamFilter } from './stream-filter.js';

export interface SessionManager {
  get: (agentId: string) => ActiveSession | undefined;
  set: (agentId: string, session: ActiveSession) => void;
  delete: (agentId: string) => boolean;
  size: () => number;
  close: (agentId: string, reason: string, options?: { endStream?: boolean; emitIdle?: boolean }) => boolean;
}

export function createSessionManager(
  sseManager: SseManager,
  streamFilter: StreamFilter,
): SessionManager {
  const sessions = new Map<string, ActiveSession>();

  function close(
    agentId: string,
    reason: string,
    options?: { endStream?: boolean; emitIdle?: boolean },
  ): boolean {
    const session = sessions.get(agentId);
    if (!session) return false;

    for (const pending of session.pendingClarifications.values()) {
      pending.reject(new Error(reason));
    }
    session.pendingClarifications.clear();

    if (options?.endStream !== false && !session.stream.isDone()) {
      session.stream.end();
    }

    sessions.delete(agentId);
    streamFilter.delete(agentId);
    if (options?.emitIdle !== false) {
      sseManager.broadcast({ type: 'status', status: 'idle', agentId });
    }
    return true;
  }

  return {
    get: (agentId) => sessions.get(agentId),
    set: (agentId, session) => sessions.set(agentId, session),
    delete: (agentId) => sessions.delete(agentId),
    size: () => sessions.size,
    close,
  };
}
