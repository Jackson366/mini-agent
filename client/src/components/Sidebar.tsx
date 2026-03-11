import { useTheme } from '../contexts/ThemeContext';

interface SidebarProps {
  view: 'chat' | 'tasks';
  onViewChange: (view: 'chat' | 'tasks') => void;
  connected: boolean;
}

export default function Sidebar({
  view,
  onViewChange,
  connected,
}: SidebarProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="w-60 bg-slate-100 dark:bg-slate-900/80 border-r border-slate-200 dark:border-slate-800/60 flex flex-col backdrop-blur-sm transition-colors duration-200">
      {/* Header */}
      <div className="px-5 py-5 border-b border-slate-200 dark:border-slate-800/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-600/20 flex items-center justify-center">
              <svg className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="4" width="14" height="12" rx="2" />
                <circle cx="9" cy="9" r="1.5" />
                <circle cx="15" cy="9" r="1.5" />
                <path d="M9 14h6" />
                <path d="M12 16v3" />
                <path d="M8 19h8" />
                <path d="M12 2L12 4" />
                <circle cx="12" cy="2" r="1" />
              </svg>
            </div>
            <h1 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">Clara</h1>
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800/60 cursor-pointer transition-colors duration-150"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
        <div className="flex items-center gap-2 mt-3 ml-0.5">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <span className="text-xs text-slate-700 dark:text-slate-500">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="px-3 pt-4 pb-2 space-y-0.5">
        <button
          onClick={() => onViewChange('chat')}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors duration-150 ${
            view === 'chat'
              ? 'bg-indigo-100 dark:bg-slate-800/80 text-indigo-800 dark:text-white font-medium'
              : 'text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800/40'
          }`}
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          Chat
        </button>
        <button
          onClick={() => onViewChange('tasks')}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors duration-150 ${
            view === 'tasks'
              ? 'bg-indigo-100 dark:bg-slate-800/80 text-indigo-800 dark:text-white font-medium'
              : 'text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800/40'
          }`}
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Tasks
        </button>
      </nav>
    </div>
  );
}
