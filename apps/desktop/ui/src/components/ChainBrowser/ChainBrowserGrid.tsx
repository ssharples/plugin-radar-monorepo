import { useMemo } from 'react';
import { ChainBrowserCard } from './ChainBrowserCard';
import { Globe, ChevronLeft, ChevronRight, X, User } from 'lucide-react';
import { usePluginStore } from '../../stores/pluginStore';
import type { BrowseChainResult } from '../../api/types';

interface ChainBrowserGridProps {
  chains: BrowseChainResult[];
  loading: boolean;
  total: number;
  hasMore: boolean;
  offset: number;
  pageSize: number;
  ownedPluginIds: Set<string>;
  collectionIds: Set<string>;
  isLoggedIn: boolean;
  authorFilter?: string | null;
  onPreview: (chain: BrowseChainResult) => void;
  onLoad: (chain: BrowseChainResult) => void;
  onToggleCollection: (chainId: string) => void;
  onNextPage: () => void;
  onPrevPage: () => void;
  onAuthorClick?: (authorName: string) => void;
  onClearAuthorFilter?: () => void;
}

function computeCompat(
  chain: BrowseChainResult,
  ownedIds: Set<string>,
  ownedNameKeys: Set<string>,
): number | null {
  const slots = chain.slots ?? [];
  if (slots.length > 0 && ownedNameKeys.size > 0) {
    const owned = slots.filter((s) => {
      const key = `${s.pluginName.toLowerCase()}::${s.manufacturer.toLowerCase()}`;
      if (ownedNameKeys.has(key)) return true;
      for (const ownedKey of ownedNameKeys) {
        const [ownedName] = ownedKey.split('::');
        const chainName = s.pluginName.toLowerCase();
        if (ownedName.includes(chainName) || chainName.includes(ownedName)) {
          const ownedMfr = ownedKey.split('::')[1];
          if (ownedMfr === s.manufacturer.toLowerCase()) return true;
        }
      }
      return false;
    }).length;
    return Math.round((owned / slots.length) * 100);
  }
  const ids: string[] = chain.pluginIds ?? [];
  if (ids.length > 0 && ownedIds.size > 0) {
    const owned = ids.filter((id) => ownedIds.has(id)).length;
    return Math.round((owned / ids.length) * 100);
  }
  return null;
}

export function ChainBrowserGrid({
  chains,
  loading,
  total,
  hasMore,
  offset,
  pageSize,
  ownedPluginIds,
  collectionIds,
  isLoggedIn,
  authorFilter,
  onPreview,
  onLoad,
  onToggleCollection,
  onNextPage,
  onPrevPage,
  onAuthorClick,
  onClearAuthorFilter,
}: ChainBrowserGridProps) {
  const localPlugins = usePluginStore((s) => s.plugins);
  const ownedNameKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const p of localPlugins) {
      keys.add(`${p.name.toLowerCase()}::${p.manufacturer.toLowerCase()}`);
    }
    return keys;
  }, [localPlugins]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>Loading chains...</div>
      </div>
    );
  }

  if (chains.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <Globe className="w-8 h-8" style={{ color: 'var(--color-text-disabled)', opacity: 0.3 }} />
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>No chains found</span>
      </div>
    );
  }

  const currentPage = Math.floor(offset / pageSize) + 1;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Author filter banner */}
      {authorFilter && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0"
          style={{
            borderBottom: '1px solid var(--color-border-subtle)',
            background: 'rgba(222, 255, 10, 0.03)',
          }}
        >
          <User className="w-3 h-3" style={{ color: 'var(--color-accent-cyan)' }} />
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
            Chains by
          </span>
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-accent-cyan)' }}>
            @{authorFilter}
          </span>
          <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
            ({total})
          </span>
          <button
            onClick={onClearAuthorFilter}
            style={{
              marginLeft: 'auto',
              padding: '2px',
              color: 'var(--color-text-disabled)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-disabled)'; }}
            title="Clear author filter"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-cyber px-3 py-2">
        <div className="flex flex-col gap-1.5">
          {chains.map((chain) => (
            <ChainBrowserCard
              key={chain._id}
              chain={chain}
              compatPercent={computeCompat(chain, ownedPluginIds, ownedNameKeys)}
              isInCollection={collectionIds.has(chain._id)}
              onPreview={() => onPreview(chain)}
              onLoad={() => onLoad(chain)}
              onToggleCollection={() => onToggleCollection(chain._id)}
              onAuthorClick={onAuthorClick}
            />
          ))}
        </div>
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between px-3 py-2 flex-shrink-0" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
          <button
            onClick={onPrevPage}
            disabled={offset === 0}
            className="flex items-center gap-1"
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              color: offset === 0 ? 'var(--color-text-disabled)' : 'var(--color-text-tertiary)',
              cursor: offset === 0 ? 'not-allowed' : 'pointer',
              background: 'none',
              border: 'none',
            }}
            onMouseEnter={(e) => { if (offset > 0) e.currentTarget.style.color = 'var(--color-text-primary)'; }}
            onMouseLeave={(e) => { if (offset > 0) e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
          >
            <ChevronLeft className="w-3 h-3" /> Prev
          </button>
          <span style={{ fontSize: '9px', color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>
            {currentPage} / {totalPages} ({total} total)
          </span>
          <button
            onClick={onNextPage}
            disabled={!hasMore}
            className="flex items-center gap-1"
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              color: !hasMore ? 'var(--color-text-disabled)' : 'var(--color-text-tertiary)',
              cursor: !hasMore ? 'not-allowed' : 'pointer',
              background: 'none',
              border: 'none',
            }}
            onMouseEnter={(e) => { if (hasMore) e.currentTarget.style.color = 'var(--color-text-primary)'; }}
            onMouseLeave={(e) => { if (hasMore) e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
          >
            Next <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
