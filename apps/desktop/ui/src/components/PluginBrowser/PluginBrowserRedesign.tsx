import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Search, TrendingUp, Clock, Zap, X, ChevronDown, Diamond, SlidersHorizontal, Activity, Waves, Timer, Flame, Disc3, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePluginStore } from '../../stores/pluginStore';
import { useChainStore } from '../../stores/chainStore';
import { useUsageStore } from '../../stores/usageStore';
import { useKeyboardStore, ShortcutPriority } from '../../stores/keyboardStore';
import type { PluginDescription } from '../../api/types';

interface PluginBrowserProps {
  collapsed?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
}

// Effect categories for filtering
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

type SortMode = 'recent' | 'popular' | 'name' | 'manufacturer';

export function PluginBrowserRedesign({ collapsed = false, onClose }: PluginBrowserProps) {
  const {
    plugins,
    getEnrichedDataForPlugin,
  } = usePluginStore();

  const { addPlugin, selectNode, nodes } = useChainStore();
  const { getPluginUsageCount, getMostRecentPlugins } = useUsageStore();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Filter and sort plugins
  const displayPlugins = useMemo(() => {
    let results = [...plugins];

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      results = results.filter(p => {
        if (p.name.toLowerCase().includes(q)) return true;
        if (p.manufacturer.toLowerCase().includes(q)) return true;
        if (p.category.toLowerCase().includes(q)) return true;
        const enriched = getEnrichedDataForPlugin(p.uid);
        if (enriched?.category?.toLowerCase().includes(q)) return true;
        return false;
      });
    }

    // Category filter
    if (selectedCategory !== 'all') {
      results = results.filter(p => {
        const enriched = getEnrichedDataForPlugin(p.uid);
        const category = enriched?.category?.toLowerCase() || p.category?.toLowerCase() || '';
        return category.includes(selectedCategory);
      });
    }

    // Sort
    switch (sortMode) {
      case 'recent':
        const recent = getMostRecentPlugins();
        results.sort((a, b) => {
          const aIdx = recent.findIndex(r => r.uid === a.uid);
          const bIdx = recent.findIndex(r => r.uid === b.uid);
          if (aIdx === -1 && bIdx === -1) return 0;
          if (aIdx === -1) return 1;
          if (bIdx === -1) return -1;
          return aIdx - bIdx;
        });
        break;
      case 'popular':
        results.sort((a, b) => {
          const aCount = getPluginUsageCount(a.uid);
          const bCount = getPluginUsageCount(b.uid);
          return bCount - aCount;
        });
        break;
      case 'name':
        results.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'manufacturer':
        results.sort((a, b) => a.manufacturer.localeCompare(b.manufacturer));
        break;
    }

    return results;
  }, [plugins, searchQuery, selectedCategory, sortMode, getEnrichedDataForPlugin, getMostRecentPlugins, getPluginUsageCount]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [displayPlugins.length, searchQuery, selectedCategory]);

  // Keyboard navigation (ArrowDown, ArrowUp, Enter)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.min(prev + 1, displayPlugins.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && displayPlugins[highlightedIndex]) {
      e.preventDefault();
      handleAddPlugin(displayPlugins[highlightedIndex]);
    }
  }, [displayPlugins, highlightedIndex]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Escape closes (modal priority)
  useEffect(() => {
    const registerShortcut = useKeyboardStore.getState().registerShortcut;
    return registerShortcut({
      id: 'plugin-browser-redesign-escape',
      key: 'Escape',
      priority: ShortcutPriority.MODAL,
      allowInInputs: true, // Allow Escape even when typing in search
      handler: (e) => {
        e.preventDefault();
        onClose?.();
      }
    });
  }, [onClose]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-plugin-item]');
    const item = items[highlightedIndex] as HTMLElement;
    item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightedIndex]);

  const handleAddPlugin = useCallback(async (plugin: PluginDescription) => {
    const success = await addPlugin(plugin.fileOrIdentifier);
    if (success) {
      const { nodes: newNodes } = useChainStore.getState();
      const lastNode = newNodes[newNodes.length - 1];
      if (lastNode) {
        selectNode(lastNode.id);
      }
      onClose?.();
    }
  }, [addPlugin, selectNode, onClose]);

  const getSortIcon = (mode: SortMode) => {
    switch (mode) {
      case 'recent': return <Clock className="w-3 h-3" />;
      case 'popular': return <TrendingUp className="w-3 h-3" />;
      case 'name': return <span className="text-[10px]">A→Z</span>;
      case 'manufacturer': return <Zap className="w-3 h-3" />;
    }
  };

  const getSortLabel = (mode: SortMode) => {
    switch (mode) {
      case 'recent': return 'Recent';
      case 'popular': return 'Popular';
      case 'name': return 'Name';
      case 'manufacturer': return 'Manufacturer';
    }
  };

  if (collapsed) return null;

  return (
    <div className="fixed inset-0 z-50 bg-plugin-bg flex flex-col">{/* Full screen overlay */}
      {/* Header with dramatic gradient bar */}
      <div className="relative border-b border-plugin-border-bright/30 bg-gradient-to-b from-plugin-accent/10 to-transparent">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold tracking-[0.2em] uppercase text-plugin-accent font-sans">
              Plugin Rack
            </h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-plugin-accent/20 rounded transition-colors"
            >
              <X className="w-4 h-4 text-plugin-muted hover:text-plugin-accent" />
            </button>
          </div>

          {/* Search with industrial styling */}
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <Search className="w-4 h-4 text-plugin-accent/60" />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search plugins..."
              className="w-full bg-black/60 border border-plugin-accent/30 rounded pl-10 pr-4 py-2.5 text-sm text-plugin-text placeholder:text-plugin-dim focus:outline-none focus:border-plugin-accent focus:ring-2 focus:ring-plugin-accent/20 font-sans transition-all"
              autoFocus
            />
          </div>
        </div>

        {/* Category pills with tactile design */}
        <div className="px-4 pb-3 overflow-x-auto scrollbar-hide">
          <div className="flex gap-1.5">
            {EFFECT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`
                  flex-shrink-0 px-3 py-1.5 rounded text-[11px] font-sans uppercase tracking-wider font-medium
                  transition-all duration-200 border
                  ${selectedCategory === cat.id
                    ? 'bg-plugin-accent text-black border-plugin-accent shadow-[0_0_12px_rgba(255,255,255,0.4)]'
                    : 'bg-plugin-surface/50 text-plugin-muted border-plugin-border hover:text-plugin-text hover:border-plugin-accent/50'
                  }
                `}
              >
                <cat.Icon className="w-3 h-3 mr-1.5 opacity-70" />
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sort bar with metric-inspired design */}
        <div className="px-4 py-2 bg-plugin-bg/80 backdrop-blur-sm border-t border-plugin-border/30 flex items-center justify-between">
          <div className="text-[10px] text-plugin-dim uppercase tracking-widest font-sans">
            {displayPlugins.length} plugin{displayPlugins.length !== 1 ? 's' : ''}
          </div>
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-plugin-border/30 hover:bg-plugin-accent/20 border border-plugin-border hover:border-plugin-accent/50 rounded text-[10px] uppercase tracking-wider font-sans text-plugin-muted hover:text-plugin-text transition-all"
            >
              {getSortIcon(sortMode)}
              <span>{getSortLabel(sortMode)}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showSortMenu && (
              <div className="absolute right-0 top-full mt-1 bg-plugin-surface border border-plugin-border rounded shadow-xl z-10 min-w-[140px] overflow-hidden">
                {(['recent', 'popular', 'name', 'manufacturer'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setSortMode(mode);
                      setShowSortMenu(false);
                    }}
                    className={`
                      w-full flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wide font-sans
                      transition-colors
                      ${sortMode === mode
                        ? 'bg-plugin-accent/20 text-plugin-accent border-l-2 border-plugin-accent'
                        : 'text-plugin-muted hover:text-plugin-text hover:bg-plugin-border/30'
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

      {/* Plugin grid with card-based design */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3">
        <div className="grid grid-cols-1 gap-2">
          {displayPlugins.map((plugin, idx) => (
            <PluginCard
              key={plugin.uid}
              plugin={plugin}
              isHighlighted={idx === highlightedIndex}
              usageCount={getPluginUsageCount(plugin.uid)}
              enrichedData={getEnrichedDataForPlugin(plugin.uid)}
              onClick={() => handleAddPlugin(plugin)}
              onMouseEnter={() => setHighlightedIndex(idx)}
            />
          ))}
          {displayPlugins.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Diamond className="w-16 h-16 mb-4 opacity-10" />
              <div className="text-sm text-plugin-muted font-sans">No plugins found</div>
              <div className="text-xs text-plugin-dim mt-1">Try adjusting your filters</div>
            </div>
          )}
        </div>
      </div>

      {/* Footer with keyboard hints */}
      <div className="border-t border-plugin-border/30 bg-plugin-surface/50 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4 text-[9px] text-plugin-dim uppercase tracking-widest font-sans">
          <span><kbd className="px-1.5 py-0.5 bg-plugin-border/50 rounded">↑↓</kbd> Navigate</span>
          <span><kbd className="px-1.5 py-0.5 bg-plugin-border/50 rounded">Enter</kbd> Add</span>
          <span><kbd className="px-1.5 py-0.5 bg-plugin-border/50 rounded">Esc</kbd> Close</span>
        </div>
        <div className="text-[9px] text-plugin-dim uppercase tracking-widest font-sans">
          ProChain v1.0
        </div>
      </div>
    </div>
  );
}

// Individual plugin card with manufacturer logo and stats
interface PluginCardProps {
  plugin: PluginDescription;
  isHighlighted: boolean;
  usageCount: number;
  enrichedData: any;
  onClick: () => void;
  onMouseEnter: () => void;
}

function PluginCard({ plugin, isHighlighted, usageCount, enrichedData, onClick, onMouseEnter }: PluginCardProps) {
  const manufacturerLogo = enrichedData?.manufacturerLogoUrl;
  const category = enrichedData?.category || plugin.category;

  return (
    <button
      data-plugin-item
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`
        group relative w-full text-left
        transition-all duration-150
        ${isHighlighted
          ? 'bg-gradient-to-r from-plugin-accent/20 to-plugin-accent/10 border-plugin-accent shadow-[0_0_16px_rgba(255,255,255,0.3)] scale-[1.01]'
          : 'bg-plugin-surface/40 border-plugin-border hover:border-plugin-accent/50 hover:bg-plugin-surface/60'
        }
        border rounded-lg p-3
      `}
    >
      <div className="flex items-start gap-3">
        {/* Manufacturer logo or icon */}
        <div className={`
          flex-shrink-0 w-12 h-12 rounded bg-black/40 border flex items-center justify-center overflow-hidden
          ${isHighlighted ? 'border-plugin-accent/50' : 'border-plugin-border/50'}
        `}>
          {manufacturerLogo ? (
            <img
              src={manufacturerLogo}
              alt={plugin.manufacturer}
              className="w-full h-full object-contain p-1.5"
            />
          ) : (
            <div className="text-xl font-bold text-plugin-accent/40 font-sans">
              {plugin.manufacturer.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        {/* Plugin info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className={`
              font-sans font-medium text-sm leading-tight truncate
              ${isHighlighted ? 'text-plugin-text' : 'text-plugin-text/90'}
            `}>
              {plugin.name}
            </h3>
            {usageCount > 0 && (
              <div className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 bg-plugin-accent/15 border border-plugin-accent/30 rounded text-[9px] text-plugin-accent font-sans">
                <Zap className="w-2.5 h-2.5" />
                {usageCount}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-[10px] text-plugin-dim font-sans">
            <span className="truncate">{plugin.manufacturer}</span>
            {category && (
              <>
                <span className="opacity-30">•</span>
                <span className="truncate capitalize">{category}</span>
              </>
            )}
            <span className="opacity-30">•</span>
            <span className="uppercase opacity-60">{plugin.format}</span>
          </div>
        </div>

        {/* Add indicator */}
        {isHighlighted && (
          <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 bg-plugin-accent rounded-full text-black animate-pulse-soft">
            <span className="text-xs font-bold">+</span>
          </div>
        )}
      </div>

      {/* Hover glow effect */}
      <div className={`
        absolute inset-0 rounded-lg pointer-events-none
        transition-opacity duration-300
        ${isHighlighted ? 'opacity-100' : 'opacity-0'}
        bg-gradient-to-r from-transparent via-plugin-accent/5 to-transparent
      `} />
    </button>
  );
}
