import type { Response } from 'express';
import type { SseMessageOut } from '../types.js';

export interface SseManager {
  clients: Set<Response>;
  broadcast: (msg: SseMessageOut) => void;
  broadcastTo: (agentId: string, msg: SseMessageOut) => void;
}

export function createSseManager(): SseManager {
  const clients = new Set<Response>();

  function broadcast(msg: SseMessageOut) {
    const payload = `data: ${JSON.stringify(msg)}\n\n`;
    for (const client of clients) {
      client.write(payload);
    }
  }

  function broadcastTo(agentId: string, msg: SseMessageOut) {
    broadcast({ ...msg, agentId });
  }

  return { clients, broadcast, broadcastTo };
}
