import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchFilePreview, type FilePreviewData } from '../lib/files';

interface FilePreviewPanelProps {
  filePath: string | null;
  agentId: string;
  onClose: () => void;
}

export default function FilePreviewPanel({ filePath, agentId, onClose }: FilePreviewPanelProps) {
  const [data, setData] = useState<FilePreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!filePath) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchFilePreview(agentId, filePath)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
          contentRef.current?.scrollTo(0, 0);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load file');
          setData(null);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [filePath, agentId]);

  useEffect(() => {
    closeBtnRef.current?.focus();
  }, [filePath]);

  if (!filePath) return null;

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-950">
      {/* Header */}
      <div className="border-b border-slate-800/60 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <svg className="w-4 h-4 text-slate-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-200 truncate">{data?.name || filePath.split('/').pop()}</p>
            <p className="text-[11px] text-slate-500 truncate font-mono">{filePath}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {data && (
            <span className="text-[10px] text-slate-600 font-mono mr-2">
              {formatSize(data.size)}
              {data.truncated && ' (truncated)'}
            </span>
          )}
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:ring-offset-0"
            title="Close preview (Esc)"
            aria-label="Close file preview"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto min-h-0">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-dot-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-dot-bounce" style={{ animationDelay: '0.16s' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-dot-bounce" style={{ animationDelay: '0.32s' }} />
            </div>
          </div>
        )}

        {error && (
          <div className="px-5 py-10 text-center">
            <div className="w-10 h-10 rounded-xl bg-red-950/40 flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <p className="text-sm text-red-300 mb-1">Cannot preview file</p>
            <p className="text-xs text-slate-500">{error}</p>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {data.truncated && (
              <div className="px-4 py-2 bg-amber-950/30 border-b border-amber-900/30 text-xs text-amber-300 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                File truncated to 512 KB — full file is {formatSize(data.size)}
              </div>
            )}

            {data.language === 'markdown' ? (
              <div className="px-5 py-4 markdown-body prose prose-invert prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.content}</ReactMarkdown>
              </div>
            ) : (
              <div className="p-0">
                <pre className="file-preview-code">
                  <code>{data.content}</code>
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
