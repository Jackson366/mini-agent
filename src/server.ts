import express from 'express';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { setupSwagger } from './config/swagger.js';
import { createSseManager } from './services/sse-manager.js';
import { createStreamFilter } from './services/stream-filter.js';
import { createSessionManager } from './services/session-manager.js';
import { startMcpPoller } from './services/mcp-poller.js';
import { createChatRouter } from './routes/chat.js';
import { createTasksRouter } from './routes/tasks.js';
import { createFilesRouter } from './routes/files.js';
import type { ServerContext } from './server-context.js';

export type { ServerOptions } from './server-context.js';
import type { ServerOptions } from './server-context.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createAppServer(options: ServerOptions) {
  const { port, workspaceBaseDir, dataDir } = options;

  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  setupSwagger(app, port);

  const clientDist = path.resolve(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
  }

  // --- Build services ---
  const sseManager = createSseManager();
  const streamFilter = createStreamFilter();
  const sessionManager = createSessionManager(sseManager, streamFilter);

  const ctx: ServerContext = { options, sseManager, streamFilter, sessionManager };

  // --- Mount routes ---
  app.use('/api/chat', createChatRouter(ctx));
  app.use('/api/tasks', createTasksRouter());
  app.use('/api/files', createFilesRouter(workspaceBaseDir));

  // --- MCP message poller ---
  startMcpPoller(dataDir, sseManager.broadcast);

  // --- SPA catch-all (must be last) ---
  if (fs.existsSync(clientDist)) {
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  const server = createServer(app);

  return {
    start: () => {
      server.listen(port, () => {
        console.error(`[server] Running on http://localhost:${port}`);
      });
    },
    broadcast: sseManager.broadcast,
  };
}
