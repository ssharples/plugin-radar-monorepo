import { useState, useCallback } from 'react';
import { Download, Star, ChevronDown, ChevronRight, Bookmark, BookmarkCheck, ArrowRight } from 'lucide-react';
import type { BrowseChainResult } from '../../api/types';

interface ChainBrowserCardProps {
  chain: BrowseChainResult;
  compatPercent: number | null;
  isInCollection: boolean;
  onPreview: () => void;
  onLoad: () => void;
  onToggleCollection: () => void;
  onAuthorClick?: (authorName: string) => void;
}

function getCompatColor(percent: number | null): string {
  if (percent === null) return 'var(--color-text-disabled)';
  if (percent === 100) return 'var(--color-status-active)';
  if (percent >= 80) return 'var(--color-status-warning)';
  if (percent >= 50) return '#f97316';
  return 'var(--color-status-error)';
}

function getCompatLabel(percent: number | null): string {
  if (percent === null) return '';
  return `${percent}%`;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function getInitials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

// Deterministic color from name for avatar background
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hues = [32, 160, 270, 45, 200, 340, 90, 15];
  const hue = hues[Math.abs(hash) % hues.length];
  return `hsl(${hue}, 45%, 35%)`;
}

export function ChainBrowserCard({
  chain,
  compatPercent,
  isInCollection,
  onPreview,
  onLoad,
  onToggleCollection,
  onAuthorClick,
}: ChainBrowserCardProps) {
  const [showPlugins, setShowPlugins] = useState(false);
  const [hovered, setHovered] = useState(false);

  const pluginCount = chain.slots?.length ?? chain.pluginCount;
  const slots = chain.slots;
  const authorName = chain.author?.name ?? 'Unknown';
  const avatarUrl = chain.author?.avatarUrl;
  const rating = chain.averageRating;

  const handleAuthorClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onAuthorClick && chain.author?.name) {
        onAuthorClick(chain.author.name);
      }
    },
    [onAuthorClick, chain.author?.name]
  );

  return (
    <div
      className="fast-snap"
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        alignItems: 'stretch',
        background: hovered ? 'var(--color-bg-hover)' : 'var(--color-bg-input)',
        border: `1px solid ${hovered ? 'rgba(222, 255, 10, 0.2)' : 'var(--color-border-subtle)'}`,
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3)',
        cursor: 'pointer',
        transition: 'all var(--duration-fast) var(--ease-snap)',
      }}
      onClick={onPreview}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Author Avatar */}
      <div
        onClick={handleAuthorClick}
        title={`View chains by @${authorName}`}
        style={{
          width: 36,
          height: 36,
          minWidth: 36,
          borderRadius: 'var(--radius-full)',
          overflow: 'hidden',
          background: avatarUrl ? 'transparent' : avatarColor(authorName),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          border: '1.5px solid var(--color-border-default)',
          flexShrink: 0,
          alignSelf: 'flex-start',
          marginTop: 1,
          transition: 'border-color var(--duration-fast)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-accent-cyan)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border-default)';
        }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={authorName}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              color: 'rgba(255, 255, 255, 0.8)',
              letterSpacing: '-0.02em',
              userSelect: 'none',
            }}
          >
            {getInitials(authorName)}
          </span>
        )}
      </div>

      {/* Main Content — middle column */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Row 1: Chain name + author */}
        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
          <span
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
              color: '#deff0a',
              fontFamily: 'var(--font-mono)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.3,
            }}
          >
            {chain.name}
          </span>
          {compatPercent !== null && (
            <span
              style={{
                fontSize: '8px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                color: getCompatColor(compatPercent),
                flexShrink: 0,
                padding: '0 4px',
                borderRadius: 'var(--radius-sm)',
                background: `${getCompatColor(compatPercent)}15`,
                lineHeight: '14px',
              }}
            >
              {getCompatLabel(compatPercent)}
            </span>
          )}
        </div>

        {/* Row 2: Author + timestamp */}
        <div className="flex items-center gap-1.5" style={{ fontSize: '9px', lineHeight: 1 }}>
          <span
            onClick={handleAuthorClick}
            style={{
              color: 'var(--color-text-disabled)',
              cursor: 'pointer',
              transition: 'color var(--duration-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-accent-cyan)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-disabled)';
            }}
          >
            @{authorName}
          </span>
          {chain.createdAt && (
            <>
              <span style={{ color: 'var(--color-border-strong)' }}>·</span>
              <span style={{ color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>
                {formatTimeAgo(chain.createdAt)}
              </span>
            </>
          )}
          {chain.useCase && (
            <>
              <span style={{ color: 'var(--color-border-strong)' }}>·</span>
              <span style={{ color: 'var(--color-text-disabled)' }}>
                {chain.useCase.replace(/-/g, ' ')}
              </span>
            </>
          )}
        </div>

        {/* Row 3: Description (if available) */}
        {chain.description && (
          <p
            style={{
              fontSize: '9px',
              color: 'var(--color-text-disabled)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.4,
              marginTop: 1,
            }}
          >
            {chain.description}
          </p>
        )}

        {/* Row 4: Plugin chain flow */}
        {slots && slots.length > 0 && (
          <div style={{ marginTop: 3 }} onClick={(e) => e.stopPropagation()}>
            {!showPlugins ? (
              <button
                onClick={() => setShowPlugins(true)}
                className="flex items-center gap-1"
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-disabled)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  lineHeight: 1.2,
                }}
              >
                <span style={{ color: 'var(--color-text-disabled)' }}>{pluginCount}p</span>
                <span style={{ color: 'var(--color-border-strong)' }}>│</span>
                <span style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {slots.slice(0, 4).map((s) => s.pluginName).join(' → ')}
                  {pluginCount > 4 ? ` → +${pluginCount - 4}` : ''}
                </span>
                <ChevronRight className="w-2.5 h-2.5" style={{ flexShrink: 0 }} />
              </button>
            ) : (
              <div>
                <button
                  onClick={() => setShowPlugins(false)}
                  className="flex items-center gap-1 mb-1"
                  style={{
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-text-disabled)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <ChevronDown className="w-2.5 h-2.5" />
                  {pluginCount} plugin{pluginCount !== 1 ? 's' : ''}
                </button>
                <div className="space-y-px">
                  {slots.map((slot, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-2 py-0.5 rounded"
                      style={{
                        background: 'rgba(0, 0, 0, 0.25)',
                        fontSize: '9px',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      <span style={{ color: 'var(--color-text-disabled)', width: '14px', textAlign: 'right', flexShrink: 0 }}>
                        {(slot.position ?? idx) + 1}.
                      </span>
                      <span
                        style={{
                          color: slot.bypassed ? 'var(--color-text-disabled)' : 'var(--color-text-primary)',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          textDecoration: slot.bypassed ? 'line-through' : 'none',
                          opacity: slot.bypassed ? 0.5 : 1,
                        }}
                      >
                        {slot.pluginName}
                      </span>
                      <span style={{ color: 'var(--color-text-disabled)', flexShrink: 0, fontSize: '8px' }}>
                        {slot.manufacturer}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Row 5: Tags */}
        {chain.tags?.length > 0 && (
          <div className="flex items-center gap-1" style={{ marginTop: 2, flexWrap: 'wrap' }}>
            {chain.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: '8px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-disabled)',
                  background: 'rgba(255, 255, 255, 0.04)',
                  padding: '1px 5px',
                  borderRadius: 'var(--radius-sm)',
                  textTransform: 'lowercase',
                }}
              >
                {tag}
              </span>
            ))}
            {chain.tags.length > 4 && (
              <span style={{ fontSize: '8px', color: 'var(--color-text-disabled)' }}>
                +{chain.tags.length - 4}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right Column — stats + actions */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 'var(--space-2)',
          flexShrink: 0,
          minWidth: 64,
        }}
      >
        {/* Stats */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          {rating != null && rating > 0 && (
            <div className="flex items-center gap-1" style={{ fontSize: '9px', fontFamily: 'var(--font-mono)' }}>
              <Star className="w-2.5 h-2.5" style={{ color: 'var(--color-status-warning)', fill: 'var(--color-status-warning)' }} />
              <span style={{ color: 'var(--color-text-disabled)' }}>{rating.toFixed(1)}</span>
            </div>
          )}
          <div className="flex items-center gap-1" style={{ fontSize: '9px', fontFamily: 'var(--font-mono)' }}>
            <Download className="w-2.5 h-2.5" style={{ color: 'var(--color-text-disabled)' }} />
            <span style={{ color: 'var(--color-text-disabled)' }}>{chain.downloads}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onToggleCollection}
            style={{
              padding: '3px',
              borderRadius: 'var(--radius-base)',
              color: isInCollection ? 'var(--color-accent-cyan)' : 'var(--color-text-disabled)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'color var(--duration-fast)',
            }}
            onMouseEnter={(e) => {
              if (!isInCollection) e.currentTarget.style.color = 'var(--color-text-tertiary)';
            }}
            onMouseLeave={(e) => {
              if (!isInCollection) e.currentTarget.style.color = 'var(--color-text-disabled)';
            }}
            title={isInCollection ? 'Remove from collection' : 'Save to collection'}
          >
            {isInCollection ? <BookmarkCheck className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
          </button>
          <button
            onClick={onLoad}
            className="flex items-center gap-1"
            style={{
              fontSize: '9px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              padding: '3px 8px',
              borderRadius: 'var(--radius-base)',
              background: 'var(--color-accent-cyan)',
              color: 'var(--color-bg-primary)',
              border: 'none',
              cursor: 'pointer',
              transition: 'opacity var(--duration-fast)',
              letterSpacing: 'var(--tracking-wide)',
              lineHeight: 1.4,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            Load <ArrowRight className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
