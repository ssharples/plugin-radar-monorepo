import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Globe, Library, User } from 'lucide-react';
import { ChainBrowserSidebar } from './ChainBrowserSidebar';
import { ChainBrowserGrid } from './ChainBrowserGrid';
import { ChainBrowserDetail } from './ChainBrowserDetail';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { useSyncStore } from '../../stores/syncStore';

type BrowserTab = 'browse' | 'collection' | 'mine';
const PAGE_SIZE = 20;

interface ChainBrowserProps {
  onClose: () => void;
}

export function ChainBrowser({ onClose }: ChainBrowserProps) {
  const {
    chains,
    browseTotal,
    browseHasMore,
    collection,
    collectionLoading,
    myChains,
    myChainsLoading,
    loading,
    ownedPluginIds,
    browseChainsPaginated,
    loadChain,
    checkCompatibility,
    fetchDetailedCompatibility,
    fetchCollection,
    addToCollection,
    removeFromCollection,
    fetchMyChains,
    fetchOwnedPluginIds,
  } = useCloudChainStore();

  const { isLoggedIn } = useSyncStore();

  const [tab, setTab] = useState<BrowserTab>('browse');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedUseCase, setSelectedUseCase] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('popular');
  const [compatFilter, setCompatFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [previewChain, setPreviewChain] = useState<any | null>(null);

  // Fetch owned plugin IDs when logged in
  useEffect(() => {
    if (isLoggedIn && ownedPluginIds.size === 0) {
      fetchOwnedPluginIds();
    }
  }, [isLoggedIn, fetchOwnedPluginIds]);

  // Collection chain IDs for quick lookup
  const collectionIds = useMemo(() => {
    return new Set(collection.map((c) => c.chain._id));
  }, [collection]);

  // Fetch browse data when filters change
  useEffect(() => {
    if (tab === 'browse') {
      setOffset(0);
      browseChainsPaginated({
        useCaseGroup: selectedGroup ?? undefined,
        useCase: selectedUseCase ?? undefined,
        search: searchQuery || undefined,
        sortBy: sortBy as any,
        compatibilityFilter: compatFilter as any,
        limit: PAGE_SIZE,
        offset: 0,
      });
    }
  }, [tab, selectedGroup, selectedUseCase, sortBy, compatFilter, searchQuery, browseChainsPaginated]);

  // Fetch collection and my chains on tab switch
  useEffect(() => {
    if (tab === 'collection' && isLoggedIn) {
      fetchCollection();
    }
    if (tab === 'mine' && isLoggedIn) {
      fetchMyChains();
    }
  }, [tab, isLoggedIn, fetchCollection, fetchMyChains]);

  // Escape closes
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewChain) {
          setPreviewChain(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, previewChain]);

  const handlePreview = useCallback(
    async (chain: any) => {
      const full = await loadChain(chain.slug);
      if (full) {
        setPreviewChain(full);
        if (isLoggedIn) {
          checkCompatibility(full._id);
          fetchDetailedCompatibility(full._id);
        }
      }
    },
    [loadChain, checkCompatibility, fetchDetailedCompatibility, isLoggedIn]
  );

  const handleNextPage = useCallback(() => {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    browseChainsPaginated({
      useCaseGroup: selectedGroup ?? undefined,
      useCase: selectedUseCase ?? undefined,
      search: searchQuery || undefined,
      sortBy: sortBy as any,
      compatibilityFilter: compatFilter as any,
      limit: PAGE_SIZE,
      offset: newOffset,
    });
  }, [offset, selectedGroup, selectedUseCase, searchQuery, sortBy, compatFilter, browseChainsPaginated]);

  const handlePrevPage = useCallback(() => {
    const newOffset = Math.max(0, offset - PAGE_SIZE);
    setOffset(newOffset);
    browseChainsPaginated({
      useCaseGroup: selectedGroup ?? undefined,
      useCase: selectedUseCase ?? undefined,
      search: searchQuery || undefined,
      sortBy: sortBy as any,
      compatibilityFilter: compatFilter as any,
      limit: PAGE_SIZE,
      offset: newOffset,
    });
  }, [offset, selectedGroup, selectedUseCase, searchQuery, sortBy, compatFilter, browseChainsPaginated]);

  const handleToggleCollection = useCallback(
    async (chainId: string) => {
      if (!isLoggedIn) return;
      if (collectionIds.has(chainId)) {
        await removeFromCollection(chainId);
      } else {
        await addToCollection(chainId);
      }
    },
    [isLoggedIn, collectionIds, addToCollection, removeFromCollection]
  );

  const tabBtnClass = (t: BrowserTab) =>
    `flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono uppercase font-medium rounded-t transition-colors ${
      tab === t
        ? 'text-plugin-accent border-b-2 border-plugin-accent bg-white/5'
        : 'text-plugin-muted hover:text-plugin-text'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-plugin-bg/95 animate-fade-in" style={{ top: 33 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-plugin-border flex-shrink-0 bg-plugin-surface">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-plugin-accent" />
          <span className="text-xs font-mono uppercase font-bold text-plugin-text crt-text">
            Community Chains
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-plugin-dim hover:text-plugin-text rounded hover:bg-white/5 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 border-b border-plugin-border/50 bg-plugin-surface flex-shrink-0">
        <button onClick={() => setTab('browse')} className={tabBtnClass('browse')}>
          <Globe className="w-3 h-3" /> Browse
        </button>
        <button onClick={() => setTab('collection')} className={tabBtnClass('collection')}>
          <Library className="w-3 h-3" /> Collection
        </button>
        <button onClick={() => setTab('mine')} className={tabBtnClass('mine')}>
          <User className="w-3 h-3" /> My Chains
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar — only for browse tab */}
        {tab === 'browse' && !previewChain && (
          <ChainBrowserSidebar
            selectedGroup={selectedGroup}
            selectedUseCase={selectedUseCase}
            sortBy={sortBy}
            compatibilityFilter={compatFilter}
            isLoggedIn={isLoggedIn}
            onSelectGroup={setSelectedGroup}
            onSelectUseCase={setSelectedUseCase}
            onSortChange={setSortBy}
            onCompatFilterChange={setCompatFilter}
            onSearch={setSearchQuery}
          />
        )}

        {/* Content area */}
        {previewChain ? (
          <ChainBrowserDetail
            chain={previewChain}
            onBack={() => setPreviewChain(null)}
            onClose={onClose}
            isInCollection={collectionIds.has(previewChain._id)}
            onToggleCollection={() => handleToggleCollection(previewChain._id)}
          />
        ) : tab === 'browse' ? (
          <ChainBrowserGrid
            chains={chains}
            loading={loading}
            total={browseTotal}
            hasMore={browseHasMore}
            offset={offset}
            pageSize={PAGE_SIZE}
            ownedPluginIds={ownedPluginIds}
            collectionIds={collectionIds}
            isLoggedIn={isLoggedIn}
            onPreview={handlePreview}
            onLoad={handlePreview} // Load also previews first
            onToggleCollection={handleToggleCollection}
            onNextPage={handleNextPage}
            onPrevPage={handlePrevPage}
          />
        ) : tab === 'collection' ? (
          <CollectionTab
            collection={collection}
            loading={collectionLoading}
            isLoggedIn={isLoggedIn}
            ownedPluginIds={ownedPluginIds}
            onPreview={handlePreview}
            onRemove={(chainId) => removeFromCollection(chainId)}
          />
        ) : (
          <MyChainsTab
            chains={myChains}
            loading={myChainsLoading}
            isLoggedIn={isLoggedIn}
            onPreview={handlePreview}
          />
        )}
      </div>
    </div>
  );
}

/** Collection tab content */
function CollectionTab({
  collection,
  loading,
  isLoggedIn,
  ownedPluginIds,
  onPreview,
  onRemove,
}: {
  collection: any[];
  loading: boolean;
  isLoggedIn: boolean;
  ownedPluginIds: Set<string>;
  onPreview: (chain: any) => void;
  onRemove: (chainId: string) => void;
}) {
  if (!isLoggedIn) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-plugin-muted">Log in to see your collection</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-xs text-plugin-muted animate-pulse-soft">Loading collection...</div>
      </div>
    );
  }

  if (collection.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <Library className="w-8 h-8 text-plugin-dim/30" />
        <span className="text-xs text-plugin-muted">No saved chains yet</span>
        <span className="text-[10px] text-plugin-dim">
          Bookmark chains from Browse to build your collection
        </span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2">
      <div className="grid grid-cols-2 gap-2">
        {collection.map((item) => {
          const chain = item.chain;
          const ids: string[] = chain.pluginIds ?? [];
          const compatPercent =
            ids.length > 0
              ? Math.round(
                  (ids.filter((id: string) => ownedPluginIds.has(id)).length / ids.length) * 100
                )
              : null;

          return (
            <div
              key={item._id}
              className="group bg-black/20 border border-plugin-border/50 rounded-propane p-3 hover:border-plugin-accent/30 hover:bg-black/30 transition-all cursor-pointer relative"
              onClick={() => onPreview(chain)}
            >
              <h4 className="text-xs font-medium text-plugin-text truncate mb-1">
                {chain.name}
              </h4>
              {chain.author?.name && (
                <p className="text-[10px] text-plugin-dim mb-1">by @{chain.author.name}</p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-plugin-dim font-mono">
                  {item.source === 'web' ? 'from web' : 'from desktop'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(chain._id);
                  }}
                  className="text-[9px] text-plugin-dim hover:text-red-400 font-mono uppercase transition-colors"
                >
                  Remove
                </button>
              </div>
              {compatPercent !== null && (
                <div className="absolute top-2 right-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      compatPercent === 100
                        ? 'bg-green-500'
                        : compatPercent >= 80
                          ? 'bg-yellow-500'
                          : compatPercent >= 50
                            ? 'bg-orange-500'
                            : 'bg-red-500'
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** My Chains tab content */
function MyChainsTab({
  chains,
  loading,
  isLoggedIn,
  onPreview,
}: {
  chains: any[];
  loading: boolean;
  isLoggedIn: boolean;
  onPreview: (chain: any) => void;
}) {
  if (!isLoggedIn) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-plugin-muted">Log in to see your chains</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-xs text-plugin-muted animate-pulse-soft">Loading your chains...</div>
      </div>
    );
  }

  if (chains.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <User className="w-8 h-8 text-plugin-dim/30" />
        <span className="text-xs text-plugin-muted">No chains yet</span>
        <span className="text-[10px] text-plugin-dim">
          Save & share your chains to see them here
        </span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2">
      <div className="grid grid-cols-2 gap-2">
        {chains.map((chain) => (
          <div
            key={chain._id}
            className="group bg-black/20 border border-plugin-border/50 rounded-propane p-3 hover:border-plugin-accent/30 hover:bg-black/30 transition-all cursor-pointer"
            onClick={() => onPreview(chain)}
          >
            <h4 className="text-xs font-medium text-plugin-text truncate mb-1">
              {chain.name}
            </h4>
            <p className="text-[10px] text-plugin-muted truncate mb-2">
              {chain.slots?.slice(0, 3).map((s: any) => s.pluginName).join(' → ')}
            </p>
            <div className="flex items-center gap-2.5 text-[9px] text-plugin-dim">
              <span>{chain.pluginCount}p</span>
              <span>{chain.downloads} downloads</span>
              <span>{chain.likes} likes</span>
              {!chain.isPublic && (
                <span className="text-plugin-accent">Private</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
