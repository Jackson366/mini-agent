import express, { type Response } from 'express';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { runAgent } from './agent.js';
import { MessageStream } from './message-stream.js';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { setSession, getSession, deleteSession, getAllTasks, getTasksForAgent, deleteTask, updateTask, saveCheckpoint, getCheckpoints, getCheckpointById, deleteCheckpointsAfter } from './db.js';
import type { AgentOutput, ClarificationQuestion, SseMessageOut, CheckpointInfo } from './types.js';

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

  const FILE_EXT_RE = /\.(md|txt|ts|tsx|js|jsx|json|yaml|yml|css|html|py|sh|sql|xml|csv|toml|ini|env)$/;
  const FILE_LANG: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
    '.json': 'json', '.md': 'markdown', '.yaml': 'yaml', '.yml': 'yaml',
    '.css': 'css', '.html': 'html', '.py': 'python', '.sh': 'bash',
    '.sql': 'sql', '.xml': 'xml', '.txt': 'plaintext', '.csv': 'csv',
    '.env': 'plaintext', '.toml': 'toml', '.ini': 'ini',
  };

  function extractRelatedFiles(text: string, agentDir: string): Array<{ path: string; name: string; language?: string }> {
    const seen = new Set<string>();
    const results: Array<{ path: string; name: string; language?: string }> = [];
    const pathPattern = /(?:^|\s|`|\(|"|')([./]?[\w\-./]+\.\w{1,5})(?:\s|`|\)|"|'|$|,|:)/gm;
    let match: RegExpExecArray | null;
    while ((match = pathPattern.exec(text)) !== null) {
      const raw = match[1];
      if (!FILE_EXT_RE.test(raw)) continue;
      const resolved = path.resolve(agentDir, raw);
      if (!resolved.startsWith(path.resolve(agentDir))) continue;
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) continue;
      const rel = path.relative(agentDir, resolved);
      if (seen.has(rel)) continue;
      seen.add(rel);
      const ext = path.extname(resolved).toLowerCase();
      results.push({ path: rel, name: path.basename(resolved), language: FILE_LANG[ext] });
    }
    return results;
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

  function closeActiveSession(agentId: string, reason: string, options?: { endStream?: boolean; emitIdle?: boolean }) {
    const session = activeSessions.get(agentId);
    if (!session) return false;

    for (const pending of session.pendingClarifications.values()) {
      pending.reject(new Error(reason));
    }
    session.pendingClarifications.clear();

    if (options?.endStream !== false && !session.stream.isDone()) {
      session.stream.end();
    }

    activeSessions.delete(agentId);
    if (options?.emitIdle !== false) {
      broadcast({ type: 'status', status: 'idle', agentId });
    }
    return true;
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

              const fileRefs = extractRelatedFiles(cleaned, agentDir);
              if (fileRefs.length > 0) {
                broadcastTo(agentId, { type: 'related_files', files: fileRefs });
              }
            }
          }
        },
        onCheckpoint: (cp: CheckpointInfo) => {
          const id = `cp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          saveCheckpoint({
            id,
            agent_id: agentId,
            session_id: cp.sessionId,
            checkpoint_id: cp.checkpointId,
            turn_index: cp.turnIndex,
            description: `Turn ${cp.turnIndex}`,
            created_at: cp.timestamp,
          });
          broadcastTo(agentId, {
            type: 'checkpoint_created',
            checkpoint: { id, checkpointId: cp.checkpointId, turnIndex: cp.turnIndex, description: `Turn ${cp.turnIndex}`, createdAt: cp.timestamp },
          });
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
      closeActiveSession(
        agentId,
        `Session ended before clarification was submitted for agent ${agentId}`,
        { endStream: false, emitIdle: true },
      );
    }
  });

  app.post('/api/chat/new', (req, res) => {
    const agentId = req.body.agentId || 'main';
    closeActiveSession(agentId, `Session reset by user for agent ${agentId}`);
    deleteSession(agentId);
    res.json({ ok: true });
  });

  app.post('/api/chat/stop', (req, res) => {
    const agentId = req.body.agentId || 'main';
    closeActiveSession(agentId, `Session stopped by user for agent ${agentId}`);
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

  app.get('/api/checkpoints', (req, res) => {
    const agentId = (req.query.agentId as string) || 'main';
    const records = getCheckpoints(agentId);
    res.json({ checkpoints: records });
  });

  app.post('/api/checkpoints/rewind', async (req, res) => {
    const { agentId: reqAgent, checkpointRecordId } = req.body as { agentId?: string; checkpointRecordId?: string };
    const agentId = reqAgent || 'main';

    if (!checkpointRecordId) {
      res.status(400).json({ error: 'checkpointRecordId required' });
      return;
    }

    const record = getCheckpointById(checkpointRecordId);
    if (!record) {
      res.status(404).json({ error: 'Checkpoint not found' });
      return;
    }

    

    broadcast({ type: 'status', status: 'thinking', agentId });

    try {
      const rewindOpts = {
        enableFileCheckpointing: true,
        resume: record.session_id,
        cwd: agentId === 'main' ? workspaceBaseDir : path.join(workspaceBaseDir, agentId),
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        env: {
          ...process.env,
          CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: '1',
        },
      };

      const rewindQuery = query({ prompt: '', options: rewindOpts });
      for await (const _msg of rewindQuery) {
        await rewindQuery.rewindFiles(record.checkpoint_id);
        break;
      }

      deleteCheckpointsAfter(agentId, record.created_at);

      broadcastTo(agentId, {
        type: 'assistant',
        text: `Files have been rewound to checkpoint: ${record.description} (turn ${record.turn_index})`,
      });

      res.json({ ok: true, rewoundTo: record });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[rewind] Error:', errorMsg);
      res.status(500).json({ error: errorMsg });
    } finally {
      broadcast({ type: 'status', status: 'idle', agentId });
    }
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

  const MAX_PREVIEW_BYTES = 512 * 1024; // 512 KB

  const LANGUAGE_MAP: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
    '.json': 'json', '.md': 'markdown', '.yaml': 'yaml', '.yml': 'yaml',
    '.css': 'css', '.html': 'html', '.py': 'python', '.sh': 'bash',
    '.sql': 'sql', '.xml': 'xml', '.txt': 'plaintext', '.csv': 'csv',
    '.env': 'plaintext', '.toml': 'toml', '.ini': 'ini',
  };

  app.get('/api/files/preview', (req, res) => {
    const agentId = (req.query.agentId as string) || 'main';
    const filePath = req.query.path as string | undefined;

    if (!filePath) {
      res.status(400).json({ error: 'path query parameter required' });
      return;
    }

    const isMain = agentId === 'main';
    const baseDir = isMain ? workspaceBaseDir : path.join(workspaceBaseDir, agentId);
    const resolved = path.resolve(baseDir, filePath);

    if (!resolved.startsWith(path.resolve(baseDir) + path.sep) && resolved !== path.resolve(baseDir)) {
      res.status(403).json({ error: 'Path traversal not allowed' });
      return;
    }

    if (!fs.existsSync(resolved)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      res.status(400).json({ error: 'Path is not a file' });
      return;
    }

    const ext = path.extname(resolved).toLowerCase();
    const language = LANGUAGE_MAP[ext] || 'plaintext';
    const truncated = stat.size > MAX_PREVIEW_BYTES;
    const raw = truncated
      ? fs.readFileSync(resolved, { encoding: 'utf-8', flag: 'r' }).slice(0, MAX_PREVIEW_BYTES)
      : fs.readFileSync(resolved, 'utf-8');

    res.json({
      path: path.relative(baseDir, resolved),
      name: path.basename(resolved),
      content: raw,
      language,
      size: stat.size,
      truncated,
    });
  });

  app.get('/api/files/list', (req, res) => {
    const agentId = (req.query.agentId as string) || 'main';
    const isMain = agentId === 'main';
    const baseDir = isMain ? workspaceBaseDir : path.join(workspaceBaseDir, agentId);

    if (!fs.existsSync(baseDir)) {
      res.json({ files: [] });
      return;
    }

    const results: Array<{ path: string; name: string; language?: string }> = [];

    const walk = (dir: string, depth: number) => {
      if (depth > 4) return;
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name.startsWith('.')) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'dist') continue;
            walk(full, depth + 1);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (LANGUAGE_MAP[ext]) {
              results.push({
                path: path.relative(baseDir, full),
                name: entry.name,
                language: LANGUAGE_MAP[ext],
              });
            }
          }
        }
      } catch { /* permission errors */ }
    };

    walk(baseDir, 0);
    results.sort((a, b) => a.path.localeCompare(b.path));
    res.json({ files: results });
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
