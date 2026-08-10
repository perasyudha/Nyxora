import React, { useState, useEffect } from 'react';
import { ChevronRight, Terminal, Search, Activity, Cpu } from 'lucide-react';

export interface ProgressLog {
  text: string;
  time: number;
}

export interface AgentTraceProps {
  toolCalls?: any[];
  progressLogs?: ProgressLog[];
  isStreaming?: boolean;
  reasoningContent?: string;
  durationMs?: number;
}

export const AgentTrace: React.FC<AgentTraceProps> = ({ toolCalls = [], progressLogs = [], isStreaming = false, reasoningContent = '', durationMs = 0 }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [startTime] = useState<number>(Date.now());
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  // Auto expand when streaming starts, auto collapse smoothly when streaming finishes
  useEffect(() => {
    if (isStreaming && (toolCalls.length > 0 || progressLogs.length > 0 || reasoningContent)) {
      setIsOpen(true);
    } else if (!isStreaming) {
      const timer = setTimeout(() => {
        setIsOpen(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isStreaming]);

  // Track time if streaming
  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isStreaming, startTime]);

  const hasContent = toolCalls.length > 0 || progressLogs.length > 0 || !!reasoningContent;
  
  if (!hasContent) {
    return null;
  }

  const getSummaryText = () => {
    if (isStreaming) {
      return `Working for ${elapsedTime}s`;
    }
    if (durationMs > 0) {
      return `Worked for ${Math.max(1, Math.round(durationMs / 1000))}s`;
    }
    if (elapsedTime > 0) {
      return `Worked for ${elapsedTime}s`;
    }
    if (progressLogs && progressLogs.length > 1) {
      const firstTime = progressLogs[0].time;
      const lastTime = progressLogs[progressLogs.length - 1].time;
      const seconds = Math.max(1, Math.round((lastTime - firstTime) / 1000));
      return `Worked for ${seconds}s`;
    }
    return `Completed`;
  };

  const getIconForStep = (text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes('find') || lower.includes('search') || lower.includes('explored')) return <Search size={14} color="#60a5fa" />;
    if (lower.includes('ran') || lower.includes('running') || lower.includes('execute')) return <Terminal size={14} color="#34d399" />;
    if (lower.includes('thought')) return <Cpu size={14} color="#f472b6" />;
    return <Activity size={14} color="#94a3b8" />;
  };

  // Merge history tool_calls into readable strings if progressLogs is empty
  const traces: string[] = [];
  
  if (progressLogs && progressLogs.length > 0) {
    // Clean up html tags in progress logs and add to traces
    progressLogs.forEach(log => {
      const cleanText = log.text.replace(/<[^>]*>?/gm, '').replace(/\*+/g, '').trim();
      if (cleanText) traces.push(cleanText);
    });
  } else if (toolCalls && toolCalls.length > 0) {
    toolCalls.forEach(tool => {
      traces.push(`Ran ${tool.function?.name || 'tool'}`);
    });
  }

  return (
    <div className="agent-trace-container" style={{ marginBottom: 0 }}>
      <div 
        className="agent-trace-header" 
        onClick={() => setIsOpen(!isOpen)}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px 10px', borderRadius: '6px', width: 'fit-content' }}
      >
        <div className="agent-trace-summary" style={{ fontSize: '0.85rem', fontWeight: 500 }}>
          {getSummaryText()}
        </div>
        <div className="agent-trace-chevron" style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease', display: 'flex' }}>
          <ChevronRight size={14} className="agent-trace-icon" />
        </div>
      </div>
      
      <div 
        className="agent-trace-body" 
        style={{ 
          maxHeight: isOpen ? '400px' : '0px', 
          opacity: isOpen ? 1 : 0, 
          marginTop: isOpen ? '8px' : '0px', 
          paddingTop: isOpen ? '2px' : '0px',
          paddingBottom: isOpen ? '4px' : '0px',
          paddingLeft: '14px', 
          marginLeft: '12px', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '6px', 
          borderLeft: '1.5px solid var(--border-color)', 
          overflow: 'hidden',
          transition: 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease, margin-top 0.3s ease, padding 0.3s ease',
          pointerEvents: isOpen ? 'auto' : 'none'
        }}
      >
        {reasoningContent && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <Cpu size={15} color="#f472b6" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Thinking:</span>
              <p 
                className="styled-scroll"
                style={{ 
                  marginTop: '4px', 
                  fontStyle: 'italic', 
                  whiteSpace: 'pre-wrap', 
                  lineHeight: 1.5,
                  maxHeight: '150px',
                  overflowY: 'auto',
                  paddingRight: '8px'
                }}
              >
                {reasoningContent}
              </p>
            </div>
          </div>
        )}
        {traces.map((trace, idx) => (
          <div key={idx} className="trace-item" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
            {getIconForStep(trace)}
            <span>{trace}</span>
          </div>
        ))}
        {isStreaming && (
          <div className="trace-item" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
            <span className="working-dots">Working</span>
          </div>
        )}
      </div>
    </div>
  );
};
