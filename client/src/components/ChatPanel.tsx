import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiJson } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import type { SseMessage, RelatedFile, FileDiffInfo } from '../hooks/useSSE';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3210' : '';

interface ChatMessage {
  role: 'user' | 'assistant' | 'error' | 'task';
  content: string;
  files?: RelatedFile[];
  diffs?: FileDiffInfo[];
}

interface ChatPanelProps {
  sse: {
    connected: boolean;
    messages: SseMessage[];
    send: (text: string, agentId: string) => Promise<void>;
    stop: (agentId: string) => Promise<void>;
    newChat: (agentId: string) => Promise<void>;
    clearMessages: () => void;
    answerClarification: (agentId: string, toolUseId: string, answers: Record<string, string>) => Promise<void>;
  };
  agentId: string;
  onUnread?: (id: string) => void;
  onOpenPreview?: (filePath: string) => void;
  onOpenDiff?: (diff: FileDiffInfo) => void;
}

interface ClarificationQuestion {
  question: string;
  header: string;
  multiSelect?: boolean;
  options: Array<{ label: string; description: string }>;
}

interface ClarificationState {
  toolUseId: string;
  questions: ClarificationQuestion[];
}

interface ClarificationProgress {
  selected: string[];
  useCustom: boolean;
  customText: string;
}

