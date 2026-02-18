import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, X, ChevronDown, Diamond, SlidersHorizontal, Activity, Waves, Timer, Flame, Disc3, Wrench, Clock, TrendingUp, Layers, Link2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePluginStore } from '../../stores/pluginStore';
import { useChainStore } from '../../stores/chainStore';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { useGroupTemplateStore } from '../../stores/groupTemplateStore';
import { useUsageStore } from '../../stores/usageStore';
import { useKeyboardStore, ShortcutPriority } from '../../stores/keyboardStore';
import { PluginCard } from './PluginCard';
import { ChainCard } from './ChainCard';
import { GroupPresetCard } from './GroupPresetCard';
import type { PluginDescription, BrowseChainResult, GroupTemplateInfo } from '../../api/types';

// ── Tabs ────────────────────────────────────────────────
type BrowserTab = 'all' | 'plugins' | 'chains' | 'groups' | 'recent';

interface TabDef {
  id: BrowserTab;
  label: string;
  Icon: LucideIcon;
}

const TABS: TabDef[] = [
  { id: 'all', label: 'All', Icon: Diamond },
  { id: 'plugins', label: 'Plugins', Icon: SlidersHorizontal },
  { id: 'chains', label: 'Chains', Icon: Link2 },
  { id: 'groups', label: 'Groups', Icon: Layers },
  { id: 'recent', label: 'Recent', Icon: Clock },
];

// ── Category filters (plugin-level) ─────────────────────
const EFFECT_CATEGORIES: ReadonlyArray<{ id: string; label: string; Icon: LucideIcon }> = [
  { id: 'all', label: 'All', Icon: Diamond },
  { id: 'eq', label: 'EQ', Icon: SlidersHorizontal },
  { id: 'compressor', label: 'Dynamics', Icon: Activity },
  { id: 'reverb', label: 'Reverb', Icon: Waves },
  { id: 'delay', label: 'Delay', Icon: Timer },
  { id: 'saturation', label: 'Saturation', Icon: Flame },
  { id: 'modulation', label: 'Modulation', Icon: Disc3 },
  { id: 'utility', label: 'Utility', Icon: Wrench },
];

type SortMode = 'recent' | 'popular' | 'name';

// ── Unified item type ───────────────────────────────────
type UnifiedItem =
  | { kind: 'plugin'; data: PluginDescription }
  | { kind: 'chain'; data: BrowseChainResult }
  | { kind: 'group'; data: GroupTemplateInfo };

// ── Props ────────────────────────────────────────────────
interface UnifiedBrowserProps {
  onClose: () => void;
}

