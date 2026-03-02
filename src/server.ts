import express, { type Response } from 'express';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { runAgent } from './agent.js';
import { MessageStream } from './message-stream.js';
import { setSession, getSession, deleteSession, getAllTasks, getTasksForWorkspace, deleteTask, updateTask } from './db.js';
import { listAgentIds, MAIN_AGENT_ID, resolveAgentContext, resolveAgentId } from './agent-context.js';
import type { AgentOutput, SseMessageOut } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ServerOptions {
  port: number;
  workspaceBaseDir: string;
  globalDir: string;
  mcpServerPath: string;
  dataDir: string;
}

interface ActiveSession {
  stream: MessageStream;
  agentId: string;
}

export function createAppServer(options: ServerOptions) {
  const { port, workspaceBaseDir, globalDir, mcpServerPath, dataDir } = options;

  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  const clientDist = path.resolve(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
  }

  const sseClients = new Set<Response>();
  const activeSessions = new Map<string, ActiveSession>();

  function broadcast(msg: SseMessageOut) {
    const payload = `data: ${JSON.stringify(msg)}\n\n`;
    for (const client of sseClients) {
      client.write(payload);
    }
  }

  function broadcastTo(workspace: string, msg: SseMessageOut) {
    broadcast({ ...msg, agentId: workspace, workspace });
  }

  // SSE stream endpoint
  app.get('/api/chat/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.add(res);
    console.error('[sse] Client connected');

    const currentStatus = activeSessions.size > 0 ? 'thinking' : 'idle';
    res.write(`data: ${JSON.stringify({ type: 'status', status: currentStatus })}\n\n`);

    req.on('close', () => {
      sseClients.delete(res);
      console.error('[sse] Client disconnected');
    });
  });

  // Send message
  app.post('/api/chat', async (req, res) => {
    const { text } = req.body as { text?: string };
    if (!text) {
      res.status(400).json({ error: 'text required' });
      return;
    }

    const agentId = resolveAgentId(req.body as { agentId?: string; workspace?: string }) || MAIN_AGENT_ID;
    const agentContext = resolveAgentContext(workspaceBaseDir, agentId);
    if (!agentContext.isMainAgent) {
      fs.mkdirSync(agentContext.agentDir, { recursive: true });
    }

    const existing = activeSessions.get(agentId);
    if (existing && !existing.stream.isDone()) {
      existing.stream.push(text);
      res.json({ ok: true, appended: true });
      return;
    }

    const stream = new MessageStream();
    stream.push(text);
    activeSessions.set(agentId, { stream, agentId });

    broadcast({ type: 'status', status: 'thinking', agentId, workspace: agentId });
    res.json({ ok: true });

    const sessionId = getSession(agentId);

    try {
      const result = await runAgent({
        input: { prompt: text, sessionId, agentId, workspace: agentId },
        agentDir: agentContext.agentDir,
        mainDir: globalDir,
        agentId,
        dataDir,
        mcpServerPath,
        onOutput: (output: AgentOutput) => {
          if (output.newSessionId) {
            setSession(agentId, output.newSessionId);
          }
          if (output.result) {
            const cleaned = output.result.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
            if (cleaned) {
              broadcastTo(agentId, { type: 'assistant', text: cleaned });
            }
          }
        },
        stream,
      });

      if (result.newSessionId) {
        setSession(agentId, result.newSessionId);
        broadcast({ type: 'session', sessionId: result.newSessionId, agentId, workspace: agentId });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[sse] Agent error:', errorMsg);
      broadcast({ type: 'error', text: errorMsg, agentId, workspace: agentId });
    } finally {
      activeSessions.delete(agentId);
      broadcast({ type: 'status', status: 'idle', agentId, workspace: agentId });
    }
  });

  // New conversation
  app.post('/api/chat/new', (req, res) => {
    const agentId = resolveAgentId(req.body as { agentId?: string; workspace?: string }) || MAIN_AGENT_ID;
    deleteSession(agentId);
    res.json({ ok: true });
  });

  // Stop agent
  app.post('/api/chat/stop', (req, res) => {
    const agentId = resolveAgentId(req.body as { agentId?: string; workspace?: string }) || MAIN_AGENT_ID;
    const session = activeSessions.get(agentId);
    if (session) {
      session.stream.end();
    }
    res.json({ ok: true });
  });

  // REST APIs
  app.get('/api/workspaces', (_req, res) => {
    try {
      const workspaces = listAgentIds(workspaceBaseDir);
      res.json({ workspaces });
    } catch {
      res.json({ workspaces: [MAIN_AGENT_ID] });
    }
  });

  app.get('/api/agents', (_req, res) => {
    try {
      const agents = listAgentIds(workspaceBaseDir);
      res.json({ agents });
    } catch {
      res.json({ agents: [MAIN_AGENT_ID] });
    }
  });

  app.get('/api/tasks', (req, res) => {
    const workspace = (req.query.agentId as string | undefined) || (req.query.workspace as string | undefined);
    const tasks = workspace ? getTasksForWorkspace(workspace) : getAllTasks();
    res.json({ tasks });
  });

  app.delete('/api/tasks/:id', (req, res) => {
    deleteTask(req.params.id);
    res.json({ ok: true });
  });

  app.patch('/api/tasks/:id', (req, res) => {
    const { status } = req.body;
    if (status === 'paused' || status === 'active') {
      updateTask(req.params.id, { status });
    }
    res.json({ ok: true });
  });

  // MCP message polling
  const pollMcpMessages = () => {
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
            const agentId = data.agentId || data.workspace || MAIN_AGENT_ID;
            broadcast({ type: 'task_message', text: data.text, taskId: data.taskId, agentId, workspace: agentId });
          }
        } catch {
          try { fs.unlinkSync(filepath); } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  };
  setInterval(pollMcpMessages, 1000);

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
    broadcast,
  };
}
