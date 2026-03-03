import express, { type Response } from 'express';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { runAgent } from './agent.js';
import { MessageStream } from './message-stream.js';
import { setSession, getSession, deleteSession, getAllTasks, getTasksForAgent, deleteTask, updateTask } from './db.js';
import type { AgentOutput, ClarificationQuestion, SseMessageOut } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const INTERNAL_AGENTS = new Set([
  'requirement-analyst', 'platform-operations', 'buyer-domain',
  'seller-domain', 'service-provider-domain', 'ui-expert', 'ux-expert',
]);

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
  pendingClarifications: Map<string, {
    questions: ClarificationQuestion[];
    resolve: (answers: Record<string, string>) => void;
    reject: (err: Error) => void;
  }>;
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

  function broadcastTo(agentId: string, msg: SseMessageOut) {
    broadcast({ ...msg, agentId });
  }

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

  app.post('/api/chat', async (req, res) => {
    const { text, agentId: reqAgent } = req.body as { text?: string; agentId?: string };
    if (!text) {
      res.status(400).json({ error: 'text required' });
      return;
    }

    const agentId = reqAgent || 'main';
    const isMain = agentId === 'main';
    const agentDir = isMain ? workspaceBaseDir : path.join(workspaceBaseDir, agentId);
    if (!isMain) fs.mkdirSync(agentDir, { recursive: true });

    const existing = activeSessions.get(agentId);
    if (existing && !existing.stream.isDone()) {
      existing.stream.push(text);
      res.json({ ok: true, appended: true });
      return;
    }

    const stream = new MessageStream();
    stream.push(text);
    activeSessions.set(agentId, { stream, agentId, pendingClarifications: new Map() });

    broadcast({ type: 'status', status: 'thinking', agentId });
    res.json({ ok: true });

    const sessionId = getSession(agentId);

    try {
      const result = await runAgent({
        input: { prompt: text, sessionId, agentId },
        agentDir,
        globalDir,
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
        onClarification: ({ toolUseId, questions }) => {
          return new Promise<Record<string, string>>((resolve, reject) => {
            const session = activeSessions.get(agentId);
            if (!session) {
              reject(new Error(`No active session for agent ${agentId}`));
              return;
            }
            session.pendingClarifications.set(toolUseId, { questions, resolve, reject });
            broadcastTo(agentId, { type: 'clarification_request', toolUseId, questions });
          });
        },
        stream,
      });

      if (result.newSessionId) {
        setSession(agentId, result.newSessionId);
        broadcast({ type: 'session', sessionId: result.newSessionId, agentId });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[sse] Agent error:', errorMsg);
      broadcast({ type: 'error', text: errorMsg, agentId });
    } finally {
      const session = activeSessions.get(agentId);
      if (session) {
        for (const [toolUseId, pending] of session.pendingClarifications.entries()) {
          pending.reject(new Error(`Session ended before clarification was submitted: ${toolUseId}`));
        }
        session.pendingClarifications.clear();
      }
      activeSessions.delete(agentId);
      broadcast({ type: 'status', status: 'idle', agentId });
    }
  });

  app.post('/api/chat/new', (req, res) => {
    const agentId = req.body.agentId || 'main';
    const session = activeSessions.get(agentId);
    if (session) {
      for (const pending of session.pendingClarifications.values()) {
        pending.reject(new Error(`Session reset by user for agent ${agentId}`));
      }
      session.pendingClarifications.clear();
    }
    deleteSession(agentId);
    res.json({ ok: true });
  });

  app.post('/api/chat/stop', (req, res) => {
    const agentId = req.body.agentId || 'main';
    const session = activeSessions.get(agentId);
    if (session) {
      for (const pending of session.pendingClarifications.values()) {
        pending.reject(new Error(`Session stopped by user for agent ${agentId}`));
      }
      session.pendingClarifications.clear();
      session.stream.end();
    }
    res.json({ ok: true });
  });

  app.post('/api/chat/answer', (req, res) => {
    const { agentId: reqAgent, toolUseId, answers } = req.body as {
      agentId?: string;
      toolUseId?: string;
      answers?: Record<string, string>;
    };

    const agentId = reqAgent || 'main';
    const session = activeSessions.get(agentId);
    if (!session) {
      res.status(404).json({ error: `No active session for agent ${agentId}` });
      return;
    }
    if (!toolUseId) {
      res.status(400).json({ error: 'toolUseId required' });
      return;
    }
    if (!answers || typeof answers !== 'object') {
      res.status(400).json({ error: 'answers required' });
      return;
    }

    const pending = session.pendingClarifications.get(toolUseId);
    if (!pending) {
      res.status(404).json({ error: `No pending clarification for toolUseId ${toolUseId}` });
      return;
    }

    session.pendingClarifications.delete(toolUseId);
    pending.resolve(answers);
    res.json({ ok: true });
  });

  app.get('/api/agents', (_req, res) => {
    try {
      const entries = fs.readdirSync(workspaceBaseDir, { withFileTypes: true });
      const agents = entries
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => e.name)
        .filter(name => !INTERNAL_AGENTS.has(name));
      if (!agents.includes('main')) agents.unshift('main');
      res.json({ agents });
    } catch {
      res.json({ agents: ['main'] });
    }
  });

  app.get('/api/tasks', (req, res) => {
    const agentId = req.query.agentId as string | undefined;
    const tasks = agentId ? getTasksForAgent(agentId) : getAllTasks();
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
            broadcast({ type: 'task_message', text: data.text, taskId: data.taskId, agentId: data.agentId || data.workspace });
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
