import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Search, TrendingUp, Clock, Zap, ChevronDown, Diamond, SlidersHorizontal, Activity, Waves, Timer, Flame, Disc3, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePluginStore } from '../../stores/pluginStore';
import { useChainStore } from '../../stores/chainStore';
import { useUsageStore } from '../../stores/usageStore';
import type { PluginDescription } from '../../api/types';

interface PluginListPanelProps {
  onClose: () => void;
}

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

export function PluginListPanel({ onClose }: PluginListPanelProps) {
  const { plugins, getEnrichedDataForPlugin } = usePluginStore();
  const { addPlugin, selectNode } = useChainStore();
  const { getPluginUsageCount, getMostRecentPlugins } = useUsageStore();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Auto-focus search on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Filter and sort plugins
  const displayPlugins = useMemo(() => {
    let results = [...plugins];

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

    if (selectedCategory !== 'all') {
      results = results.filter(p => {
        const enriched = getEnrichedDataForPlugin(p.uid);
        const category = enriched?.category?.toLowerCase() || p.category?.toLowerCase() || '';
        return category.includes(selectedCategory);
      });
    }

    switch (sortMode) {
      case 'recent': {
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
      }
      case 'popular':
        results.sort((a, b) => getPluginUsageCount(b.uid) - getPluginUsageCount(a.uid));
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

  // Keyboard navigation
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
      onClose();
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

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Search + filters header */}
      <div style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
        <div className="px-4 py-3">
          {/* Search */}
          <div className="relative mb-3">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <Search className="w-4 h-4" style={{ color: 'var(--color-accent-cyan)', opacity: 0.6 }} />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search plugins..."
              className="w-full pl-10 pr-4 py-2 rounded text-sm focus:outline-none transition-all"
              style={{
                background: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border-default)',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>

          {/* Category chips */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {EFFECT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded text-[10px] uppercase tracking-wider font-medium transition-all"
                style={{
                  fontFamily: 'var(--font-mono)',
                  background: selectedCategory === cat.id ? 'rgba(0, 240, 255, 0.15)' : 'transparent',
                  color: selectedCategory === cat.id ? 'var(--color-accent-cyan)' : 'var(--color-text-tertiary)',
                  border: `1px solid ${selectedCategory === cat.id ? 'var(--color-accent-cyan)' : 'var(--color-border-default)'}`,
                }}
              >
                <cat.Icon className="w-3 h-3" />
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sort bar */}
        <div className="px-4 py-1.5 flex items-center justify-between" style={{ background: 'var(--color-bg-tertiary)' }}>
          <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>
            {displayPlugins.length} plugin{displayPlugins.length !== 1 ? 's' : ''}
          </span>
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] uppercase tracking-wider transition-all"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-secondary)',
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border-default)',
              }}
            >
              {getSortIcon(sortMode)}
              <span>{getSortLabel(sortMode)}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showSortMenu && (
              <div className="absolute right-0 top-full mt-1 rounded shadow-xl z-10 min-w-[140px] overflow-hidden" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)' }}>
                {(['recent', 'popular', 'name', 'manufacturer'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => { setSortMode(mode); setShowSortMenu(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wide transition-colors"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: sortMode === mode ? 'var(--color-accent-cyan)' : 'var(--color-text-secondary)',
                      background: sortMode === mode ? 'rgba(0, 240, 255, 0.08)' : 'transparent',
                      borderLeft: sortMode === mode ? '2px solid var(--color-accent-cyan)' : '2px solid transparent',
                    }}
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

      {/* Plugin list */}
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
              <Diamond className="w-12 h-12 mb-3" style={{ color: 'var(--color-text-disabled)' }} />
              <div style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>No plugins found</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>Try adjusting your filters</div>
            </div>
          )}
        </div>
      </div>

      {/* Footer hints */}
      <div className="flex-shrink-0 px-4 py-2 flex items-center justify-between" style={{ borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-secondary)' }}>
        <div className="flex items-center gap-4" style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)' }}>
          <span><kbd className="px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)' }}>↑↓</kbd> Navigate</span>
          <span><kbd className="px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)' }}>Enter</kbd> Add</span>
          <span><kbd className="px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)' }}>Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}

// Plugin card component
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
      className="group relative w-full text-left transition-all duration-150 rounded-lg p-3"
      style={{
        background: isHighlighted ? 'rgba(0, 240, 255, 0.08)' : 'var(--color-bg-tertiary)',
        border: `1px solid ${isHighlighted ? 'var(--color-accent-cyan)' : 'var(--color-border-default)'}`,
        boxShadow: isHighlighted ? '0 0 12px rgba(0, 240, 255, 0.15)' : 'none',
      }}
    >
      <div className="flex items-start gap-3">
        {/* Manufacturer logo */}
        <div
          className="flex-shrink-0 w-10 h-10 rounded flex items-center justify-center overflow-hidden"
          style={{
            background: 'rgba(0,0,0,0.4)',
            border: `1px solid ${isHighlighted ? 'rgba(0,240,255,0.3)' : 'var(--color-border-subtle)'}`,
          }}
        >
          {manufacturerLogo ? (
            <img src={manufacturerLogo} alt={plugin.manufacturer} className="w-full h-full object-contain p-1" />
          ) : (
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>
              {plugin.manufacturer.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <h3 className="text-sm leading-tight truncate" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: isHighlighted ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
              {plugin.name}
            </h3>
            {usageCount > 0 && (
              <div className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--color-accent-cyan)', background: 'rgba(0,240,255,0.1)', border: '1px solid rgba(0,240,255,0.2)' }}>
                <Zap className="w-2.5 h-2.5" />
                {usageCount}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2" style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
            <span className="truncate">{plugin.manufacturer}</span>
            {category && (
              <>
                <span style={{ opacity: 0.3 }}>·</span>
                <span className="truncate capitalize">{category}</span>
              </>
            )}
            <span style={{ opacity: 0.3 }}>·</span>
            <span className="uppercase" style={{ opacity: 0.6 }}>{plugin.format}</span>
          </div>
        </div>

        {/* Add indicator */}
        {isHighlighted && (
          <div className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full" style={{ background: 'var(--color-accent-cyan)', color: '#000' }}>
            <span className="text-xs font-bold">+</span>
          </div>
        )}
      </div>
    </button>
  );
}
