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
    send: (text: string, workspace: string) => Promise<void>;
    stop: (workspace: string) => Promise<void>;
    newChat: (workspace: string) => Promise<void>;
    clearMessages: () => void;
  };
  workspace: string;
  onUnread?: (ws: string) => void;
}

export default function ChatPanel({ sse, workspace, onUnread }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const historyMapRef = useRef<Record<string, ChatMessage[]>>({});
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const thinkingMapRef = useRef<Record<string, boolean>>({});
  const [isSending, setIsSending] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const processedCount = useRef(0);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  useEffect(() => {
    setChatHistory(historyMapRef.current[workspace] || []);
    setIsThinking(!!thinkingMapRef.current[workspace]);
    setIsStopping(false);
  }, [workspace]);

  useEffect(() => {
    const newMessages = sse.messages.slice(processedCount.current);
    processedCount.current = sse.messages.length;

    const currentWs = workspaceRef.current;

    for (const msg of newMessages) {
      const msgWs = msg.agentId || msg.workspace || 'main';

      if (msg.type === 'assistant' && msg.text) {
        const entry: ChatMessage = { role: 'assistant', content: msg.text! };
        historyMapRef.current[msgWs] = [...(historyMapRef.current[msgWs] || []), entry];
        thinkingMapRef.current[msgWs] = false;
        if (msgWs === currentWs) {
          setChatHistory([...historyMapRef.current[msgWs]]);
          setIsThinking(false);
        } else {
          onUnread?.(msgWs);
        }
      } else if (msg.type === 'error' && msg.text) {
        const entry: ChatMessage = { role: 'error', content: msg.text! };
        historyMapRef.current[msgWs] = [...(historyMapRef.current[msgWs] || []), entry];
        if (msgWs === currentWs) {
          setChatHistory([...historyMapRef.current[msgWs]]);
        } else {
          onUnread?.(msgWs);
        }
      } else if (msg.type === 'task_message' && msg.text) {
        const entry: ChatMessage = { role: 'task', content: msg.text! };
        historyMapRef.current[msgWs] = [...(historyMapRef.current[msgWs] || []), entry];
        if (msgWs === currentWs) {
          setChatHistory([...historyMapRef.current[msgWs]]);
        } else {
          onUnread?.(msgWs);
        }
      } else if (msg.type === 'status') {
        const thinking = msg.status === 'thinking';
        thinkingMapRef.current[msgWs] = thinking;
        if (msgWs === currentWs) {
          setIsThinking(thinking);
          if (thinking) setIsSending(false);
          if (!thinking) setIsStopping(false);
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
    historyMapRef.current[workspace] = [...(historyMapRef.current[workspace] || []), entry];
    setChatHistory([...historyMapRef.current[workspace]]);
    setInput('');

    try {
      await sse.send(text, workspace);
    } catch {
      setIsSending(false);
    }

    setTimeout(() => setIsSending(false), 500);
  };

  const handleStop = async () => {
    if (isStopping) return;
    setIsStopping(true);
    try {
      await sse.stop(workspace);
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
    await sse.newChat(workspace);
    historyMapRef.current[workspace] = [];
    setChatHistory([]);
  };

  const sendDisabled = !input.trim() || !sse.connected || isSending || isThinking;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Chat</h2>
          <span className="text-sm text-gray-500">agent: {workspace}</span>
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
      </div>
    </div>
  );
}
