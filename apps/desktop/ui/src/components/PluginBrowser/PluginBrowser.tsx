import { useEffect, useState, useCallback, useRef } from 'react';
import { Search, RefreshCw, X, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { usePluginStore } from '../../stores/pluginStore';
import { useChainStore } from '../../stores/chainStore';
import { PluginItem } from './PluginItem';
import { PluginFilters } from './PluginFilters';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

interface PluginBrowserProps {
  collapsed?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
}

export function PluginBrowser({ collapsed = false, onToggle, onClose }: PluginBrowserProps) {
  const {
    filteredPlugins,
    searchQuery,
    formatFilter,
    scanning,
    scanProgress,
    currentlyScanning,
    loading,
    fetchPlugins,
    startScan,
    setSearchQuery,
    setFormatFilter,
    enrichmentLoading,
    enrichmentLoaded,
    hasActiveFilters,
    clearAllFilters,
  } = usePluginStore();

  const { addPlugin, addPluginToGroup, selectNode, selectedNodeId, slots, nodes } = useChainStore();

  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  // --- Keyboard navigation state ---
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [toast, setToast] = useState<string | null>(null);

  // Wire up global keyboard shortcuts (Cmd+F, Delete/Backspace)
  useKeyboardShortcuts({ searchInputRef, isSearchFocused });

  // "Add plugin" buttons elsewhere ask the browser to open: put the cursor in search
  useEffect(() => {
    const focus = () => setTimeout(() => searchInputRef.current?.focus(), 30);
    window.addEventListener('openPluginBrowser', focus);
    return () => window.removeEventListener('openPluginBrowser', focus);
  }, []);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [filteredPlugins.length, searchQuery]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    const wrapper = listRef.current.querySelector('.space-y-px');
    if (!wrapper) return;
    const item = wrapper.children[highlightedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1500);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleInsertPlugin = useCallback(async (pluginId: string, pluginName: string) => {
    let success = false;

    // Find the tree position of the selected node (parent group + index)
    const treePos = selectedNodeId !== null ? findTreePosition(nodes, selectedNodeId) : null;

    if (treePos && treePos.parentId !== 0) {
      // Selected node is inside a group — add to that group after the selected node
      success = await addPluginToGroup(pluginId, treePos.parentId, treePos.index + 1);
    } else if (treePos) {
      // Selected node is at root — use flat insert after it
      const flatIdx = slots.findIndex(
        (s) => s.index === selectedNodeId || s.uid === selectedNodeId
      );
      success = await addPlugin(pluginId, flatIdx !== -1 ? flatIdx + 1 : -1);
    } else {
      // Nothing selected — append to end
      success = await addPlugin(pluginId);
    }

    if (success) {
      const { slots: newSlots, nodes: newNodes } = useChainStore.getState();
      // Find and select the newly added plugin
      const lastNode = findLastPluginByName(newNodes, pluginName);
      if (lastNode) {
        selectNode(lastNode);
      } else if (newSlots.length > 0) {
        const lastSlot = newSlots[newSlots.length - 1];
        selectNode(lastSlot.index);
      }
      setToast(`Added "${pluginName}"`);
    }
  }, [addPlugin, addPluginToGroup, selectedNodeId, slots, nodes, selectNode]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const count = filteredPlugins.length;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (count > 0) {
          setHighlightedIndex((prev) => (prev + 1) % count);
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (count > 0) {
          setHighlightedIndex((prev) => (prev <= 0 ? count - 1 : prev - 1));
        }
        break;

      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < count) {
          const plugin = filteredPlugins[highlightedIndex];
          handleInsertPlugin(plugin.id, plugin.name);
        } else if (count > 0) {
          const plugin = filteredPlugins[0];
          handleInsertPlugin(plugin.id, plugin.name);
        }
        break;

      case 'Escape':
        e.preventDefault();
        if (searchQuery) {
          setSearchQuery('');
        } else {
          searchInputRef.current?.blur();
        }
        setHighlightedIndex(-1);
        break;
    }
  }, [filteredPlugins, highlightedIndex, searchQuery, setSearchQuery, handleInsertPlugin]);

  const handleAddPlugin = useCallback(async (pluginId: string, pluginName: string) => {
    let success = false;

    // If a node inside a group is selected, add to that group
    const treePos = selectedNodeId !== null ? findTreePosition(nodes, selectedNodeId) : null;
    if (treePos && treePos.parentId !== 0) {
      success = await addPluginToGroup(pluginId, treePos.parentId, treePos.index + 1);
    } else {
      success = await addPlugin(pluginId);
    }

    if (success) {
      const { nodes: newNodes } = useChainStore.getState();
      const lastNode = findLastPluginByName(newNodes, pluginName);
      if (lastNode) selectNode(lastNode);
      setToast(`Added "${pluginName}"`);
    }
  }, [addPlugin, addPluginToGroup, selectedNodeId, nodes, selectNode]);

  const formats = ['VST3', 'AudioUnit'];
  const activeFilters = hasActiveFilters();

  // Collapsed state: a thin rail with the count (docked mode only)
  if (collapsed && !onClose) {
    return (
      <div className="flex flex-col h-full w-full bg-plugin-surface items-center py-2 gap-2">
        <button
          onClick={onToggle}
          className="w-8 h-8 inline-flex items-center justify-center rounded-md hover:bg-plugin-raised text-plugin-muted hover:text-plugin-text transition-colors"
          title="Show plugins (⌘B)"
          aria-label="Show plugins"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            onToggle?.();
            setTimeout(() => searchInputRef.current?.focus(), 0);
          }}
          className="w-8 h-8 inline-flex items-center justify-center rounded-md hover:bg-plugin-raised text-plugin-muted hover:text-plugin-text transition-colors"
          title="Search plugins"
          aria-label="Search plugins"
        >
          <Search className="w-4 h-4" />
        </button>
        <div className="flex-1 flex items-center justify-center">
          <span
            className="text-[11px] font-semibold text-plugin-dim uppercase tracking-[0.15em] select-none"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          >
            Plugins
          </span>
        </div>
        <div className="num text-[10px] text-plugin-dim">{filteredPlugins.length}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-plugin-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-1.5 h-10 pl-3 pr-1.5 border-b border-plugin-border flex-shrink-0">
        <h2 className="section-label !text-plugin-muted">Plugins</h2>
        <span className="num text-[10px] text-plugin-dim">{filteredPlugins.length}</span>
        {enrichmentLoading && (
          <span className="text-[10px] text-plugin-accent animate-pulse-soft">syncing catalogue…</span>
        )}
        {enrichmentLoaded && !enrichmentLoading && (
          <span className="w-1.5 h-1.5 rounded-full bg-green-500/70" title="Catalogue synced" />
        )}
        <span className="flex-1" />
        <button
          onClick={() => startScan(false)}
          disabled={scanning}
          className="w-7 h-7 inline-flex items-center justify-center rounded-md hover:bg-plugin-raised text-plugin-muted hover:text-plugin-text transition-colors disabled:opacity-40"
          title="Rescan plugins"
          aria-label="Rescan plugins"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin text-plugin-accent' : ''}`} />
        </button>
        <button
          onClick={onClose || onToggle}
          className="w-7 h-7 inline-flex items-center justify-center rounded-md hover:bg-plugin-raised text-plugin-muted hover:text-plugin-text transition-colors"
          title={onClose ? 'Close (⌘B)' : 'Hide plugins (⌘B)'}
          aria-label={onClose ? 'Close plugin browser' : 'Hide plugins'}
        >
          {onClose ? <X className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Search and filters */}
      <div className="px-2.5 pt-2.5 pb-2 space-y-2 border-b border-plugin-border flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-plugin-dim" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={isSearchFocused ? 'Type, ↑↓ to pick, Enter to add' : 'Search plugins  ⌘F'}
            aria-label="Search plugins"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            className={`w-full h-8 pl-8 pr-3 bg-plugin-bg rounded-md text-[13px] text-plugin-text placeholder:text-plugin-dim border transition-colors focus:outline-none ${
              isSearchFocused ? 'border-plugin-accent/60' : 'border-plugin-border'
            }`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center rounded-md bg-plugin-bg border border-plugin-border p-0.5" role="group" aria-label="Plugin format">
            {[{ v: null as string | null, l: 'All' }, ...formats.map((f) => ({ v: f as string | null, l: f === 'AudioUnit' ? 'AU' : f }))].map(({ v, l }) => (
              <button
                key={l}
                onClick={() => setFormatFilter(v)}
                aria-pressed={formatFilter === v}
                className={`h-6 px-2 text-[11px] font-semibold rounded transition-colors ${
                  formatFilter === v ? 'bg-plugin-raised text-plugin-text' : 'text-plugin-dim hover:text-plugin-text'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <PluginFilters />
        </div>

        {activeFilters && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-plugin-accent-bright">Filters on</span>
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-0.5 text-[11px] text-plugin-muted hover:text-plugin-text"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Scan progress */}
      {scanning && (
        <div className="px-3 py-2 bg-plugin-bg border-b border-plugin-border flex-shrink-0">
          <div className="flex items-center justify-between text-[11px] text-plugin-muted mb-1">
            <span className="text-plugin-accent-bright font-medium">Scanning…</span>
            <span className="num">{Math.round(scanProgress * 100)}%</span>
          </div>
          <div className="h-1 bg-plugin-raised rounded-full overflow-hidden">
            <div
              className="h-full bg-plugin-accent transition-all duration-300"
              style={{ width: `${scanProgress * 100}%` }}
            />
          </div>
          {currentlyScanning && (
            <p className="text-[10px] text-plugin-dim mt-1 truncate">{currentlyScanning}</p>
          )}
        </div>
      )}

      {/* Plugin list */}
      <div className="flex-1 overflow-y-auto p-1" ref={listRef}>
        {loading && !scanning ? (
          <div className="flex items-center justify-center h-24 text-plugin-muted text-xs">
            Loading…
          </div>
        ) : filteredPlugins.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-28 text-plugin-muted text-xs gap-2">
            <p>No plugins found</p>
            {activeFilters && (
              <button onClick={clearAllFilters} className="text-plugin-accent-bright hover:underline text-xs">
                Clear filters
              </button>
            )}
            {!scanning && !activeFilters && (
              <button onClick={() => startScan(true)} className="text-plugin-accent-bright hover:underline text-xs">
                Scan for plugins
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-px">
            {filteredPlugins.map((plugin, index) => (
              <PluginItem
                key={plugin.id}
                plugin={plugin}
                isHighlighted={isSearchFocused && index === highlightedIndex}
                onAdd={() => handleAddPlugin(plugin.id, plugin.name)}
                onInsert={() => handleInsertPlugin(plugin.id, plugin.name)}
                onMouseEnter={() => { if (isSearchFocused) setHighlightedIndex(index); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Hint */}
      <div className="px-3 h-7 flex items-center border-t border-plugin-border text-[11px] text-plugin-dim flex-shrink-0">
        {highlightedIndex >= 0 && isSearchFocused ? (
          <span className="num">{highlightedIndex + 1} of {filteredPlugins.length}</span>
        ) : (
          <span className="truncate">Double-click or + to add after the selected slot</span>
        )}
      </div>

      {toast && (
        <div className="fixed z-[200] bottom-16 left-1/2 -translate-x-1/2 animate-slide-up" role="status">
          <div className="px-3 h-8 inline-flex items-center bg-plugin-raised border border-plugin-border-bright text-plugin-text text-xs font-medium rounded-md shadow-panel">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

type NodeUI = import('../../api/types').ChainNodeUI;

/** Find the parent ID and index of a node within the tree */
function findTreePosition(nodes: NodeUI[], targetId: number, parentId = 0): { parentId: number; index: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === targetId) {
      return { parentId, index: i };
    }
    if (nodes[i].type === 'group') {
      const found = findTreePosition(nodes[i].children, targetId, nodes[i].id);
      if (found) return found;
    }
  }
  return null;
}

/** Find the node ID of the last plugin with a given name (for selecting newly added plugins) */
function findLastPluginByName(nodes: NodeUI[], name: string): number | null {
  let lastId: number | null = null;
  for (const node of nodes) {
    if (node.type === 'plugin' && node.name === name) lastId = node.id;
    if (node.type === 'group') {
      const found = findLastPluginByName(node.children, name);
      if (found !== null) lastId = found;
    }
  }
  return lastId;
}
