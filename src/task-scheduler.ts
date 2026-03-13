import { CronExpressionParser } from 'cron-parser';
import { getDueTasks, updateTaskAfterRun, logTaskRun, getSession } from './db.js';
import { runAgent } from './agent.js';
import { MessageStream } from './message-stream.js';
import type { AgentOutput } from './types.js';

const SCHEDULER_POLL_INTERVAL = 60000;

export interface SchedulerOptions {
  workspaceBaseDir: string;
  globalDir: string;
  dataDir: string;
  mcpServerPath: string;
  onTaskMessage: (agentId: string, text: string, taskId: string) => void;
}

function computeNextRun(scheduleType: string, scheduleValue: string): string | null {
  if (scheduleType === 'cron') {
    try {
      const interval = CronExpressionParser.parse(scheduleValue);
      return interval.next().toDate().toISOString();
    } catch {
      return null;
    }
  } else if (scheduleType === 'interval') {
    const ms = parseInt(scheduleValue, 10);
    if (isNaN(ms) || ms <= 0) return null;
    return new Date(Date.now() + ms).toISOString();
  }
  return null;
}

export function startSchedulerLoop(options: SchedulerOptions): void {
  const { workspaceBaseDir, globalDir, dataDir, mcpServerPath, onTaskMessage } = options;

  const runDueTasks = async () => {
    const dueTasks = getDueTasks();
    for (const task of dueTasks) {
      const startTime = Date.now();
      const isMain = task.agent_id === 'main';
      const agentDir = isMain ? workspaceBaseDir : `${workspaceBaseDir}/${task.agent_id}`;
      const sessionId = task.context_mode === 'workspace' ? getSession(task.agent_id) : undefined;

      console.error(`[scheduler] Running task ${task.id} for agent ${task.agent_id}`);

      const stream = new MessageStream();
      const prompt = `[SCHEDULED TASK - DO NOT ASK QUESTIONS]

You are executing a scheduled task. You MUST:
1. Immediately perform the action described below
2. Use the send_message tool to deliver the result/notification to the user
3. Do NOT ask for clarification or more information
4. Do NOT set up new tasks or reminders

Task to execute:
${task.prompt}`;
      stream.push(prompt);
      stream.end();

      try {
        await runAgent({
          input: {
            prompt,
            sessionId,
            agentId: task.agent_id,
            isScheduledTask: true,
          },
          agentDir,
          globalDir,
          dataDir,
          mcpServerPath,
          onOutput: (output: AgentOutput) => {
            if (output.result) {
              onTaskMessage(task.agent_id, output.result, task.id);
            }
          },
          stream,
        });

        const duration = Date.now() - startTime;
        const nextRun = computeNextRun(task.schedule_type, task.schedule_value);
        updateTaskAfterRun(task.id, nextRun, 'success');
        logTaskRun({
          task_id: task.id,
          run_at: new Date().toISOString(),
          duration_ms: duration,
          status: 'success',
          result: null,
          error: null,
        });
      } catch (err) {
        const duration = Date.now() - startTime;
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[scheduler] Task ${task.id} failed: ${errorMsg}`);

        const nextRun = computeNextRun(task.schedule_type, task.schedule_value);
        updateTaskAfterRun(task.id, nextRun, 'error');
        logTaskRun({
          task_id: task.id,
          run_at: new Date().toISOString(),
          duration_ms: duration,
          status: 'error',
          result: null,
          error: errorMsg,
        });
      }
    }
  };

  setInterval(() => {
    runDueTasks().catch(err => console.error('[scheduler] Error:', err));
  }, SCHEDULER_POLL_INTERVAL);

  runDueTasks().catch(err => console.error('[scheduler] Initial run error:', err));
}
