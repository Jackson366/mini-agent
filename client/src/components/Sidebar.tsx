import { useState, useEffect } from 'react';
import { apiJson } from '../lib/api';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3210' : '';

interface SidebarProps {
  agentId: string;
  onAgentChange: (id: string) => void;
  view: 'chat' | 'tasks';
  onViewChange: (view: 'chat' | 'tasks') => void;
  connected: boolean;
  unreadAgents?: Set<string>;
}

export default function Sidebar({
  agentId,
  onAgentChange,
  view,
  onViewChange,
  connected,
  unreadAgents,
}: SidebarProps) {
  const [agents, setAgents] = useState<string[]>(['main']);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadAgents = async () => {
      try {
        const data = await apiJson<{ agents?: string[] }>(`${API_BASE}/api/agents`);
        if (data.agents?.length) setAgents(data.agents);
        setLoadError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load agents';
        setLoadError(message);
      }
    };

    void loadAgents();
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
        <p className="text-xs text-gray-500 mb-2 px-3">Agent</p>
        {loadError && (
          <p className="text-xs text-red-400 px-3 mb-2 truncate" title={loadError}>
            {loadError}
          </p>
        )}
        <div className="space-y-1">
          {agents.map((id) => (
            <button
              key={id}
              onClick={() => onAgentChange(id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center justify-between ${
                agentId === id
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
            >
              {id}
              {unreadAgents?.has(id) && agentId !== id && (
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