export function UnifiedBrowser({ onClose }: UnifiedBrowserProps) {
  // ── Stores ──────────────────────────────────────────────
  const { plugins, getEnrichedDataForPlugin } = usePluginStore();
  const { addPlugin, selectNode } = useChainStore();
  const { chains, browseChainsPaginated, loadChain } = useCloudChainStore();
  const { templates, fetchTemplates } = useGroupTemplateStore();
  const { getPluginUsageCount, getMostRecentPlugins } = useUsageStore();

  // ── State ───────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<BrowserTab>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [authorFilter, setAuthorFilter] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Data loading ────────────────────────────────────────
  useEffect(() => {
    fetchTemplates();
    browseChainsPaginated({ limit: 50, offset: 0, sortBy: 'popular' });
  }, [fetchTemplates, browseChainsPaginated]);

  // ── Escape closes ───────────────────────────────────────
  useEffect(() => {
    const registerShortcut = useKeyboardStore.getState().registerShortcut;
    return registerShortcut({
      id: 'unified-browser-escape',
      key: 'Escape',
      priority: ShortcutPriority.MODAL,
      allowInInputs: true,
      handler: (e) => {
        e.preventDefault();
        if (authorFilter) {
          setAuthorFilter(null);
        } else {
          onClose();
        }
      },
    });
  }, [onClose, authorFilter]);

  // ── Build unified item list ─────────────────────────────
  const items: UnifiedItem[] = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const result: UnifiedItem[] = [];

    // Recent tab: show recently used plugins only
    if (activeTab === 'recent') {
      const recent = getMostRecentPlugins().slice(0, 20);
      for (const r of recent) {
        const plugin = plugins.find(p => p.uid === r.uid);
        if (plugin) {
          if (q && !plugin.name.toLowerCase().includes(q) && !plugin.manufacturer.toLowerCase().includes(q)) continue;
          result.push({ kind: 'plugin', data: plugin });
        }
      }
      return result;
    }

    // Plugins
    if (activeTab === 'all' || activeTab === 'plugins') {
      for (const p of plugins) {
        if (q && !p.name.toLowerCase().includes(q) && !p.manufacturer.toLowerCase().includes(q)) continue;
        if (categoryFilter !== 'all') {
          const enriched = getEnrichedDataForPlugin(p.uid);
          const cat = (enriched?.category || p.category || '').toLowerCase();
          if (!cat.includes(categoryFilter)) continue;
        }
        result.push({ kind: 'plugin', data: p });
      }
    }

    // Chains
    if (activeTab === 'all' || activeTab === 'chains') {
      const browseChains = chains as BrowseChainResult[];
      for (const c of browseChains) {
        if (q && !c.name.toLowerCase().includes(q)) continue;
        if (authorFilter && c.author?.name !== authorFilter) continue;
        result.push({ kind: 'chain', data: c });
      }
    }

    // Group presets
    if (activeTab === 'all' || activeTab === 'groups') {
      for (const t of templates) {
        if (q && !t.name.toLowerCase().includes(q)) continue;
        result.push({ kind: 'group', data: t });
      }
    }

    // Sort
    const recentList = sortMode === 'recent' ? getMostRecentPlugins() : [];
    result.sort((a, b) => {
        switch (sortMode) {
          case 'recent': {
            const aIdx = a.kind === 'plugin' ? recentList.findIndex(r => r.uid === a.data.uid) : -1;
            const bIdx = b.kind === 'plugin' ? recentList.findIndex(r => r.uid === (b.data as PluginDescription).uid) : -1;
            if (aIdx === -1 && bIdx === -1) return 0;
            if (aIdx === -1) return 1;
            if (bIdx === -1) return -1;
            return aIdx - bIdx;
          }
          case 'popular': {
            const aScore = a.kind === 'plugin' ? getPluginUsageCount(a.data.uid) : a.kind === 'chain' ? (a.data as BrowseChainResult).downloads : 0;
            const bScore = b.kind === 'plugin' ? getPluginUsageCount(b.data.uid) : b.kind === 'chain' ? (b.data as BrowseChainResult).downloads : 0;
            return bScore - aScore;
          }
          case 'name': {
            const aName = a.kind === 'plugin' ? a.data.name : a.data.name;
            const bName = b.kind === 'plugin' ? b.data.name : b.data.name;
            return aName.localeCompare(bName);
          }
        }
      });

    return result;
  }, [plugins, chains, templates, searchQuery, activeTab, categoryFilter, sortMode, authorFilter, getEnrichedDataForPlugin, getPluginUsageCount, getMostRecentPlugins]);

  // ── Reset highlight on filter change ────────────────────
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery, activeTab, categoryFilter, sortMode, authorFilter]);

  // ── Scroll highlighted into view ────────────────────────
  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    const els = listRef.current.querySelectorAll('[data-browser-item]');
    const el = els[highlightedIndex] as HTMLElement;
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightedIndex]);

  // ── Keyboard navigation (via keyboard store) ────────────
  useEffect(() => {
    const registerShortcut = useKeyboardStore.getState().registerShortcut;
    const unsubs = [
      registerShortcut({
        id: 'unified-browser-arrow-down',
        key: 'ArrowDown',
        priority: ShortcutPriority.MODAL,
        allowInInputs: true,
        handler: (e) => {
          e.preventDefault();
          setHighlightedIndex(prev => Math.min(prev + 1, items.length - 1));
        },
      }),
      registerShortcut({
        id: 'unified-browser-arrow-up',
        key: 'ArrowUp',
        priority: ShortcutPriority.MODAL,
        allowInInputs: true,
        handler: (e) => {
          e.preventDefault();
          setHighlightedIndex(prev => Math.max(prev - 1, 0));
        },
      }),
      registerShortcut({
        id: 'unified-browser-enter',
        key: 'Enter',
        priority: ShortcutPriority.MODAL,
        allowInInputs: true,
        handler: (e) => {
          e.preventDefault();
          const item = items[highlightedIndex];
          if (item) handleItemAction(item);
        },
      }),
    ];
    return () => unsubs.forEach(unsub => unsub());
  }, [items, highlightedIndex, handleItemAction]);

  // ── Actions ─────────────────────────────────────────────
  const handleItemAction = useCallback(async (item: UnifiedItem) => {
    switch (item.kind) {
      case 'plugin': {
        const success = await addPlugin(item.data.fileOrIdentifier);
        if (success) {
          const { nodes } = useChainStore.getState();
          const lastNode = nodes[nodes.length - 1];
          if (lastNode) selectNode(lastNode.id);
          onClose();
        }
        break;
      }
      case 'chain': {
        await loadChain(item.data.slug);
        onClose();
        break;
      }
      case 'group': {
        const { loadTemplate } = useGroupTemplateStore.getState();
        await loadTemplate(item.data.path, 0, -1);
        onClose();
        break;
      }
    }
  }, [addPlugin, selectNode, loadChain, onClose]);

  const handleAuthorClick = useCallback((authorName: string) => {
    setAuthorFilter(authorName);
    setActiveTab('chains');
  }, []);

  // ── Sort helpers ────────────────────────────────────────
  const getSortIcon = (mode: SortMode) => {
    switch (mode) {
      case 'recent': return <Clock className="w-3 h-3" />;
      case 'popular': return <TrendingUp className="w-3 h-3" />;
      case 'name': return <span className="text-[10px]">A-Z</span>;
    }
  };
  const getSortLabel = (mode: SortMode) => {
    switch (mode) {
      case 'recent': return 'Recent';
      case 'popular': return 'Popular';
      case 'name': return 'Name';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0a] flex flex-col" style={{ top: 33 }}>
      {/* ── Header ──────────────────────────────────────── */}
      <div className="relative border-b border-white/[0.08] bg-gradient-to-b from-plugin-accent/[0.06] to-transparent">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold tracking-[0.2em] uppercase text-plugin-accent font-mono">
              Browser
            </h2>
            {authorFilter && (
              <button
                onClick={() => setAuthorFilter(null)}
                className="flex items-center gap-1 px-2 py-0.5 bg-plugin-accent/15 border border-plugin-accent/30 rounded text-[10px] text-plugin-accent font-mono"
              >
                @{authorFilter}
                <X className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 hover:bg-plugin-accent/20 rounded transition-colors"
            >
              <X className="w-4 h-4 text-white hover:text-plugin-accent" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-plugin-accent/60 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search plugins, chains, presets..."
              className="w-full bg-black/60 border border-plugin-accent/30 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-plugin-accent focus:ring-2 focus:ring-plugin-accent/20 font-mono transition-all"
              autoFocus
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 pb-2 overflow-x-auto scrollbar-hide">
          <div className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setCategoryFilter('all'); }}
                className={`
                  flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-mono uppercase tracking-wider font-medium
                  transition-all duration-200 border
                  ${activeTab === tab.id
                    ? 'bg-plugin-accent text-black border-plugin-accent'
                    : 'bg-white/[0.03] text-white border-white/[0.06] hover:text-plugin-accent hover:border-white/[0.15]'
                  }
                `}
              >
                <tab.Icon className="w-3 h-3" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category filter pills (only when viewing plugins or all) */}
        {(activeTab === 'all' || activeTab === 'plugins') && (
          <div className="px-4 pb-2 overflow-x-auto scrollbar-hide">
            <div className="flex gap-1">
              {EFFECT_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`
                    flex-shrink-0 px-2 py-1 rounded text-[9px] font-mono uppercase tracking-wider font-medium
                    transition-all duration-200 border
                    ${categoryFilter === cat.id
                      ? 'bg-white/10 text-white border-white/20'
                      : 'bg-transparent text-white border-transparent hover:text-plugin-accent'
                    }
                  `}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sort bar */}
        <div className="px-4 py-1.5 bg-black/40 backdrop-blur-sm border-t border-white/[0.04] flex items-center justify-between">
          <span className="text-[10px] text-white uppercase tracking-widest font-mono">
            {items.length} result{items.length !== 1 ? 's' : ''}
          </span>
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex items-center gap-1.5 px-2 py-1 bg-white/[0.04] hover:bg-plugin-accent/15 border border-white/[0.08] hover:border-plugin-accent/30 rounded text-[10px] uppercase tracking-wider font-mono text-white hover:text-plugin-accent transition-all"
            >
              {getSortIcon(sortMode)}
              <span>{getSortLabel(sortMode)}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showSortMenu && (
              <div className="absolute right-0 top-full mt-1 bg-[#151515] border border-white/10 rounded-lg shadow-xl z-10 min-w-[120px] overflow-hidden">
                {(['recent', 'popular', 'name'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => { setSortMode(mode); setShowSortMenu(false); }}
                    className={`
                      w-full flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wide font-mono transition-colors
                      ${sortMode === mode
                        ? 'bg-plugin-accent/15 text-plugin-accent'
                        : 'text-white hover:text-plugin-accent hover:bg-white/5'
                      }
                    `}
                  >
                    {getSortIcon(mode)}
                    {getSortLabel(mode)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Scrollable list ─────────────────────────────── */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-2">
          {items.map((item, idx) => {
            switch (item.kind) {
              case 'plugin':
                return (
                  <PluginCard
                    key={`p-${item.data.uid}`}
                    plugin={item.data}
                    enrichedData={getEnrichedDataForPlugin(item.data.uid)}
                    usageCount={getPluginUsageCount(item.data.uid)}
                    isHighlighted={idx === highlightedIndex}
                    onAdd={() => handleItemAction(item)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                  />
                );
              case 'chain':
                return (
                  <ChainCard
                    key={`c-${item.data._id}`}
                    chain={item.data}
                    isHighlighted={idx === highlightedIndex}
                    onLoad={() => handleItemAction(item)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onAuthorClick={handleAuthorClick}
                  />
                );
              case 'group':
                return (
                  <GroupPresetCard
                    key={`g-${item.data.path}`}
                    template={item.data}
                    isHighlighted={idx === highlightedIndex}
                    onInsert={() => handleItemAction(item)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                  />
                );
            }
          })}
          {items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Diamond className="w-16 h-16 mb-4 opacity-10 text-white" />
              <div className="text-sm text-white font-mono">No results found</div>
              <div className="text-xs text-white mt-1 font-mono">Try adjusting your search or filters</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer keyboard hints ──────────────────────── */}
      <div className="border-t border-white/[0.06] bg-black/40 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4 text-[9px] text-white/70 uppercase tracking-widest font-mono">
          <span><kbd className="px-1.5 py-0.5 bg-white/5 rounded">Up/Down</kbd> Navigate</span>
          <span><kbd className="px-1.5 py-0.5 bg-white/5 rounded">Enter</kbd> Select</span>
          <span><kbd className="px-1.5 py-0.5 bg-white/5 rounded">Esc</kbd> Close</span>
        </div>
        <span className="text-[9px] text-white/70 uppercase tracking-widest font-mono">ProChain</span>
      </div>
    </div>
  );
}
