import { useState, useCallback } from 'react';
import { useSSE } from './hooks/useSSE';
import ChatPanel from './components/ChatPanel';
import TaskPanel from './components/TaskPanel';
import Sidebar from './components/Sidebar';

export default function App() {
  const [workspace, setWorkspace] = useState('default');
  const [view, setView] = useState<'chat' | 'tasks'>('chat');
  const [unreadWorkspaces, setUnreadWorkspaces] = useState<Set<string>>(new Set());
  const sse = useSSE();

  const handleWorkspaceChange = useCallback((ws: string) => {
    setWorkspace(ws);
    setUnreadWorkspaces(prev => {
      if (!prev.has(ws)) return prev;
      const next = new Set(prev);
      next.delete(ws);
      return next;
    });
  }, []);

  const handleUnread = useCallback((ws: string) => {
    setUnreadWorkspaces(prev => {
      if (prev.has(ws)) return prev;
      return new Set(prev).add(ws);
    });
  }, []);

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <Sidebar
        workspace={workspace}
        onWorkspaceChange={handleWorkspaceChange}
        view={view}
        onViewChange={setView}
        connected={sse.connected}
        unreadWorkspaces={unreadWorkspaces}
      />
      <main className="flex-1 flex flex-col">
        <div className={view === 'chat' ? 'flex flex-col flex-1 min-h-0' : 'hidden'}>
          <ChatPanel sse={sse} workspace={workspace} onUnread={handleUnread} />
        </div>
        <div className={view === 'tasks' ? 'flex flex-col flex-1' : 'hidden'}>
          <TaskPanel workspace={workspace} active={view === 'tasks'} />
        </div>
      </main>
    </div>
  );
}
