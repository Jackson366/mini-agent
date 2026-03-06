import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { CronExpressionParser } from 'cron-parser';
import path from 'path';
import fs from 'fs';
import { AgentRegistry } from './registry.js';
import {
  createTask,
  getAllTasks,
  getTasksForAgent,
  initDatabase,
} from './db.js';

const agentId = process.env.MINI_AGENT_ID || 'main';
const dataDir = process.env.MINI_AGENT_DATA_DIR || path.resolve(process.cwd(), 'data');
const cwd = process.cwd();

function resolveWorkspaceRoot(startDir: string): string {
  let current = path.resolve(startDir);
  while (true) {
    const marker = path.join(current, 'chongqing-product-design', 'config.yaml');
    if (fs.existsSync(marker)) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(startDir);
    current = parent;
  }
}

function slugify(value: string): string {
  const ascii = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (ascii) return ascii;
  return `domain-${Date.now().toString(36)}`;
}

function buildGeneratedExpertPrompt(args: {
  name: string;
  description: string;
  capabilities: string[];
  keywords: string[];
  knowledgePoints: string[];
}): string {
  const caps = args.capabilities.map((c) => `- ${c}`).join('\n');
  const kws = args.keywords.map((k) => `- ${k}`).join('\n');
  const points = args.knowledgePoints.length > 0
    ? args.knowledgePoints.map((p) => `- ${p}`).join('\n')
    : '- 待补充';

  return `---
name: ${args.name}
description: ${args.description}
---

你是${args.name}，负责该业务域PRD内容优化与治理。

## 专业能力
${caps}

## 关键词
${kws}

## 域知识
${points}

## 工作要求
1. 基于当前PRD最新版本进行增量修订，不回退旧版本。
2. 明确输出：修改建议、修改原因、影响范围、验收要点。
3. 与其他专家冲突时，先暴露分歧并给出权衡建议。
4. 输出中文，结论可执行可追溯。`;
}

const workspaceRoot = resolveWorkspaceRoot(cwd);
const registry = new AgentRegistry({ workspaceDir: workspaceRoot });

initDatabase(dataDir);

const server = new McpServer({
  name: 'nanoclaw',
  version: '1.0.0',
});

