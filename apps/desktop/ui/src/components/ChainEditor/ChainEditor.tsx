import { useEffect, useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Link2, Layers, GitBranch, Undo2, Redo2, Power, AppWindow } from 'lucide-react';
import { useChainStore } from '../../stores/chainStore';
import { juceBridge } from '../../api/juce-bridge';
import { ChainNodeList } from './ChainNodeList';

export function ChainEditor() {
  const {
    nodes,
    loading,
    fetchChainState,
    moveNode,
    createGroup,
    selectNode,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useChainStore();

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Chain-level toggle state
  const [bypassState, setBypassState] = useState<{ allBypassed: boolean; anyBypassed: boolean }>({ allBypassed: false, anyBypassed: false });
  const [windowState, setWindowState] = useState<{ openCount: number; totalCount: number }>({ openCount: 0, totalCount: 0 });

  useEffect(() => {
    fetchChainState();
    // Fetch initial toggle states
    juceBridge.getAllBypassState().then(setBypassState).catch(() => {});
    juceBridge.getPluginWindowState().then(setWindowState).catch(() => {});
  }, [fetchChainState]);

  // Refresh toggle states when chain changes
  useEffect(() => {
    const unsub = juceBridge.onChainChanged(() => {
      juceBridge.getAllBypassState().then(setBypassState).catch(() => {});
      juceBridge.getPluginWindowState().then(setWindowState).catch(() => {});
    });
    return unsub;
  }, []);

  const handleToggleAllBypass = useCallback(async () => {
    try {
      const result = await juceBridge.toggleAllBypass();
      setBypassState({ allBypassed: result.allBypassed, anyBypassed: result.anyBypassed });
    } catch { /* ignore */ }
  }, []);

  const handleToggleAllWindows = useCallback(async () => {
    try {
      const result = await juceBridge.toggleAllPluginWindows();
      setWindowState({ openCount: result.openCount, totalCount: result.totalCount });
    } catch { /* ignore */ }
  }, []);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo()) undo();
      } else if (
        (e.key === 'z' && e.shiftKey) ||
        (e.key === 'y' && !e.shiftKey)
      ) {
        e.preventDefault();
        if (canRedo()) redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Tree-based DnD: reorder top-level nodes within root group (id=0)
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const overIndex = nodes.findIndex((n) => n.id === over.id);
      if (overIndex !== -1) {
        moveNode(active.id as number, 0, overIndex);
      }
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (selectedIds.size >= 2) {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY });
    }
  }, [selectedIds]);

  const handleCreateGroup = useCallback((mode: 'serial' | 'parallel') => {
    const ids = Array.from(selectedIds);
    createGroup(ids, mode);
    setSelectedIds(new Set());
    setContextMenu(null);
  }, [selectedIds, createGroup]);

  // Ctrl+click multi-select for group creation
  const handleNodeSelect = useCallback((e: React.MouseEvent, nodeId: number) => {
    if (e.ctrlKey || e.metaKey) {
      e.stopPropagation();
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return next;
      });
    } else {
      setSelectedIds(new Set());
      selectNode(nodeId);
    }
  }, [selectNode]);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, []);

  const hasNodes = nodes.length > 0;
  const totalPlugins = countPluginsInTree(nodes);

  // Collect top-level node IDs for sortable context
  const sortableIds = nodes.map((n) => n.id);

  return (
    <div className="flex flex-col h-full bg-plugin-surface rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-plugin-border">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-plugin-accent" />
          <h2 className="text-sm font-semibold text-plugin-text">Plugin Chain</h2>
        </div>
        <div className="flex items-center gap-1">
          {/* Undo/Redo buttons */}
          <button
            onClick={() => undo()}
            disabled={!canUndo()}
            className={`p-1 rounded transition-colors ${
              canUndo()
                ? 'text-plugin-muted hover:text-plugin-text hover:bg-plugin-border/50'
                : 'text-plugin-dim cursor-not-allowed'
            }`}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => redo()}
            disabled={!canRedo()}
            className={`p-1 rounded transition-colors ${
              canRedo()
                ? 'text-plugin-muted hover:text-plugin-text hover:bg-plugin-border/50'
                : 'text-plugin-dim cursor-not-allowed'
            }`}
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          {/* Separator */}
          {totalPlugins > 0 && (
            <div className="w-px h-4 bg-plugin-border mx-1" />
          )}

          {/* Toggle All Bypass */}
          {totalPlugins > 0 && (
            <button
              onClick={handleToggleAllBypass}
              className={`p-1 rounded transition-colors ${
                bypassState.allBypassed
                  ? 'text-red-400 bg-red-500/15 hover:bg-red-500/25'
                  : bypassState.anyBypassed
                    ? 'text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/15'
                    : 'text-green-400 hover:text-green-300 hover:bg-green-500/15'
              }`}
              title={
                bypassState.allBypassed
                  ? 'Enable all plugins'
                  : 'Bypass all plugins'
              }
            >
              <Power className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Toggle All Plugin Windows */}
          {totalPlugins > 0 && (
            <button
              onClick={handleToggleAllWindows}
              className={`p-1 rounded transition-colors flex items-center gap-1 ${
                windowState.openCount > 0
                  ? 'text-plugin-accent hover:text-plugin-accent/80 hover:bg-plugin-accent/15'
                  : 'text-plugin-muted hover:text-plugin-text hover:bg-plugin-border/50'
              }`}
              title={
                windowState.openCount > 0
                  ? `Close all plugin windows (${windowState.openCount}/${windowState.totalCount} open)`
                  : 'Open all plugin windows'
              }
            >
              <AppWindow className="w-3.5 h-3.5" />
              {windowState.totalCount > 0 && (
                <span className="text-[10px] leading-none">
                  {windowState.openCount}/{windowState.totalCount}
                </span>
              )}
            </button>
          )}

          <span className="text-xs text-plugin-muted ml-2">
            {totalPlugins} plugin{totalPlugins !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Chain */}
      <div
        className="flex-1 overflow-y-auto p-3"
        onContextMenu={handleContextMenu}
        onClick={() => { selectNode(null); setSelectedIds(new Set()); }}
      >
        {loading && !hasNodes ? (
          <div className="flex items-center justify-center h-32 text-plugin-muted">
            Loading...
          </div>
        ) : !hasNodes ? (
          <div className="flex flex-col items-center justify-center h-full text-plugin-muted">
            <Link2 className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-sm">No plugins in chain</p>
            <p className="text-xs mt-1">
              Double-click a plugin to add it
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortableIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {/* Input indicator */}
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-plugin-muted">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  Audio Input
                </div>

                {/* Tree-based rendering */}
                <ChainNodeList
                  nodes={nodes}
                  depth={0}
                  isParallelParent={false}
                  onNodeSelect={handleNodeSelect}
                  selectedIds={selectedIds}
                />

                {/* Output indicator */}
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-plugin-muted">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  Audio Output
                </div>
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Context menu for creating groups */}
      {contextMenu && selectedIds.size >= 2 && (
        <div
          className="fixed z-50 bg-plugin-surface border border-plugin-border rounded-lg shadow-lg py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleCreateGroup('serial')}
            className="w-full px-3 py-1.5 text-left text-sm text-plugin-text hover:bg-plugin-border/50 flex items-center gap-2"
          >
            <Layers className="w-4 h-4 text-blue-400" />
            Create Serial Group
          </button>
          <button
            onClick={() => handleCreateGroup('parallel')}
            className="w-full px-3 py-1.5 text-left text-sm text-plugin-text hover:bg-plugin-border/50 flex items-center gap-2"
          >
            <GitBranch className="w-4 h-4 text-orange-400" />
            Create Parallel Group
          </button>
        </div>
      )}

      {/* Signal flow visualization */}
      {hasNodes && (
        <div className="px-3 py-2 border-t border-plugin-border">
          <div className="flex items-center gap-1 overflow-x-auto">
            <div className="flex-shrink-0 w-2 h-2 rounded-full bg-green-500" />
            {renderSignalFlow(nodes)}
            <div className="w-4 h-px bg-plugin-border" />
            <div className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500" />
          </div>
        </div>
      )}

    </div>
  );
}

