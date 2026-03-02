import { useState, useEffect } from 'react';

interface SidebarProps {
  workspace: string;
  onWorkspaceChange: (ws: string) => void;
  view: 'chat' | 'tasks';
  onViewChange: (view: 'chat' | 'tasks') => void;
  connected: boolean;
  unreadWorkspaces?: Set<string>;
}

export default function Sidebar({
  workspace,
  onWorkspaceChange,
  view,
  onViewChange,
  connected,
  unreadWorkspaces,
}: SidebarProps) {
  const [workspaces, setWorkspaces] = useState<string[]>(['default']);

  useEffect(() => {
    fetch('/api/workspaces')
      .then(r => r.json())
      .then(data => {
        if (data.workspaces?.length) setWorkspaces(data.workspaces);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="px-4 py-4 border-b border-gray-800">
        <h1 className="text-lg font-bold tracking-tight">Mini Agent</h1>
        <div className="flex items-center gap-2 mt-1">
          <span
            className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
          />
          <span className="text-xs text-gray-500">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        <button
          onClick={() => onViewChange('chat')}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
            view === 'chat'
              ? 'bg-gray-800 text-white'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => onViewChange('tasks')}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
            view === 'tasks'
              ? 'bg-gray-800 text-white'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
          }`}
        >
          Tasks
        </button>
      </nav>

      <div className="px-3 py-4 border-t border-gray-800">
        <p className="text-xs text-gray-500 mb-2 px-3">Workspace</p>
        <div className="space-y-1">
          {workspaces.map((ws) => (
            <button
              key={ws}
              onClick={() => onWorkspaceChange(ws)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center justify-between ${
                workspace === ws
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
            >
              {ws}
              {unreadWorkspaces?.has(ws) && workspace !== ws && (
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
