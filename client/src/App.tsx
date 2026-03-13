import { useState, useCallback, useEffect, useRef } from 'react';
import { useSSE, type FileDiffInfo } from './hooks/useSSE';
import { ThemeProvider } from './contexts/ThemeContext';
import ChatPanel from './components/ChatPanel';
import TaskPanel from './components/TaskPanel';
import FilePreviewPanel from './components/FilePreviewPanel';
import Sidebar from './components/Sidebar';

type RightPanel = { type: 'preview'; path: string } | { type: 'diff'; diff: FileDiffInfo } | null;

// 常量配置
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 800;
const DEFAULT_PANEL_WIDTH = 480;
const STORAGE_KEY = 'right-panel-width';

export default function App() {
  const agentId = 'main';
  const [view, setView] = useState<'chat' | 'tasks'>('chat');
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [panelWidth, setPanelWidth] = useState(() => {
    // 从 localStorage 读取保存的宽度
    const saved = localStorage.getItem(STORAGE_KEY);
    const width = saved ? parseInt(saved, 10) : DEFAULT_PANEL_WIDTH;
    return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, width));
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
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

  // 保存面板宽度到 localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, panelWidth.toString());
  }, [panelWidth]);

  // 拖拽开始
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
    // 获取鼠标或触摸位置
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    dragStartX.current = clientX;
    dragStartWidth.current = panelWidth;
  }, [panelWidth]);

  // 拖拽过程
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = dragStartX.current - e.clientX;
      const newWidth = dragStartWidth.current + deltaX;
      const clampedWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, newWidth));
      setPanelWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // 触摸支持
  useEffect(() => {
    if (!isDragging) return;

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const deltaX = dragStartX.current - touch.clientX;
      const newWidth = dragStartWidth.current + deltaX;
      const clampedWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, newWidth));
      setPanelWidth(clampedWidth);
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging]);

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
    <ThemeProvider>
      <div className="flex h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased transition-colors duration-200">
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
        <>
          {/* 拖拽遮罩层 - 防止拖拽时选中文本 */}
          {isDragging && (
            <div className="hidden lg:block fixed inset-0 z-30 cursor-col-resize" />
          )}

          <div
            className={`hidden lg:flex relative border-l border-slate-200 dark:border-slate-800/60 ${
              isDragging ? '' : 'transition-all duration-200 ease-out'
            } overflow-hidden ${
              isRightOpen ? '' : 'w-0 min-w-0'
            }`}
            style={{
              width: isRightOpen ? `${panelWidth}px` : 0,
              minWidth: isRightOpen ? `${MIN_PANEL_WIDTH}px` : 0,
            }}
          >
            {/* 拖拽手柄 - 在面板左边缘 */}
            {isRightOpen && (
              <div
                onMouseDown={handleDragStart}
                onTouchStart={handleDragStart}
                className={`absolute left-0 top-0 bottom-0 w-3 -translate-x-1/2 z-10 cursor-col-resize hover:w-4 hover:bg-indigo-500/50 transition-all duration-150 ${
                  isDragging ? 'w-4 bg-indigo-500/60' : 'bg-transparent hover:bg-indigo-500/30'
                }`}
                title="拖拽调整面板宽度"
              />
            )}

            <div className="flex flex-col flex-1 min-w-0">
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
        </>

        {/* Mobile/tablet overlay drawer */}
        {isRightOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm"
              onClick={handleCloseRight}
            />
            <div className="ml-auto relative w-full max-w-md bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800/60 flex flex-col animate-slide-in-right">
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
    </ThemeProvider>
  );
}
