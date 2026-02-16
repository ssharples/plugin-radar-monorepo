import { useMemo } from 'react';
import { ChainBrowserCard } from './ChainBrowserCard';
import { Globe, ChevronLeft, ChevronRight } from 'lucide-react';
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
  onPreview: (chain: BrowseChainResult) => void;
  onLoad: (chain: BrowseChainResult) => void;
  onToggleCollection: (chainId: string) => void;
  onNextPage: () => void;
  onPrevPage: () => void;
}

function computeCompat(
  chain: BrowseChainResult,
  ownedIds: Set<string>,
  ownedNameKeys: Set<string>,
): number | null {
  // Prefer name-based matching (works without login — uses local JUCE scan)
  const slots = chain.slots ?? [];
  if (slots.length > 0 && ownedNameKeys.size > 0) {
    const owned = slots.filter((s) => {
      const key = `${s.pluginName.toLowerCase()}::${s.manufacturer.toLowerCase()}`;
      if (ownedNameKeys.has(key)) return true;
      // Fuzzy: check if any local plugin name contains the chain's plugin name or vice versa
      for (const ownedKey of ownedNameKeys) {
        const [ownedName] = ownedKey.split('::');
        const chainName = s.pluginName.toLowerCase();
        if (ownedName.includes(chainName) || chainName.includes(ownedName)) {
          // Also verify manufacturer matches
          const ownedMfr = ownedKey.split('::')[1];
          if (ownedMfr === s.manufacturer.toLowerCase()) return true;
        }
      }
      return false;
    }).length;
    return Math.round((owned / slots.length) * 100);
  }
  // Fallback to Convex ID-based matching (requires synced plugins)
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
  onPreview,
  onLoad,
  onToggleCollection,
  onNextPage,
  onPrevPage,
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
      {/* Grid */}
      <div className="flex-1 overflow-y-auto scrollbar-cyber px-3 py-2">
        <div className="grid grid-cols-2 gap-2">
          {chains.map((chain) => (
            <ChainBrowserCard
              key={chain._id}
              chain={chain}
              compatPercent={computeCompat(chain, ownedPluginIds, ownedNameKeys)}
              isInCollection={collectionIds.has(chain._id)}
              onPreview={() => onPreview(chain)}
              onLoad={() => onLoad(chain)}
              onToggleCollection={() => onToggleCollection(chain._id)}
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
