import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { CronExpressionParser } from 'cron-parser';
import path from 'path';
import fs from 'fs';
import {
  createTask,
  getAllTasks,
  getTasksForAgent,
  initDatabase,
} from './db.js';

const agentId = process.env.MINI_AGENT_ID || 'main';
const dataDir = process.env.MINI_AGENT_DATA_DIR || path.resolve(process.cwd(), 'data');

initDatabase(dataDir);

const server = new McpServer({
  name: 'clara',
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
