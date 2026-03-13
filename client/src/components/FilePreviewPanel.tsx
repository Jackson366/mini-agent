import { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTheme } from '../contexts/ThemeContext';
import { fetchFilePreview, type FilePreviewData } from '../lib/files';
import type { FileDiffInfo } from '../hooks/useSSE';

interface FilePreviewPanelProps {
  filePath: string | null;
  agentId: string;
  onClose: () => void;
  diffData?: FileDiffInfo;
}

type LineStatus = 'unchanged' | 'added' | 'deleted' | 'modified';

interface LineInfo {
  number: number;
  content: string;
  status: LineStatus;
}

// Build the complete file view with diff highlights
function buildFileLinesWithDiff(fileContent: string, diff: FileDiffInfo): LineInfo[] {
  const fileLines = fileContent.split('\n');
  const result: LineInfo[] = [];
  let fileIndex = 0;

  // Sort hunks by their newStart position
  const sortedHunks = [...diff.hunks].sort((a, b) => a.newStart - b.newStart);

  for (const hunk of sortedHunks) {
    const hunkStartInFile = hunk.newStart - 1; // Convert to 0-based

    // Add unchanged lines before this hunk
    while (fileIndex < hunkStartInFile && fileIndex < fileLines.length) {
      result.push({
        number: fileIndex + 1,
        content: fileLines[fileIndex],
        status: 'unchanged',
      });
      fileIndex++;
    }

    // Process the hunk
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;

    for (const line of hunk.lines) {
      const prefix = line[0];
      const content = line.slice(1);

      if (prefix === '+') {
        // Added line - exists in new file
        if (fileIndex < fileLines.length) {
          result.push({
            number: newLine,
            content: fileLines[fileIndex],
            status: 'added',
          });
          fileIndex++;
        }
        newLine++;
      } else if (prefix === '-') {
        // Deleted line - doesn't exist in new file, insert as ghost
        result.push({
          number: oldLine,
          content: content,
          status: 'deleted',
        });
        oldLine++;
      } else {
        // Context line - exists in both
        if (fileIndex < fileLines.length) {
          result.push({
            number: newLine,
            content: fileLines[fileIndex],
            status: 'unchanged',
          });
          fileIndex++;
        }
        oldLine++;
        newLine++;
      }
    }
  }

  // Add remaining unchanged lines after all hunks
  while (fileIndex < fileLines.length) {
    result.push({
      number: fileIndex + 1,
      content: fileLines[fileIndex],
      status: 'unchanged',
    });
    fileIndex++;
  }

  return result;
}

