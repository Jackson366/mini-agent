import { useState, useCallback } from 'react';
import { useSSE } from './hooks/useSSE';
import ChatPanel from './components/ChatPanel';
import TaskPanel from './components/TaskPanel';
import Sidebar from './components/Sidebar';

export default function App() {
  const [agentId, setAgentId] = useState('main');
  const [view, setView] = useState<'chat' | 'tasks'>('chat');
  const [unreadAgents, setUnreadAgents] = useState<Set<string>>(new Set());
  const sse = useSSE();

  const handleAgentChange = useCallback((id: string) => {
    setAgentId(id);
    setUnreadAgents(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleUnread = useCallback((id: string) => {
    setUnreadAgents(prev => {
      if (prev.has(id)) return prev;
      return new Set(prev).add(id);
    });
  }, []);

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <Sidebar
        agentId={agentId}
        onAgentChange={handleAgentChange}
        view={view}
        onViewChange={setView}
        connected={sse.connected}
        unreadAgents={unreadAgents}
      />
      <main className="flex-1 flex flex-col">
        <div className={view === 'chat' ? 'flex flex-col flex-1 min-h-0' : 'hidden'}>
          <ChatPanel sse={sse} agentId={agentId} onUnread={handleUnread} />
        </div>
        <div className={view === 'tasks' ? 'flex flex-col flex-1' : 'hidden'}>
          <TaskPanel agentId={agentId} active={view === 'tasks'} />
        </div>
      </main>
    </div>
  );
}
