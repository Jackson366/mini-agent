import { useState, useEffect, useCallback } from 'react';

interface Task {
  id: string;
  workspace: string;
  prompt: string;
  schedule_type: string;
  schedule_value: string;
  status: string;
  next_run: string | null;
  last_run: string | null;
}

interface TaskPanelProps {
  workspace: string;
  active?: boolean;
}

export default function TaskPanel({ workspace, active = true }: TaskPanelProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks?workspace=${workspace}`);
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    if (!active) return;
    fetchTasks();
    const interval = setInterval(fetchTasks, 10000);
    return () => clearInterval(interval);
  }, [fetchTasks, active]);

  const handleToggle = async (task: Task) => {
    const newStatus = task.status === 'active' ? 'paused' : 'active';
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchTasks();
  };

  const handleDelete = async (taskId: string) => {
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    fetchTasks();
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Scheduled Tasks</h2>
        <span className="text-sm text-gray-500">{workspace}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : tasks.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            <p className="text-lg">No scheduled tasks</p>
            <p className="text-sm mt-2">Ask the agent to schedule a task in chat</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="bg-gray-800 border border-gray-700 rounded-xl p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200 truncate">
                      {task.prompt.slice(0, 100)}
                      {task.prompt.length > 100 ? '...' : ''}
                    </p>
                    <div className="flex gap-4 mt-2 text-xs text-gray-500">
                      <span>{task.schedule_type}: {task.schedule_value}</span>
                      <span>Next: {formatTime(task.next_run)}</span>
                      <span>Last: {formatTime(task.last_run)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        task.status === 'active'
                          ? 'bg-green-900/50 text-green-400'
                          : task.status === 'paused'
                            ? 'bg-yellow-900/50 text-yellow-400'
                            : 'bg-gray-700 text-gray-400'
                      }`}
                    >
                      {task.status}
                    </span>
                    <button
                      onClick={() => handleToggle(task)}
                      className="text-xs text-gray-400 hover:text-gray-200 transition"
                    >
                      {task.status === 'active' ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      onClick={() => handleDelete(task.id)}
                      className="text-xs text-red-400 hover:text-red-300 transition"
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
