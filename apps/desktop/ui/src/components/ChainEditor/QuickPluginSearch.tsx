import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, Grid3x3, Sparkles, TrendingUp, FolderOpen, Globe, Layers } from 'lucide-react';
import { usePluginStore } from '../../stores/pluginStore';
import { useUsageStore } from '../../stores/usageStore';
import { useChainStore } from '../../stores/chainStore';
import { usePresetStore } from '../../stores/presetStore';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { useGroupTemplateStore } from '../../stores/groupTemplateStore';
import type { PluginDescription, PresetInfo, BrowseChainResult, GroupTemplateInfo } from '../../api/types';
import { OtherInstancesList } from './OtherInstancesList';

interface QuickPluginSearchProps {
  onPluginAdded?: () => void;
  onOpenFullBrowser?: () => void;
}

/**
 * Quick search-first interface for adding plugins.
 * Shows as the initial empty state with semantic search and keyboard navigation.
 */
export function QuickPluginSearch({ onPluginAdded, onOpenFullBrowser }: QuickPluginSearchProps) {
  const { plugins, getEnrichedDataForPlugin } = usePluginStore();
  const { getPluginUsageCount, getMostRecentPlugins } = useUsageStore();
  const { addPlugin, selectNode } = useChainStore();
  const { presets, loadPreset } = usePresetStore();
  const { setChainName } = useChainStore();
  const { chains: cloudChains, browseChainsPaginated } = useCloudChainStore();
  const { templates, fetchTemplates } = useGroupTemplateStore();

  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Semantic search with relevance scoring
  const searchResults = useMemo(() => {
    if (!query.trim()) {
      // No query - show most recent
      const recent = getMostRecentPlugins().slice(0, 8);
      return recent.map(r =>
        plugins.find(p => p.uid === r.uid)
      ).filter(Boolean) as PluginDescription[];
    }

    const q = query.toLowerCase();

    // Score each plugin
    const scored = plugins.map(plugin => {
      let score = 0;
      const name = plugin.name.toLowerCase();
      const manufacturer = plugin.manufacturer.toLowerCase();
      const category = (getEnrichedDataForPlugin(plugin.uid)?.category || plugin.category || '').toLowerCase();

      // Exact name match (highest priority)
      if (name === q) score += 1000;
      // Name starts with query
      else if (name.startsWith(q)) score += 500;
      // Name contains query
      else if (name.includes(q)) score += 200;

      // Manufacturer match
      if (manufacturer === q) score += 300;
      else if (manufacturer.startsWith(q)) score += 150;
      else if (manufacturer.includes(q)) score += 50;

      // Category match
      if (category.includes(q)) score += 100;

      // Boost by usage
      const usage = getPluginUsageCount(plugin.uid);
      score += usage * 10;

      // Fuzzy matching bonus for common abbreviations
      const acronym = name.split(/\s+/).map(w => w[0]).join('').toLowerCase();
      if (acronym.includes(q)) score += 75;

      return { plugin, score };
    });

    // Filter and sort by score
    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(s => s.plugin);
  }, [query, plugins, getEnrichedDataForPlugin, getPluginUsageCount, getMostRecentPlugins]);

  // Chain search results (only when query matches chain names)
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
      setQuery('');
      setShowResults(false);
      onPluginAdded?.();
    }
  }, [loadPreset, setChainName, onPluginAdded]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchResults.length, query]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex < 0 || !resultsRef.current) return;
    const items = resultsRef.current.querySelectorAll('[data-result-item]');
    const item = items[highlightedIndex] as HTMLElement;
    item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightedIndex]);

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
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setQuery('');
      setShowResults(false);
    }
  }, [searchResults, highlightedIndex]);

  const handleAddPlugin = useCallback(async (plugin: PluginDescription) => {
    const success = await addPlugin(plugin.fileOrIdentifier);
    if (success) {
      const { nodes: newNodes } = useChainStore.getState();
      const lastNode = newNodes[newNodes.length - 1];
      if (lastNode) {
        selectNode(lastNode.id);
      }
      setQuery('');
      setShowResults(false);
      onPluginAdded?.();
    }
  }, [addPlugin, selectNode, onPluginAdded]);

  const handleFocus = useCallback(() => {
    setShowResults(true);
  }, []);

  const handleBlur = useCallback((e: React.FocusEvent) => {
    // Check if focus moved to results list, if not close results
    const relatedTarget = e.relatedTarget as Node;
    if (!resultsRef.current?.contains(relatedTarget)) {
      setShowResults(false);
    }
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-8 px-4">
      {/* Hero search box */}
      <div className="w-full max-w-xl">
        {/* Animated icon */}
        <div className="flex items-center justify-center mb-6">
          <div className="relative">
            <div
              className="absolute inset-0 rounded-full blur-xl animate-pulse"
              style={{ background: 'rgba(222, 255, 10, 0.15)' }}
            />
            <div
              className="relative w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(222, 255, 10, 0.2), rgba(222, 255, 10, 0.05))',
                border: '1px solid rgba(222, 255, 10, 0.3)',
              }}
            >
              <Sparkles className="w-8 h-8" style={{ color: 'var(--color-accent-cyan)' }} strokeWidth={1.5} />
            </div>
          </div>
        </div>

        <h2
          className="text-center mb-2"
          style={{
            fontFamily: 'var(--font-extended)',
            fontSize: 'var(--text-base)',
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '0.3em',
            color: '#deff0a',
          }}
        >
          Start Building
        </h2>
        <p
          className="text-center mb-6"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-tertiary)',
          }}
        >
          Type to search, or browse all plugins
        </p>

        {/* Search input */}
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
            <Search className="w-5 h-5" style={{ color: 'rgba(222, 255, 10, 0.6)' }} />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder="Search plugins... (e.g. 'Pro-Q', 'reverb', 'Fab')"
            className="w-full pl-12 pr-14 py-4 focus:outline-none"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-lg)',
              color: 'var(--color-text-primary)',
              background: 'rgba(0, 0, 0, 0.6)',
              border: '2px solid rgba(222, 255, 10, 0.3)',
              borderRadius: 'var(--radius-lg)',
              transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 0 24px rgba(222, 255, 10, 0.1)',
            }}
            onFocusCapture={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-accent-cyan)';
              e.currentTarget.style.boxShadow = '0 0 0 4px rgba(222, 255, 10, 0.15), 0 0 32px rgba(222, 255, 10, 0.2)';
            }}
            onBlurCapture={(e) => {
              e.currentTarget.style.borderColor = 'rgba(222, 255, 10, 0.3)';
              e.currentTarget.style.boxShadow = '0 0 24px rgba(222, 255, 10, 0.1)';
            }}
          />

          {/* Full browser button */}
          <button
            onClick={onOpenFullBrowser}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg fast-snap"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-cyan)'; e.currentTarget.style.background = 'rgba(222, 255, 10, 0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; e.currentTarget.style.background = 'transparent'; }}
            title="Open full plugin browser"
          >
            <Grid3x3 className="w-5 h-5" />
          </button>

          {/* Results dropdown */}
          {showResults && searchResults.length > 0 && (
            <div
              ref={resultsRef}
              className="absolute top-full left-0 right-0 mt-2 overflow-hidden z-50 slide-in"
              style={{
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border-strong)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-elevated), 0 0 24px rgba(0, 0, 0, 0.6)',
              }}
            >
              {/* Header */}
              <div
                className="px-4 py-2 flex items-center justify-between"
                style={{
                  background: 'rgba(222, 255, 10, 0.05)',
                  borderBottom: '1px solid var(--color-border-default)',
                }}
              >
                <div
                  className="flex items-center gap-2"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--tracking-widest)',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  {query ? (
                    <><Search className="w-3 h-3" /> Search Results</>
                  ) : (
                    <><TrendingUp className="w-3 h-3" /> Recently Used</>
                  )}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9px',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                </div>
              </div>

              {/* Results */}
              <div className="max-h-[320px] overflow-y-auto scrollbar-cyber">
                {searchResults.map((plugin, idx) => (
                  <SearchResultItem
                    key={plugin.uid}
                    plugin={plugin}
                    isHighlighted={idx === highlightedIndex}
                    usageCount={getPluginUsageCount(plugin.uid)}
                    enrichedData={getEnrichedDataForPlugin(plugin.uid)}
                    onClick={() => handleAddPlugin(plugin)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                  />
                ))}
              </div>

              {/* Chain results */}
              {chainResults.length > 0 && (
                <>
                  <div
                    className="px-4 py-1.5 flex items-center gap-2"
                    style={{
                      background: 'rgba(222, 255, 10, 0.03)',
                      borderTop: '1px solid var(--color-border-default)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--tracking-widest)',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    <FolderOpen className="w-3 h-3" /> Load a Chain
                  </div>
                  {chainResults.map((preset) => (
                    <button
                      key={preset.path}
                      onClick={() => handleLoadChain(preset)}
                      className="w-full text-left px-4 py-2 fast-snap flex items-center gap-3"
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
                      <FolderOpen className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-serial)' }} />
                      <div className="flex-1 min-w-0">
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {preset.name}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-text-disabled)', textTransform: 'capitalize' }}>
                          {preset.category}
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {/* Cloud chain results */}
              {cloudChainResults.length > 0 && (
                <>
                  <div
                    className="px-4 py-1.5 flex items-center gap-2"
                    style={{
                      background: 'rgba(222, 255, 10, 0.03)',
                      borderTop: '1px solid var(--color-border-default)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--tracking-widest)',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    <Globe className="w-3 h-3" /> Community Chains
                  </div>
                  {cloudChainResults.map((chain) => (
                    <button
                      key={chain._id}
                      onClick={handleBrowseAllChains}
                      className="w-full text-left px-4 py-2 fast-snap flex items-center gap-3"
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
                      <Globe className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-accent-cyan)' }} />
                      <div className="flex-1 min-w-0">
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {chain.name}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-text-disabled)' }}>
                          {chain.pluginCount}p{chain.author?.name ? ` · @${chain.author.name}` : ''}
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {/* Group template results */}
              {templateResults.length > 0 && (
                <>
                  <div
                    className="px-4 py-1.5 flex items-center gap-2"
                    style={{
                      background: 'rgba(222, 255, 10, 0.03)',
                      borderTop: '1px solid var(--color-border-default)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--tracking-widest)',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    <Layers className="w-3 h-3" /> Load a Group
                  </div>
                  {templateResults.map((tmpl) => (
                    <button
                      key={tmpl.path}
                      onClick={handleBrowseAllChains}
                      className="w-full text-left px-4 py-2 fast-snap flex items-center gap-3"
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
                      <Layers className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-parallel)' }} />
                      <div className="flex-1 min-w-0">
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tmpl.name}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-text-disabled)', textTransform: 'capitalize' }}>
                          {tmpl.mode} · {tmpl.pluginCount}p{tmpl.category ? ` · ${tmpl.category}` : ''}
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {/* Browse all chains button */}
              {query.trim().length >= 2 && (
                <button
                  onClick={handleBrowseAllChains}
                  className="w-full text-left px-4 py-2 fast-snap flex items-center gap-3"
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
                  <Globe className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-accent-cyan)' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-accent-cyan)' }}>
                    Browse All Chains
                  </span>
                </button>
              )}

              {/* Footer */}
              <div
                className="px-4 py-2 flex items-center justify-between"
                style={{
                  background: 'var(--color-bg-primary)',
                  borderTop: '1px solid var(--color-border-default)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--tracking-widest)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                <span><kbd style={{ padding: '1px 4px', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-default)' }}>Up/Down</kbd> Navigate</span>
                <span><kbd style={{ padding: '1px 4px', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-default)' }}>Enter</kbd> Add</span>
                <span><kbd style={{ padding: '1px 4px', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-default)' }}>Esc</kbd> Clear</span>
              </div>
            </div>
          )}
        </div>

        {/* Helper text */}
        <div className="mt-4 flex items-center justify-center gap-6">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(222, 255, 10, 0.6)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              Arrow keys to navigate
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(222, 255, 10, 0.6)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              Enter to add
            </span>
          </div>
        </div>

        {/* Other instances list */}
        <div className="mt-8">
          <OtherInstancesList />
        </div>
      </div>
    </div>
  );
}

// Individual search result item
interface SearchResultItemProps {
  plugin: PluginDescription;
  isHighlighted: boolean;
  usageCount: number;
  enrichedData: any;
  onClick: () => void;
  onMouseEnter: () => void;
}

function SearchResultItem({ plugin, isHighlighted, usageCount, enrichedData, onClick, onMouseEnter }: SearchResultItemProps) {
  const manufacturerLogo = enrichedData?.manufacturerLogoUrl;
  const category = enrichedData?.category || plugin.category;

  return (
    <button
      data-result-item
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className="w-full text-left px-4 py-3 fast-snap"
      style={{
        borderLeft: '2px solid',
        borderLeftColor: isHighlighted ? 'var(--color-accent-cyan)' : 'transparent',
        background: isHighlighted ? 'rgba(222, 255, 10, 0.08)' : 'transparent',
      }}
    >
      <div className="flex items-center gap-3">
        {/* Logo */}
        <div
          className="flex-shrink-0 w-10 h-10 rounded flex items-center justify-center overflow-hidden"
          style={{
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid',
            borderColor: isHighlighted ? 'rgba(222, 255, 10, 0.5)' : 'var(--color-border-default)',
            ...(isHighlighted ? { boxShadow: '0 0 8px rgba(222, 255, 10, 0.2)' } : {}),
          }}
        >
          {manufacturerLogo ? (
            <img
              src={manufacturerLogo}
              alt={plugin.manufacturer}
              className="w-full h-full object-contain p-1.5"
            />
          ) : (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-base)',
                fontWeight: 700,
                color: isHighlighted ? 'var(--color-accent-cyan)' : 'var(--color-text-tertiary)',
              }}
            >
              {plugin.manufacturer.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h4
              className="truncate"
              style={{
                fontFamily: 'var(--font-extended)',
                fontSize: 'var(--text-base)',
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wide)',
                color: isHighlighted ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              }}
            >
              {plugin.name}
            </h4>
            {usageCount > 0 && (
              <div
                className="flex-shrink-0 px-1.5 py-0.5 rounded"
                style={{
                  background: 'rgba(222, 255, 10, 0.15)',
                  border: '1px solid rgba(222, 255, 10, 0.3)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  color: 'var(--color-accent-cyan)',
                }}
              >
                {usageCount}x
              </div>
            )}
          </div>
          <div
            className="flex items-center gap-2"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-tertiary)',
            }}
          >
            <span className="truncate">{plugin.manufacturer}</span>
            {category && (
              <>
                <span style={{ opacity: 0.3 }}>|</span>
                <span className="truncate capitalize">{category}</span>
              </>
            )}
          </div>
        </div>

        {/* Add indicator */}
        {isHighlighted && (
          <div
            className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded"
            style={{
              background: 'var(--color-accent-cyan)',
              color: 'var(--color-bg-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
            }}
          >
            +
          </div>
        )}
      </div>
    </button>
  );
}
