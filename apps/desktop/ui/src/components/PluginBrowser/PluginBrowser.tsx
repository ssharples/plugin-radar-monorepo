import { useEffect, useState, useCallback, useRef } from 'react';
import { Search, RefreshCw, Filter, X, PanelLeftOpen, Settings, Eye, EyeOff } from 'lucide-react';
import { usePluginStore } from '../../stores/pluginStore';
import { useChainStore } from '../../stores/chainStore';
import { PluginItem } from './PluginItem';
import { PluginFilters } from './PluginFilters';
import { NewPluginsBanner } from './NewPluginsBanner';
import { ScanSettings } from './ScanSettings';
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
    showDeactivated,
    setShowDeactivated,
    deactivatedPlugins,
    scanSettingsOpen,
    setScanSettingsOpen,
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
    const wrapper = listRef.current.querySelector('.plugin-list-inner');
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

  // Collapsed state — thin sidebar with vertical label
  if (collapsed && !onClose) {
    return (
      <div
        className="flex flex-col h-full items-center py-2"
        style={{ background: 'var(--color-bg-secondary)' }}
      >
        <button
          onClick={onToggle}
          className="p-1 rounded fast-snap"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-cyan)'; e.currentTarget.style.background = 'var(--color-bg-elevated)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; e.currentTarget.style.background = 'transparent'; }}
          title="Expand plugin browser"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
        <div className="flex-1 flex items-center justify-center">
          <span
            className="select-none"
            style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-widest)',
              color: 'var(--color-text-tertiary)',
            }}
          >
            Plugins
          </span>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            color: 'var(--color-accent-cyan)',
          }}
        >
          {filteredPlugins.length}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: 'var(--color-bg-secondary)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ borderBottom: '1px solid var(--color-border-default)' }}
      >
        <div className="flex items-center gap-1.5">
          <button
            onClick={onClose || onToggle}
            className="p-0.5 rounded fast-snap"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-cyan)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
            title="Close"
          >
            {onClose ? <X className="w-3.5 h-3.5" /> : <PanelLeftOpen className="w-3.5 h-3.5 rotate-180" />}
          </button>
          <h2
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wider)',
              color: 'var(--color-accent-cyan)',
            }}
          >
            Plugins
          </h2>
          {enrichmentLoading && (
            <span
              className="animate-pulse"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                color: 'var(--color-accent-magenta)',
              }}
            >
              syncing...
            </span>
          )}
          {enrichmentLoaded && !enrichmentLoading && (
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: 'var(--color-status-active)' }}
              title="Catalog synced"
            />
          )}
        </div>
        <div className="flex items-center gap-0.5 relative">
          <button
            onClick={() => setScanSettingsOpen(!scanSettingsOpen)}
            className="p-1 rounded fast-snap"
            style={{ color: scanSettingsOpen ? 'var(--color-accent-cyan)' : 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-cyan)'; }}
            onMouseLeave={(e) => { if (!scanSettingsOpen) e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
            title="Scan settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => startScan(false)}
            disabled={scanning}
            className="p-1 rounded fast-snap disabled:opacity-40"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => { if (!scanning) e.currentTarget.style.color = 'var(--color-accent-cyan)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
            title="Rescan plugins"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} style={scanning ? { color: 'var(--color-accent-cyan)' } : {}} />
          </button>
          {scanSettingsOpen && <ScanSettings onClose={() => setScanSettingsOpen(false)} />}
        </div>
      </div>

      {/* Search and filters */}
      <div
        className="px-2.5 py-2 space-y-1.5"
        style={{ borderBottom: '1px solid var(--color-border-default)' }}
      >
        <div className="relative">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: 'var(--color-text-tertiary)' }}
          />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={isSearchFocused ? "Type to search... (Enter to add)" : "Search plugins..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            className="input w-full pl-7 pr-3 py-1"
            style={{
              fontSize: 'var(--text-sm)',
              ...(isSearchFocused ? {
                borderColor: 'var(--color-accent-cyan)',
                boxShadow: '0 0 0 1px var(--color-accent-cyan), 0 0 12px rgba(222, 255, 10, 0.3)',
              } : {}),
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3 h-3" style={{ color: 'var(--color-text-tertiary)' }} />
            <div className="flex gap-0.5">
              <button
                onClick={() => setFormatFilter(null)}
                className="fast-snap"
                style={{
                  padding: '2px 8px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--tracking-wide)',
                  borderRadius: 'var(--radius-base)',
                  border: '1px solid',
                  ...(formatFilter === null ? {
                    background: 'var(--color-accent-cyan)',
                    color: 'var(--color-bg-primary)',
                    borderColor: 'var(--color-accent-cyan)',
                    boxShadow: '0 0 8px rgba(222, 255, 10, 0.3)',
                  } : {
                    background: 'var(--color-bg-input)',
                    color: 'var(--color-text-secondary)',
                    borderColor: 'var(--color-border-default)',
                  }),
                }}
              >
                All
              </button>
              {formats.map((format) => (
                <button
                  key={format}
                  onClick={() => setFormatFilter(format)}
                  className="fast-snap"
                  style={{
                    padding: '2px 8px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--tracking-wide)',
                    borderRadius: 'var(--radius-base)',
                    border: '1px solid',
                    ...(formatFilter === format ? {
                      background: 'var(--color-accent-cyan)',
                      color: 'var(--color-bg-primary)',
                      borderColor: 'var(--color-accent-cyan)',
                      boxShadow: '0 0 8px rgba(222, 255, 10, 0.3)',
                    } : {
                      background: 'var(--color-bg-input)',
                      color: 'var(--color-text-secondary)',
                      borderColor: 'var(--color-border-default)',
                    }),
                  }}
                >
                  {format}
                </button>
              ))}
            </div>
          </div>
          <PluginFilters />
        </div>

        {/* Active filters indicator + show deactivated toggle */}
        <div className="flex items-center justify-between">
          {activeFilters ? (
            <div className="flex items-center gap-1">
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-accent-magenta)' }}>
                Filtered
              </span>
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-0.5 fast-snap"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-text-tertiary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-cyan)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
              >
                <X className="w-2.5 h-2.5" />
                Clear
              </button>
            </div>
          ) : <div />}
          <button
            onClick={() => setShowDeactivated(!showDeactivated)}
            className="flex items-center gap-1 fast-snap"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: showDeactivated ? 'var(--color-accent-cyan)' : 'var(--color-text-tertiary)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-cyan)'; }}
            onMouseLeave={(e) => { if (!showDeactivated) e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
            title={showDeactivated ? "Hide deactivated plugins" : "Show deactivated plugins"}
          >
            {showDeactivated ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            {showDeactivated ? 'Showing all' : 'Show deactivated'}
          </button>
        </div>
      </div>

      {/* New plugins detected banner */}
      <NewPluginsBanner />

      {/* Scan progress */}
      {scanning && (
        <div
          className="px-2.5 py-1.5"
          style={{
            background: 'var(--color-bg-primary)',
            borderBottom: '1px solid var(--color-border-default)',
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-accent-cyan)' }}>
              Scanning...
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              {Math.round(scanProgress * 100)}%
            </span>
          </div>
          <div
            className="h-0.5 rounded overflow-hidden"
            style={{ background: 'var(--color-border-default)' }}
          >
            <div
              className="h-full"
              style={{
                background: 'var(--color-accent-cyan)',
                width: `${scanProgress * 100}%`,
                boxShadow: '0 0 8px rgba(222, 255, 10, 0.5)',
                transition: 'width 300ms ease',
              }}
            />
          </div>
          {currentlyScanning && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-text-tertiary)', marginTop: '2px' }} className="truncate">
              {currentlyScanning}
            </p>
          )}
        </div>
      )}

      {/* Plugin list */}
      <div className="flex-1 overflow-y-auto p-1.5 scrollbar-cyber" ref={listRef}>
        {loading && !scanning ? (
          <div className="flex items-center justify-center h-24" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
            Loading...
          </div>
        ) : filteredPlugins.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24">
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
              No plugins found
            </p>
            {activeFilters && (
              <button
                onClick={clearAllFilters}
                className="mt-2 fast-snap"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-accent-cyan)' }}
              >
                Clear filters
              </button>
            )}
            {!scanning && !activeFilters && (
              <button
                onClick={() => startScan(true)}
                className="mt-2 fast-snap"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-accent-cyan)' }}
              >
                Scan for plugins
              </button>
            )}
          </div>
        ) : (
          <div className="plugin-list-inner" style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
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
      <div
        className="px-3 py-1 flex items-center"
        style={{
          borderTop: '1px solid var(--color-border-default)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
        }}
      >
        <span style={{ color: 'var(--color-accent-cyan)' }}>{filteredPlugins.length}</span>
        <span style={{ marginLeft: '4px' }}>plugin{filteredPlugins.length !== 1 ? 's' : ''}</span>
        {deactivatedPlugins.length > 0 && showDeactivated && (
          <span style={{ color: 'var(--color-accent-magenta)', marginLeft: '6px' }}>
            {deactivatedPlugins.length} deactivated
          </span>
        )}
        {highlightedIndex >= 0 && isSearchFocused && (
          <span style={{ color: 'var(--color-text-secondary)', marginLeft: '6px' }}>
            {highlightedIndex + 1}/{filteredPlugins.length}
          </span>
        )}
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="fixed z-[200] bottom-6 left-1/2 -translate-x-1/2 slide-in">
          <div
            style={{
              padding: '8px 16px',
              background: 'var(--color-accent-cyan)',
              color: 'var(--color-bg-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wide)',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 0 20px rgba(222, 255, 10, 0.5)',
            }}
          >
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
