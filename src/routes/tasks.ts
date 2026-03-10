import { Router } from 'express';
import { getAllTasks, getTasksForAgent, deleteTask, updateTask } from '../db.js';

export function createTasksRouter(): Router {
  const router = Router();

  /**
   * @swagger
   * /api/tasks:
   *   get:
   *     summary: 获取任务列表
   *     description: 获取所有任务或指定 agent 的任务列表
   *     tags: [Tasks]
   *     parameters:
   *       - name: agentId
   *         in: query
   *         description: 筛选指定 agent 的任务
   *         required: false
   *         schema:
   *           type: string
   *           example: "main"
   *     responses:
   *       200:
   *         description: 任务列表
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 tasks:
   *                   type: array
   *                   items:
   *                     type: object
   */
  router.get('/', (req, res) => {
    const agentId = req.query.agentId as string | undefined;
    const tasks = agentId ? getTasksForAgent(agentId) : getAllTasks();
    res.json({ tasks });
  });

  /**
   * @swagger
   * /api/tasks/{id}:
   *   delete:
   *     summary: 删除任务
   *     description: 根据 ID 删除任务
   *     tags: [Tasks]
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         description: 任务 ID
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: 任务已删除
   */
  router.delete('/:id', (req, res) => {
    deleteTask(req.params.id);
    res.json({ ok: true });
  });

  /**
   * @swagger
   * /api/tasks/{id}:
   *   patch:
   *     summary: 更新任务状态
   *     description: 更新任务的活跃状态
   *     tags: [Tasks]
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         description: 任务 ID
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               status:
   *                 type: string
   *                 enum: [paused, active]
   *                 example: "paused"
   *             required:
   *               - status
   *     responses:
   *       200:
   *         description: 任务已更新
   */
  router.patch('/:id', (req, res) => {
    const { status } = req.body;
    if (status === 'paused' || status === 'active') {
      updateTask(req.params.id, { status });
    }
    res.json({ ok: true });
  });

  return router;
}
