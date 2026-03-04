import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, Grid3x3, X, FolderOpen, Globe, Layers } from 'lucide-react';
import { usePluginStore } from '../../stores/pluginStore';
import { useUsageStore } from '../../stores/usageStore';
import { useChainStore } from '../../stores/chainStore';
import { usePresetStore } from '../../stores/presetStore';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { useGroupTemplateStore } from '../../stores/groupTemplateStore';
import type { PluginDescription, PresetInfo, BrowseChainResult, ChainNodeUI } from '../../api/types';
import { getCategoryColor } from '../../constants/categoryColors';
import { PluginSuggestions } from './PluginSuggestions';

interface InlinePluginSearchProps {
  parentId?: number;
  insertIndex?: number;
  onPluginAdded?: () => void;
  onOpenFullBrowser?: () => void;
  onClose?: () => void;
}

/**
 * Compact inline search box for rapid plugin adding.
 * Appears when clicking "+ Add plugin" buttons.
 */
export function InlinePluginSearch({
  parentId = 0,
  insertIndex = -1,
  onPluginAdded,
  onOpenFullBrowser,
  onClose,
}: InlinePluginSearchProps) {
  const allPlugins = usePluginStore((s) => s.plugins);
  const hiddenPlugins = usePluginStore((s) => s.hiddenPlugins);
  const getEnrichedDataForPlugin = usePluginStore((s) => s.getEnrichedDataForPlugin);
  const getManufacturerLogoUrl = usePluginStore((s) => s.getManufacturerLogoUrl);
  const plugins = useMemo(() => allPlugins.filter((p) => !hiddenPlugins.has(p.fileOrIdentifier)), [allPlugins, hiddenPlugins]);
  const { getPluginUsageCount } = useUsageStore();
  const { addPlugin, addPluginToGroup, selectNode, setChainName } = useChainStore();
  const { presets, loadPreset } = usePresetStore();
  const { chains: cloudChains, browseChainsPaginated } = useCloudChainStore();
  const { templates, fetchTemplates } = useGroupTemplateStore();

  const nodes = useChainStore((s) => s.nodes);

  // Find the preceding plugin for pairing suggestions
  const precedingPlugin = useMemo(() => {
    // Find the list of children to look in
    let siblings: ChainNodeUI[] = nodes;
    if (parentId !== 0) {
      const findGroup = (ns: ChainNodeUI[]): ChainNodeUI[] | null => {
        for (const n of ns) {
          if (n.type === 'group' && n.id === parentId) return n.children;
          if (n.type === 'group') {
            const found = findGroup(n.children);
            if (found) return found;
          }
        }
        return null;
      };
      siblings = findGroup(nodes) || nodes;
    }

    // insertIndex tells us where the new plugin goes; look at the plugin right before it
    const idx = insertIndex === -1 ? siblings.length - 1 : insertIndex - 1;
    if (idx < 0) return null;

    // Walk backwards to find a plugin node
    for (let i = idx; i >= 0; i--) {
      const node = siblings[i];
      if (node && node.type === 'plugin') {
        return { name: node.name, manufacturer: node.manufacturer };
      }
    }
    return null;
  }, [nodes, parentId, insertIndex]);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [typeFilter, setTypeFilter] = useState<'all' | 'effects' | 'instruments'>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // P3-1: Debounce the search query to avoid scoring on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(timer);
  }, [query]);

  // Search with relevance scoring across all enriched fields
  const searchResults = useMemo(() => {
    // Apply type pre-filter
    const pool = typeFilter === 'all' ? plugins : plugins.filter(p =>
      typeFilter === 'instruments' ? p.isInstrument : !p.isInstrument
    );

    if (!debouncedQuery.trim()) {
      // No query — show ALL plugins sorted by usage then alphabetical
      return [...pool].sort((a, b) => {
        const diff = getPluginUsageCount(b.uid) - getPluginUsageCount(a.uid);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      });
    }

    const q = debouncedQuery.toLowerCase();

    const scored = pool.map(plugin => {
      const enriched = getEnrichedDataForPlugin(plugin.uid);
      let score = 0;
      const name = plugin.name.toLowerCase();
      const manufacturer = plugin.manufacturer.toLowerCase();
      const category = (enriched?.category || plugin.category || '').toLowerCase();
      const effectType = (enriched?.effectType || '').toLowerCase();
      const tags = (enriched?.tags ?? []).map((t: string) => t.toLowerCase());
      const shortDesc = (enriched?.shortDescription || '').toLowerCase();

      // Name
      if (name === q) score += 1000;
      else if (name.startsWith(q)) score += 500;
      else if (name.includes(q)) score += 200;

      // Manufacturer
      if (manufacturer === q) score += 300;
      else if (manufacturer.startsWith(q)) score += 150;
      else if (manufacturer.includes(q)) score += 50;

      // Category
      if (category.includes(q)) score += 100;

      // Effect type — lets "delay" find delay plugins by type even if name differs
      if (effectType === q) score += 200;
      else if (effectType.includes(q)) score += 150;

      // Tags
      if (tags.includes(q)) score += 80;
      else if (tags.some((t: string) => t.includes(q))) score += 50;

      // Short description
      if (shortDesc.includes(q)) score += 30;

      // Acronym fuzzy
      const acronym = name.split(/\s+/).map((w: string) => w[0]).join('').toLowerCase();
      if (acronym.includes(q)) score += 75;

      // Usage boost
      score += getPluginUsageCount(plugin.uid) * 10;

      return { plugin, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(s => s.plugin);
  }, [debouncedQuery, plugins, typeFilter, getEnrichedDataForPlugin, getPluginUsageCount]);

  // Chain search results
  const chainResults = useMemo(() => {
    if (!query.trim() || query.trim().length < 2) return [];
    const q = query.toLowerCase();
    return presets
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 3);
  }, [query, presets]);

  // Cloud chain search — debounce browse query
  const cloudSearchTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) return;
    clearTimeout(cloudSearchTimer.current);
    cloudSearchTimer.current = setTimeout(() => {
      browseChainsPaginated({ search: query.trim(), limit: 3, offset: 0 });
    }, 300);
    return () => clearTimeout(cloudSearchTimer.current);
  }, [query, browseChainsPaginated]);

  const cloudChainResults = useMemo(() => {
    if (!query.trim() || query.trim().length < 2) return [];
    return (cloudChains as BrowseChainResult[]).slice(0, 3);
  }, [query, cloudChains]);

  // Group template results
  useEffect(() => {
    if (templates.length === 0) fetchTemplates();
  }, [templates.length, fetchTemplates]);

  const templateResults = useMemo(() => {
    if (!query.trim() || query.trim().length < 2) return [];
    const q = query.toLowerCase();
    return templates
      .filter((t) => t.name.toLowerCase().includes(q))
      .slice(0, 3);
  }, [query, templates]);

  const handleBrowseAllChains = useCallback(() => {
    window.dispatchEvent(new CustomEvent('open-chain-browser', { detail: { tab: 'browse' } }));
  }, []);

  const handleLoadChain = useCallback(async (preset: PresetInfo) => {
    const success = await loadPreset(preset.path);
    if (success) {
      setChainName(preset.name);
      onPluginAdded?.();
      onClose?.();
    }
  }, [loadPreset, setChainName, onPluginAdded, onClose]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchResults.length, query]);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Click outside to close (only if onClose is provided)
  useEffect(() => {
    if (!onClose) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose?.();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && searchResults[highlightedIndex]) {
      e.preventDefault();
      handleAddPlugin(searchResults[highlightedIndex]);
    } else if (e.key === 'Escape' && onClose) {
      e.preventDefault();
      onClose();
    }
  }, [searchResults, highlightedIndex, onClose]);

  const handleAddPlugin = useCallback(async (plugin: PluginDescription) => {
    let success = false;

    if (parentId !== 0 && insertIndex !== -1) {
      // Add to group at specific index
      success = await addPluginToGroup(plugin.fileOrIdentifier, parentId, insertIndex);
    } else {
      // Add to root
      success = await addPlugin(plugin.fileOrIdentifier, insertIndex);
    }

    if (success) {
      const { nodes: newNodes } = useChainStore.getState();
      const lastNode = newNodes[newNodes.length - 1];
      if (lastNode) {
        selectNode(lastNode.id);
      }
      onPluginAdded?.();
      onClose?.();
    }
  }, [addPlugin, addPluginToGroup, parentId, insertIndex, selectNode, onPluginAdded, onClose]);

  const handleSuggestionSelect = useCallback((pluginName: string, manufacturer: string) => {
    const match = plugins.find(
      (p) => p.name.toLowerCase() === pluginName.toLowerCase() &&
             p.manufacturer.toLowerCase() === manufacturer.toLowerCase()
    );
    if (match) handleAddPlugin(match);
  }, [plugins, handleAddPlugin]);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden slide-in"
      style={{
        background: 'linear-gradient(135deg, rgba(20,20,20,0.85) 0%, rgba(10,10,10,0.9) 50%, rgba(20,20,20,0.85) 100%)',
        border: '1px solid rgba(222, 255, 10, 0.3)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-elevated), 0 0 20px rgba(222, 255, 10, 0.15)',
        backdropFilter: 'blur(20px) saturate(150%)',
        WebkitBackdropFilter: 'blur(20px) saturate(150%)',
      }}
    >
      {/* Search input */}
      <div
        style={{
          borderBottom: '1px solid var(--color-border-default)',
          background: 'rgba(222, 255, 10, 0.03)',
        }}
      >
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <Search className="w-4 h-4" style={{ color: 'rgba(222, 255, 10, 0.6)' }} />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Name, manufacturer, type (e.g. 'delay')..."
            className="w-full bg-transparent pl-10 pr-20 py-2.5 focus:outline-none"
            style={{
              fontSize: 'var(--text-title)',
              color: 'var(--color-text-primary)',
            }}
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              onClick={onOpenFullBrowser}
              className="p-1.5 rounded fast-snap"
              style={{ color: 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-cyan)'; e.currentTarget.style.background = 'rgba(222, 255, 10, 0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; e.currentTarget.style.background = 'transparent'; }}
              title="Open full browser"
            >
              <Grid3x3 className="w-3.5 h-3.5" />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded fast-snap"
                style={{ color: 'var(--color-text-tertiary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-status-error)'; e.currentTarget.style.background = 'rgba(255, 0, 51, 0.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; e.currentTarget.style.background = 'transparent'; }}
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Type filter pills */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5"
        style={{ borderBottom: '1px solid var(--color-border-default)', background: 'rgba(0,0,0,0.15)' }}
      >
        {(['all', 'effects', 'instruments'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-body)',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wide)',
              border: '1px solid',
              borderColor: typeFilter === t ? 'rgba(222, 255, 10, 0.4)' : 'var(--color-border-default)',
              background: typeFilter === t ? 'rgba(222, 255, 10, 0.12)' : 'transparent',
              color: typeFilter === t ? 'var(--color-accent-cyan)' : 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
          >
            {t === 'all' ? 'All' : t === 'effects' ? 'FX' : 'Instr'}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 'var(--text-body)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          {searchResults.length}
        </span>
      </div>

      {/* Plugin pairing suggestions */}
      {precedingPlugin && !query.trim() && (
        <PluginSuggestions
          currentPluginName={precedingPlugin.name}
          currentManufacturer={precedingPlugin.manufacturer}
          onSelect={handleSuggestionSelect}
        />
      )}

      {/* Results */}
      {searchResults.length > 0 ? (
        <div className="max-h-[280px] overflow-y-auto scrollbar-cyber">
          {searchResults.map((plugin, idx) => (
            <button
              key={plugin.uid}
              onClick={() => handleAddPlugin(plugin)}
              onMouseEnter={() => setHighlightedIndex(idx)}
              className="w-full text-left px-3 py-2 fast-snap flex items-center gap-2.5"
              style={{
                borderLeft: '2px solid',
                borderLeftColor: idx === highlightedIndex ? 'var(--color-accent-cyan)' : 'transparent',
                background: idx === highlightedIndex ? 'rgba(222, 255, 10, 0.08)' : 'transparent',
              }}
            >
              {/* Logo */}
              <InlineSearchLogo
                plugin={plugin}
                isHighlighted={idx === highlightedIndex}
                getEnrichedDataForPlugin={getEnrichedDataForPlugin}
                getManufacturerLogoUrl={getManufacturerLogoUrl}
              />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <h4
                    className="truncate"
                    style={{
                      fontSize: 'var(--text-title)',
                      fontWeight: 700,
                      letterSpacing: 'var(--tracking-wide)',
                      color: idx === highlightedIndex ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {plugin.name}
                  </h4>
                  {getPluginUsageCount(plugin.uid) > 0 && (
                    <div
                      className="flex-shrink-0 px-1 py-0.5 rounded"
                      style={{
                        background: 'rgba(222, 255, 10, 0.15)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-body)',
                        color: 'var(--color-accent-cyan)',
                      }}
                    >
                      {getPluginUsageCount(plugin.uid)}x
                    </div>
                  )}
                </div>
                <div
                  className="flex items-center gap-1 truncate"
                  style={{
                    fontSize: 'var(--text-body)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <span className="truncate">{plugin.manufacturer}</span>
                  {(() => {
                    const cat = getEnrichedDataForPlugin(plugin.uid)?.category || plugin.category;
                    return cat ? (
                      <>
                        <span style={{ opacity: 0.3 }}>·</span>
                        <span className="truncate capitalize" style={{ color: getCategoryColor(cat) }}>{cat}</span>
                      </>
                    ) : null;
                  })()}
                </div>
              </div>

              {/* Add indicator */}
              {idx === highlightedIndex && (
                <div
                  className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center"
                  style={{
                    background: 'var(--color-accent-cyan)',
                    color: 'var(--color-bg-primary)',
                    fontSize: 'var(--text-title)',
                    fontWeight: 700,
                  }}
                >
                  +
                </div>
              )}
            </button>
          ))}
        </div>
      ) : query ? (
        <div className="px-4 py-8 text-center" style={{ fontSize: 'var(--text-title)', color: 'var(--color-text-secondary)' }}>
          No plugins found
        </div>
      ) : (
        <div className="px-4 py-6 text-center" style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-secondary)' }}>
          No plugins installed
        </div>
      )}

      {/* Chain results */}
      {chainResults.length > 0 && (
        <div style={{ borderTop: '1px solid var(--color-border-default)' }}>
          <div
            className="px-3 py-1 flex items-center gap-1.5"
            style={{
              background: 'rgba(222, 255, 10, 0.03)',
              fontSize: 'var(--text-body)',
              letterSpacing: 'var(--tracking-wide)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <FolderOpen className="w-3 h-3" /> Load a Chain
          </div>
          {chainResults.map((preset) => (
            <button
              key={preset.path}
              onClick={() => handleLoadChain(preset)}
              className="w-full text-left px-3 py-1.5 fast-snap flex items-center gap-2"
              style={{ borderLeft: '2px solid transparent' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderLeftColor = 'var(--color-serial)';
                e.currentTarget.style.background = 'rgba(201, 148, 74, 0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderLeftColor = 'transparent';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-serial)' }} />
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {preset.name}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Cloud chain results */}
      {cloudChainResults.length > 0 && (
        <div style={{ borderTop: '1px solid var(--color-border-default)' }}>
          <div
            className="px-3 py-1 flex items-center gap-1.5"
            style={{
              background: 'rgba(222, 255, 10, 0.03)',
              fontSize: 'var(--text-body)',
              letterSpacing: 'var(--tracking-wide)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <Globe className="w-3 h-3" /> Community Chains
          </div>
          {cloudChainResults.map((chain) => (
            <button
              key={chain._id}
              onClick={handleBrowseAllChains}
              className="w-full text-left px-3 py-1.5 fast-snap flex items-center gap-2"
              style={{ borderLeft: '2px solid transparent' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderLeftColor = 'var(--color-accent-cyan)';
                e.currentTarget.style.background = 'rgba(222, 255, 10, 0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderLeftColor = 'transparent';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <Globe className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-accent-cyan)' }} />
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {chain.name}
                </div>
                <div style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-tertiary)' }}>
                  {chain.pluginCount}p{chain.author?.name ? ` · @${chain.author.name}` : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Group template results */}
      {templateResults.length > 0 && (
        <div style={{ borderTop: '1px solid var(--color-border-default)' }}>
          <div
            className="px-3 py-1 flex items-center gap-1.5"
            style={{
              background: 'rgba(222, 255, 10, 0.03)',
              fontSize: 'var(--text-body)',
              letterSpacing: 'var(--tracking-wide)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <Layers className="w-3 h-3" /> Load a Group
          </div>
          {templateResults.map((tmpl) => (
            <button
              key={tmpl.path}
              onClick={handleBrowseAllChains}
              className="w-full text-left px-3 py-1.5 fast-snap flex items-center gap-2"
              style={{ borderLeft: '2px solid transparent' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderLeftColor = 'var(--color-parallel)';
                e.currentTarget.style.background = 'rgba(90, 120, 66, 0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderLeftColor = 'transparent';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <Layers className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-parallel)' }} />
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tmpl.name}
                </div>
                <div style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-tertiary)', textTransform: 'capitalize' }}>
                  {tmpl.mode} · {tmpl.pluginCount}p
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Browse all chains button */}
      {query.trim().length >= 2 && (
        <button
          onClick={handleBrowseAllChains}
          className="w-full text-left px-3 py-1.5 fast-snap flex items-center gap-2"
          style={{
            borderTop: '1px solid var(--color-border-default)',
            borderLeft: '2px solid transparent',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderLeftColor = 'var(--color-accent-cyan)';
            e.currentTarget.style.background = 'rgba(222, 255, 10, 0.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderLeftColor = 'transparent';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <Globe className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-accent-cyan)' }} />
          <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--color-accent-cyan)' }}>
            Browse All Chains
          </span>
        </button>
      )}

      {/* Footer */}
      <div
        className="px-3 py-1.5 flex items-center justify-between"
        style={{
          background: 'var(--color-bg-primary)',
          borderTop: '1px solid var(--color-border-default)',
          fontSize: 'var(--text-body)',
          letterSpacing: 'var(--tracking-wide)',
          color: 'var(--color-text-secondary)',
        }}
      >
        <span><kbd style={{ padding: '1px 4px', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-default)' }}>Up/Down</kbd> Nav</span>
        <span><kbd style={{ padding: '1px 4px', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-default)' }}>Enter</kbd> Add</span>
        {onClose && <span><kbd style={{ padding: '1px 4px', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-default)' }}>Esc</kbd> Close</span>}
      </div>
    </div>
  );
}

function InlineSearchLogo({
  plugin,
  isHighlighted,
  getEnrichedDataForPlugin,
  getManufacturerLogoUrl,
}: {
  plugin: PluginDescription;
  isHighlighted: boolean;
  getEnrichedDataForPlugin: (uid: number) => any;
  getManufacturerLogoUrl: (name: string) => string | undefined;
}) {
  const [logoError, setLogoError] = useState(false);
  const enriched = getEnrichedDataForPlugin(plugin.uid);
  const logoUrl = !logoError
    ? (enriched?.manufacturerData?.resolvedLogoUrl ??
       enriched?.manufacturerData?.logoUrl ??
       getManufacturerLogoUrl(plugin.manufacturer))
    : undefined;

  return (
    <div
      className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center overflow-hidden"
      style={{
        background: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid',
        borderColor: isHighlighted ? 'rgba(222, 255, 10, 0.5)' : 'var(--color-border-default)',
      }}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={plugin.manufacturer}
          className="w-full h-full object-contain p-1"
          onError={() => setLogoError(true)}
        />
      ) : (
        <span
          style={{
            fontSize: 'var(--text-body)',
            fontWeight: 700,
            color: isHighlighted ? 'var(--color-accent-cyan)' : 'var(--color-text-tertiary)',
          }}
        >
          {plugin.manufacturer.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}
