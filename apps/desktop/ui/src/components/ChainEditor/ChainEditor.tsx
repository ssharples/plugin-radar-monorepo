import { useEffect, useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from '@dnd-kit/core';
import { Link2, Layers, GitBranch, Undo2, Redo2, Power, AppWindow } from 'lucide-react';
import { useChainStore } from '../../stores/chainStore';
import { juceBridge } from '../../api/juce-bridge';
import type { ChainNodeUI } from '../../api/types';
import { ChainNodeList } from './ChainNodeList';
import { DragPreview } from './DragPreview';
import { HeaderMenu } from '../HeaderMenu';

// Root parent ID (the implicit root group)
const ROOT_PARENT_ID = 0;

/**
 * Custom collision detection: prefer pointerWithin for drop zones (small targets),
 * fall back to rectIntersection for group targets.
 */
const customCollisionDetection: CollisionDetection = (args) => {
  // First try pointer-within (more precise for thin drop zones)
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    return pointerCollisions;
  }
  // Fall back to rect intersection for broader group targets
  return rectIntersection(args);
};

export function ChainEditor() {
  const {
    nodes,
    loading,
    fetchChainState,
    moveNode,
    createGroup,
    dissolveGroup,
    selectNode,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useChainStore();

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [activeDragNode, setActiveDragNode] = useState<ChainNodeUI | null>(null);
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);

  // Chain-level toggle state
  const [bypassState, setBypassState] = useState<{ allBypassed: boolean; anyBypassed: boolean }>({ allBypassed: false, anyBypassed: false });
  const [windowState, setWindowState] = useState<{ openCount: number; totalCount: number }>({ openCount: 0, totalCount: 0 });

  // Track shift key state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

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

  // Keyboard shortcuts for undo/redo and group creation
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
      } else if (e.key === 'g' || e.key === 'G') {
        // Ctrl+G = serial group, Ctrl+Shift+G = parallel group
        if (selectedIds.size >= 2) {
          e.preventDefault();
          const mode = e.shiftKey ? 'parallel' : 'serial';
          const ids = Array.from(selectedIds);
          createGroup(ids, mode);
          setSelectedIds(new Set());
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo, selectedIds, createGroup]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  // DnD handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current;
    if (data?.node) {
      setActiveDragNode(data.node as ChainNodeUI);
      setActiveDragId(data.nodeId as number);
    }
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragNode(null);
    setActiveDragId(null);

    if (!over) return;

    const dragData = active.data.current;
    const draggedNodeId = dragData?.nodeId as number;
    if (draggedNodeId == null) return;

    const overId = String(over.id);

    // Parse the droppable ID
    if (overId.startsWith('drop:')) {
      // Format: drop:{parentId}:{insertIndex}
      const parts = overId.split(':');
      const targetParentId = parseInt(parts[1], 10);
      const targetIndex = parseInt(parts[2], 10);

      if (isNaN(targetParentId) || isNaN(targetIndex)) return;

      // Check if shift is held for group creation
      if (shiftHeld) {
        // Find the adjacent node for group creation
        const adjacentNodeId = findAdjacentNodeId(nodes, targetParentId, targetIndex);
        if (adjacentNodeId != null && adjacentNodeId !== draggedNodeId) {
          // Create a parallel group with dragged + adjacent
          await createGroup([draggedNodeId, adjacentNodeId], 'parallel');
          return;
        }
      }

      // Regular move: adjust index if needed
      // The backend handles index adjustment for same-parent moves
      await moveNode(draggedNodeId, targetParentId, targetIndex);

      // Auto-dissolve: check if old parent now has 0 or 1 children
      // The backend handles this via chainChanged event, but we can also
      // check locally for responsiveness
      const oldParent = findParentOf(nodes, draggedNodeId);
      if (oldParent && oldParent.type === 'group') {
        const remainingChildren = oldParent.children.filter(c => c.id !== draggedNodeId);
        if (remainingChildren.length <= 1 && oldParent.id !== ROOT_PARENT_ID) {
          // Auto-dissolve groups that end up with 0 or 1 children
          await dissolveGroup(oldParent.id);
        }
      }
    } else if (overId.startsWith('group:')) {
      // Dropped onto a group container → append to end
      const targetGroupId = parseInt(overId.split(':')[1], 10);
      if (isNaN(targetGroupId)) return;

      // Find the group to determine insert index
      const targetGroup = findNodeById(nodes, targetGroupId);
      const insertIndex = targetGroup?.type === 'group' ? targetGroup.children.length : 0;

      await moveNode(draggedNodeId, targetGroupId, insertIndex);

      // Auto-dissolve old parent if needed
      const oldParent = findParentOf(nodes, draggedNodeId);
      if (oldParent && oldParent.type === 'group') {
        const remainingChildren = oldParent.children.filter(c => c.id !== draggedNodeId);
        if (remainingChildren.length <= 1 && oldParent.id !== ROOT_PARENT_ID) {
          await dissolveGroup(oldParent.id);
        }
      }
    }
  }, [nodes, moveNode, createGroup, dissolveGroup, shiftHeld]);

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
  const isDragActive = activeDragNode !== null;

  return (
    <div className="flex flex-col h-full bg-plugin-surface rounded-lg overflow-hidden">
      {/* Unified Header Menu */}
      <HeaderMenu />

      {/* Chain Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-plugin-border">
        <div className="flex items-center gap-2">
          <Link2 className="w-3.5 h-3.5 text-plugin-accent" />
          <span className="text-xs font-medium text-plugin-muted">Chain</span>
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
            collisionDetection={customCollisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="space-y-2">
              {/* Input indicator */}
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-plugin-muted">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                Audio Input
              </div>

              {/* Tree-based rendering with drop zones */}
              <ChainNodeList
                nodes={nodes}
                depth={0}
                parentId={ROOT_PARENT_ID}
                isParallelParent={false}
                onNodeSelect={handleNodeSelect}
                selectedIds={selectedIds}
                isDragActive={isDragActive}
                draggedNodeId={activeDragId}
                shiftHeld={shiftHeld}
              />

              {/* Output indicator */}
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-plugin-muted">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                Audio Output
              </div>
            </div>

            {/* Drag overlay - follows cursor */}
            <DragOverlay dropAnimation={{
              duration: 200,
              easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
            }}>
              {activeDragNode ? (
                <DragPreview node={activeDragNode} />
              ) : null}
            </DragOverlay>
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
            <span className="ml-auto text-xxs text-plugin-muted">⌘G</span>
          </button>
          <button
            onClick={() => handleCreateGroup('parallel')}
            className="w-full px-3 py-1.5 text-left text-sm text-plugin-text hover:bg-plugin-border/50 flex items-center gap-2"
          >
            <GitBranch className="w-4 h-4 text-orange-400" />
            Create Parallel Group
            <span className="ml-auto text-xxs text-plugin-muted">⌘⇧G</span>
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

// ============================================
// Tree utility functions
// ============================================

function countPluginsInTree(nodes: ChainNodeUI[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === 'plugin') count++;
    else if (node.type === 'group') count += countPluginsInTree(node.children);
  }
  return count;
}

