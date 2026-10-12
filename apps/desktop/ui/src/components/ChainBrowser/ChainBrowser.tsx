import { useState, useEffect, useCallback, useMemo } from 'react';
import { Compass, Bookmark, User, SlidersHorizontal, LogIn } from 'lucide-react';
import { ChainBrowserSidebar } from './ChainBrowserSidebar';
import { ChainBrowserGrid, computeCompat, CARD_GRID } from './ChainBrowserGrid';
import { ChainBrowserCard } from './ChainBrowserCard';
import { ChainBrowserSearch } from './ChainBrowserSearch';
import { ChainDetailContent, buildImportData } from '../CloudSync/ChainDetailContent';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { useChainStore } from '../../stores/chainStore';
import { useSyncStore } from '../../stores/syncStore';
import { juceBridge } from '../../api/juce-bridge';

type LibraryTab = 'browse' | 'collection' | 'mine';
const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: 'popular', label: 'Popular' },
  { value: 'recent', label: 'Newest' },
  { value: 'downloads', label: 'Most loaded' },
  { value: 'rating', label: 'Top rated' },
];

interface ChainBrowserProps {
  /** Pre-fills the search box. Change it (with a new nonce) to search again. */
  initialSearch?: string;
  searchNonce?: number;
  /** Called after a chain loads into the editor */
  onLoaded?: () => void;
  /** Optional close action (shown when the Library is used as an overlay) */
  onClose?: () => void;
}

/**
 * The Library: community chains, saved chains and your own chains,
 * with a filter rail, a card grid and a detail panel on the right.
 */
