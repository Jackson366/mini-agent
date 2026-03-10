import path from 'path';
import fs from 'fs';
import type { SseMessageOut } from '../types.js';

export function startMcpPoller(
  dataDir: string,
  broadcast: (msg: SseMessageOut) => void,
): void {
  const poll = () => {
    const mcpDir = path.resolve(dataDir, 'mcp-messages');
    if (!fs.existsSync(mcpDir)) return;
    try {
      const files = fs.readdirSync(mcpDir).filter(f => f.endsWith('.json')).sort();
      for (const file of files) {
        const filepath = path.join(mcpDir, file);
        try {
          const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
          fs.unlinkSync(filepath);
          if (data.type === 'message' && data.text) {
            broadcast({ type: 'task_message', text: data.text, taskId: data.taskId, agentId: data.agentId || data.workspace });
          }
        } catch {
          try { fs.unlinkSync(filepath); } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  };

  setInterval(poll, 1000);
}
