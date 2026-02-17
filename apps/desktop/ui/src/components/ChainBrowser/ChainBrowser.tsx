import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Globe, FolderOpen, Plug } from 'lucide-react';
import { ChainBrowserSidebar } from './ChainBrowserSidebar';
import { ChainBrowserGrid } from './ChainBrowserGrid';
import { ChainBrowserDetail } from './ChainBrowserDetail';
import { BrowseFilterBar } from './BrowseFilterBar';
import { MyChainsList } from './MyChainsList';
import { PluginListPanel } from './PluginListPanel';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { useSyncStore } from '../../stores/syncStore';
import { useKeyboardStore, ShortcutPriority } from '../../stores/keyboardStore';
import type { BrowseChainResult } from '../../api/types';

export type BrowserTab = 'plugins' | 'my-chains' | 'browse';
const PAGE_SIZE = 20;

interface ChainBrowserProps {
  onClose: () => void;
  initialTab?: BrowserTab;
}

export function ChainBrowser({ onClose, initialTab = 'plugins' }: ChainBrowserProps) {
  const {
    chains,
    browseTotal,
    browseHasMore,
    collection,
    loading,
    ownedPluginIds,
    browseChainsPaginated,
    loadChain,
    checkCompatibility,
    fetchDetailedCompatibility,
    fetchCollection,
    addToCollection,
    removeFromCollection,
    fetchOwnedPluginIds,
  } = useCloudChainStore();

  const { isLoggedIn } = useSyncStore();

  const [tab, setTab] = useState<BrowserTab>(initialTab);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedUseCase, setSelectedUseCase] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('popular');
  const [compatFilter, setCompatFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [previewChain, setPreviewChain] = useState<BrowseChainResult | null>(null);

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
        authorName: authorFilter ?? undefined,
        sortBy: sortBy as any,
        compatibilityFilter: compatFilter as any,
        limit: PAGE_SIZE,
        offset: 0,
      });
    }
  }, [tab, selectedGroup, selectedUseCase, sortBy, compatFilter, searchQuery, authorFilter, browseChainsPaginated]);

  // Fetch collection on browse tab
  useEffect(() => {
    if (tab === 'browse' && isLoggedIn) {
      fetchCollection();
    }
  }, [tab, isLoggedIn, fetchCollection]);

  // Escape closes (modal priority)
  useEffect(() => {
    const registerShortcut = useKeyboardStore.getState().registerShortcut;
    return registerShortcut({
      id: 'chain-browser-escape',
      key: 'Escape',
      priority: ShortcutPriority.MODAL,
      allowInInputs: true,
      handler: (e) => {
        e.preventDefault();
        if (previewChain) {
          setPreviewChain(null);
        } else {
          onClose();
        }
      }
    });
  }, [onClose, previewChain]);

  const handlePreview = useCallback(
    async (chain: BrowseChainResult) => {
      const full = await loadChain(chain.slug);
      if (full) {
        setPreviewChain(full as BrowseChainResult);
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
      authorName: authorFilter ?? undefined,
      sortBy: sortBy as any,
      compatibilityFilter: compatFilter as any,
      limit: PAGE_SIZE,
      offset: newOffset,
    });
  }, [offset, selectedGroup, selectedUseCase, searchQuery, authorFilter, sortBy, compatFilter, browseChainsPaginated]);

  const handlePrevPage = useCallback(() => {
    const newOffset = Math.max(0, offset - PAGE_SIZE);
    setOffset(newOffset);
    browseChainsPaginated({
      useCaseGroup: selectedGroup ?? undefined,
      useCase: selectedUseCase ?? undefined,
      search: searchQuery || undefined,
      authorName: authorFilter ?? undefined,
      sortBy: sortBy as any,
      compatibilityFilter: compatFilter as any,
      limit: PAGE_SIZE,
      offset: newOffset,
    });
  }, [offset, selectedGroup, selectedUseCase, searchQuery, authorFilter, sortBy, compatFilter, browseChainsPaginated]);

  const handleAuthorClick = useCallback((authorName: string) => {
    setAuthorFilter(authorName);
    setSearchQuery('');
    setOffset(0);
  }, []);

  const handleClearAuthorFilter = useCallback(() => {
    setAuthorFilter(null);
    setOffset(0);
  }, []);

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

  const tabBtnStyle = (t: BrowserTab): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: 'var(--space-1) var(--space-3)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--tracking-wide)',
    fontWeight: 600,
    borderBottom: tab === t ? '2px solid var(--color-accent-cyan)' : '2px solid transparent',
    color: tab === t ? 'var(--color-accent-cyan)' : 'var(--color-text-tertiary)',
    background: tab === t ? 'rgba(222, 255, 10, 0.05)' : 'transparent',
    cursor: 'pointer',
    transition: 'all var(--duration-fast) var(--ease-snap)',
    border: 'none',
    borderRadius: 0,
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col fade-in" style={{ top: 33, background: 'var(--color-bg-primary)' }}>
      {/* Tab bar (also serves as header) */}
      <div className="flex items-center justify-between px-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-secondary)' }}>
        <div className="flex items-center gap-1">
          <button onClick={() => setTab('plugins')} style={tabBtnStyle('plugins')}>
            <Plug className="w-3 h-3" /> Plugins
          </button>
          <button onClick={() => setTab('my-chains')} style={tabBtnStyle('my-chains')}>
            <FolderOpen className="w-3 h-3" /> My Chains
          </button>
          <button onClick={() => setTab('browse')} style={tabBtnStyle('browse')}>
            <Globe className="w-3 h-3" /> Browse
          </button>
        </div>
        <button
          onClick={onClose}
          style={{ padding: '4px', color: 'var(--color-text-disabled)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-base)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-disabled)')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Filter bar for browse tab */}
      {tab === 'browse' && !previewChain && (
        <BrowseFilterBar
          sortBy={sortBy}
          compatibilityFilter={compatFilter}
          isLoggedIn={isLoggedIn}
          searchQuery={searchQuery}
          onSortChange={setSortBy}
          onCompatFilterChange={setCompatFilter}
          onSearch={setSearchQuery}
        />
      )}

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar — only for browse tab */}
        {tab === 'browse' && !previewChain && (
          <ChainBrowserSidebar
            selectedGroup={selectedGroup}
            selectedUseCase={selectedUseCase}
            onSelectGroup={setSelectedGroup}
            onSelectUseCase={setSelectedUseCase}
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
        ) : tab === 'plugins' ? (
          <PluginListPanel onClose={onClose} />
        ) : tab === 'my-chains' ? (
          <MyChainsList
            onClose={onClose}
            onPreview={handlePreview}
          />
        ) : (
          <ChainBrowserGrid
            chains={chains as BrowseChainResult[]}
            loading={loading}
            total={browseTotal}
            hasMore={browseHasMore}
            offset={offset}
            pageSize={PAGE_SIZE}
            ownedPluginIds={ownedPluginIds}
            collectionIds={collectionIds}
            isLoggedIn={isLoggedIn}
            authorFilter={authorFilter}
            onPreview={handlePreview}
            onLoad={handlePreview}
            onToggleCollection={handleToggleCollection}
            onNextPage={handleNextPage}
            onPrevPage={handlePrevPage}
            onAuthorClick={handleAuthorClick}
            onClearAuthorFilter={handleClearAuthorFilter}
          />
        )}
      </div>
    </div>
  );
}
