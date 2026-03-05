import { useEffect, useRef, useCallback, useState } from 'react';
import { apiFetch } from '../lib/api';

export interface SseMessage {
  type: 'assistant' | 'status' | 'error' | 'task_message' | 'session' | 'clarification_request';
  text?: string;
  status?: string;
  sessionId?: string;
  taskId?: string;
  agentId?: string;
  toolUseId?: string;
  questions?: Array<{
    question: string;
    header: string;
    multiSelect?: boolean;
    options: Array<{ label: string; description: string }>;
  }>;
}

const API_BASE = import.meta.env.DEV ? 'http://localhost:3210' : '';

export function useSSE() {
  const esRef = useRef<EventSource | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<SseMessage[]>([]);

  const connect = useCallback(() => {
    if (esRef.current) return;

    const es = new EventSource(`${API_BASE}/api/chat/stream`);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const msg: SseMessage = JSON.parse(event.data);
        setMessages(prev => [...prev, msg]);
      } catch { /* ignore */ }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      esRef.current = null;
      setTimeout(connect, 3000);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);

  const send = useCallback(async (text: string, agentId: string) => {
    await apiFetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, agentId }),
    });
  }, []);

  const stop = useCallback(async (agentId: string) => {
    await apiFetch(`${API_BASE}/api/chat/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
  }, []);

  const newChat = useCallback(async (agentId: string) => {
    await apiFetch(`${API_BASE}/api/chat/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
    setMessages([]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const answerClarification = useCallback(async (
    agentId: string,
    toolUseId: string,
    answers: Record<string, string>,
  ) => {
    await apiFetch(`${API_BASE}/api/chat/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, toolUseId, answers }),
    });
  }, []);

  return { connected, messages, send, stop, newChat, clearMessages, answerClarification };
}
