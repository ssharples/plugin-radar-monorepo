import { useEffect, useState, useCallback, useRef } from 'react';
import { Search, RefreshCw, Filter, X, PanelLeftOpen } from 'lucide-react';
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

  // Collapsed state — thin sidebar with vertical label (only for sidebar mode, not overlay)
  if (collapsed && !onClose) {
    return (
      <div className="flex flex-col h-full bg-plugin-surface items-center py-2">
        <button
          onClick={onToggle}
          className="p-1 rounded hover:bg-plugin-border text-plugin-muted hover:text-plugin-text transition-colors"
          title="Expand plugin browser (⌘B)"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
        <div className="flex-1 flex items-center justify-center">
          <span
            className="text-[10px] font-mono font-semibold text-plugin-muted uppercase tracking-[0.15em] select-none"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          >
            Plugins
          </span>
        </div>
        <div className="text-[9px] font-mono text-plugin-dim">
          {filteredPlugins.length}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-plugin-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-plugin-border">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onClose || onToggle}
            className="p-0.5 rounded hover:bg-plugin-border text-plugin-muted hover:text-plugin-text transition-colors"
            title="Close (⌘B)"
          >
            {onClose ? <X className="w-3.5 h-3.5" /> : <PanelLeftOpen className="w-3.5 h-3.5 rotate-180" />}
          </button>
          <h2 className="text-xs font-mono font-semibold text-plugin-text uppercase tracking-wider">Plugins</h2>
          {enrichmentLoading && (
            <span className="text-[9px] text-plugin-accent animate-pulse">syncing catalog...</span>
          )}
          {enrichmentLoaded && !enrichmentLoading && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-500/60" title="Catalog synced" />
          )}
        </div>
        <button
          onClick={() => startScan(false)}
          disabled={scanning}
          className="p-1 rounded hover:bg-plugin-border-bright text-plugin-muted hover:text-plugin-accent transition-colors disabled:opacity-40"
          title="Rescan plugins"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin text-plugin-accent' : ''}`} />
        </button>
      </div>

      {/* Search and filters */}
      <div className="px-2.5 py-2 space-y-1.5 border-b border-plugin-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-plugin-dim" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={isSearchFocused ? "Type to search... (↑↓ navigate, Enter to add)" : "Search plugins... (⌘F)"}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            className={`w-full pl-7 pr-3 py-1 bg-plugin-bg rounded-propane font-mono text-xs text-plugin-text placeholder:text-plugin-dim border transition-colors focus:outline-none ${
              isSearchFocused
                ? 'border-plugin-accent/60 shadow-glow-accent'
                : 'border-plugin-border focus:border-plugin-accent/50'
            }`}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3 h-3 text-plugin-dim" />
            <div className="flex gap-0.5">
              <button
                onClick={() => setFormatFilter(null)}
                className={`px-2 py-0.5 text-xxs font-mono uppercase rounded transition-all ${
                  formatFilter === null
                    ? 'bg-plugin-accent text-black font-semibold'
                    : 'bg-plugin-bg text-plugin-muted hover:text-plugin-text border border-plugin-border'
                }`}
              >
                All
              </button>
              {formats.map((format) => (
                <button
                  key={format}
                  onClick={() => setFormatFilter(format)}
                  className={`px-2 py-0.5 text-xxs font-mono uppercase rounded transition-all ${
                    formatFilter === format
                      ? 'bg-plugin-accent text-black font-semibold'
                      : 'bg-plugin-bg text-plugin-muted hover:text-plugin-text border border-plugin-border'
                  }`}
                >
                  {format}
                </button>
              ))}
            </div>
          </div>
          <PluginFilters />
        </div>

        {/* Active filters indicator */}
        {activeFilters && (
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-plugin-accent">Filtered</span>
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-0.5 text-[9px] text-plugin-muted hover:text-plugin-accent"
            >
              <X className="w-2.5 h-2.5" />
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Scan progress */}
      {scanning && (
        <div className="px-2.5 py-1.5 bg-plugin-bg border-b border-plugin-border">
          <div className="flex items-center justify-between text-xxs text-plugin-muted mb-1">
            <span className="text-plugin-accent font-medium">Scanning...</span>
            <span className="font-mono">{Math.round(scanProgress * 100)}%</span>
          </div>
          <div className="h-0.5 bg-plugin-border rounded overflow-hidden">
            <div
              className="h-full bg-plugin-accent transition-all duration-300"
              style={{ width: `${scanProgress * 100}%` }}
            />
          </div>
          {currentlyScanning && (
            <p className="text-[9px] text-plugin-dim mt-0.5 truncate font-mono">
              {currentlyScanning}
            </p>
          )}
        </div>
      )}

      {/* Plugin list */}
      <div className="flex-1 overflow-y-auto p-1.5" ref={listRef}>
        {loading && !scanning ? (
          <div className="flex items-center justify-center h-24 text-plugin-muted text-xs">
            Loading...
          </div>
        ) : filteredPlugins.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-plugin-muted text-xs">
            <p>No plugins found</p>
            {activeFilters && (
              <button
                onClick={clearAllFilters}
                className="mt-2 text-plugin-accent hover:underline text-xxs"
              >
                Clear filters
              </button>
            )}
            {!scanning && !activeFilters && (
              <button
                onClick={() => startScan(true)}
                className="mt-2 text-plugin-accent hover:underline text-xxs"
              >
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

      {/* Footer count */}
      <div className="px-3 py-1 border-t border-plugin-border text-xxs text-plugin-dim font-mono">
        {filteredPlugins.length} plugin{filteredPlugins.length !== 1 ? 's' : ''}
        {highlightedIndex >= 0 && isSearchFocused && (
          <span className="text-plugin-muted ml-1">
            — {highlightedIndex + 1}/{filteredPlugins.length} selected
          </span>
        )}
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="fixed z-[200] bottom-6 left-1/2 -translate-x-1/2 animate-slide-up">
          <div className="px-4 py-2 bg-plugin-accent/90 text-black text-sm font-medium rounded-lg shadow-lg">
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
