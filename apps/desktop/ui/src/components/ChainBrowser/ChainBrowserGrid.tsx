import { ChainBrowserCard } from './ChainBrowserCard';
import { Globe, ChevronLeft, ChevronRight } from 'lucide-react';

interface ChainBrowserGridProps {
  chains: any[];
  loading: boolean;
  total: number;
  hasMore: boolean;
  offset: number;
  pageSize: number;
  ownedPluginIds: Set<string>;
  collectionIds: Set<string>;
  isLoggedIn: boolean;
  onPreview: (chain: any) => void;
  onLoad: (chain: any) => void;
  onToggleCollection: (chainId: string) => void;
  onNextPage: () => void;
  onPrevPage: () => void;
}

function computeCompat(chain: any, ownedIds: Set<string>, isLoggedIn: boolean): number | null {
  if (!isLoggedIn) return null;
  const ids: string[] = chain.pluginIds ?? [];
  if (ids.length === 0) return null;
  const owned = ids.filter((id) => ownedIds.has(id)).length;
  return Math.round((owned / ids.length) * 100);
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
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-xs text-plugin-muted animate-pulse-soft">Loading chains...</div>
      </div>
    );
  }

  if (chains.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <Globe className="w-8 h-8 text-plugin-dim/30" />
        <span className="text-xs text-plugin-muted">No chains found</span>
      </div>
    );
  }

  const currentPage = Math.floor(offset / pageSize) + 1;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="grid grid-cols-2 gap-2">
          {chains.map((chain) => (
            <ChainBrowserCard
              key={chain._id}
              chain={chain}
              compatPercent={computeCompat(chain, ownedPluginIds, isLoggedIn)}
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
        <div className="flex items-center justify-between px-3 py-2 border-t border-plugin-border/50 flex-shrink-0">
          <button
            onClick={onPrevPage}
            disabled={offset === 0}
            className="flex items-center gap-1 text-[10px] text-plugin-muted hover:text-plugin-text disabled:text-plugin-dim disabled:cursor-not-allowed font-mono"
          >
            <ChevronLeft className="w-3 h-3" /> Prev
          </button>
          <span className="text-[9px] text-plugin-dim font-mono">
            {currentPage} / {totalPages} ({total} total)
          </span>
          <button
            onClick={onNextPage}
            disabled={!hasMore}
            className="flex items-center gap-1 text-[10px] text-plugin-muted hover:text-plugin-text disabled:text-plugin-dim disabled:cursor-not-allowed font-mono"
          >
            Next <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