/**
 * Find a node by ID anywhere in the tree.
 */
function findNodeById(nodes: ChainNodeUI[], id: number): ChainNodeUI | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.type === 'group') {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Find the parent group of a given node ID.
 * Returns null for root-level nodes (parent is implicit root).
 */
function findParentOf(nodes: ChainNodeUI[], targetId: number, parent?: ChainNodeUI): ChainNodeUI | null {
  for (const node of nodes) {
    if (node.id === targetId) return parent ?? null;
    if (node.type === 'group') {
      const found = findParentOf(node.children, targetId, node);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Find the adjacent node ID at a given insert position within a parent.
 * Used for shift+drop group creation — returns the node that would be
 * "next to" the drop position.
 */
function findAdjacentNodeId(
  allNodes: ChainNodeUI[],
  parentId: number,
  insertIndex: number,
): number | null {
  const parentChildren = parentId === 0
    ? allNodes
    : (() => {
        const parent = findNodeById(allNodes, parentId);
        return parent?.type === 'group' ? parent.children : [];
      })();

  // Prefer the node just before the insert index, fall back to the one after
  if (insertIndex > 0 && parentChildren[insertIndex - 1]) {
    return parentChildren[insertIndex - 1].id;
  }
  if (parentChildren[insertIndex]) {
    return parentChildren[insertIndex].id;
  }
  return null;
}

function renderSignalFlow(nodes: ChainNodeUI[]): React.ReactNode[] {
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
