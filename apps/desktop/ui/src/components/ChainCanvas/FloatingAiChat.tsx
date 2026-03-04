import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, X, Sparkles, Check, Trash2 } from 'lucide-react';
import { useAiChatStore, type AiChatMessage } from '../../stores/aiChatStore';
import { useAiProfileStore, type AiProfile } from '../../stores/aiProfileStore';
import type { ChainNodeUI } from '../../api/types';

// ── Quick Suggestions ────────────────────────────────────────────────

const DEFAULT_SUGGESTIONS = [
  'Build a vocal chain',
  'Add reverb',
  'Build a master bus',
  'Analyze my chain',
];

function getProfileSuggestions(profile: AiProfile | null): string[] {
  if (!profile?.onboardingCompleted) return DEFAULT_SUGGESTIONS;

  const suggestions: string[] = [];
  const genres = profile.genres.map(g => g.toLowerCase());
  const targets = profile.processingTargets.map(t => t.toLowerCase());

  if (genres.some(g => g.includes('hip-hop') || g.includes('rap'))) {
    suggestions.push('Build a rap vocal chain');
  }
  if (genres.some(g => g.includes('rock'))) {
    suggestions.push('Build a guitar chain');
  }
  if (genres.some(g => g.includes('edm') || g.includes('electronic'))) {
    suggestions.push('Build an EDM master chain');
  }
  if (genres.some(g => g.includes('pop'))) {
    suggestions.push('Build a pop vocal chain');
  }
  if (targets.includes('vocals')) {
    suggestions.push('Fix boxy vocals');
  }
  if (targets.includes('mastering')) {
    suggestions.push('Build a mastering chain');
  }

  suggestions.push('Analyze my chain', 'Add parallel compression');

  return [...new Set(suggestions)].slice(0, 4);
}

// ── Message Formatting ───────────────────────────────────────────────

function formatContent(content: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) parts.push(<br key={`br-${i}`} />);
    // Bold
    const boldRegex = /\*\*([^*]+)\*\*/g;
    let lastIdx = 0;
    let match: RegExpExecArray | null;
    const line = lines[i];
    while ((match = boldRegex.exec(line)) !== null) {
      if (match.index > lastIdx) {
        parts.push(line.slice(lastIdx, match.index));
      }
      parts.push(<strong key={`b-${i}-${match.index}`}>{match[1]}</strong>);
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < line.length) {
      parts.push(line.slice(lastIdx));
    }
  }
  return parts;
}

// ── Ghost Node Controls ──────────────────────────────────────────────

interface GhostControlsProps {
  onApply: () => void;
  onDiscard: () => void;
}

