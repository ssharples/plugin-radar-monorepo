import { ChainBrowserCard } from './ChainBrowserCard';
import { ChevronLeft, ChevronRight, SearchX } from 'lucide-react';

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
  selectedId?: string | null;
  onPreview: (chain: any) => void;
  onLoad: (chain: any) => void;
  onToggleCollection: (chainId: string) => void;
  onNextPage: () => void;
  onPrevPage: () => void;
}

export function computeCompat(chain: any, ownedIds: Set<string>, isLoggedIn: boolean): number | null {
  if (!isLoggedIn) return null;
  const ids: string[] = chain.pluginIds ?? [];
  if (ids.length === 0) return null;
  const owned = ids.filter((id) => ownedIds.has(id)).length;
  return Math.round((owned / ids.length) * 100);
}

export const CARD_GRID = 'grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(232px,1fr))]';

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
  selectedId,
  onPreview,
  onLoad,
  onToggleCollection,
  onNextPage,
  onPrevPage,
}: ChainBrowserGridProps) {
  if (loading && chains.length === 0) {
    return (
      <div className="flex-1 overflow-hidden p-3">
        <div className={CARD_GRID}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[138px] rounded-lg border border-plugin-border bg-plugin-surface animate-pulse-soft" />
          ))}
        </div>
      </div>
    );
  }

  if (chains.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
        <SearchX className="w-7 h-7 text-plugin-dim" />
        <span className="text-sm text-plugin-muted">No chains match</span>
        <span className="text-xs text-plugin-dim">Try a different search or clear the filters.</span>
      </div>
    );
  }

  const currentPage = Math.floor(offset / pageSize) + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className={`flex-1 overflow-y-auto p-3 ${loading ? 'opacity-60' : ''}`}>
        <div className={CARD_GRID}>
          {chains.map((chain) => (
            <ChainBrowserCard
              key={chain._id}
              chain={chain}
              selected={selectedId === chain._id}
              compatPercent={computeCompat(chain, ownedPluginIds, isLoggedIn)}
              isInCollection={collectionIds.has(chain._id)}
              onPreview={() => onPreview(chain)}
              onLoad={() => onLoad(chain)}
              onToggleCollection={isLoggedIn ? () => onToggleCollection(chain._id) : undefined}
            />
          ))}
        </div>
      </div>

      {total > pageSize && (
        <div className="flex items-center justify-between h-9 px-3 border-t border-plugin-border flex-shrink-0">
          <button
            onClick={onPrevPage}
            disabled={offset === 0}
            className="h-7 inline-flex items-center gap-1 px-2 rounded-md text-xs text-plugin-muted hover:text-plugin-text hover:bg-plugin-raised disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Previous
          </button>
          <span className="num text-[11px] text-plugin-dim">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={onNextPage}
            disabled={!hasMore}
            className="h-7 inline-flex items-center gap-1 px-2 rounded-md text-xs text-plugin-muted hover:text-plugin-text hover:bg-plugin-raised disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