function InlineDiffView({ lines }: { lines: LineInfo[] }) {
  const { theme } = useTheme();
  // Calculate positions of changed lines for auto-scroll
  const firstChangeIndex = lines.findIndex(l => l.status !== 'unchanged');

  useEffect(() => {
    if (firstChangeIndex >= 0) {
      // Scroll to first change
      const element = document.getElementById(`diff-line-${firstChangeIndex}`);
      element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [firstChangeIndex]);

  if (lines.length === 0) {
    return <div className="px-5 py-10 text-center text-sm text-slate-600 dark:text-slate-500">Empty file</div>;
  }

  return (
    <div className="font-mono text-[12px] leading-[1.6]">
      {lines.map((line, index) => {
        const isDeleted = line.status === 'deleted';
        let rowClass = 'flex';

        if (line.status === 'added') {
          rowClass += ' bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300';
        } else if (isDeleted) {
          rowClass += ' bg-red-100 dark:bg-red-950/20 text-red-700 dark:text-red-400 line-through';
        } else {
          rowClass += ' text-slate-700 dark:text-slate-400';
        }

        return (
          <div
            id={`diff-line-${index}`}
            key={index}
            className={rowClass}
          >
            <span className="w-[4em] shrink-0 text-right pr-2 text-slate-500 dark:text-slate-600 select-none border-r border-slate-300 dark:border-slate-800/40 mr-2">
              {isDeleted ? '~' : line.number}
            </span>
            <span className="flex-1 whitespace-pre-wrap break-all pr-4">{line.content || ' '}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function FilePreviewPanel({ filePath, agentId, onClose, diffData }: FilePreviewPanelProps) {
  const { theme } = useTheme();
  const [data, setData] = useState<FilePreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // When diffData is provided, fetch the file content
  useEffect(() => {
    if (!filePath) {
      setData(null);
      setError(null);
      setLoading(false);
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

  // Build diff lines when we have both file content and diff data
  const diffLines = useMemo(() => {
    if (diffData && data?.content) {
      return buildFileLinesWithDiff(data.content, diffData);
    }
    return null;
  }, [diffData, data]);

  useEffect(() => {
    closeBtnRef.current?.focus();
  }, [filePath, diffData]);

  if (!filePath && !diffData) return null;

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Diff mode with inline highlights
  if (diffData) {
    const diffLabel = diffData.diffType === 'create' ? 'New' : diffData.diffType === 'edit' ? 'Edited' : 'Updated';
    const labelColor = diffData.diffType === 'create' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/40' : 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/40';

    return (
      <div className="flex flex-col h-full min-h-0 bg-white dark:bg-slate-950">
        <div className="border-b border-slate-200 dark:border-slate-800/60 px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <svg className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{diffData.fileName}</p>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${labelColor}`}>{diffLabel}</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-500 truncate font-mono">{diffData.filePath}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <span className="text-[11px] font-mono mr-2">
              {diffData.additions > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{diffData.additions}</span>}
              {diffData.additions > 0 && diffData.deletions > 0 && <span className="text-slate-500 dark:text-slate-600 mx-1">/</span>}
              {diffData.deletions > 0 && <span className="text-red-600 dark:text-red-400">-{diffData.deletions}</span>}
            </span>
            <button
              ref={closeBtnRef}
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800/60 cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:ring-offset-0"
              title="Close (Esc)"
              aria-label="Close diff view"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div ref={contentRef} className="flex-1 overflow-y-auto min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-dot-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-dot-bounce" style={{ animationDelay: '0.16s' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-dot-bounce" style={{ animationDelay: '0.32s' }} />
              </div>
            </div>
          )}

          {error && (
            <div className="px-5 py-10 text-center">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/40 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-red-500 dark:text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <p className="text-sm text-red-600 dark:text-red-300 mb-1">Failed to load file</p>
              <p className="text-xs text-slate-500 dark:text-slate-500">{error}</p>
            </div>
          )}

          {!loading && !error && diffLines && (
            <InlineDiffView lines={diffLines} />
          )}
        </div>
      </div>
    );
  }

  // File preview mode
  return (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-slate-950">
      <div className="border-b border-slate-200 dark:border-slate-800/60 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <svg className="w-4 h-4 text-slate-500 dark:text-slate-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{data?.name || filePath!.split('/').pop()}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-500 truncate font-mono">{filePath}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {data && (
            <span className="text-[10px] text-slate-500 dark:text-slate-600 font-mono mr-2">
              {formatSize(data.size)}
              {data.truncated && ' (truncated)'}
            </span>
          )}
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800/60 cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:ring-offset-0"
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

      <div ref={contentRef} className="flex-1 overflow-y-auto min-h-0">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-dot-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-dot-bounce" style={{ animationDelay: '0.16s' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-dot-bounce" style={{ animationDelay: '0.32s' }} />
            </div>
          </div>
        )}

        {error && (
          <div className="px-5 py-10 text-center">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/40 flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-red-500 dark:text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <p className="text-sm text-red-600 dark:text-red-300 mb-1">Cannot preview file</p>
            <p className="text-xs text-slate-500 dark:text-slate-500">{error}</p>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {data.truncated && (
              <div className="px-4 py-2 bg-amber-100 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/30 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                File truncated to 512 KB — full file is {formatSize(data.size)}
              </div>
            )}

            {data.language === 'markdown' ? (
              <div className="px-5 py-4 markdown-body prose dark:prose-invert prose-sm max-w-none">
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