export default function ChatPanel({ sse, agentId, onUnread, onOpenPreview, onOpenDiff }: ChatPanelProps) {
  const { theme } = useTheme();
  const [input, setInput] = useState('');
  const historyMapRef = useRef<Record<string, ChatMessage[]>>({});
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const thinkingMapRef = useRef<Record<string, boolean>>({});
  const [isSending, setIsSending] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingTextMapRef = useRef<Record<string, string>>({});
  const isStreamingMapRef = useRef<Record<string, boolean>>({});
  const pendingDiffsMapRef = useRef<Record<string, FileDiffInfo[]>>({});
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [clarification, setClarification] = useState<ClarificationState | null>(null);
  const [clarificationIndex, setClarificationIndex] = useState(0);
  const [clarificationProgress, setClarificationProgress] = useState<Record<number, ClarificationProgress>>({});
  const [clarificationTransitioning, setClarificationTransitioning] = useState(false);
  const [isSubmittingClarification, setIsSubmittingClarification] = useState(false);
  const [clarificationCollapsed, setClarificationCollapsed] = useState(false);
  const clarificationMapRef = useRef<Record<string, ClarificationState | undefined>>({});
  const clarificationIndexRef = useRef<Record<string, number | undefined>>({});
  const clarificationProgressRef = useRef<Record<string, Record<number, ClarificationProgress> | undefined>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const processedCount = useRef(0);
  const agentIdRef = useRef(agentId);
  const isComposingRef = useRef(false);
  const [fileBrowserOpen, setFileBrowserOpen] = useState(false);
  const [fileBrowserList, setFileBrowserList] = useState<RelatedFile[]>([]);
  const [fileBrowserLoading, setFileBrowserLoading] = useState(false);
  const fileBrowserRef = useRef<HTMLDivElement>(null);
  agentIdRef.current = agentId;

  const loadFileBrowser = useCallback(async () => {
    setFileBrowserLoading(true);
    try {
      const data = await apiJson<{ files: RelatedFile[] }>(`${API_BASE}/api/files/list?agentId=${agentId}`);
      setFileBrowserList(data.files || []);
    } catch {
      setFileBrowserList([]);
    } finally {
      setFileBrowserLoading(false);
    }
  }, [agentId]);

  const toggleFileBrowser = useCallback(() => {
    if (!fileBrowserOpen) {
      loadFileBrowser();
    }
    setFileBrowserOpen(prev => !prev);
  }, [fileBrowserOpen, loadFileBrowser]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fileBrowserRef.current && !fileBrowserRef.current.contains(e.target as Node)) {
        setFileBrowserOpen(false);
      }
    };
    if (fileBrowserOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [fileBrowserOpen]);

  useEffect(() => {
    setChatHistory(historyMapRef.current[agentId] || []);
    setIsThinking(!!thinkingMapRef.current[agentId]);
    setIsStopping(false);
    setStreamingText(streamingTextMapRef.current[agentId] || '');
    setIsStreaming(!!isStreamingMapRef.current[agentId]);
    setClarification(clarificationMapRef.current[agentId] || null);
    setClarificationIndex(clarificationIndexRef.current[agentId] || 0);
    setClarificationProgress(clarificationProgressRef.current[agentId] || {});
  }, [agentId]);

  useEffect(() => {
    const newMessages = sse.messages.slice(processedCount.current);
    processedCount.current = sse.messages.length;

    const currentAgent = agentIdRef.current;

    for (const msg of newMessages) {
      const msgAgent = msg.agentId || 'main';

      if (msg.type === 'assistant_delta' && msg.text) {
        // Accumulate streaming text
        const prev = streamingTextMapRef.current[msgAgent] || '';
        streamingTextMapRef.current[msgAgent] = prev + msg.text;
        isStreamingMapRef.current[msgAgent] = true;
        thinkingMapRef.current[msgAgent] = false;
        if (msgAgent === currentAgent) {
          setStreamingText(streamingTextMapRef.current[msgAgent]);
          setIsStreaming(true);
          setIsThinking(false);
        }
      } else if (msg.type === 'assistant_end') {
        // Finalize: move streaming text into chat history
        const finalText = streamingTextMapRef.current[msgAgent] || '';
        const pendingDiffs = pendingDiffsMapRef.current[msgAgent];
        if (finalText.trim()) {
          const entry: ChatMessage = {
            role: 'assistant',
            content: finalText,
            diffs: pendingDiffs?.length ? pendingDiffs : undefined,
          };
          historyMapRef.current[msgAgent] = [...(historyMapRef.current[msgAgent] || []), entry];
        }
        pendingDiffsMapRef.current[msgAgent] = [];
        streamingTextMapRef.current[msgAgent] = '';
        isStreamingMapRef.current[msgAgent] = false;
        if (msgAgent === currentAgent) {
          if (finalText.trim()) setChatHistory([...historyMapRef.current[msgAgent]]);
          setStreamingText('');
          setIsStreaming(false);
        } else if (finalText.trim()) {
          onUnread?.(msgAgent);
        }
      } else if (msg.type === 'assistant' && msg.text) {
        // Full message from result — only add if streaming didn't already deliver it
        if (!isStreamingMapRef.current[msgAgent]) {
          const entry: ChatMessage = { role: 'assistant', content: msg.text! };
          historyMapRef.current[msgAgent] = [...(historyMapRef.current[msgAgent] || []), entry];
          thinkingMapRef.current[msgAgent] = false;
          if (msgAgent === currentAgent) {
            setChatHistory([...historyMapRef.current[msgAgent]]);
            setIsThinking(false);
          } else {
            onUnread?.(msgAgent);
          }
        }
      } else if (msg.type === 'error' && msg.text) {
        const entry: ChatMessage = { role: 'error', content: msg.text! };
        historyMapRef.current[msgAgent] = [...(historyMapRef.current[msgAgent] || []), entry];
        if (msgAgent === currentAgent) {
          setChatHistory([...historyMapRef.current[msgAgent]]);
        } else {
          onUnread?.(msgAgent);
        }
      } else if (msg.type === 'task_message' && msg.text) {
        const entry: ChatMessage = { role: 'task', content: msg.text! };
        historyMapRef.current[msgAgent] = [...(historyMapRef.current[msgAgent] || []), entry];
        if (msgAgent === currentAgent) {
          setChatHistory([...historyMapRef.current[msgAgent]]);
        } else {
          onUnread?.(msgAgent);
        }
      } else if (msg.type === 'status') {
        const thinking = msg.status === 'thinking';
        thinkingMapRef.current[msgAgent] = thinking;
        // If going idle while streaming, finalize the streaming bubble
        if (!thinking && isStreamingMapRef.current[msgAgent]) {
          const finalText = streamingTextMapRef.current[msgAgent] || '';
          if (finalText.trim()) {
            const entry: ChatMessage = { role: 'assistant', content: finalText };
            historyMapRef.current[msgAgent] = [...(historyMapRef.current[msgAgent] || []), entry];
          }
          streamingTextMapRef.current[msgAgent] = '';
          isStreamingMapRef.current[msgAgent] = false;
          if (msgAgent === currentAgent) {
            if (finalText.trim()) setChatHistory([...historyMapRef.current[msgAgent]]);
            setStreamingText('');
            setIsStreaming(false);
          }
        }
        if (msgAgent === currentAgent) {
          setIsThinking(thinking);
          if (thinking) setIsSending(false);
          if (!thinking) setIsStopping(false);
        }
      } else if (msg.type === 'related_files' && msg.files && msg.files.length > 0) {
        const history = historyMapRef.current[msgAgent];
        if (history && history.length > 0) {
          const lastIdx = history.length - 1;
          if (history[lastIdx].role === 'assistant') {
            history[lastIdx] = { ...history[lastIdx], files: msg.files };
            historyMapRef.current[msgAgent] = [...history];
            if (msgAgent === currentAgent) {
              setChatHistory([...historyMapRef.current[msgAgent]]);
            }
          }
        }
      } else if (msg.type === 'file_diff' && msg.diff) {
        // If streaming, buffer diffs to attach when assistant_end fires
        if (isStreamingMapRef.current[msgAgent]) {
          const pending = pendingDiffsMapRef.current[msgAgent] || [];
          pendingDiffsMapRef.current[msgAgent] = [...pending, msg.diff];
        } else {
          // Attach to the last assistant message
          const history = historyMapRef.current[msgAgent];
          if (history && history.length > 0) {
            const lastIdx = history.length - 1;
            if (history[lastIdx].role === 'assistant') {
              const existing = history[lastIdx].diffs || [];
              history[lastIdx] = { ...history[lastIdx], diffs: [...existing, msg.diff] };
              historyMapRef.current[msgAgent] = [...history];
              if (msgAgent === currentAgent) {
                setChatHistory([...historyMapRef.current[msgAgent]]);
              }
            }
          }
        }
      } else if (msg.type === 'clarification_request' && msg.toolUseId && msg.questions && msg.questions.length > 0) {
        const nextClarification: ClarificationState = { toolUseId: msg.toolUseId, questions: msg.questions };
        clarificationMapRef.current[msgAgent] = nextClarification;
        clarificationIndexRef.current[msgAgent] = 0;
        clarificationProgressRef.current[msgAgent] = {};
        if (msgAgent === currentAgent) {
          setClarification(nextClarification);
          setClarificationIndex(0);
          setClarificationProgress({});
        } else {
          onUnread?.(msgAgent);
        }
      } else if (msg.type === 'turn_end') {
        thinkingMapRef.current[msgAgent] = false;
        if (msgAgent === currentAgent) {
          setIsThinking(false);
          setIsStopping(false);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sse.messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isThinking, streamingText]);

  const resetTextarea = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    setIsSending(true);
    setIsThinking(true);
    thinkingMapRef.current[agentId] = true;
    const entry: ChatMessage = { role: 'user', content: text };
    historyMapRef.current[agentId] = [...(historyMapRef.current[agentId] || []), entry];
    setChatHistory([...historyMapRef.current[agentId]]);
    setInput('');
    resetTextarea();

    try {
      await sse.send(text, agentId);
      setRequestError(null);
      setIsSending(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message';
      setRequestError(message);
      setIsSending(false);
      setIsThinking(false);
      thinkingMapRef.current[agentId] = false;
    }
  };

  const getProgress = (index: number): ClarificationProgress => {
    return clarificationProgress[index] || { selected: [], useCustom: false, customText: '' };
  };

  const setProgressForCurrentAgent = (next: Record<number, ClarificationProgress>) => {
    clarificationProgressRef.current[agentId] = next;
    setClarificationProgress(next);
  };

  const handleSelectOption = (label: string) => {
    if (!clarification) return;
    const currentQuestion = clarification.questions[clarificationIndex];
    if (!currentQuestion) return;
    const prev = getProgress(clarificationIndex);

    let selected: string[];
    if (currentQuestion.multiSelect) {
      const has = prev.selected.includes(label);
      selected = has ? prev.selected.filter(s => s !== label) : [...prev.selected, label];
    } else {
      selected = [label];
    }

    setProgressForCurrentAgent({
      ...clarificationProgress,
      [clarificationIndex]: { ...prev, selected, useCustom: false },
    });
  };

  const handleUseCustom = () => {
    const prev = getProgress(clarificationIndex);
    setProgressForCurrentAgent({
      ...clarificationProgress,
      [clarificationIndex]: { ...prev, selected: [], useCustom: true },
    });
  };

  const handleCustomTextChange = (value: string) => {
    const prev = getProgress(clarificationIndex);
    setProgressForCurrentAgent({
      ...clarificationProgress,
      [clarificationIndex]: { ...prev, customText: value, useCustom: true },
    });
  };

  const resolveAnswer = (question: ClarificationQuestion, progress: ClarificationProgress): string => {
    if (progress.useCustom) return progress.customText.trim();
    if (question.multiSelect) return progress.selected.join(', ');
    return progress.selected[0] || '';
  };

  const moveToQuestion = (index: number) => {
    setClarificationTransitioning(true);
    setTimeout(() => {
      clarificationIndexRef.current[agentId] = index;
      setClarificationIndex(index);
      setClarificationTransitioning(false);
    }, 140);
  };

  const handleNextQuestion = () => {
    if (!clarification) return;
    if (clarificationIndex >= clarification.questions.length - 1) return;
    moveToQuestion(clarificationIndex + 1);
  };

  const handlePrevQuestion = () => {
    if (clarificationIndex <= 0) return;
    moveToQuestion(clarificationIndex - 1);
  };

  const handleSubmitClarification = async () => {
    if (!clarification) return;
    const answers: Record<string, string> = {};
    for (let i = 0; i < clarification.questions.length; i++) {
      const question = clarification.questions[i];
      const progress = clarificationProgress[i] || { selected: [], useCustom: false, customText: '' };
      const resolved = resolveAnswer(question, progress);
      if (!resolved) return;
      answers[question.question] = resolved;
    }

    setIsSubmittingClarification(true);
    try {
      await sse.answerClarification(agentId, clarification.toolUseId, answers);
      setRequestError(null);
      clarificationMapRef.current[agentId] = undefined;
      clarificationIndexRef.current[agentId] = undefined;
      clarificationProgressRef.current[agentId] = undefined;
      setClarification(null);
      setClarificationIndex(0);
      setClarificationProgress({});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit clarification';
      setRequestError(message);
    } finally {
      setIsSubmittingClarification(false);
    }
  };

  const handleStop = async () => {
    if (isStopping) return;
    setIsStopping(true);
    try {
      await sse.stop(agentId);
      setRequestError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop';
      setRequestError(message);
      setIsStopping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = async () => {
    try {
      await sse.newChat(agentId);
      setRequestError(null);
      historyMapRef.current[agentId] = [];
      clarificationMapRef.current[agentId] = undefined;
      clarificationIndexRef.current[agentId] = undefined;
      clarificationProgressRef.current[agentId] = undefined;
      setChatHistory([]);
      setClarification(null);
      setClarificationIndex(0);
      setClarificationProgress({});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start a new chat';
      setRequestError(message);
    }
  };

  const sendDisabled = !input.trim() || !sse.connected || isSending || isThinking;
  const activeQuestion = clarification?.questions[clarificationIndex];
  const activeProgress = activeQuestion ? getProgress(clarificationIndex) : undefined;
  const canMoveNext = !!(activeQuestion && activeProgress && resolveAnswer(activeQuestion, activeProgress));
  const isLastQuestion = !!(clarification && clarificationIndex === clarification.questions.length - 1);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800/60 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Chat</h2>
          <span className="text-xs text-slate-700 dark:text-slate-500 bg-slate-200 dark:bg-slate-800/60 px-2 py-0.5 rounded-md font-mono">{agentId}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="relative" ref={fileBrowserRef}>
            <button
              onClick={toggleFileBrowser}
              className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors duration-150 cursor-pointer px-2.5 py-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              title="Browse workspace files"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              </svg>
              Files
            </button>
            {fileBrowserOpen && (
              <div className="absolute right-0 top-full mt-1 w-72 max-h-80 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700/60 rounded-xl shadow-xl overflow-hidden z-40 animate-fade-in-up">
                <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800/60 text-[11px] text-slate-500 uppercase tracking-wider font-medium">
                  Workspace Files
                </div>
                <div className="overflow-y-auto max-h-64">
                  {fileBrowserLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-dot-bounce" />
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-dot-bounce" style={{ animationDelay: '0.16s' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-dot-bounce" style={{ animationDelay: '0.32s' }} />
                      </div>
                    </div>
                  ) : fileBrowserList.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-6">No files found</p>
                  ) : (
                    fileBrowserList.map((f) => (
                      <button
                        key={f.path}
                        onClick={() => {
                          onOpenPreview?.(f.path);
                          setFileBrowserOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer transition-colors duration-150 flex items-center gap-2 border-b border-slate-200 dark:border-slate-800/30 last:border-0 focus:outline-none focus:bg-slate-100 dark:focus:bg-slate-800/60"
                      >
                        <svg className="w-3 h-3 text-slate-500 dark:text-slate-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className="font-mono truncate">{f.path}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={handleNewChat}
            disabled={isThinking}
            className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer px-2.5 py-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800/50"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Chat
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {chatHistory.length === 0 && !isThinking && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-200 dark:bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-slate-500 dark:text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-500">Start a conversation</p>
            </div>
          </div>
        )}
        <div className="space-y-4">
          {chatHistory.map((msg, i) => (
            <div
              key={i}
              className={`flex animate-fade-in-up ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : msg.role === 'error'
                      ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-900/50'
                      : msg.role === 'task'
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-200 border border-amber-200 dark:border-amber-900/50'
                        : 'bg-slate-100 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700/40'
                }`}
              >
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed">{msg.content}</p>
                ) : (
                  <>
                    <div className="markdown-body prose dark:prose-invert prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                    {msg.files && msg.files.length > 0 && (
                      <div className="mt-2.5 pt-2.5 border-t border-slate-700/30 flex flex-wrap gap-1.5">
                        {msg.files.map((f) => (
                          <button
                            key={f.path}
                            onClick={() => onOpenPreview?.(f.path)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-700/40 hover:bg-slate-700/70 text-xs text-slate-300 hover:text-slate-100 cursor-pointer transition-colors duration-150 border border-slate-600/30 hover:border-slate-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                            title={`Preview ${f.path}`}
                          >
                            <svg className="w-3 h-3 text-slate-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                            <span className="font-mono truncate max-w-[180px]">{f.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {msg.diffs && msg.diffs.length > 0 && (
                      <div className="mt-2.5 pt-2.5 border-t border-slate-700/30 space-y-2">
                        {msg.diffs.map((d, di) => {
                          const diffKey = `${i}-${di}`;
                          const isExpanded = !!expandedDiffs[diffKey];
                          return (
                            <div key={diffKey} className="rounded-lg border border-slate-700/40 overflow-hidden">
                              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800/40">
                                <button
                                  onClick={() => setExpandedDiffs(prev => ({ ...prev, [diffKey]: !prev[diffKey] }))}
                                  className="flex items-center gap-1.5 flex-1 min-w-0 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                                >
                                  <svg className={`w-3 h-3 text-slate-500 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="9 18 15 12 9 6" />
                                  </svg>
                                  <svg className="w-3 h-3 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                  <span className="font-mono truncate">{d.fileName}</span>
                                  <span className="text-emerald-400 text-[10px] shrink-0">+{d.additions}</span>
                                  <span className="text-red-400 text-[10px] shrink-0">-{d.deletions}</span>
                                  <span className="text-[10px] text-slate-600 shrink-0">
                                    {d.diffType === 'create' ? 'new' : d.diffType}
                                  </span>
                                </button>
                                <button
                                  onClick={() => onOpenDiff?.(d)}
                                  className="px-1.5 py-0.5 rounded text-[10px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700/60 cursor-pointer transition-colors shrink-0"
                                  title="Open in panel"
                                >
                                  ↗
                                </button>
                              </div>
                              {isExpanded && d.hunks.length > 0 && (
                                <div className="border-t border-slate-700/30 overflow-x-auto max-h-[300px] overflow-y-auto">
                                  {d.hunks.map((hunk, hi) => (
                                    <div key={hi}>
                                      <div className="text-[10px] text-slate-600 bg-slate-900/40 px-3 py-0.5 font-mono sticky top-0">
                                        @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                                      </div>
                                      {hunk.lines.map((line, li) => {
                                        const prefix = line[0];
                                        const content = line.slice(1);
                                        return (
                                          <div
                                            key={li}
                                            className={`px-3 font-mono text-[11px] leading-[1.6] whitespace-pre ${
                                              prefix === '+' ? 'bg-emerald-950/30 text-emerald-300'
                                              : prefix === '-' ? 'bg-red-950/30 text-red-300'
                                              : 'text-slate-700'
                                            }`}
                                          >
                                            <span className="select-none opacity-70 inline-block w-3">{prefix}</span>{content}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          {isStreaming && streamingText && (
            <div className="flex justify-start animate-fade-in-up">
              <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-slate-100 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700/40">
                <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed">{streamingText}<span className="inline-block w-1.5 h-4 bg-slate-400 dark:bg-slate-500 animate-pulse ml-0.5 align-text-bottom rounded-sm" /></p>
              </div>
            </div>
          )}
          {isThinking && !isStreaming && (
            <div className="flex justify-start animate-fade-in-up">
              <div className="bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/40 rounded-2xl px-4 py-3.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-400 animate-dot-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-dot-bounce" style={{ animationDelay: '0.16s' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-dot-bounce" style={{ animationDelay: '0.32s' }} />
              </div>
            </div>
          )}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-200 dark:border-slate-800/60 px-6 py-4 shrink-0">
        {requestError && (
          <p className="mb-3 text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {requestError}
          </p>
        )}
        {clarification && activeQuestion ? (
          <>
            {/* 折叠时显示的底部展开条 */}
            {clarificationCollapsed && (
              <div
                onClick={() => setClarificationCollapsed(false)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl cursor-pointer transition-colors duration-200 flex items-center justify-between shadow-lg"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wider font-medium opacity-90">{activeQuestion.header}</span>
                  <span className="text-[10px] opacity-70">•</span>
                  <span className="text-[10px] opacity-70">{clarificationIndex + 1}/{clarification.questions.length}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">点击展开选项</span>
                  <svg className="w-4 h-4 transition-transform duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>
            )}

            {/* 展开时显示的完整选项框 */}
            {!clarificationCollapsed && (
              <div className={`bg-white dark:bg-slate-900/80 border border-indigo-200 dark:border-indigo-500/20 rounded-2xl transition-all duration-200 ${clarificationTransitioning ? 'opacity-60 translate-y-1' : 'opacity-100 translate-y-0'}`}>
                {/* 可点击的顶部区域 - 用于折叠 */}
                <div
                  onClick={() => setClarificationCollapsed(true)}
                  className="px-4 pt-3 pb-2 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-colors duration-150 rounded-t-2xl"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="text-[11px] text-indigo-600 dark:text-indigo-400 uppercase tracking-wider font-medium">{activeQuestion.header}</div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-600">•</div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-600">点击收起</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-[11px] text-slate-500 font-mono">
                        {clarificationIndex + 1}/{clarification.questions.length}
                      </div>
                      <svg className="w-4 h-4 text-slate-400 transition-transform duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="18 15 12 9 6 15" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* 选项内容区域 */}
                <div className="px-4 pb-4">
                  <p className="text-sm text-slate-800 dark:text-slate-200 mt-2 leading-relaxed">{activeQuestion.question}</p>
                  <div className="mt-3 space-y-2">
                    {activeQuestion.options.map((opt) => {
                      const active = activeProgress?.selected.includes(opt.label) && !activeProgress?.useCustom;
                      return (
                        <button
                          key={opt.label}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectOption(opt.label);
                          }}
                          className={`w-full text-left rounded-xl border px-3 py-2.5 cursor-pointer transition-colors duration-150 ${active ? 'border-indigo-500 dark:border-indigo-500/50 bg-indigo-100 dark:bg-indigo-600/15 text-indigo-700 dark:text-indigo-200' : 'border-slate-300 dark:border-slate-700/50 bg-white dark:bg-slate-800/40 hover:border-slate-400 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300'}`}
                        >
                          <p className="text-sm">{opt.label}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-500 mt-0.5">{opt.description}</p>
                        </button>
                      );
                    })}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUseCustom();
                      }}
                      className={`w-full text-left rounded-xl border px-3 py-2.5 cursor-pointer transition-colors duration-150 ${activeProgress?.useCustom ? 'border-indigo-500 dark:border-indigo-500/50 bg-indigo-100 dark:bg-indigo-600/15 text-indigo-700 dark:text-indigo-200' : 'border-slate-300 dark:border-slate-700/50 bg-white dark:bg-slate-800/40 hover:border-slate-400 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300'}`}
                    >
                      <p className="text-sm">自定义输入</p>
                      <p className="text-xs text-slate-600 dark:text-slate-500 mt-0.5">填写你的具体答案</p>
                    </button>
                    {activeProgress?.useCustom && (
                      <textarea
                        value={activeProgress.customText}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleCustomTextChange(e.target.value);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        rows={2}
                        className="w-full bg-white dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700/50 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500/50 input-glow text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 resize-none transition-colors duration-150"
                        placeholder="请输入自定义答案"
                      />
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrevQuestion();
                      }}
                      disabled={clarificationIndex === 0 || clarificationTransitioning || isSubmittingClarification}
                      className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700/50 text-sm text-slate-600 dark:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150 hover:border-slate-400 dark:hover:border-slate-600 hover:text-slate-800 dark:hover:text-slate-300"
                    >
                      上一题
                    </button>
                    {isLastQuestion ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSubmitClarification();
                        }}
                        disabled={!canMoveNext || isSubmittingClarification}
                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-600 text-white text-sm rounded-lg font-medium cursor-pointer transition-colors duration-150"
                      >
                        {isSubmittingClarification ? '提交中...' : '提交答案'}
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNextQuestion();
                        }}
                        disabled={!canMoveNext || clarificationTransitioning}
                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-600 text-white text-sm rounded-lg font-medium cursor-pointer transition-colors duration-150"
                      >
                        下一题
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex gap-2.5 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => { isComposingRef.current = true; }}
              onCompositionEnd={() => { isComposingRef.current = false; }}
              placeholder="Send a message..."
              disabled={isThinking}
              rows={1}
              className="flex-1 bg-white dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700/50 rounded-xl px-4 py-3 resize-none focus:outline-none focus:border-indigo-500/40 input-glow text-[0.9375rem] text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 disabled:opacity-40 overflow-y-auto transition-colors duration-150"
              style={{ maxHeight: '120px' }}
            />
            {isThinking ? (
              <button
                onClick={handleStop}
                disabled={isStopping}
                className="p-3 bg-red-600 hover:bg-red-500 disabled:bg-red-200 dark:disabled:bg-red-800/50 disabled:opacity-50 text-white rounded-xl cursor-pointer transition-colors duration-150 shrink-0"
                title="Stop"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={sendDisabled}
                className="p-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-600 text-white rounded-xl cursor-pointer transition-colors duration-150 shrink-0"
                title="Send"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