export function ChainBrowser({ initialSearch, searchNonce, onLoaded, onClose }: ChainBrowserProps) {
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
    downloadChain,
  } = useCloudChainStore();

  const setChainName = useChainStore((s) => s.setChainName);
  const setTargetInputLufs = useChainStore((s) => s.setTargetInputLufs);
  const { isLoggedIn } = useSyncStore();

  const [tab, setTab] = useState<LibraryTab>('browse');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedUseCase, setSelectedUseCase] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('popular');
  const [compatFilter, setCompatFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState(initialSearch ?? '');
  const [offset, setOffset] = useState(0);
  const [previewChain, setPreviewChain] = useState<any | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [loadMessage, setLoadMessage] = useState<string | null>(null);

  // Outside request to search (e.g. empty-state starter buttons)
  useEffect(() => {
    if (initialSearch !== undefined) {
      setTab('browse');
      setSearchQuery(initialSearch);
    }
  }, [initialSearch, searchNonce]);

  useEffect(() => {
    if (isLoggedIn && ownedPluginIds.size === 0) {
      fetchOwnedPluginIds();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, fetchOwnedPluginIds]);

  const collectionIds = useMemo(() => new Set(collection.map((c) => c.chain._id)), [collection]);

  const query = useCallback(
    (newOffset: number) =>
      browseChainsPaginated({
        useCaseGroup: selectedGroup ?? undefined,
        useCase: selectedUseCase ?? undefined,
        search: searchQuery || undefined,
        sortBy: sortBy as any,
        compatibilityFilter: compatFilter as any,
        limit: PAGE_SIZE,
        offset: newOffset,
      }),
    [selectedGroup, selectedUseCase, searchQuery, sortBy, compatFilter, browseChainsPaginated]
  );

  useEffect(() => {
    if (tab === 'browse') {
      setOffset(0);
      query(0);
    }
  }, [tab, query]);

  useEffect(() => {
    if (isLoggedIn) fetchCollection();
  }, [isLoggedIn, fetchCollection]);

  useEffect(() => {
    if (tab === 'mine' && isLoggedIn) fetchMyChains();
  }, [tab, isLoggedIn, fetchMyChains]);

  // Escape closes the detail panel first, then the overlay (if any)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (previewChain) setPreviewChain(null);
      else onClose?.();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, previewChain]);

  useEffect(() => {
    if (!loadMessage) return;
    const t = setTimeout(() => setLoadMessage(null), 3500);
    return () => clearTimeout(t);
  }, [loadMessage]);

  const handlePreview = useCallback(
    async (chain: any) => {
      if (previewChain?._id === chain._id) return;
      // Show what we have at once, then swap in the full record
      setPreviewChain(chain);
      const full = await loadChain(chain.slug ?? chain.shareCode);
      if (full) {
        setPreviewChain(full);
        if (isLoggedIn) {
          checkCompatibility(full._id);
          fetchDetailedCompatibility(full._id);
        }
      }
    },
    [previewChain, loadChain, checkCompatibility, fetchDetailedCompatibility, isLoggedIn]
  );

  const importIntoEditor = useCallback(
    async (chain: any, chainData: unknown) => {
      const result = await juceBridge.importChain(chainData);
      if (result?.success) {
        setChainName(chain.name);
        setTargetInputLufs(chain.targetInputLufs ?? null);
        setLoadMessage(`Loaded "${chain.name}"`);
        onLoaded?.();
      } else {
        setLoadMessage(`Couldn't load "${chain.name}"`);
      }
    },
    [setChainName, setTargetInputLufs, onLoaded]
  );

  // Card "Load": go straight in when you own everything, else open the detail to pick swaps
  const handleQuickLoad = useCallback(
    async (chain: any) => {
      const pct = computeCompat(chain, ownedPluginIds, isLoggedIn);
      if (pct !== 100) {
        handlePreview(chain);
        return;
      }
      const full = await loadChain(chain.slug ?? chain.shareCode);
      if (!full) return;
      downloadChain(full._id);
      await importIntoEditor(full, buildImportData(full));
    },
    [ownedPluginIds, isLoggedIn, handlePreview, loadChain, downloadChain, importIntoEditor]
  );

  const handleToggleCollection = useCallback(
    async (chainId: string) => {
      if (!isLoggedIn) return;
      if (collectionIds.has(chainId)) await removeFromCollection(chainId);
      else await addToCollection(chainId);
    },
    [isLoggedIn, collectionIds, addToCollection, removeFromCollection]
  );

  const tabs: { id: LibraryTab; label: string; icon: typeof Compass; count?: number }[] = [
    { id: 'browse', label: 'Discover', icon: Compass },
    { id: 'collection', label: 'Saved', icon: Bookmark, count: isLoggedIn ? collection.length : undefined },
    { id: 'mine', label: 'My chains', icon: User },
  ];

  const resultLabel =
    tab === 'browse'
      ? loading && chains.length === 0
        ? 'Loading…'
        : `${browseTotal || chains.length} chain${(browseTotal || chains.length) === 1 ? '' : 's'}`
      : tab === 'collection'
        ? `${collection.length} saved`
        : `${myChains.length} of yours`;

  return (
    <div className="relative flex flex-col flex-1 min-h-0 bg-plugin-bg">
      {/* Library toolbar */}
      <div className="flex items-center gap-2 h-11 px-3 border-b border-plugin-border bg-plugin-surface flex-shrink-0">
        <div className="flex items-center rounded-md bg-plugin-bg border border-plugin-border p-0.5" role="tablist" aria-label="Library sections">
          {tabs.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
                setPreviewChain(null);
              }}
              className={`h-7 inline-flex items-center gap-1.5 px-2.5 rounded text-xs font-semibold transition-colors ${
                tab === id ? 'bg-plugin-raised text-plugin-text shadow-sm' : 'text-plugin-muted hover:text-plugin-text'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
              {count ? <span className="num text-[10px] text-plugin-dim">{count}</span> : null}
            </button>
          ))}
        </div>

        {tab === 'browse' && (
          <>
            <div className="flex-1 max-w-[360px] min-w-[120px]">
              <ChainBrowserSearch onSearch={setSearchQuery} value={initialSearch} key={searchNonce ?? 0} />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort chains"
              className="h-8 bg-plugin-bg border border-plugin-border rounded-md px-2 text-xs text-plugin-text focus:outline-none focus:border-plugin-accent/60"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <button
              onClick={() => setShowFilters((v) => !v)}
              aria-pressed={showFilters}
              className={`h-8 w-8 inline-flex items-center justify-center rounded-md border transition-colors ${
                showFilters ? 'border-plugin-accent/50 text-plugin-accent-bright bg-plugin-accent/10' : 'border-plugin-border text-plugin-muted hover:text-plugin-text'
              }`}
              title="Show filters"
              aria-label="Show filters"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        <span className="flex-1" />
        <span className="num text-[11px] text-plugin-dim hidden md:inline">{resultLabel}</span>
      </div>

      <div className="flex flex-1 min-h-0">
        {tab === 'browse' && showFilters && (
          <div className={previewChain ? 'hidden xl:flex' : 'hidden md:flex'}>
            <ChainBrowserSidebar
              selectedGroup={selectedGroup}
              selectedUseCase={selectedUseCase}
              compatibilityFilter={compatFilter}
              isLoggedIn={isLoggedIn}
              onSelectGroup={setSelectedGroup}
              onSelectUseCase={setSelectedUseCase}
              onCompatFilterChange={setCompatFilter}
            />
          </div>
        )}

        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          {tab === 'browse' ? (
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
              selectedId={previewChain?._id}
              onPreview={handlePreview}
              onLoad={handleQuickLoad}
              onToggleCollection={handleToggleCollection}
              onNextPage={() => {
                const n = offset + PAGE_SIZE;
                setOffset(n);
                query(n);
              }}
              onPrevPage={() => {
                const n = Math.max(0, offset - PAGE_SIZE);
                setOffset(n);
                query(n);
              }}
            />
          ) : !isLoggedIn ? (
            <LoggedOut what={tab === 'collection' ? 'chains you save' : 'chains you share'} />
          ) : tab === 'collection' ? (
            <SimpleList
              loading={collectionLoading}
              items={collection.map((c) => ({ chain: c.chain, note: c.source === 'web' ? 'saved on web' : undefined }))}
              emptyTitle="Nothing saved yet"
              emptyHint="Use the bookmark on any chain in Discover to keep it here."
              emptyIcon={Bookmark}
              ownedPluginIds={ownedPluginIds}
              collectionIds={collectionIds}
              selectedId={previewChain?._id}
              onPreview={handlePreview}
              onLoad={handleQuickLoad}
              onToggleCollection={handleToggleCollection}
            />
          ) : (
            <SimpleList
              loading={myChainsLoading}
              items={myChains.map((c: any) => ({ chain: c, note: c.isPublic === false ? 'Private' : undefined }))}
              emptyTitle="You haven't shared a chain yet"
              emptyHint="Build a chain, then use Save to put it in the library."
              emptyIcon={User}
              ownedPluginIds={ownedPluginIds}
              collectionIds={collectionIds}
              selectedId={previewChain?._id}
              onPreview={handlePreview}
              onLoad={handleQuickLoad}
            />
          )}
        </div>

        {previewChain && (
          <aside
            className="w-[340px] lg:w-[380px] flex-shrink-0 border-l border-plugin-border bg-plugin-surface flex flex-col min-h-0 animate-slide-in-right"
            aria-label="Chain details"
          >
            <ChainDetailContent
              chain={previewChain}
              onClose={() => setPreviewChain(null)}
              isInCollection={collectionIds.has(previewChain._id)}
              onToggleCollection={isLoggedIn ? () => handleToggleCollection(previewChain._id) : undefined}
              onLoad={(data) => importIntoEditor(previewChain, data)}
            />
          </aside>
        )}
      </div>

      {loadMessage && (
        <div
          role="status"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 h-8 inline-flex items-center rounded-md bg-plugin-raised border border-plugin-border-bright shadow-panel text-xs text-plugin-text animate-fade-in"
        >
          {loadMessage}
        </div>
      )}
    </div>
  );
}

function LoggedOut({ what }: { what: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
      <LogIn className="w-7 h-7 text-plugin-dim" />
      <span className="text-sm text-plugin-muted">Log in to see {what}</span>
      <span className="text-xs text-plugin-dim">Use the account button at the top right.</span>
    </div>
  );
}

function SimpleList({
  loading,
  items,
  emptyTitle,
  emptyHint,
  emptyIcon: Icon,
  ownedPluginIds,
  collectionIds,
  selectedId,
  onPreview,
  onLoad,
  onToggleCollection,
}: {
  loading: boolean;
  items: { chain: any; note?: string }[];
  emptyTitle: string;
  emptyHint: string;
  emptyIcon: typeof Compass;
  ownedPluginIds: Set<string>;
  collectionIds: Set<string>;
  selectedId?: string;
  onPreview: (chain: any) => void;
  onLoad: (chain: any) => void;
  onToggleCollection?: (chainId: string) => void;
}) {
  if (loading && items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-xs text-plugin-muted animate-pulse-soft">Loading…</span>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
        <Icon className="w-7 h-7 text-plugin-dim" />
        <span className="text-sm text-plugin-muted">{emptyTitle}</span>
        <span className="text-xs text-plugin-dim">{emptyHint}</span>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className={CARD_GRID}>
        {items.map(({ chain, note }) => (
          <ChainBrowserCard
            key={chain._id}
            chain={chain}
            note={note}
            selected={selectedId === chain._id}
            compatPercent={computeCompat(chain, ownedPluginIds, true)}
            isInCollection={collectionIds.has(chain._id)}
            onPreview={() => onPreview(chain)}
            onLoad={() => onLoad(chain)}
            onToggleCollection={onToggleCollection ? () => onToggleCollection(chain._id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
