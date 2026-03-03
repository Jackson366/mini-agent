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
  const [clarification, setClarification] = useState<ClarificationState | null>(null);
  const [clarificationIndex, setClarificationIndex] = useState(0);
  const [clarificationProgress, setClarificationProgress] = useState<Record<number, ClarificationProgress>>({});
  const [clarificationTransitioning, setClarificationTransitioning] = useState(false);
  const [isSubmittingClarification, setIsSubmittingClarification] = useState(false);
  const clarificationMapRef = useRef<Record<string, ClarificationState | undefined>>({});
  const clarificationIndexRef = useRef<Record<string, number | undefined>>({});
  const clarificationProgressRef = useRef<Record<string, Record<number, ClarificationProgress> | undefined>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const processedCount = useRef(0);
  const agentIdRef = useRef(agentId);
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

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    setIsSending(true);
    const entry: ChatMessage = { role: 'user', content: text };
    historyMapRef.current[agentId] = [...(historyMapRef.current[agentId] || []), entry];
    setChatHistory([...historyMapRef.current[agentId]]);
    setInput('');

    try {
      await sse.send(text, agentId);
    } catch {
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
      clarificationMapRef.current[agentId] = undefined;
      clarificationIndexRef.current[agentId] = undefined;
      clarificationProgressRef.current[agentId] = undefined;
      setClarification(null);
      setClarificationIndex(0);
      setClarificationProgress({});
    } finally {
      setIsSubmittingClarification(false);
    }
  };

  const handleStop = async () => {
    if (isStopping) return;
    setIsStopping(true);
    try {
      await sse.stop(agentId);
    } catch {
      setIsStopping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = async () => {
    await sse.newChat(agentId);
    historyMapRef.current[agentId] = [];
    clarificationMapRef.current[agentId] = undefined;
    clarificationIndexRef.current[agentId] = undefined;
    clarificationProgressRef.current[agentId] = undefined;
    setChatHistory([]);
    setClarification(null);
    setClarificationIndex(0);
    setClarificationProgress({});
  };

  const sendDisabled = !input.trim() || !sse.connected || isSending || isThinking;
  const activeQuestion = clarification?.questions[clarificationIndex];
  const activeProgress = activeQuestion ? getProgress(clarificationIndex) : undefined;
  const canMoveNext = !!(activeQuestion && activeProgress && resolveAnswer(activeQuestion, activeProgress));
  const isLastQuestion = !!(clarification && clarificationIndex === clarification.questions.length - 1);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Chat</h2>
          <span className="text-sm text-gray-500">agent: {agentId}</span>
        </div>
        <button
          onClick={handleNewChat}
          disabled={isThinking}
          className="text-sm text-gray-500 hover:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {chatHistory.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : msg.role === 'error'
                    ? 'bg-red-900/50 text-red-300 border border-red-800'
                    : msg.role === 'task'
                      ? 'bg-amber-900/50 text-amber-200 border border-amber-800'
                      : 'bg-gray-800 text-gray-100'
              }`}
            >
              {msg.role === 'user' ? (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <div className="markdown-body prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}
        {isThinking && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-2xl px-4 py-3 text-gray-400">
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-800 px-6 py-4">
        {clarification && activeQuestion ? (
          <div className={`bg-gray-900 border border-blue-700/50 rounded-2xl p-4 transition-all duration-200 ${clarificationTransitioning ? 'opacity-60 translate-y-1' : 'opacity-100 translate-y-0'}`}>
            <div className="flex items-center justify-between">
              <div className="text-xs text-blue-300 uppercase tracking-wide">{activeQuestion.header}</div>
              <div className="text-xs text-gray-400">
                {clarificationIndex + 1}/{clarification.questions.length}
              </div>
            </div>
            <p className="text-sm text-gray-100 mt-2">{activeQuestion.question}</p>
            <div className="mt-3 space-y-2">
              {activeQuestion.options.map((opt) => {
                const active = activeProgress?.selected.includes(opt.label) && !activeProgress?.useCustom;
                return (
                  <button
                    key={opt.label}
                    onClick={() => handleSelectOption(opt.label)}
                    className={`w-full text-left rounded-xl border px-3 py-2 transition ${active ? 'border-blue-500 bg-blue-600/20' : 'border-gray-700 bg-gray-800 hover:border-gray-500'}`}
                  >
                    <p className="text-sm text-gray-100">{opt.label}</p>
                    <p className="text-xs text-gray-400 mt-1">{opt.description}</p>
                  </button>
                );
              })}
              <button
                onClick={handleUseCustom}
                className={`w-full text-left rounded-xl border px-3 py-2 transition ${activeProgress?.useCustom ? 'border-blue-500 bg-blue-600/20' : 'border-gray-700 bg-gray-800 hover:border-gray-500'}`}
              >
                <p className="text-sm text-gray-100">自定义输入</p>
                <p className="text-xs text-gray-400 mt-1">填写你的具体答案</p>
              </button>
              {activeProgress?.useCustom && (
                <textarea
                  value={activeProgress.customText}
                  onChange={(e) => handleCustomTextChange(e.target.value)}
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 text-gray-100 placeholder-gray-500 resize-none"
                  placeholder="请输入自定义答案"
                />
              )}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={handlePrevQuestion}
                disabled={clarificationIndex === 0 || clarificationTransitioning || isSubmittingClarification}
                className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                上一题
              </button>
              {isLastQuestion ? (
                <button
                  onClick={handleSubmitClarification}
                  disabled={!canMoveNext || isSubmittingClarification}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium transition"
                >
                  {isSubmittingClarification ? '提交中...' : '提交答案'}
                </button>
              ) : (
                <button
                  onClick={handleNextQuestion}
                  disabled={!canMoveNext || clarificationTransitioning}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium transition"
                >
                  下一题
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={handleKeyDown}
              placeholder="Send a message..."
              disabled={isThinking}
              rows={1}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 resize-none focus:outline-none focus:border-blue-500 text-gray-100 placeholder-gray-500 disabled:opacity-50 overflow-y-auto"
              style={{ maxHeight: '120px' }}
            />
            {isThinking ? (
              <button
                onClick={handleStop}
                disabled={isStopping}
                className="px-5 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:opacity-60 text-white rounded-xl font-medium transition"
              >
                {isStopping ? 'Stopping...' : 'Stop'}
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={sendDisabled}
                className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-medium transition"
              >
                Send
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
