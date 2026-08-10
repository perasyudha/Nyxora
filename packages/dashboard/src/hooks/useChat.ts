import { useState, useRef, useEffect } from 'react';
import { apiFetch } from '../utils/api';

export interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  name?: string;
  reasoning_content?: string;
  tool_calls?: any[];
  progressLogs?: any[];
  isOptimistic?: boolean;
  isStreaming?: boolean;
  progress?: string;
}

export const useChat = (isVoiceMode: boolean, speak: (text: string) => void) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatSessions, setChatSessions] = useState<any[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => localStorage.getItem('nyxora_active_session_id') || null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessionTitle, setEditSessionTitle] = useState<string>('');
  const isCreatingSessionRef = useRef(false);
  
  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem('nyxora_active_session_id', activeSessionId);
    } else {
      localStorage.removeItem('nyxora_active_session_id');
    }
  }, [activeSessionId]);

  const fetchHistory = async (sessionId: string | null = activeSessionId) => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    try {
      const url = `/api/history?session_id=${sessionId}`;
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => {
          // Protect local typewriter streaming and optimistic user messages from being wiped
          if (prev.some(m => m.isStreaming || m.isOptimistic)) {
            return prev;
          }

          if (prev.length === data.length) {
            const isSame = data.every((d: any, i: number) => 
              prev[i] && prev[i].role === d.role && prev[i].content === d.content
            );
            if (isSame) return prev;
          }

          return data;
        });
      }
    } catch (err) {
      console.warn('Backend not ready, retrying history fetch in 2s...');
    }
  };

  const fetchSessions = async (sessionId: string | null = activeSessionId) => {
    try {
      const res = await apiFetch(`/api/sessions?client=dashboard`);
      if (res.ok) {
        const data = await res.json();
        setChatSessions(data);
        if (data.length > 0) {
          const exists = data.some((s: any) => s.id === sessionId);
          if (!sessionId || !exists) {
            setActiveSessionId(data[0].id);
          }
        }
      }
    } catch {}
  };

  const createNewSession = async (projectId?: string) => {
    try {
      const body: any = { title: 'New Chat', client: 'dashboard' };
      if (projectId) body.project_id = projectId;
      
      const res = await apiFetch(`/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const { id } = await res.json();
        setActiveSessionId(id);
        setMessages([]);
        await fetchSessions();
      }
    } catch {}
  };

  const renameSession = async (id: string, newTitle: string) => {
    try {
      await apiFetch(`/api/sessions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      });
      setEditingSessionId(null);
      await fetchSessions();
    } catch {}
  };

  const deleteSession = async (id: string) => {
    try {
      await apiFetch(`/api/sessions/${id}`, { method: 'DELETE' });
      const res = await apiFetch(`/api/sessions?client=dashboard`);
      if (res.ok) {
        const remaining = await res.json();
        setChatSessions(remaining);
        if (activeSessionId === id) {
          // Auto-switch to first remaining session, or clear
          const nextSession = remaining.find((s: any) => s.id !== id);
          if (nextSession) {
            setActiveSessionId(nextSession.id);
          } else {
            setActiveSessionId(null);
            setMessages([]);
          }
        }
      }
    } catch {}
  };

  const handleSend = async (e: React.FormEvent | null, customMsg?: string) => {
    e?.preventDefault();
    const userMsg = customMsg || input;
    if (!userMsg.trim() || isLoading) return;

    setInput('');
    setIsLoading(true);

    if (userMsg.trim() === '/clear') {
      if (activeSessionId) {
        try {
          await apiFetch(`/api/sessions/${activeSessionId}`, { method: 'DELETE' });
        } catch (err) {
          console.error('Failed to clear session', err);
        }
      }
      setActiveSessionId(null);
      setMessages([]);
      await fetchSessions();
      setIsLoading(false);
      return;
    }

    let currentSessionId = activeSessionId;

    if (!currentSessionId) {
      // Guard: prevent double session creation on rapid sends
      if (isCreatingSessionRef.current) {
        setIsLoading(false);
        return;
      }
      isCreatingSessionRef.current = true;
      try {
        const title = userMsg.length > 25 ? userMsg.substring(0, 25) + '...' : userMsg;
        const res = await apiFetch(`/api/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, client: 'dashboard' })
        });
        if (res.ok) {
          const { id } = await res.json();
          currentSessionId = id;
          setActiveSessionId(id);
          await fetchSessions(id);
        }
      } catch (err) {
        console.error('Failed to auto-create session', err);
      } finally {
        isCreatingSessionRef.current = false;
      }
    }

    setMessages(prev => [...prev, { role: 'user', content: userMsg, isOptimistic: true }]);

    const streamingId = `streaming-${Date.now()}`;
    setMessages(prev => [...prev, { role: 'assistant', content: '', id: streamingId, isStreaming: true }]);

    let fullResponse = '';
    let renderedResponse = '';
    let streamedReasoning = '';
    let intervalId: NodeJS.Timeout | null = null;

    try {
      const token = localStorage.getItem('nyxora_token') || '';
      const params = new URLSearchParams({
        message: userMsg,
        session_id: currentSessionId || '',
        token,
      });

      await new Promise<void>((resolve, reject) => {
        const source = new EventSource(`/api/chat/stream?${params}`);
        let isSourceClosed = false;

        intervalId = setInterval(() => {
          if (renderedResponse.length < fullResponse.length) {
            const remaining = fullResponse.length - renderedResponse.length;
            const charsPerFrame = Math.max(2, Math.ceil(remaining / 4)); 
            
            const charsToAdd = fullResponse.slice(renderedResponse.length, renderedResponse.length + charsPerFrame);
            renderedResponse += charsToAdd;
          }

          let displayContent = renderedResponse;
          let displayReasoning = streamedReasoning;

          const thinkMatch = displayContent.match(/<(think|thought|thinking|reasoning|analysis|reflection|ant-thinking|ant_thinking)[^>]*>([\s\S]*?)(<\/\1>|$)/i);
          if (thinkMatch) {
            displayReasoning += (displayReasoning ? '\n' : '') + thinkMatch[2];
            displayContent = displayContent.replace(/<(think|thought|thinking|reasoning|analysis|reflection|ant-thinking|ant_thinking)[^>]*>([\s\S]*?)(<\/\1>|$)/i, '');
          }

          setMessages(prev => prev.map(m =>
            m.id === streamingId ? { ...m, content: displayContent, reasoning_content: displayReasoning || undefined } : m
          ));

          if (renderedResponse.length >= fullResponse.length && isSourceClosed) {
            if (intervalId) clearInterval(intervalId);
            resolve();
          }
        }, 30);

        source.onmessage = (event) => {
          if (event.data === '[DONE]') {
            source.close();
            isSourceClosed = true;
            return;
          }
          try {
            const data = JSON.parse(event.data);
            if (data.chunk) {
              let cleanChunk = data.chunk;
              if (cleanChunk.includes('[CLEAR_STREAM]')) {
                renderedResponse = fullResponse;
                setMessages(prev => prev.map(m =>
                  m.id === streamingId ? { ...m, content: renderedResponse } : m
                ));
                fullResponse = '';
                renderedResponse = '';
                cleanChunk = cleanChunk.split('[CLEAR_STREAM]').pop() || '';
              }
              cleanChunk = cleanChunk.replace(/\[TOOL_CALL_DETECTED\]|\[TOOL_CALL_FINISHED\]/g, '');
              if (cleanChunk) {
                fullResponse += cleanChunk;
              }
            }
            if (data.progress) {
              setMessages(prev => prev.map(m =>
                m.id === streamingId ? { 
                  ...m, 
                  progress: data.progress,
                  progressLogs: [...(m.progressLogs || []), { text: data.progress, time: Date.now() }]
                } : m
              ));
            }
            if (data.reasoning) {
              streamedReasoning += data.reasoning;
            }
            if (data.error) {
              source.close();
              isSourceClosed = true;
              if (intervalId) clearInterval(intervalId);
              reject(new Error(data.error));
            }
          } catch {}
        };

        source.onerror = () => {
          source.close();
          isSourceClosed = true;
        };
      });

      const sanitizeResponse = (text: string) => text
        .replace(/<tool_code>[\s\S]*?<\/tool_code>/gi, '')
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
        .replace(/<(?:execute_bash|execute)>[\s\S]*?<\/(?:execute_bash|execute)>/gi, '')
        .replace(/<(think|thought|thinking|reasoning|analysis|reflection|ant-thinking|ant_thinking)[^>]*>[\s\S]*?(<\/\1>|$)/gi, '')
        .replace(/```(?:json)?\s*\[?\s*\{\s*"(?:tool_name|function_name)"[\s\S]*?(?:\]\s*```|```|$)/gi, '')
        .replace(/\[\s*\{\s*"(?:tool_name|function_name)"[\s\S]*?(?:\]|$)/gi, '')
        .trim();
        
      let finalReasoning = streamedReasoning;
      const finalThinkMatch = fullResponse.match(/<(think|thought|thinking|reasoning|analysis|reflection|ant-thinking|ant_thinking)[^>]*>([\s\S]*?)(<\/\1>|$)/i);
      if (finalThinkMatch) {
        finalReasoning += (finalReasoning ? '\n' : '') + finalThinkMatch[2];
      }

      fullResponse = sanitizeResponse(fullResponse);

      setMessages(prev => prev.map(m =>
        m.id === streamingId ? { ...m, content: fullResponse, reasoning_content: finalReasoning || undefined, isStreaming: false } : m
      ));

      // Auto-rename only if this was the very first message in the session
      // Use fetched history length as ground truth, not local state (which has optimistic msgs)
      if (currentSessionId) {
        try {
          const histRes = await apiFetch(`/api/history?session_id=${currentSessionId}`);
          if (histRes.ok) {
            const hist = await histRes.json();
            const userMsgsCount = hist.filter((m: any) => m.role === 'user').length;
            if (userMsgsCount <= 1) {
              const autoTitle = userMsg.length > 25 ? userMsg.substring(0, 25) + '...' : userMsg;
              renameSession(currentSessionId, autoTitle);
            }
          }
        } catch {}
      }

      await fetchHistory(currentSessionId);

      if (isVoiceMode && fullResponse) {
        speak(fullResponse);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => prev.filter(m => m.id !== streamingId));
    } finally {
      setIsLoading(false);
      const textarea = document.querySelector('.chat-input') as HTMLTextAreaElement;
      if (textarea) {
        textarea.style.height = 'auto';
        if (typeof window !== 'undefined' && window.innerWidth > 768) {
          setTimeout(() => textarea.focus(), 150);
        }
      }
    }
  };

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'nyxora_active_session_id') {
        setActiveSessionId(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    fetchHistory();
    fetchSessions();

    if (!activeSessionId) return;

    // Smart polling to keep desktop and mobile in sync in real-time
    const interval = setInterval(() => {
      if (!isLoading) {
        fetchHistory(activeSessionId);
        fetchSessions(activeSessionId);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeSessionId, isLoading]);

  return {
    messages,
    setMessages,
    chatSessions,
    activeSessionId,
    setActiveSessionId,
    input,
    setInput,
    isLoading,
    setIsLoading,
    editingSessionId,
    setEditingSessionId,
    editSessionTitle,
    setEditSessionTitle,
    handleSend,
    fetchHistory,
    fetchSessions,
    createNewSession,
    renameSession,
    deleteSession
  };
};
