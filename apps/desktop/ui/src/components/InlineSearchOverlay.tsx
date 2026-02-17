import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, X, ArrowRight, Replace } from 'lucide-react';
import { usePluginStore } from '../stores/pluginStore';
import { useUsageStore } from '../stores/usageStore';
import { useChainStore, useChainActions } from '../stores/chainStore';
import { useKeyboardStore, ShortcutPriority } from '../stores/keyboardStore';
import { juceBridge } from '../api/juce-bridge';
import type { PluginDescription } from '../api/types';

/**
 * Full-screen search overlay that appears over the inline editor.
 * Cmd+K = Replace mode (swap current plugin), Cmd+Shift+K = Add mode (insert after current).
 */
export function InlineSearchOverlay() {
  const searchOverlayActive = useChainStore(s => s.searchOverlayActive);
  const inlineEditorNodeId = useChainStore(s => s.inlineEditorNodeId);
  const { hideSearchOverlay } = useChainActions();

  const { plugins, getEnrichedDataForPlugin } = usePluginStore();
  const { getPluginUsageCount, getMostRecentPlugins } = useUsageStore();

  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [mode, setMode] = useState<'replace' | 'add'>('add');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when overlay opens
  useEffect(() => {
    if (searchOverlayActive) {
      setQuery('');
      setHighlightedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [searchOverlayActive]);

  // Register Shift+Enter shortcut to toggle search overlay
  useEffect(() => {
    const register = useKeyboardStore.getState().registerShortcut;

    const cleanup = register({
      id: 'inline-search-open',
      key: 'Enter',
      modifiers: { shift: true, meta: false, ctrl: false, alt: false },
      priority: ShortcutPriority.GLOBAL,
      allowInInputs: false,
      handler: (e) => {
        const state = useChainStore.getState();
        if (!state.inlineEditorNodeId) return;
        e.preventDefault();
        if (state.searchOverlayActive) {
          hideSearchOverlay();
        } else {
          setMode('add');
          // Set state synchronously so overlay appears immediately,
          // then fire bridge call in the background for C++ layout changes.
          useChainStore.setState({ searchOverlayActive: true });
          juceBridge.showSearchOverlay().catch(() => {});
        }
      },
    });

    return cleanup;
  }, [hideSearchOverlay]);

  // Search results with relevance scoring
  const searchResults = useMemo(() => {
    if (!query.trim()) {
      const recent = getMostRecentPlugins().slice(0, 8);
      return recent.map(r =>
        plugins.find(p => p.uid === r.uid)
      ).filter(Boolean) as PluginDescription[];
    }

    const q = query.toLowerCase();
    const scored = plugins.map(plugin => {
      let score = 0;
      const name = plugin.name.toLowerCase();
      const manufacturer = plugin.manufacturer.toLowerCase();
      const category = (getEnrichedDataForPlugin(plugin.uid)?.category || plugin.category || '').toLowerCase();

      if (name === q) score += 100;
      else if (name.startsWith(q)) score += 80;
      else if (name.includes(q)) score += 60;

      if (manufacturer.includes(q)) score += 30;
      if (category.includes(q)) score += 20;

      // Boost frequently used
      const usage = getPluginUsageCount(plugin.uid);
      score += Math.min(usage * 2, 20);

      return { plugin, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

    return scored.map(s => s.plugin);
  }, [query, plugins, getEnrichedDataForPlugin, getPluginUsageCount, getMostRecentPlugins]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      hideSearchOverlay();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && searchResults[highlightedIndex]) {
      e.preventDefault();
      handleSelect(searchResults[highlightedIndex]);
    }
  }, [searchResults, highlightedIndex, hideSearchOverlay]);

  const handleSelect = useCallback(async (plugin: PluginDescription) => {
    const { addPluginToGroup, removeNode, addPlugin, openInlineEditor } = useChainStore.getState();
    hideSearchOverlay();

    if (mode === 'replace' && inlineEditorNodeId != null) {
      // Remove old, add new at same spot. Use the bridge swap function.
      try {
        const { juceBridge: bridge } = await import('../api/juce-bridge');
        await bridge.swapPluginInChain(inlineEditorNodeId, plugin.fileOrIdentifier, []);
      } catch (err) {
        console.error('[InlineSearchOverlay] swap failed:', err);
      }
    } else {
      // Add after current node
      await addPluginToGroup(plugin.fileOrIdentifier, 0, -1);
    }
  }, [mode, inlineEditorNodeId, hideSearchOverlay]);

  if (!searchOverlayActive) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center bg-black/90 pt-[15vh]">
      {/* Search input */}
      <div className="w-full max-w-lg px-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white" size={18} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHighlightedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'replace' ? 'Search plugins to swap…' : 'Search plugins to add…'}
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-20 py-3 text-sm text-white placeholder-plugin-muted focus:outline-none focus:border-plugin-accent/50"
            autoFocus
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
              mode === 'replace' ? 'bg-plugin-accent/20 text-plugin-accent' : 'bg-blue-500/20 text-blue-400'
            }`}>
              {mode === 'replace' ? 'SWAP' : 'ADD'}
            </span>
            <button
              onClick={() => hideSearchOverlay()}
              className="text-white hover:text-plugin-accent"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => setMode('replace')}
            className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors ${
              mode === 'replace'
                ? 'bg-plugin-accent/20 text-plugin-accent border border-plugin-accent/30'
                : 'text-white hover:text-plugin-accent border border-transparent'
            }`}
          >
            <Replace size={10} className="inline mr-1" />
            Replace
          </button>
          <button
            onClick={() => setMode('add')}
            className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors ${
              mode === 'add'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-white hover:text-plugin-accent border border-transparent'
            }`}
          >
            <ArrowRight size={10} className="inline mr-1" />
            Add After
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="w-full max-w-lg px-4 mt-3 max-h-[50vh] overflow-y-auto">
        {searchResults.length === 0 && query.trim() && (
          <div className="text-center text-white text-sm py-8">
            No plugins found for "{query}"
          </div>
        )}
        {searchResults.map((plugin, i) => {
          const isHighlighted = i === highlightedIndex;
          const enriched = getEnrichedDataForPlugin(plugin.uid);
          const category = enriched?.category || plugin.category || '';

          return (
            <button
              key={plugin.uid}
              onClick={() => handleSelect(plugin)}
              onMouseEnter={() => setHighlightedIndex(i)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                isHighlighted ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{plugin.name}</div>
                <div className="text-[10px] text-white truncate">
                  {plugin.manufacturer}
                  {category && <span className="ml-2 text-plugin-accent/60">{category}</span>}
                </div>
              </div>
              <span className="text-[9px] font-mono text-white shrink-0">
                {plugin.format}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer hints */}
      <div className="mt-auto pb-4 text-[10px] text-white font-mono flex items-center gap-4">
        <span>↑↓ Navigate</span>
        <span>↵ Select</span>
        <span>Esc Close</span>
        <span>⇧↵ Toggle</span>
      </div>
    </div>
  );
}
