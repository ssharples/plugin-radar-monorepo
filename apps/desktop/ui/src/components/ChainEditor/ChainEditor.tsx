import { useEffect, useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from '@dnd-kit/core';
import { Link2, Layers, GitBranch, Undo2, Redo2, Power, AppWindow, Plus, MousePointer2 } from 'lucide-react';
import { useChainStore } from '../../stores/chainStore';
import { juceBridge } from '../../api/juce-bridge';
import type { ChainNodeUI } from '../../api/types';
import { ChainNodeList } from './ChainNodeList';
import { DragPreview } from './DragPreview';
import { ChainTemplates } from './ChainTemplates';
import { HeaderMenu } from '../HeaderMenu';
import { getLastSlotHoverSide } from './ChainSlot';

// Root parent ID (the implicit root group)
const ROOT_PARENT_ID = 0;

/**
 * Custom collision detection: prefer slot targets (drop-on-plugin for grouping)
 * over thin drop zones (reorder between plugins).
 * Slot targets have IDs like "slot:123", drop zones have "drop:0:1".
 */
const customCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    // Prefer slot targets (larger plugin slots) over thin drop zones
    const slotCollisions = pointerCollisions.filter(c => String(c.id).startsWith('slot:'));
    if (slotCollisions.length > 0) return slotCollisions;
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
    snapshots,
    activeSnapshot,
    saveSnapshot,
    recallSnapshot,
  } = useChainStore();

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [activeDragNode, setActiveDragNode] = useState<ChainNodeUI | null>(null);
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [groupSelectMode, setGroupSelectMode] = useState(false);

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
      } else if (['1', '2', '3'].includes(e.key)) {
        // Cmd+Shift+1/2/3 = save snapshot, Cmd+1/2/3 = recall snapshot
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (e.shiftKey) {
          saveSnapshot(idx);
        } else {
          recallSnapshot(idx);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo, selectedIds, createGroup, saveSnapshot, recallSnapshot]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
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
    } else if (overId.startsWith('slot:')) {
      // Dropped onto another plugin → create a group
      // Left half = serial, right half = parallel
      const targetNodeId = parseInt(overId.split(':')[1], 10);
      if (isNaN(targetNodeId) || targetNodeId === draggedNodeId) return;

      const mode = getLastSlotHoverSide() === 'left' ? 'serial' : 'parallel';
      await createGroup([targetNodeId, draggedNodeId], mode);
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

  // Click multi-select: always multi-select in group mode, otherwise require Ctrl/Cmd
  const handleNodeSelect = useCallback((e: React.MouseEvent, nodeId: number) => {
    if (groupSelectMode || e.ctrlKey || e.metaKey) {
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
  }, [selectNode, groupSelectMode]);

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
    <div className="relative flex flex-col h-full bg-plugin-surface rounded-lg overflow-hidden">
      {/* Unified Header Menu */}
      <HeaderMenu />

      {/* Chain Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-plugin-border">
        <div className="flex items-center gap-2">
          <Link2 className="w-3.5 h-3.5 text-plugin-accent" />
          <span className="text-xs font-medium text-plugin-muted">Chain</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Undo/Redo buttons with history depth badges */}
          <div className="relative">
            <button
              onClick={() => undo()}
              disabled={!canUndo()}
              className={`p-1 rounded transition-colors ${
                canUndo()
                  ? 'text-plugin-muted hover:text-plugin-text hover:bg-plugin-border/50'
                  : 'text-plugin-dim cursor-not-allowed'
              }`}
              title="Undo (⌘Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
          </div>
          <div className="relative">
            <button
              onClick={() => redo()}
              disabled={!canRedo()}
              className={`p-1 rounded transition-colors ${
                canRedo()
                  ? 'text-plugin-muted hover:text-plugin-text hover:bg-plugin-border/50'
                  : 'text-plugin-dim cursor-not-allowed'
              }`}
              title="Redo (⌘⇧Z)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* A/B/C Snapshots */}
          <div className="flex items-center gap-0.5 ml-1">
            {[0, 1, 2].map((i) => {
              const label = ['A', 'B', 'C'][i];
              const snapshot = snapshots[i];
              const isActive = activeSnapshot === i && snapshot != null;
              return (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey) {
                      saveSnapshot(i);
                    } else if (snapshot) {
                      recallSnapshot(i);
                    } else {
                      saveSnapshot(i);
                    }
                  }}
                  className={`
                    w-5 h-5 rounded text-[10px] font-bold transition-all
                    ${isActive
                      ? 'bg-plugin-accent text-white shadow-glow-accent'
                      : snapshot
                        ? 'bg-plugin-accent/15 text-plugin-accent border border-plugin-accent/30 hover:bg-plugin-accent/25'
                        : 'bg-plugin-border/50 text-plugin-dim hover:text-plugin-muted hover:bg-plugin-border'
                    }
                  `}
                  title={
                    snapshot
                      ? `${isActive ? 'Active snapshot' : 'Recall snapshot'} ${label} \u2022 Shift+click to overwrite \u2022 \u2318${i + 1}`
                      : `Save snapshot ${label} \u2022 \u2318\u21E7${i + 1}`
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Separator */}
          {totalPlugins > 0 && (
            <div className="w-px h-4 bg-plugin-border mx-1" />
          )}

          {/* Group select mode toggle */}
          {totalPlugins >= 2 && (
            <button
              onClick={() => {
                setGroupSelectMode(prev => !prev);
                if (groupSelectMode) setSelectedIds(new Set());
              }}
              className={`p-1 rounded transition-colors flex items-center gap-1 ${
                groupSelectMode
                  ? 'text-plugin-accent bg-plugin-accent/15 ring-1 ring-plugin-accent/30'
                  : 'text-plugin-muted hover:text-plugin-text hover:bg-plugin-border/50'
              }`}
              title="Group select mode — click plugins to select, then create group"
            >
              <MousePointer2 className="w-4 h-4" />
              <span className="text-[11px] font-medium">Group</span>
            </button>
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
          <ChainTemplates />
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
                groupSelectMode={groupSelectMode}
              />

              {/* Empty slot at bottom — always visible drop target */}
              <EmptySlot
                parentId={ROOT_PARENT_ID}
                insertIndex={nodes.length}
                isDragActive={isDragActive}
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

      {/* Floating action bar when 2+ nodes selected */}
      {selectedIds.size >= 2 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40 animate-slide-up">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-plugin-surface/95 border border-plugin-border shadow-[0_4px_24px_rgba(0,0,0,0.5)] backdrop-blur-sm">
            <span className="text-[11px] text-plugin-muted mr-1">
              {selectedIds.size} selected
            </span>
            <button
              onClick={() => handleCreateGroup('serial')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-plugin-serial/12 text-plugin-serial border border-plugin-serial/30 hover:bg-plugin-serial/20 transition-colors"
            >
              <Layers className="w-3.5 h-3.5" />
              Serial Group
              <kbd className="text-[9px] opacity-60 font-mono ml-1">⌘G</kbd>
            </button>
            <button
              onClick={() => handleCreateGroup('parallel')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-plugin-parallel/12 text-plugin-parallel border border-plugin-parallel/30 hover:bg-plugin-parallel/20 transition-colors"
            >
              <GitBranch className="w-3.5 h-3.5" />
              Parallel Group
              <kbd className="text-[9px] opacity-60 font-mono ml-1">⌘⇧G</kbd>
            </button>
            <button
              onClick={() => { setSelectedIds(new Set()); setGroupSelectMode(false); }}
              className="p-1 rounded text-plugin-muted hover:text-plugin-text hover:bg-plugin-border/50 transition-colors ml-1"
              title="Cancel"
            >
              <Plus className="w-3.5 h-3.5 rotate-45" />
            </button>
          </div>
        </div>
      )}

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

/**
 * Always-visible empty slot at the bottom of the chain.
 * Drop a plugin here to move it to the end.
 */
function EmptySlot({
  parentId,
  insertIndex,
  isDragActive,
}: {
  parentId: number;
  insertIndex: number;
  isDragActive: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `drop:${parentId}:${insertIndex}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={`
        mx-0 rounded-lg border-2 border-dashed transition-all duration-200
        flex items-center justify-center gap-2 cursor-default
        ${isOver && isDragActive
          ? 'border-plugin-accent bg-plugin-accent/10 py-4'
          : isDragActive
            ? 'border-plugin-border/70 bg-plugin-bg/30 py-3'
            : 'border-plugin-border/40 py-2.5'
        }
      `}
    >
      <Plus className={`w-3.5 h-3.5 ${
        isOver && isDragActive ? 'text-plugin-accent' : 'text-plugin-dim'
      }`} />
      <span className={`text-xs ${
        isOver && isDragActive
          ? 'text-plugin-accent'
          : 'text-plugin-dim'
      }`}>
        {isOver && isDragActive
          ? 'Drop here'
          : isDragActive
            ? 'Move to end'
            : 'Drag plugin here'
        }
      </span>
    </div>
  );
}