server.tool(
  'send_message',
  'Send a message to the user immediately while you are still running. Use this for progress updates or to send multiple messages.',
  {
    text: z.string().describe('The message text to send'),
  },
  async (args) => {
    const ipcDir = path.resolve(dataDir, 'mcp-messages');
    fs.mkdirSync(ipcDir, { recursive: true });
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    const filepath = path.join(ipcDir, filename);
    const tempPath = `${filepath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify({
      type: 'message',
      agentId,
      text: args.text,
      timestamp: new Date().toISOString(),
    }));
    fs.renameSync(tempPath, filepath);
    return { content: [{ type: 'text' as const, text: 'Message sent.' }] };
  },
);

server.tool(
  'route_experts',
  'Route requirement text to domain experts by capabilities and keywords. Use this before delegating PRD optimization tasks.',
  {
    requirement_text: z.string().default(''),
    capabilities: z.array(z.string()).optional(),
    top_n: z.number().int().positive().max(20).default(6),
  },
  async (args) => {
    registry.reload();
    const routed = registry.routeExperts({
      text: args.requirement_text,
      capabilities: args.capabilities,
      topN: args.top_n,
    });
    const matchedText = routed.matched.length > 0
      ? routed.matched
        .map((m, i) => `${i + 1}. ${m.id} (score=${m.score}; ${m.reasons.join('; ')})`)
        .join('\n')
      : 'none';
    const missingText = routed.missingCapabilities.length > 0
      ? routed.missingCapabilities.join(', ')
      : 'none';

    return {
      content: [{
        type: 'text' as const,
        text: `matched_experts:\n${matchedText}\n\nmissing_capabilities:\n${missingText}`,
      }],
    };
  },
);

server.tool(
  'upsert_domain_expert',
  'Create or update a missing domain expert after collecting domain knowledge from user, then write it into agents-registry.yaml for immediate reuse.',
  {
    domain_name: z.string().min(1),
    domain_description: z.string().min(1),
    capabilities: z.array(z.string().min(1)).min(1),
    keywords: z.array(z.string().min(1)).default([]),
    knowledge_points: z.array(z.string().min(1)).default([]),
    expert_id: z.string().min(1).optional(),
  },
  async (args) => {
    const expertId = args.expert_id ? slugify(args.expert_id) : `${slugify(args.domain_name)}-expert`;
    const generatedDir = path.join(
      workspaceRoot,
      'chongqing-product-design',
      'agents',
      'generated',
    );
    fs.mkdirSync(generatedDir, { recursive: true });
    const fileName = `${expertId}.md`;
    const filePath = path.join(generatedDir, fileName);
    const promptPath = `@chongqing-product-design/agents/generated/${fileName}`;

    const content = buildGeneratedExpertPrompt({
      name: args.domain_name,
      description: args.domain_description,
      capabilities: args.capabilities,
      keywords: args.keywords,
      knowledgePoints: args.knowledge_points,
    });
    fs.writeFileSync(filePath, content, 'utf-8');

    registry.upsertAgent({
      id: expertId,
      name: args.domain_name,
      description: args.domain_description,
      prompt_path: promptPath,
      model: 'sonnet',
      tools: ['Read', 'Grep', 'Glob', 'Write', 'Edit'],
      capabilities: args.capabilities,
      keywords: args.keywords,
      priority: 85,
      enabled: true,
      expert: true,
    });

    return {
      content: [{
        type: 'text' as const,
        text: `domain expert upserted: ${expertId}\nfile: ${filePath}\nregistry: ${path.join(workspaceRoot, 'chongqing-product-design', 'agents-registry.yaml')}`,
      }],
    };
  },
);

server.tool(
  'schedule_task',
  `Schedule a recurring or one-time task. The task will run as a full agent with access to all tools.

CONTEXT MODE:
- "isolated": Task runs in a fresh session with no conversation history (default).
- "workspace": Task runs with workspace context.

SCHEDULE VALUE FORMAT (all times are LOCAL timezone):
- cron: Standard cron expression (e.g., "0 9 * * *" for daily at 9am)
- interval: Milliseconds between runs (e.g., "3600000" for 1 hour)
- once: Local time WITHOUT "Z" suffix (e.g., "2026-02-01T15:30:00")`,
  {
    prompt: z.string().describe('What the agent should DO when the task runs. Write as a direct action instruction, e.g. "Use send_message to notify the user: time to call mom". Do NOT store the user\'s original request verbatim.'),
    schedule_type: z.enum(['cron', 'interval', 'once']),
    schedule_value: z.string(),
    context_mode: z.enum(['workspace', 'isolated']).default('isolated'),
  },
  async (args) => {
    if (args.schedule_type === 'cron') {
      try {
        CronExpressionParser.parse(args.schedule_value);
      } catch {
        return {
          content: [{ type: 'text' as const, text: `Invalid cron: "${args.schedule_value}".` }],
          isError: true,
        };
      }
    } else if (args.schedule_type === 'interval') {
      const ms = parseInt(args.schedule_value, 10);
      if (isNaN(ms) || ms <= 0) {
        return {
          content: [{ type: 'text' as const, text: `Invalid interval: "${args.schedule_value}".` }],
          isError: true,
        };
      }
    } else if (args.schedule_type === 'once') {
      if (/[Zz]$/.test(args.schedule_value) || /[+-]\d{2}:\d{2}$/.test(args.schedule_value)) {
        return {
          content: [{ type: 'text' as const, text: `Use local time without timezone suffix.` }],
          isError: true,
        };
      }
      const date = new Date(args.schedule_value);
      if (isNaN(date.getTime())) {
        return {
          content: [{ type: 'text' as const, text: `Invalid timestamp: "${args.schedule_value}".` }],
          isError: true,
        };
      }
    }

    const now = new Date();
    let nextRun: string;
    if (args.schedule_type === 'cron') {
      const interval = CronExpressionParser.parse(args.schedule_value);
      nextRun = interval.next().toDate().toISOString();
    } else if (args.schedule_type === 'interval') {
      nextRun = new Date(now.getTime() + parseInt(args.schedule_value, 10)).toISOString();
    } else {
      nextRun = new Date(args.schedule_value).toISOString();
    }

    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    createTask({
      id: taskId,
      agent_id: agentId,
      prompt: args.prompt,
      schedule_type: args.schedule_type,
      schedule_value: args.schedule_value,
      context_mode: args.context_mode || 'isolated',
      next_run: nextRun,
      status: 'active',
      created_at: now.toISOString(),
    });

    return {
      content: [{ type: 'text' as const, text: `Task scheduled: ${taskId} (${args.schedule_type}: ${args.schedule_value})` }],
    };
  },
);

server.tool(
  'list_tasks',
  'List all scheduled tasks for the current agent.',
  {},
  async () => {
    const tasks = getTasksForAgent(agentId);

    if (tasks.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No scheduled tasks found.' }] };
    }

    const formatted = tasks
      .map(
        (t) =>
          `- [${t.id}] ${t.prompt.slice(0, 50)}... (${t.schedule_type}: ${t.schedule_value}) - ${t.status}, next: ${t.next_run || 'N/A'}`,
      )
      .join('\n');

    return { content: [{ type: 'text' as const, text: `Scheduled tasks:\n${formatted}` }] };
  },
);

server.tool(
  'pause_task',
  'Pause a scheduled task.',
  { task_id: z.string() },
  async (args) => {
    const { updateTask } = await import('./db.js');
    updateTask(args.task_id, { status: 'paused' });
    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} paused.` }] };
  },
);

server.tool(
  'resume_task',
  'Resume a paused task.',
  { task_id: z.string() },
  async (args) => {
    const { updateTask } = await import('./db.js');
    updateTask(args.task_id, { status: 'active' });
    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} resumed.` }] };
  },
);

server.tool(
  'cancel_task',
  'Cancel and delete a scheduled task.',
  { task_id: z.string() },
  async (args) => {
    const { deleteTask } = await import('./db.js');
    deleteTask(args.task_id);
    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} cancelled.` }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
