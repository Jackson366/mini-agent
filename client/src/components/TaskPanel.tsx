import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { apiFetch, apiJson } from '../lib/api';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3210' : '';

interface Task {
  id: string;
  agent_id: string;
  prompt: string;
  schedule_type: string;
  schedule_value: string;
  status: string;
  next_run: string | null;
  last_run: string | null;
}

interface TaskPanelProps {
  agentId: string;
  active?: boolean;
}

export default function TaskPanel({ agentId, active = true }: TaskPanelProps) {
  const { theme } = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const data = await apiJson<{ tasks?: Task[] }>(`${API_BASE}/api/tasks?agentId=${agentId}`);
      setTasks(data.tasks || []);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch tasks';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    if (!active) return;
    fetchTasks();
    const interval = setInterval(fetchTasks, 10000);
    return () => clearInterval(interval);
  }, [fetchTasks, active]);

  const handleToggle = async (task: Task) => {
    const newStatus = task.status === 'active' ? 'paused' : 'active';
    try {
      await apiFetch(`${API_BASE}/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchTasks();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update task';
      setError(message);
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      await apiFetch(`${API_BASE}/api/tasks/${taskId}`, { method: 'DELETE' });
      await fetchTasks();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete task';
      setError(message);
    }
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-slate-200 dark:border-slate-800/60 px-6 py-3 flex items-center justify-between shrink-0">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Scheduled Tasks</h2>
        <span className="text-xs text-slate-700 dark:text-slate-500 bg-slate-200 dark:bg-slate-800/60 px-2 py-0.5 rounded-md font-mono">{agentId}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 mb-3 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {error}
          </p>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-dot-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-dot-bounce" style={{ animationDelay: '0.16s' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-dot-bounce" style={{ animationDelay: '0.32s' }} />
            </div>
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 rounded-2xl bg-slate-200 dark:bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-slate-500 dark:text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-500">No scheduled tasks</p>
            <p className="text-xs text-slate-500 dark:text-slate-600 mt-1.5">Ask the agent to schedule a task in chat</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40 rounded-xl p-4 animate-fade-in-up"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate leading-relaxed">
                      {task.prompt.slice(0, 100)}
                      {task.prompt.length > 100 ? '...' : ''}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500 dark:text-slate-500">
                      <span className="font-mono">{task.schedule_type}: {task.schedule_value}</span>
                      <span>Next: {formatTime(task.next_run)}</span>
                      <span>Last: {formatTime(task.last_run)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        task.status === 'active'
                          ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/30'
                          : task.status === 'paused'
                            ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/30'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-500 border border-slate-300 dark:border-slate-700/50'
                      }`}
                    >
                      {task.status}
                    </span>
                    <button
                      onClick={() => handleToggle(task)}
                      className="text-xs text-slate-600 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 cursor-pointer transition-colors duration-150 px-1.5 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700/30"
                    >
                      {task.status === 'active' ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      onClick={() => handleDelete(task.id)}
                      className="text-xs text-red-500/70 dark:text-red-400/70 hover:text-red-600 dark:hover:text-red-300 cursor-pointer transition-colors duration-150 px-1.5 py-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
