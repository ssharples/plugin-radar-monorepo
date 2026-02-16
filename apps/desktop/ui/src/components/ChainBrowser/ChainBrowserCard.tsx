import { useState } from 'react';
import { Download, Heart, Bookmark, BookmarkCheck, ChevronDown, ChevronRight } from 'lucide-react';
import type { BrowseChainResult } from '../../api/types';

interface ChainBrowserCardProps {
  chain: BrowseChainResult;
  compatPercent: number | null; // null if not logged in
  isInCollection: boolean;
  onPreview: () => void;
  onLoad: () => void;
  onToggleCollection: () => void;
}

function getCompatColor(percent: number | null): string {
  if (percent === null) return 'var(--color-text-disabled)';
  if (percent === 100) return 'var(--color-status-active)';
  if (percent >= 80) return 'var(--color-status-warning)';
  if (percent >= 50) return '#f97316';
  return 'var(--color-status-error)';
}

function getCompatLabel(percent: number | null): string {
  if (percent === null) return '—';
  return `${percent}%`;
}

export function ChainBrowserCard({
  chain,
  compatPercent,
  isInCollection,
  onPreview,
  onLoad,
  onToggleCollection,
}: ChainBrowserCardProps) {
  const [showPlugins, setShowPlugins] = useState(false);
  const [expandedPluginIdx, setExpandedPluginIdx] = useState<number | null>(null);
  const pluginCount = chain.slots?.length ?? chain.pluginCount;
  const slots = chain.slots;

  return (
    <div
      className="group fast-snap"
      style={{
        background: 'var(--color-bg-input)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3)',
        cursor: 'pointer',
        transition: 'all var(--duration-fast) var(--ease-snap)',
      }}
      onClick={onPreview}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(222, 255, 10, 0.3)';
        e.currentTarget.style.boxShadow = '0 0 8px rgba(222, 255, 10, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Top row: name + compat badge */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4 style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {chain.name}
        </h4>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="flex items-center gap-1">
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: getCompatColor(compatPercent) }} />
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
              {getCompatLabel(compatPercent)}
            </span>
          </div>
        </div>
      </div>

      {/* Author */}
      {chain.author?.name && (
        <p style={{ fontSize: '10px', color: 'var(--color-text-disabled)', marginBottom: '4px' }}>
          by @{chain.author.name}
        </p>
      )}

      {/* Expandable plugin list */}
      {slots && slots.length > 0 && (
        <div style={{ marginBottom: '8px' }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              setShowPlugins(!showPlugins);
              if (showPlugins) setExpandedPluginIdx(null);
            }}
            className="flex items-center gap-1"
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-tertiary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {showPlugins ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {pluginCount} plugin{pluginCount !== 1 ? 's' : ''}
          </button>

          {showPlugins ? (
            <div className="mt-1 space-y-0.5">
              {slots.map((slot, idx) => {
                const paramCount = slot.parameters?.length ?? 0;
                const isExpanded = expandedPluginIdx === idx;

                return (
                  <div key={idx}>
                    <div
                      className="flex items-center gap-2 px-2 py-0.5 rounded"
                      style={{
                        background: isExpanded ? 'rgba(222, 255, 10, 0.06)' : 'rgba(0, 0, 0, 0.2)',
                        fontSize: '9px',
                        fontFamily: 'var(--font-mono)',
                        cursor: paramCount > 0 ? 'pointer' : 'default',
                      }}
                      onClick={() => {
                        if (paramCount > 0) {
                          setExpandedPluginIdx(isExpanded ? null : idx);
                        }
                      }}
                    >
                      <span style={{ color: 'var(--color-text-disabled)', width: '14px', textAlign: 'right', flexShrink: 0 }}>
                        {(slot.position ?? idx) + 1}.
                      </span>
                      <span style={{ color: slot.bypassed ? 'var(--color-text-disabled)' : 'var(--color-text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {slot.pluginName}
                      </span>
                      <span style={{ color: 'var(--color-text-disabled)', flexShrink: 0 }}>
                        {slot.manufacturer}
                      </span>
                      {slot.bypassed && (
                        <span
                          className="px-1 rounded"
                          style={{
                            fontSize: '7px',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                            color: 'var(--color-status-warning)',
                            background: 'rgba(255, 200, 0, 0.1)',
                          }}
                        >
                          BYP
                        </span>
                      )}
                      {paramCount > 0 && (
                        <span
                          className="flex items-center gap-0.5"
                          style={{
                            fontSize: '8px',
                            color: 'var(--color-accent-cyan)',
                            flexShrink: 0,
                          }}
                        >
                          {paramCount}p {isExpanded ? <ChevronDown className="w-2 h-2" /> : <ChevronRight className="w-2 h-2" />}
                        </span>
                      )}
                    </div>

                    {/* Parameter sub-list */}
                    {isExpanded && slot.parameters && (
                      <div className="ml-6 mt-0.5 mb-1 space-y-px">
                        {slot.parameters.map((param, pIdx) => (
                          <div
                            key={pIdx}
                            className="flex items-center gap-2 px-2 py-px rounded"
                            style={{
                              background: 'rgba(222, 255, 10, 0.03)',
                              fontSize: '8px',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            <span style={{ color: 'var(--color-text-tertiary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {param.name}
                            </span>
                            <span style={{ color: 'var(--color-accent-cyan)', flexShrink: 0, fontWeight: 600 }}>
                              {param.value}{param.unit ? ` ${param.unit}` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
              {slots.slice(0, 3).map((s) => s.pluginName).join(' → ')}
              {pluginCount > 3 ? ` +${pluginCount - 3} more` : ''}
            </p>
          )}
        </div>
      )}

      {/* Bottom row: stats + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5" style={{ fontSize: '9px', color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>
          <span className="flex items-center gap-0.5">
            <Download className="w-2.5 h-2.5" /> {chain.downloads}
          </span>
          <span className="flex items-center gap-0.5">
            <Heart className="w-2.5 h-2.5" /> {chain.likes}
          </span>
          {chain.pluginCount > 0 && (
            <span>{chain.pluginCount}p</span>
          )}
        </div>

        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onToggleCollection}
            style={{
              padding: '4px',
              borderRadius: 'var(--radius-base)',
              color: isInCollection ? 'var(--color-accent-cyan)' : 'var(--color-text-disabled)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'color var(--duration-fast)',
            }}
            onMouseEnter={(e) => { if (!isInCollection) e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
            onMouseLeave={(e) => { if (!isInCollection) e.currentTarget.style.color = 'var(--color-text-disabled)'; }}
            title={isInCollection ? 'Remove from collection' : 'Add to collection'}
          >
            {isInCollection ? (
              <BookmarkCheck className="w-3 h-3" />
            ) : (
              <Bookmark className="w-3 h-3" />
            )}
          </button>
          <button
            onClick={onLoad}
            className="btn btn-primary"
            style={{ fontSize: '9px', padding: '2px 8px', textTransform: 'uppercase', fontWeight: 700 }}
          >
            Load
          </button>
        </div>
      </div>
    </div>
  );
}
