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
  return (
    <div className="w-60 bg-slate-900/80 border-r border-slate-800/60 flex flex-col backdrop-blur-sm">
      <div className="px-5 py-5 border-b border-slate-800/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 flex items-center justify-center">
            <svg className="w-4.5 h-4.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-base font-semibold tracking-tight text-slate-100">Mini Agent</h1>
        </div>
        <div className="flex items-center gap-2 mt-3 ml-0.5">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span className="text-xs text-slate-500">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <nav className="px-3 pt-4 pb-2 space-y-0.5">
        <button
          onClick={() => onViewChange('chat')}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors duration-150 ${
            view === 'chat'
              ? 'bg-slate-800/80 text-white font-medium'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
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
              ? 'bg-slate-800/80 text-white font-medium'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
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
