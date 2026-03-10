import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { LANGUAGE_MAP, MAX_PREVIEW_BYTES, walkDirectory } from '../services/file-utils.js';

export function createFilesRouter(workspaceBaseDir: string): Router {
  const router = Router();

  /**
   * @swagger
   * /api/files/preview:
   *   get:
   *     summary: 文件预览
   *     description: 获取文件内容和元信息
   *     tags: [Files]
   *     parameters:
   *       - name: agentId
   *         in: query
   *         description: Agent ID
   *         required: false
   *         schema:
   *           type: string
   *           example: "main"
   *       - name: path
   *         in: query
   *         description: 文件相对路径
   *         required: true
   *         schema:
   *           type: string
   *           example: "src/index.ts"
   *     responses:
   *       200:
   *         description: 文件内容
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 path:
   *                   type: string
   *                   example: "src/index.ts"
   *                 name:
   *                   type: string
   *                   example: "index.ts"
   *                 content:
   *                   type: string
   *                   example: "console.log('hello');"
   *                 language:
   *                   type: string
   *                   example: "typescript"
   *                 size:
   *                   type: number
   *                   example: 1024
   *                 truncated:
   *                   type: boolean
   *                   description: 内容是否被截断（超过 512KB）
   *       400:
   *         description: 参数错误或路径无效
   *       403:
   *         description: 路径穿越攻击被阻止
   *       404:
   *         description: 文件不存在
   */
  router.get('/preview', (req, res) => {
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

  /**
   * @swagger
   * /api/files/list:
   *   get:
   *     summary: 文件列表
   *     description: 列出工作目录中的所有文件
   *     tags: [Files]
   *     parameters:
   *       - name: agentId
   *         in: query
   *         description: Agent ID
   *         required: false
   *         schema:
   *           type: string
   *           example: "main"
   *     responses:
   *       200:
   *         description: 文件列表
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 files:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       path:
   *                         type: string
   *                         example: "src/index.ts"
   *                       name:
   *                         type: string
   *                         example: "index.ts"
   *                       language:
   *                         type: string
   *                         example: "typescript"
   */
  router.get('/list', (req, res) => {
    const agentId = (req.query.agentId as string) || 'main';
    const isMain = agentId === 'main';
    const baseDir = isMain ? workspaceBaseDir : path.join(workspaceBaseDir, agentId);

    if (!fs.existsSync(baseDir)) {
      res.json({ files: [] });
      return;
    }

    const results: Array<{ path: string; name: string; language?: string }> = [];
    walkDirectory(baseDir, baseDir, results, 0);
    results.sort((a, b) => a.path.localeCompare(b.path));
    res.json({ files: results });
  });

  return router;
}