function GhostControls({ onApply, onDiscard }: GhostControlsProps) {
  return (
    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
      <button
        onClick={onApply}
        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono uppercase tracking-wider bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-colors"
      >
        <Check size={12} />
        Apply
      </button>
      <button
        onClick={onDiscard}
        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono uppercase tracking-wider bg-red-500/10 text-red-400/70 border border-red-500/20 hover:bg-red-500/20 transition-colors"
      >
        <Trash2 size={12} />
        Discard
      </button>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

interface FloatingAiChatProps {
  ghostNodes: ChainNodeUI[];
  onSetGhostNodes: (nodes: ChainNodeUI[]) => void;
  onApplyGhostNodes: () => void;
}

export function FloatingAiChat({ ghostNodes, onSetGhostNodes, onApplyGhostNodes }: FloatingAiChatProps) {
  const [expanded, setExpanded] = useState(false);

  const {
    messages,
    streamingMessage,
    inputText,
    isStreaming,
    error,
    setInputText,
    sendMessage,
    loadThreads,
    applyChainAction,
  } = useAiChatStore();

  const { profile, loadProfile } = useAiProfileStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load profile and threads on first expand
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (expanded && !hasInitialized.current) {
      hasInitialized.current = true;
      loadProfile();
      loadThreads();
    }
  }, [expanded, loadProfile, loadThreads]);

  // Auto-scroll when messages change
  useEffect(() => {
    if (expanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingMessage, expanded]);

  // Focus input on expand
  useEffect(() => {
    if (expanded) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [expanded]);

  const suggestions = useMemo(() => getProfileSuggestions(profile), [profile]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    sendMessage(text);
  }, [inputText, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Prevent canvas keyboard shortcuts from firing when typing
    e.stopPropagation();
  }, [handleSend]);

  const handleSuggestionClick = useCallback((text: string) => {
    sendMessage(text);
  }, [sendMessage]);

  const handleDiscard = useCallback(() => {
    onSetGhostNodes([]);
  }, [onSetGhostNodes]);

  const hasGhostNodes = ghostNodes.length > 0;
  const allMessages = useMemo(() => {
    const msgs = [...messages];
    if (streamingMessage) msgs.push(streamingMessage);
    return msgs;
  }, [messages, streamingMessage]);
  const hasMessages = allMessages.length > 0;

  // ── Collapsed pill ──

  if (!expanded) {
    return (
      <div
        className="absolute bottom-4 right-4 z-10 pointer-events-auto"
      >
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 px-3 py-2 font-mono text-xs rounded-full transition-colors"
          style={{
            background: 'rgba(10, 10, 10, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: 'rgba(255, 255, 255, 0.5)',
          }}
        >
          <Sparkles size={14} style={{ color: 'rgba(168, 130, 255, 0.8)' }} />
          <span>AI</span>
          {hasGhostNodes && (
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
          )}
        </button>
      </div>
    );
  }

  // ── Expanded panel ──

  return (
    <div
      className="absolute bottom-4 right-4 z-10 pointer-events-auto font-mono"
      style={{
        width: 300,
        height: 420,
        background: 'rgba(10, 10, 10, 0.92)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}
      >
        <Sparkles size={14} style={{ color: 'rgba(168, 130, 255, 0.8)' }} />
        <span className="text-xs text-white/70 flex-1">AI Assistant</span>
        <button
          onClick={() => setExpanded(false)}
          className="p-1 text-white/30 hover:text-white/60 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        {!hasMessages && !isStreaming && (
          <div className="flex flex-col gap-3 mt-4">
            <div className="text-[10px] text-white/25 uppercase tracking-wider">
              Try asking...
            </div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map(text => (
                <button
                  key={text}
                  onClick={() => handleSuggestionClick(text)}
                  className="px-2.5 py-1.5 text-[10px] rounded-md transition-colors"
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    color: 'rgba(255, 255, 255, 0.45)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(168, 130, 255, 0.3)';
                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.45)';
                  }}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}

        {allMessages.map((msg, i) => {
          const isUser = msg.role === 'user';
          const isStreamMsg = msg === streamingMessage;
          return (
            <div
              key={msg._id || `msg-${i}`}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed ${
                  isUser
                    ? 'bg-purple-500/10 text-white/90 border border-purple-500/20'
                    : 'bg-white/5 text-white/80'
                }`}
              >
                {msg.content ? (
                  <div>{formatContent(msg.content)}</div>
                ) : isStreamMsg ? (
                  <div className="text-white/30 text-[10px]">
                    {msg.thinkingStatus || 'Thinking...'}
                  </div>
                ) : null}

                {/* Chain action Apply button within message */}
                {msg.chainAction && !msg.chainAction.applied && (
                  <button
                    onClick={() => applyChainAction(msg._id)}
                    className="mt-1.5 px-2 py-1 rounded text-[10px] uppercase tracking-wider bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-colors"
                  >
                    Apply to chain
                  </button>
                )}
                {msg.chainAction?.applied && (
                  <div className="mt-1 text-[10px] text-green-400/50 flex items-center gap-1">
                    <Check size={10} /> Applied
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Streaming placeholder */}
        {isStreaming && !streamingMessage && (
          <div className="flex justify-start mb-2">
            <div className="bg-white/5 rounded-lg px-2.5 py-1.5 text-[10px] text-white/30">
              Thinking...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Ghost node controls */}
      {hasGhostNodes && (
        <div className="px-3 pb-1">
          <GhostControls onApply={onApplyGhostNodes} onDiscard={handleDiscard} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-3 py-1 text-[10px] text-red-400 bg-red-400/10 border-t border-red-400/20">
          {error}
        </div>
      )}

      {/* Input */}
      <div
        className="shrink-0 p-2"
        style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}
      >
        <div
          className="flex items-end gap-1.5 rounded-lg px-2.5 py-1.5"
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? 'Queuing...' : 'Ask about your chain...'}
            rows={1}
            className="flex-1 bg-transparent text-[11px] text-white/80 placeholder-white/25 resize-none outline-none min-h-[18px] max-h-[60px]"
            style={{ lineHeight: '18px' }}
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim()}
            className={`p-0.5 rounded transition-colors ${
              inputText.trim()
                ? 'text-purple-400 hover:bg-purple-500/10'
                : 'text-white/15'
            }`}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
