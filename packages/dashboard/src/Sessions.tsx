import React, { useRef, useState, useEffect } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Mic, Paperclip, Send, Loader2, Plus, Check, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { useChat } from './hooks/useChat';
import NyxoraLogo from './NyxoraLogo';
import { AgentTrace } from './AgentTrace';
import BalanceWidget from './BalanceWidget';
import MarketWidget from './MarketWidget';
import SwapWidget from './SwapWidget';
import PendingTransactions from './PendingTransactions';
import { apiFetch } from './utils/api';

const greetings = [
  { title: "Hello. I'm Nyxora.", desc: "I am a high-autonomy financial agent. Give me a goal, and I will execute it." }
];

const UserMessageBubble: React.FC<{ content: string, onCopy: () => void, copied: boolean }> = ({ content, onCopy, copied }) => {
  const [expanded, setExpanded] = useState(false);
  
  const MAX_LENGTH = 500;
  const lines = content.split('\n');
  const isLong = content.length > MAX_LENGTH || lines.length > 5;

  return (
    <>
      <div 
        className="message-bubble" 
        style={{ 
          whiteSpace: 'pre-wrap', 
          wordBreak: 'break-word', 
          overflow: 'hidden',
          position: 'relative',
          maxHeight: (!expanded && isLong) ? '180px' : 'none',
          paddingBottom: (!expanded && isLong) ? '40px' : '16px',
          transition: 'max-height 0.2s ease-out'
        }}
      >
        {content}
        
        {isLong && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            style={{
              position: 'absolute',
              bottom: '12px',
              right: '12px',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: '#ffffff',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
              zIndex: 10,
              color: '#333'
            }}
            title={expanded ? "Show Less" : "Show More"}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>
      <button className="copy-btn" onClick={onCopy} title="Copy message">
        {copied ? <Check size={14} color="#a3be8c" /> : <Copy size={14} />}
      </button>
    </>
  );
};

export const Sessions: React.FC = () => {
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const spacerDivRef = useRef<HTMLDivElement>(null);
  const isVoiceModeRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [trendingTokens, setTrendingTokens] = useState<string[]>(['$BTC', '$ETH', '$SOL', '$SUI']);

  // Scroll state refs — mirrors Desktop MessageList
  const isUserScrolledUp = useRef(false);
  const lastSnappedUserIndex = useRef(-1);
  const isAutoScrolling = useRef(false);
  const snapPendingRef = useRef(false); // true when user just sent, waiting to snap

  const startListening = () => {
    try {
      recognitionRef.current?.start();
      setIsListening(true);
    } catch {}
  };

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*#_`]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      if (isVoiceModeRef.current) startListening();
    };
    window.speechSynthesis.speak(utterance);
  };

  const toggleVoiceMode = () => {
    const newMode = !isVoiceMode;
    setIsVoiceMode(newMode);
    isVoiceModeRef.current = newMode;
    if (newMode) {
      startListening();
    } else {
      recognitionRef.current?.stop();
      setIsListening(false);
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const {
    messages,
    activeSessionId,
    input,
    setInput,
    isLoading,
    setIsLoading,
    handleSend,
  } = useChat(isVoiceMode, speak);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';
      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };
      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
    return () => {
      recognitionRef.current?.stop();
      window.speechSynthesis.cancel();
    };
  }, []);

  const handleScroll = () => {
    if (!chatContainerRef.current || isAutoScrolling.current) return;
    const { scrollHeight, scrollTop, clientHeight } = chatContainerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight <= 120;
    isUserScrolledUp.current = !atBottom;
  };

  // Snap the latest user message to the top of the chat container
  const triggerSnap = () => {
    snapPendingRef.current = true;
    isAutoScrolling.current = true; // block ResizeObserver immediately
    isUserScrolledUp.current = false;

    const attempt = (retries = 0) => {
      const container = chatContainerRef.current;
      const merged = getMergedMessages(messages); // closure — but will have new msg after state update
      // Find the absolute last user message in the DOM
      let el: HTMLElement | null = null;
      let targetIndex = -1;
      
      const allUserMsgs = container?.querySelectorAll('[data-role="user"]');
      if (allUserMsgs && allUserMsgs.length > 0) {
        const lastNode = allUserMsgs[allUserMsgs.length - 1] as HTMLElement;
        const id = lastNode.id;
        const idx = parseInt(id.replace('msg-', ''), 10);
        
        // Only accept if it's a NEW user message we haven't snapped to yet
        if (!isNaN(idx) && idx > lastSnappedUserIndex.current) {
          el = lastNode;
          targetIndex = idx;
        }
      }

      if (!container || !el) {
        if (retries < 15) {
          setTimeout(() => attempt(retries + 1), 50); // retry every 50ms up to 750ms
        } else {
          isAutoScrolling.current = false;
          snapPendingRef.current = false;
        }
        return;
      }

      // Walk offsetParent chain to get position within the scroll container
      let elOffsetTop = 0;
      let node: HTMLElement | null = el;
      while (node && node !== container) {
        elOffsetTop += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
      }

      // 1. Calculate how much content is currently below the top of this user message
      // (Excluding any existing spacer)
      let currentSpacer = 0;
      if (spacerDivRef.current) {
        currentSpacer = parseInt(spacerDivRef.current.style.height || '0', 10);
      }
      const trueScrollHeight = container.scrollHeight - currentSpacer;
      const contentBelowTop = trueScrollHeight - elOffsetTop;

      // 2. We want at least (clientHeight) of space below the message
      // so it can sit comfortably at the top (0px offset)
      const desiredMinHeight = container.clientHeight - 12;
      if (contentBelowTop < desiredMinHeight && spacerDivRef.current) {
        spacerDivRef.current.style.height = `${desiredMinHeight - contentBelowTop}px`;
        // Force synchronous layout recalculation so the browser knows we have space!
        void container.scrollHeight; 
      }

      // 3. Now we are guaranteed to have enough space, safely scroll.
      const targetScrollTop = Math.max(0, elOffsetTop - 12);


      container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      lastSnappedUserIndex.current = targetIndex;
      snapPendingRef.current = false;

      setTimeout(() => { isAutoScrolling.current = false; }, 900);
    };

    // Start first attempt after a short delay for React to render the new message
    setTimeout(() => attempt(), 80);
  };



  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      // 1. Dynamically shrink the spacer as new content streams in
      const allUserMsgs = container.querySelectorAll('[data-role="user"]');
      const allMsgsFadeIn = container.querySelectorAll('.message-fade-in');
      
      let lastUserEl: HTMLElement | null = null;
      if (allUserMsgs && allUserMsgs.length > 0) {
        lastUserEl = allUserMsgs[allUserMsgs.length - 1] as HTMLElement;
      }
      const lastMsgEl = allMsgsFadeIn.length > 0 ? allMsgsFadeIn[allMsgsFadeIn.length - 1] as HTMLElement : null;

      if (lastUserEl && lastMsgEl && spacerDivRef.current) {
        // Walk offsetParent chain for true offset, just like in triggerSnap
        let userOffsetTop = 0;
        let node: HTMLElement | null = lastUserEl;
        while (node && node !== container) {
          userOffsetTop += node.offsetTop;
          node = node.offsetParent as HTMLElement | null;
        }

        let msgOffsetTop = 0;
        node = lastMsgEl;
        while (node && node !== container) {
          msgOffsetTop += node.offsetTop;
          node = node.offsetParent as HTMLElement | null;
        }

        const contentBelowTop = (msgOffsetTop + lastMsgEl.offsetHeight) - userOffsetTop;
        const desiredMinHeight = container.clientHeight - 0; // 0px top clearance

        if (contentBelowTop < desiredMinHeight) {
          spacerDivRef.current.style.height = `${desiredMinHeight - contentBelowTop}px`;
        } else {
          spacerDivRef.current.style.height = '0px';
        }
      }

      // 2. Only auto-scroll to bottom if the spacer is fully consumed
      if (!isUserScrolledUp.current && !isAutoScrolling.current) {
        if (!spacerDivRef.current || spacerDivRef.current.style.height === '0px' || spacerDivRef.current.style.height === '') {
          container.scrollTop = container.scrollHeight;
        }
      }
    });

    const inner = container.firstElementChild;
    if (inner) observer.observe(inner);
    return () => observer.disconnect();
  }, [messages.length > 0]);

  // Reset snap state when session is cleared, and force scroll on load
  useEffect(() => {
    if (messages.length === 0) {
      lastSnappedUserIndex.current = -1;
      isUserScrolledUp.current = false;
      snapPendingRef.current = false;
      isAutoScrolling.current = false;
      if (spacerDivRef.current) spacerDivRef.current.style.height = '0px';
    } else {
      setTimeout(() => {
        if (chatContainerRef.current && !isUserScrolledUp.current) {
          isAutoScrolling.current = true;
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
          setTimeout(() => { isAutoScrolling.current = false; }, 150);
        }
      }, 100);
    }
  }, [activeSessionId, messages.length === 0]);



  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await apiFetch('/api/upload-temp', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        const prompt = `Please analyze this document: ${data.filePath}`;
        handleSend(null, prompt);
      } else {
        setIsLoading(false);
      }
    } catch {
      setIsLoading(false);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const renderMessageContent = (content: string) => {
    let cleanContent = content
      .replace(/(?:```(?:xml|html)?\s*)?<think>[\s\S]*?<\/think>(?:\s*```)?|```think[\s\S]*?```/gi, '')
      .replace(/<tool_code>[\s\S]*?<\/tool_code>/gi, '')
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
      .replace(/<(?:execute_bash|execute)>[\s\S]*?<\/(?:execute_bash|execute)>/gi, '')
      .replace(/```(?:json)?\s*\[?\s*\{\s*"(?:tool_name|function_name)"[\s\S]*?(?:\]\s*```|```|$)/gi, '')
      .replace(/\[\s*\{\s*"(?:tool_name|function_name)"[\s\S]*?(?:\]|$)/gi, '')
      .trim();

    return (
      <div className="markdown-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {cleanContent && (
          <div 
            className="markdown-body"
            style={{ overflowWrap: 'anywhere' }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(cleanContent) as string) }}
          />
        )}
      </div>
    );
  };

  let activeWidget: React.ReactNode = null;
  const latestToolMessage = [...messages].reverse().find(m => m.role === 'tool');
  if (latestToolMessage && latestToolMessage.name) {
    if (latestToolMessage.name === 'get_balance') {
      activeWidget = <BalanceWidget data={latestToolMessage.content} />;
    } else if (['analyze_market'].includes(latestToolMessage.name)) {
      activeWidget = <MarketWidget data={latestToolMessage.content} />;
    } else if (latestToolMessage.name === 'swap_token') {
      if (!latestToolMessage.content.startsWith('Failed') && !latestToolMessage.content.startsWith('Error')) {
        activeWidget = <SwapWidget data={latestToolMessage.content} />;
      }
    }
  }

  const getMergedMessages = (msgs: any[]) => {
    const merged: any[] = [];
    let currentAssistantMsg: any = null;
    for (const m of msgs) {
      if (m.role === 'user') {
        if (currentAssistantMsg) {
          merged.push(currentAssistantMsg);
          currentAssistantMsg = null;
        }
        merged.push(m);
      } else if (m.role === 'assistant') {
        if (currentAssistantMsg) {
          if (m.tool_calls) currentAssistantMsg.tool_calls = [...(currentAssistantMsg.tool_calls || []), ...m.tool_calls];
          if (m.content && m.content.trim() !== '') {
            if (currentAssistantMsg.tool_calls && currentAssistantMsg.tool_calls.length > 0) {
               currentAssistantMsg.content = m.content.trim();
            } else {
               currentAssistantMsg.content = (currentAssistantMsg.content && currentAssistantMsg.content.trim() !== '')
                 ? currentAssistantMsg.content.trim() + '\n\n' + m.content.trim() 
                 : m.content.trim();
            }
          }
          if (m.reasoning_content) currentAssistantMsg.reasoning_content = (currentAssistantMsg.reasoning_content || '') + m.reasoning_content;
          if (m.progressLogs) currentAssistantMsg.progressLogs = [...(currentAssistantMsg.progressLogs || []), ...m.progressLogs];
          currentAssistantMsg.isStreaming = currentAssistantMsg.isStreaming || m.isStreaming;
        } else {
          currentAssistantMsg = { ...m };
        }
      }
    }
    if (currentAssistantMsg) merged.push(currentAssistantMsg);
    return merged;
  };

  return (
    <div className="workspace-container">
      <div className="chat-wrapper" style={{ width: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>

        <div className={`empty-state-container ${messages.length > 0 ? 'hidden-state' : ''}`}>
          <div className="empty-state-logo-wrapper">
            <NyxoraLogo size={70} color="var(--accent)" />
          </div>
          <h1 className="empty-state-title">
            {greetings[0].title}
          </h1>
          <p className="empty-state-desc">
            {greetings[0].desc}
          </p>
        </div>

        <div
          className={`chat-container ${messages.length === 0 ? 'hidden-state' : 'active-state'}`}
          ref={chatContainerRef}
          onScroll={handleScroll}
          style={{ display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '0px', paddingBottom: '24px' }}>
            {getMergedMessages(messages).map((msg, idx) => {
              const handleCopy = () => {
                navigator.clipboard.writeText(msg.content);
                setCopiedIndex(idx);
                setTimeout(() => setCopiedIndex(null), 2000);
              };

              if (msg.role === 'user') {
                return (
                  <div
                    key={idx}
                    id={`msg-${idx}`}
                    className="message-wrapper user message-fade-in"
                    data-role="user"
                  >
                    <UserMessageBubble 
                      content={msg.content} 
                      onCopy={handleCopy} 
                      copied={copiedIndex === idx} 
                    />
                  </div>
                );
              }
              if (msg.role === 'assistant' && (msg.content || msg.tool_calls || msg.progressLogs || msg.reasoning_content)) {
                return (
                  <div
                    key={idx}
                    id={`msg-${idx}`}
                    className="message-fade-in"
                    data-role="assistant"
                    style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignSelf: 'flex-start', maxWidth: '95%' }}
                  >
                    {(msg.tool_calls?.length > 0 || msg.progressLogs?.length > 0 || !!msg.reasoning_content) && (
                      <AgentTrace 
                        toolCalls={msg.tool_calls} 
                        progressLogs={msg.progressLogs} 
                        isStreaming={msg.isStreaming} 
                        reasoningContent={msg.reasoning_content}
                        durationMs={(msg as any).duration_ms}
                      />
                    )}
                    {msg.content && msg.content.trim() !== '' && (
                      <div className="message-wrapper agent" style={{ maxWidth: '100%', margin: 0 }}>
                        <div className="message-bubble">{renderMessageContent(msg.content)}</div>
                        <button className="copy-btn" onClick={handleCopy} title="Copy message">
                          {copiedIndex === idx ? <Check size={14} color="#a3be8c" /> : <Copy size={14} />}
                        </button>
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })}

            {isLoading && !messages.some((m: any) => m.isStreaming && (m.content || m.progressLogs)) && (
              <div className="working-indicator">
                <span className="working-dots">Working</span>
              </div>
            )}
            {activeWidget && (
              <div className="widget-container-live" style={{ marginTop: '16px', marginBottom: '16px' }}>
                {activeWidget}
              </div>
            )}

            {/* Dynamic spacer — ensures content doesn't get clipped after snap-to-top */}
            <div ref={spacerDivRef} style={{ height: '0px', flexShrink: 0 }} />
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="input-area">
          <form className="input-form" onSubmit={(e) => {
            e.preventDefault();
            isUserScrolledUp.current = false;
            handleSend(e as any);
            triggerSnap();
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
          }}>
            <div className="action-menu-container">
              <button type="button" className="voice-button plus-button" disabled={isLoading} title="More Actions">
                <Plus size={20} />
              </button>
              <div className="action-menu-items">
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
                <button type="button" className="voice-button" onClick={() => fileInputRef.current?.click()} disabled={isLoading} title="Upload Document" style={{ color: 'var(--text-secondary)' }}>
                  <Paperclip size={18} />
                </button>
                <button type="button" className={`voice-button ${isVoiceMode ? 'active pulse' : ''}`} onClick={toggleVoiceMode} title={isVoiceMode ? "Disable Voice Mode" : "Enable Voice Mode"}>
                  <Mic size={18} color={isVoiceMode ? 'var(--accent)' : 'currentColor'} />
                </button>
              </div>
            </div>
            <textarea
              ref={textareaRef}
              className="chat-input styled-scroll"
              placeholder={isVoiceMode ? "Listening..." : "Ask Nyxora"}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  isUserScrolledUp.current = false;
                  handleSend(null);
                  triggerSnap();
                  if (textareaRef.current) textareaRef.current.style.height = 'auto';
                }
              }}
              disabled={isLoading}
              rows={1}
              style={{ resize: 'none', minHeight: '32px' }}
            />
            <button type="submit" className="send-button" disabled={isLoading || !input.trim()}>
              {isLoading ? <Loader2 size={20} className="spinner" /> : <Send size={20} />}
            </button>
          </form>
          <div className="trending-tokens">
            <span>Trending Tokens:</span>
            {trendingTokens.map((token, idx) => (
              <span 
                key={idx} 
                className="token-tag" 
                onClick={() => setInput(`Please provide the latest market analysis for ${token}`)}
                title={`Click to analyze ${token}`}
                style={{ cursor: 'pointer' }}
              >
                {token}
              </span>
            ))}
          </div>
        </div>
      </div>
      <PendingTransactions sessionId={activeSessionId} />
    </div>
  );
};

export default Sessions;
