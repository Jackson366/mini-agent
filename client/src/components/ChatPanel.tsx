import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SseMessage } from '../hooks/useSSE';

interface ChatMessage {
  role: 'user' | 'assistant' | 'error' | 'task';
  content: string;
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

export default function ChatPanel({ sse, agentId, onUnread }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const historyMapRef = useRef<Record<string, ChatMessage[]>>({});
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const thinkingMapRef = useRef<Record<string, boolean>>({});
  const [isSending, setIsSending] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [clarification, setClarification] = useState<ClarificationState | null>(null);
  const [clarificationIndex, setClarificationIndex] = useState(0);
  const [clarificationProgress, setClarificationProgress] = useState<Record<number, ClarificationProgress>>({});
  const [clarificationTransitioning, setClarificationTransitioning] = useState(false);
  const [isSubmittingClarification, setIsSubmittingClarification] = useState(false);
  const clarificationMapRef = useRef<Record<string, ClarificationState | undefined>>({});
  const clarificationIndexRef = useRef<Record<string, number | undefined>>({});
  const clarificationProgressRef = useRef<Record<string, Record<number, ClarificationProgress> | undefined>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const processedCount = useRef(0);
  const agentIdRef = useRef(agentId);
  const isComposingRef = useRef(false);
  agentIdRef.current = agentId;

  useEffect(() => {
    setChatHistory(historyMapRef.current[agentId] || []);
    setIsThinking(!!thinkingMapRef.current[agentId]);
    setIsStopping(false);
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

      if (msg.type === 'assistant' && msg.text) {
        const entry: ChatMessage = { role: 'assistant', content: msg.text! };
        historyMapRef.current[msgAgent] = [...(historyMapRef.current[msgAgent] || []), entry];
        thinkingMapRef.current[msgAgent] = false;
        if (msgAgent === currentAgent) {
          setChatHistory([...historyMapRef.current[msgAgent]]);
          setIsThinking(false);
        } else {
          onUnread?.(msgAgent);
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
        if (msgAgent === currentAgent) {
          setIsThinking(thinking);
          if (thinking) setIsSending(false);
          if (!thinking) setIsStopping(false);
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
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sse.messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isThinking]);

  const resetTextarea = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    setIsSending(true);
    const entry: ChatMessage = { role: 'user', content: text };
    historyMapRef.current[agentId] = [...(historyMapRef.current[agentId] || []), entry];
    setChatHistory([...historyMapRef.current[agentId]]);
    setInput('');
    resetTextarea();

    try {
      await sse.send(text, agentId);
      setRequestError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message';
      setRequestError(message);
      setIsSending(false);
    }

    setTimeout(() => setIsSending(false), 500);
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
      <div className="border-b border-slate-800/60 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-100">Chat</h2>
          <span className="text-xs text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded-md font-mono">{agentId}</span>
        </div>
        <button
          onClick={handleNewChat}
          disabled={isThinking}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer px-2.5 py-1.5 rounded-lg hover:bg-slate-800/50"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {chatHistory.length === 0 && !isThinking && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </div>
              <p className="text-sm text-slate-500">Start a conversation</p>
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
                      ? 'bg-red-950/40 text-red-300 border border-red-900/50'
                      : msg.role === 'task'
                        ? 'bg-amber-950/40 text-amber-200 border border-amber-900/50'
                        : 'bg-slate-800/60 text-slate-200 border border-slate-700/40'
                }`}
              >
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed">{msg.content}</p>
                ) : (
                  <div className="markdown-body prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isThinking && (
            <div className="flex justify-start animate-fade-in-up">
              <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl px-4 py-3.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-dot-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-dot-bounce" style={{ animationDelay: '0.16s' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-dot-bounce" style={{ animationDelay: '0.32s' }} />
              </div>
            </div>
          )}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-800/60 px-6 py-4 shrink-0">
        {requestError && (
          <p className="mb-3 text-xs text-red-400 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {requestError}
          </p>
        )}
        {clarification && activeQuestion ? (
          <div className={`bg-slate-900/80 border border-indigo-500/20 rounded-2xl p-4 transition-all duration-200 ${clarificationTransitioning ? 'opacity-60 translate-y-1' : 'opacity-100 translate-y-0'}`}>
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-indigo-400 uppercase tracking-wider font-medium">{activeQuestion.header}</div>
              <div className="text-[11px] text-slate-500 font-mono">
                {clarificationIndex + 1}/{clarification.questions.length}
              </div>
            </div>
            <p className="text-sm text-slate-200 mt-2 leading-relaxed">{activeQuestion.question}</p>
            <div className="mt-3 space-y-2">
              {activeQuestion.options.map((opt) => {
                const active = activeProgress?.selected.includes(opt.label) && !activeProgress?.useCustom;
                return (
                  <button
                    key={opt.label}
                    onClick={() => handleSelectOption(opt.label)}
                    className={`w-full text-left rounded-xl border px-3 py-2.5 cursor-pointer transition-colors duration-150 ${active ? 'border-indigo-500/50 bg-indigo-600/15 text-indigo-200' : 'border-slate-700/50 bg-slate-800/40 hover:border-slate-600 text-slate-300'}`}
                  >
                    <p className="text-sm">{opt.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>
                  </button>
                );
              })}
              <button
                onClick={handleUseCustom}
                className={`w-full text-left rounded-xl border px-3 py-2.5 cursor-pointer transition-colors duration-150 ${activeProgress?.useCustom ? 'border-indigo-500/50 bg-indigo-600/15 text-indigo-200' : 'border-slate-700/50 bg-slate-800/40 hover:border-slate-600 text-slate-300'}`}
              >
                <p className="text-sm">自定义输入</p>
                <p className="text-xs text-slate-500 mt-0.5">填写你的具体答案</p>
              </button>
              {activeProgress?.useCustom && (
                <textarea
                  value={activeProgress.customText}
                  onChange={(e) => handleCustomTextChange(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500/50 input-glow text-sm text-slate-200 placeholder-slate-600 resize-none transition-colors duration-150"
                  placeholder="请输入自定义答案"
                />
              )}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={handlePrevQuestion}
                disabled={clarificationIndex === 0 || clarificationTransitioning || isSubmittingClarification}
                className="px-4 py-2 rounded-lg border border-slate-700/50 text-sm text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150 hover:border-slate-600 hover:text-slate-300"
              >
                上一题
              </button>
              {isLastQuestion ? (
                <button
                  onClick={handleSubmitClarification}
                  disabled={!canMoveNext || isSubmittingClarification}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-sm rounded-lg font-medium cursor-pointer transition-colors duration-150"
                >
                  {isSubmittingClarification ? '提交中...' : '提交答案'}
                </button>
              ) : (
                <button
                  onClick={handleNextQuestion}
                  disabled={!canMoveNext || clarificationTransitioning}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-sm rounded-lg font-medium cursor-pointer transition-colors duration-150"
                >
                  下一题
                </button>
              )}
            </div>
          </div>
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
              className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 resize-none focus:outline-none focus:border-indigo-500/40 input-glow text-[0.9375rem] text-slate-100 placeholder-slate-500 disabled:opacity-40 overflow-y-auto transition-colors duration-150"
              style={{ maxHeight: '120px' }}
            />
            {isThinking ? (
              <button
                onClick={handleStop}
                disabled={isStopping}
                className="p-3 bg-red-600/90 hover:bg-red-500 disabled:bg-red-800/50 disabled:opacity-50 text-white rounded-xl cursor-pointer transition-colors duration-150 shrink-0"
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
                className="p-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl cursor-pointer transition-colors duration-150 shrink-0"
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
