import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { LANGUAGE_MAP, MAX_PREVIEW_BYTES, walkDirectory } from '../services/file-utils.js';

export function createFilesRouter(workspaceBaseDir: string): Router {
  const router = Router();
  // 限制到 output 子目录
  const OUTPUT_DIR = path.join(workspaceBaseDir, 'output');

  /**
   * @swagger
   * /api/files/preview:
   *   get:
   *     summary: 文件预览
   *     description: 获取 output 目录下文件的内容和元信息
   *     tags: [Files]
   *     parameters:
   *       - name: path
   *         in: query
   *         description: 文件相对路径（相对于 output 目录）
   *         required: true
   *         schema:
   *           type: string
   *           example: "file.txt"
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
   *                   example: "file.txt"
   *                 name:
   *                   type: string
   *                   example: "file.txt"
   *                 content:
   *                   type: string
   *                   example: "content..."
   *                 language:
   *                   type: string
   *                   example: "plaintext"
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
    const filePath = req.query.path as string | undefined;

    if (!filePath) {
      res.status(400).json({ error: 'path query parameter required' });
      return;
    }

    const resolved = path.resolve(OUTPUT_DIR, filePath);

    if (!resolved.startsWith(path.resolve(OUTPUT_DIR) + path.sep) && resolved !== path.resolve(OUTPUT_DIR)) {
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
      path: path.relative(OUTPUT_DIR, resolved),
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
   *     description: 列出 output 目录中的所有文件
   *     tags: [Files]
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
   *                         example: "file.txt"
   *                       name:
   *                         type: string
   *                         example: "file.txt"
   *                       language:
   *                         type: string
   *                         example: "plaintext"
   */
  router.get('/list', (_req, res) => {
    if (!fs.existsSync(OUTPUT_DIR)) {
      res.json({ files: [] });
      return;
    }

    const results: Array<{ path: string; name: string; language?: string }> = [];
    walkDirectory(OUTPUT_DIR, OUTPUT_DIR, results, 0);
    results.sort((a, b) => a.path.localeCompare(b.path));
    res.json({ files: results });
  });

  return router;
}