function countPluginsInTree(nodes: import('../../api/types').ChainNodeUI[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === 'plugin') count++;
    else if (node.type === 'group') count += countPluginsInTree(node.children);
  }
  return count;
}

function renderSignalFlow(nodes: import('../../api/types').ChainNodeUI[]): React.ReactNode[] {
  const elements: React.ReactNode[] = [];

  nodes.forEach((node, i) => {
    if (i > 0) {
      elements.push(
        <div key={`sep-${node.id}`} className="w-4 h-px bg-plugin-border" />
      );
    }

    if (node.type === 'plugin') {
      elements.push(
        <div
          key={`flow-${node.id}`}
          className={`flex-shrink-0 px-2 py-0.5 text-xs rounded ${
            node.bypassed
              ? 'bg-plugin-bg text-plugin-muted line-through'
              : 'bg-plugin-border text-plugin-text'
          }`}
          title={node.name}
        >
          {node.name.length > 8 ? node.name.slice(0, 8) + '...' : node.name}
        </div>
      );
    } else if (node.type === 'group') {
      const isParallel = node.mode === 'parallel';
      elements.push(
        <div
          key={`flow-${node.id}`}
          className={`flex-shrink-0 px-1.5 py-0.5 text-xxs rounded border ${
            isParallel
              ? 'border-orange-500/30 text-orange-400'
              : 'border-blue-500/30 text-blue-400'
          }`}
          title={`${node.name} (${node.mode})`}
        >
          {isParallel ? '||' : '>'} {node.name.length > 6 ? node.name.slice(0, 6) + '..' : node.name}
        </div>
      );
    }
  });

  return elements;
}
