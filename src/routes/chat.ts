import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { runAgent } from '../agent.js';
import { MessageStream } from '../message-stream.js';
import { setSession, getSession, deleteSession } from '../db.js';
import { extractRelatedFiles } from '../services/file-utils.js';
import type { ServerContext } from '../server-context.js';
import type { AgentOutput, StreamDelta } from '../types.js';

export function createChatRouter(ctx: ServerContext): Router {
  const router = Router();
  const { options, sseManager, streamFilter, sessionManager } = ctx;
  const { workspaceBaseDir, globalDir, mcpServerPath, dataDir } = options;

  /**
   * @swagger
   * /api/chat/stream:
   *   get:
   *     summary: SSE 流式连接
   *     description: 建立 Server-Sent Events 连接，实时接收 agent 响应
   *     tags: [Chat]
   *     responses:
   *       200:
   *         description: SSE 流连接建立成功
   *         content:
   *           text/event-stream:
   *             schema:
   *               type: string
   *               example: "data: {\"type\":\"status\",\"status\":\"idle\"}\n\n"
   */
  router.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseManager.clients.add(res);
    console.error('[sse] Client connected');

    const currentStatus = sessionManager.size() > 0 ? 'thinking' : 'idle';
    res.write(`data: ${JSON.stringify({ type: 'status', status: currentStatus })}\n\n`);

    req.on('close', () => {
      sseManager.clients.delete(res);
      console.error('[sse] Client disconnected');
    });
  });

  /**
   * @swagger
   * /api/chat:
   *   post:
   *     summary: 发送消息给 agent
   *     description: 发送文本消息给指定的 agent，agent 会通过 SSE 返回响应
   *     tags: [Chat]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               text:
   *                 type: string
   *                 description: 要发送的消息内容
   *                 example: "帮我创建一个 Hello World 程序"
   *               agentId:
   *                 type: string
   *                 description: Agent ID，默认为 'main'
   *                 example: "main"
   *             required:
   *               - text
   *     responses:
   *       200:
   *         description: 消息已发送
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 ok:
   *                   type: boolean
   *                   example: true
   *                 appended:
   *                   type: boolean
   *                   description: 是否追加到现有会话
   *                   example: false
   *       400:
   *         description: 请求参数错误
   */
  router.post('/', async (req, res) => {
    const { text, agentId: reqAgent } = req.body as { text?: string; agentId?: string };
    if (!text) {
      res.status(400).json({ error: 'text required' });
      return;
    }

    const agentId = reqAgent || 'main';
    const isMain = agentId === 'main';
    const agentDir = isMain ? workspaceBaseDir : path.join(workspaceBaseDir, agentId);
    if (!isMain) fs.mkdirSync(agentDir, { recursive: true });

    const existing = sessionManager.get(agentId);
    if (existing && !existing.stream.isDone()) {
      existing.stream.push(text);
      res.json({ ok: true, appended: true });
      return;
    }

    const stream = new MessageStream();
    stream.push(text);
    sessionManager.set(agentId, { stream, agentId, pendingClarifications: new Map() });

    sseManager.broadcast({ type: 'status', status: 'thinking', agentId });
    res.json({ ok: true });

    const sessionId = getSession(agentId);
    console.log(`[Chat] agentId=${agentId}, existing sessionId=${sessionId}`);

    try {
      let streamedThisTurn = false;
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
              if (!streamFilter.has(agentId) && !streamedThisTurn) {
                sseManager.broadcastTo(agentId, { type: 'assistant', text: cleaned });
              }

              const fileRefs = extractRelatedFiles(cleaned, agentDir);
              if (fileRefs.length > 0) {
                sseManager.broadcastTo(agentId, { type: 'related_files', files: fileRefs });
              }
            }
          }
        },
        onClarification: ({ toolUseId, questions }) => {
          return new Promise<Record<string, string>>((resolve, reject) => {
            const session = sessionManager.get(agentId);
            if (!session) {
              reject(new Error(`No active session for agent ${agentId}`));
              return;
            }
            session.pendingClarifications.set(toolUseId, { questions, resolve, reject });
            sseManager.broadcastTo(agentId, { type: 'clarification_request', toolUseId, questions });
          });
        },
        onStreamDelta: (delta: StreamDelta) => {
          if (delta.event === 'delta' && delta.text) {
            streamedThisTurn = true;
            const chunks = streamFilter.process(agentId, delta.text);
            for (const chunk of chunks) {
              if (chunk) sseManager.broadcastTo(agentId, { type: 'assistant_delta', text: chunk });
            }
          } else if (delta.event === 'end') {
            const remaining = streamFilter.flush(agentId);
            if (remaining) {
              sseManager.broadcastTo(agentId, { type: 'assistant_delta', text: remaining });
            }
            sseManager.broadcastTo(agentId, { type: 'assistant_end' });
          }
        },
        onFileDiff: (diff) => {
          sseManager.broadcastTo(agentId, { type: 'file_diff', diff });
        },
        stream,
      });

      if (result.newSessionId) {
        setSession(agentId, result.newSessionId);
        sseManager.broadcast({ type: 'session', sessionId: result.newSessionId, agentId });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[sse] Agent error:', errorMsg);
      sseManager.broadcast({ type: 'error', text: errorMsg, agentId });
    } finally {
      sessionManager.close(
        agentId,
        `Session ended before clarification was submitted for agent ${agentId}`,
        { endStream: false, emitIdle: true },
      );
    }
  });

  /**
   * @swagger
   * /api/chat/new:
   *   post:
   *     summary: 新建会话
   *     description: 重置指定 agent 的会话，清除之前的对话历史
   *     tags: [Chat]
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               agentId:
   *                 type: string
   *                 example: "main"
   *     responses:
   *       200:
   *         description: 会话已重置
   */
  router.post('/new', (req, res) => {
    const agentId = req.body.agentId || 'main';
    sessionManager.close(agentId, `Session reset by user for agent ${agentId}`);
    deleteSession(agentId);
    res.json({ ok: true });
  });

  /**
   * @swagger
   * /api/chat/stop:
   *   post:
   *     summary: 停止会话
   *     description: 停止当前正在运行的 agent 会话
   *     tags: [Chat]
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               agentId:
   *                 type: string
   *                 example: "main"
   *     responses:
   *       200:
   *         description: 会话已停止
   */
  router.post('/stop', (req, res) => {
    const agentId = req.body.agentId || 'main';
    sessionManager.close(agentId, `Session stopped by user for agent ${agentId}`);
    res.json({ ok: true });
  });

  /**
   * @swagger
   * /api/chat/answer:
   *   post:
   *     summary: 回答澄清问题
   *     description: 当 agent 需要澄清时，提交问题的答案
   *     tags: [Chat]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               agentId:
   *                 type: string
   *                 example: "main"
   *               toolUseId:
   *                 type: string
   *                 description: 澄清请求的工具 ID
   *                 example: "toolu_123456"
   *               answers:
   *                 type: object
   *                 description: 问题答案的键值对
   *                 example: { "question_0": "选项1" }
   *             required:
   *               - toolUseId
   *               - answers
   *     responses:
   *       200:
   *         description: 答案已提交
   *       404:
   *         description: 未找到活动的会话或澄清请求
   *       400:
   *         description: 参数错误
   */
  router.post('/answer', (req, res) => {
    const { agentId: reqAgent, toolUseId, answers } = req.body as {
      agentId?: string;
      toolUseId?: string;
      answers?: Record<string, string>;
    };

    const agentId = reqAgent || 'main';
    const session = sessionManager.get(agentId);
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

  return router;
}
