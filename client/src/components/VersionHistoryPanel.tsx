import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchCheckpoints, rewindToCheckpoint, type CheckpointRecord } from '../lib/files';
import type { SseMessage } from '../hooks/useSSE';

interface VersionHistoryPanelProps {
  agentId: string;
  sseMessages: SseMessage[];
  onClose: () => void;
  onRewound: () => void;
}

export default function VersionHistoryPanel({ agentId, sseMessages, onClose, onRewound }: VersionHistoryPanelProps) {
  const [checkpoints, setCheckpoints] = useState<CheckpointRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [rewinding, setRewinding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const loadCheckpoints = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCheckpoints(agentId);
      setCheckpoints(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load checkpoints');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadCheckpoints();
  }, [loadCheckpoints]);

  useEffect(() => {
    const hasNew = sseMessages.some(m => m.type === 'checkpoint_created' && (m.agentId || 'main') === agentId);
    if (hasNew) loadCheckpoints();
  }, [sseMessages, agentId, loadCheckpoints]);

  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  const handleRewind = async (record: CheckpointRecord) => {
    setRewinding(record.id);
    setError(null);
    try {
      await rewindToCheckpoint(agentId, record.id);
      setConfirmId(null);
      await loadCheckpoints();
      onRewound();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rewind failed');
    } finally {
      setRewinding(null);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-950">
      {/* Header */}
      <div className="border-b border-slate-800/60 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <h3 className="text-sm font-semibold text-slate-100">Version History</h3>
          <span className="text-[10px] text-slate-500 bg-slate-800/60 px-1.5 py-0.5 rounded font-mono">
            {checkpoints.length} checkpoints
          </span>
        </div>
        <button
          ref={closeBtnRef}
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          title="Close (Esc)"
          aria-label="Close version history"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-950/30 border-b border-red-900/30 text-xs text-red-300 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-dot-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-dot-bounce" style={{ animationDelay: '0.16s' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-dot-bounce" style={{ animationDelay: '0.32s' }} />
            </div>
          </div>
        ) : checkpoints.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-10 h-10 rounded-xl bg-slate-800/50 flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <p className="text-sm text-slate-500">No checkpoints yet</p>
            <p className="text-xs text-slate-600 mt-1">Checkpoints are created automatically as the agent modifies files</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-slate-800" />

            <div className="space-y-1">
              {checkpoints.map((cp, idx) => {
                const isLatest = idx === checkpoints.length - 1;
                const isConfirming = confirmId === cp.id;
                const isRewinding = rewinding === cp.id;

                return (
                  <div key={cp.id} className="relative pl-8 group">
                    {/* Timeline dot */}
                    <div className={`absolute left-[7px] top-3 w-[9px] h-[9px] rounded-full border-2 ${
                      isLatest
                        ? 'bg-indigo-500 border-indigo-400'
                        : 'bg-slate-800 border-slate-600 group-hover:border-slate-400'
                    } transition-colors duration-150`} />

                    <div className={`rounded-lg border px-3 py-2.5 transition-colors duration-150 ${
                      isLatest
                        ? 'border-indigo-500/30 bg-indigo-950/20'
                        : 'border-slate-800/60 bg-slate-900/40 hover:border-slate-700/60'
                    }`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-300">
                              {cp.description}
                            </span>
                            {isLatest && (
                              <span className="text-[9px] uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded font-medium">
                                current
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-600 font-mono mt-0.5">
                            {formatDate(cp.created_at)} {formatTime(cp.created_at)}
                          </p>
                        </div>

                        {!isLatest && (
                          <div className="shrink-0">
                            {isConfirming ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleRewind(cp)}
                                  disabled={isRewinding}
                                  className="px-2 py-1 text-[10px] font-medium bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800/50 text-white rounded cursor-pointer transition-colors duration-150"
                                >
                                  {isRewinding ? 'Rewinding...' : 'Confirm'}
                                </button>
                                <button
                                  onClick={() => setConfirmId(null)}
                                  disabled={isRewinding}
                                  className="px-2 py-1 text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer transition-colors duration-150"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmId(cp.id)}
                                className="px-2 py-1 text-[10px] font-medium text-slate-500 hover:text-amber-300 hover:bg-amber-950/30 rounded cursor-pointer transition-colors duration-150 opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                                title={`Rewind files to this checkpoint`}
                              >
                                Rewind
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="border-t border-slate-800/60 px-4 py-2.5 shrink-0">
        <p className="text-[10px] text-slate-600 leading-relaxed">
          Rewind restores files to a previous state. Chat history is preserved but the agent will be informed of the rollback.
        </p>
      </div>
    </div>
  );
}
