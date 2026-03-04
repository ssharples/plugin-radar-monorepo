import { useState, useCallback } from 'react';
import { Download, Star, Bookmark, BookmarkCheck, ArrowRight } from 'lucide-react';
import type { BrowseChainResult } from '../../api/types';
import { usePluginStore } from '../../stores/pluginStore';
import { getCompatColor, getCategoryColor } from '../../constants/categoryColors';
import { formatRelativeTime as formatTimeAgo } from '../../utils/timeFormatting';
import { AuthorAvatar } from './AuthorAvatar';
import { TopologyDiagram } from './TopologyDiagram';

interface ChainBrowserCardProps {
  chain: BrowseChainResult;
  compatPercent: number | null;
  isInCollection: boolean;
  onPreview: () => void;
  onLoad: () => void;
  onToggleCollection: () => void;
  onAuthorClick?: (authorName: string) => void;
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
  const [hovered, setHovered] = useState(false);
  const getEnrichedDataForPlugin = usePluginStore((s) => s.getEnrichedDataForPlugin);

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
      className="fast-snap overflow-hidden"
      style={{
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        padding: '6px 8px',
        background: hovered ? 'rgba(222, 255, 10, 0.03)' : 'transparent',
        borderLeft: hovered ? '2px solid var(--color-accent-cyan)' : '2px solid transparent',
        cursor: 'pointer',
        transition: 'all 100ms',
      }}
      onClick={onPreview}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Author Avatar */}
      <AuthorAvatar name={authorName} avatarUrl={avatarUrl} size={26} onClick={handleAuthorClick} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Row 1: Name + compat */}
        <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
          <span className="truncate" style={{
            fontSize: 'var(--text-title)',
            fontWeight: 700,
            color: hovered ? 'var(--color-accent-cyan)' : '#fff',
            fontFamily: 'var(--font-system)',
            letterSpacing: '0.02em',
            lineHeight: 1.2,
            transition: 'color 100ms',
          }}>
            {chain.name}
          </span>
          {compatPercent !== null && (
            <span style={{
              fontSize: 'var(--text-body)',
              fontFamily: 'var(--font-system)',
              fontWeight: 600,
              color: getCompatColor(compatPercent),
              flexShrink: 0,
              padding: '0 3px',
              background: `${getCompatColor(compatPercent)}12`,
              lineHeight: '13px',
            }}>
              {compatPercent}%
            </span>
          )}
        </div>

        {/* Row 2: Author + time + plugin flow */}
        <div className="flex items-center gap-1" style={{ fontSize: 'var(--text-body)', color: '#fff', lineHeight: 1.2, marginTop: '2px' }}>
          <span
            onClick={handleAuthorClick}
            style={{ cursor: 'pointer', transition: 'color 150ms' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-cyan)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#fff'; }}
          >
            @{authorName}
          </span>
          {chain.createdAt && (
            <>
              <span style={{ opacity: 0.5 }}>·</span>
              <span>{formatTimeAgo(chain.createdAt)}</span>
            </>
          )}
          {slots && slots.length > 0 && (
            <>
              <span style={{ opacity: 0.5 }}>·</span>
              <span className="truncate" style={{ fontFamily: 'var(--font-mono)' }}>
                {pluginCount}p:{' '}
                {slots.slice(0, 3).map((s, i) => {
                  const enriched = s.uid ? getEnrichedDataForPlugin(s.uid) : null;
                  const catColor = enriched?.category ? getCategoryColor(enriched.category) : undefined;
                  return (
                    <span key={i}>
                      {i > 0 && ' → '}
                      {catColor && <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: catColor, marginRight: 3, verticalAlign: 'middle' }} />}
                      {s.pluginName}
                    </span>
                  );
                })}
                {pluginCount > 3 ? ' →...' : ''}
              </span>
            </>
          )}
        </div>

        {/* Topology diagram (compact) */}
        {chain.treeData && (
          <div style={{ marginTop: '2px' }}>
            <TopologyDiagram treeData={chain.treeData} compact />
          </div>
        )}

        {/* Tags (max 3, inline) */}
        {chain.tags?.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            {chain.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 'var(--text-nano)',
                  color: '#fff',
                  background: 'rgba(255,255,255,0.03)',
                  padding: '1px 4px',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Right column: stats + actions */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        {/* Stats row */}
        <div className="flex items-center gap-2" style={{ fontSize: 'var(--text-body)', color: '#fff' }}>
          {rating != null && rating > 0 && (
            <span className="flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5" style={{ color: 'var(--color-status-warning)', fill: 'var(--color-status-warning)' }} />
              {rating.toFixed(1)}
            </span>
          )}
          <span className="flex items-center gap-0.5">
            <Download className="w-2.5 h-2.5" />
            {chain.downloads}
          </span>
        </div>

        {/* Actions (visible on hover) */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()} style={{ opacity: hovered ? 1 : 0, transition: 'opacity 100ms' }}>
          <button
            onClick={onToggleCollection}
            style={{
              padding: '2px',
              color: isInCollection ? 'var(--color-accent-cyan)' : 'rgba(255,255,255,0.3)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'color 150ms',
            }}
            title={isInCollection ? 'Saved' : 'Save'}
          >
            {isInCollection ? <BookmarkCheck className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
          </button>
          <button
            onClick={onLoad}
            className="flex items-center gap-0.5"
            style={{
              fontSize: 'var(--text-body)',
              fontWeight: 700,
              fontFamily: 'var(--font-system)',
              textTransform: 'uppercase',
              padding: '3px 8px',
              background: 'var(--color-accent-cyan)',
              color: '#000',
              border: 'none',
              cursor: 'pointer',
              letterSpacing: '0.06em',
              lineHeight: 1.2,
              transition: 'opacity 100ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            Load <ArrowRight className="w-2 h-2" />
          </button>
        </div>
      </div>
    </div>
  );
}
