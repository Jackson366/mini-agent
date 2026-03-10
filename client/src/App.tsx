import { useState, useCallback, useEffect } from 'react';
import { useSSE, type FileDiffInfo } from './hooks/useSSE';
import ChatPanel from './components/ChatPanel';
import TaskPanel from './components/TaskPanel';
import FilePreviewPanel from './components/FilePreviewPanel';
import Sidebar from './components/Sidebar';

type RightPanel = { type: 'preview'; path: string } | { type: 'diff'; diff: FileDiffInfo } | null;

export default function App() {
  const agentId = 'main';
  const [view, setView] = useState<'chat' | 'tasks'>('chat');
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const sse = useSSE();

  const handleOpenPreview = useCallback((filePath: string) => {
    setRightPanel({ type: 'preview', path: filePath });
  }, []);

  const handleOpenDiff = useCallback((diff: FileDiffInfo) => {
    setRightPanel({ type: 'diff', diff });
  }, []);

  const handleCloseRight = useCallback(() => {
    setRightPanel(null);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && rightPanel) {
        handleCloseRight();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [rightPanel, handleCloseRight]);

  const isRightOpen = rightPanel !== null;

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans antialiased">
      <Sidebar
        view={view}
        onViewChange={setView}
        connected={sse.connected}
      />
      <main className="flex-1 flex min-w-0">
        <div className={`flex-1 flex flex-col min-w-0 ${view === 'chat' ? '' : 'hidden'}`}>
          <ChatPanel
            sse={sse}
            agentId={agentId}
            onOpenPreview={handleOpenPreview}
            onOpenDiff={handleOpenDiff}
          />
        </div>
        <div className={`flex-1 flex flex-col ${view === 'tasks' ? '' : 'hidden'}`}>
          <TaskPanel agentId={agentId} active={view === 'tasks'} />
        </div>

        {/* Desktop right panel */}
        <div
          className={`hidden lg:flex flex-col border-l border-slate-800/60 transition-all duration-200 ease-out overflow-hidden ${
            isRightOpen ? 'w-[480px] min-w-[380px]' : 'w-0 min-w-0'
          }`}
        >
          {rightPanel?.type === 'preview' && (
            <FilePreviewPanel
              filePath={rightPanel.path}
              agentId={agentId}
              onClose={handleCloseRight}
            />
          )}
          {rightPanel?.type === 'diff' && (
            <FilePreviewPanel
              filePath={rightPanel.diff.filePath}
              agentId={agentId}
              onClose={handleCloseRight}
              diffData={rightPanel.diff}
            />
          )}
        </div>

        {/* Mobile/tablet overlay drawer */}
        {isRightOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={handleCloseRight}
            />
            <div className="ml-auto relative w-full max-w-md bg-slate-950 border-l border-slate-800/60 flex flex-col animate-slide-in-right">
              {rightPanel?.type === 'preview' && (
                <FilePreviewPanel
                  filePath={rightPanel.path}
                  agentId={agentId}
                  onClose={handleCloseRight}
                />
              )}
              {rightPanel?.type === 'diff' && (
                <FilePreviewPanel
                  filePath={rightPanel.diff.filePath}
                  agentId={agentId}
                  onClose={handleCloseRight}
                  diffData={rightPanel.diff}
                />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
