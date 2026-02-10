import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  defaultDropAnimationSideEffects,
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
import { getLastSlotHoverSide, resetLastSlotHoverSide } from './ChainSlot';

// Root parent ID (the implicit root group)
const ROOT_PARENT_ID = 0;

/**
 * Custom collision detection: zone-based approach using pointer Y position.
 * - Top/bottom 25% of a slot → prefer drop: targets (reordering between plugins)
 * - Middle 50% of a slot → prefer slot: targets (grouping with this plugin)
 * This prevents the old problem where slots always won over drop zones.
 */
const customCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length === 0) {
    // Fall back to rect intersection for broader group targets
    return rectIntersection(args);
  }

  const slotCollisions = pointerCollisions.filter(c => String(c.id).startsWith('slot:'));
  const dropCollisions = pointerCollisions.filter(c => String(c.id).startsWith('drop:'));
  const groupCollisions = pointerCollisions.filter(c => String(c.id).startsWith('group:'));

  // If we're over a slot, use zone-based detection
  if (slotCollisions.length > 0 && dropCollisions.length > 0) {
    const slotId = slotCollisions[0].id;
    const slotRect = args.droppableRects.get(slotId);
    const pointerY = args.pointerCoordinates?.y;

    if (slotRect && pointerY != null) {
      const relY = (pointerY - slotRect.top) / slotRect.height;
      // Top 25% or bottom 25% → prefer reorder (drop zones)
      if (relY < 0.25 || relY > 0.75) {
        return dropCollisions;
      }
      // Middle 50% → prefer grouping (slot targets)
      return slotCollisions;
    }
  }

  // If only slots, return them
  if (slotCollisions.length > 0) return slotCollisions;
  // If only drops, return them
  if (dropCollisions.length > 0) return dropCollisions;
  // Group targets
  if (groupCollisions.length > 0) return groupCollisions;

  return pointerCollisions;
};

export function ChainEditor() {
  const {
    nodes,
    loading,
    fetchChainState,
    moveNode,
    createGroup,
    dissolveGroupSilent,
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
  const [disabledDropIds, setDisabledDropIds] = useState<Set<number>>(new Set());

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
      const dragNode = data.node as ChainNodeUI;
      const dragNodeId = data.nodeId as number;
      setActiveDragNode(dragNode);
      setActiveDragId(dragNodeId);

      // Bug 9: Reset stale hover side from previous drag
      resetLastSlotHoverSide();

      // Bug 4: Compute disabled drop IDs — the dragged node's entire subtree
      // to prevent dropping a group into itself or its descendants
      const disabled = new Set<number>();
      collectSubtreeIds(dragNode, disabled);
      setDisabledDropIds(disabled);
    }
  }, []);

  // Bug 6: Cancel handler — resets all drag state when Escape is pressed
  const handleDragCancel = useCallback(() => {
    setActiveDragNode(null);
    setActiveDragId(null);
    setDisabledDropIds(new Set());
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragNode(null);
    setActiveDragId(null);
    setDisabledDropIds(new Set());

    if (!over) return;

    // Parse node ID from active.id ("drag:{nodeId}") instead of active.data.current.
    // The dragged node unmounts during drag (filtered from ChainNodeList), which causes
    // active.data.current to become {} (dnd-kit issue #794). active.id is always reliable.
    const activeIdStr = String(active.id);
    if (!activeIdStr.startsWith('drag:')) return;
    const draggedNodeId = parseInt(activeIdStr.split(':')[1], 10);
    if (isNaN(draggedNodeId)) return;

    const overId = String(over.id);

    // Parse the droppable ID
    if (overId.startsWith('drop:')) {
      // Format: drop:{parentId}:{insertIndex}
      const parts = overId.split(':');
      const targetParentId = parseInt(parts[1], 10);
      let targetIndex = parseInt(parts[2], 10);

      if (isNaN(targetParentId) || isNaN(targetIndex)) return;

      // Bug 4: Prevent dropping into own subtree
      if (isAncestorOf(nodes, draggedNodeId, targetParentId)) return;

      // Check if shift is held for group creation
      if (shiftHeld) {
        const adjacentNodeId = findAdjacentNodeId(nodes, targetParentId, targetIndex);
        if (adjacentNodeId != null && adjacentNodeId !== draggedNodeId) {
          await createGroup([draggedNodeId, adjacentNodeId], 'parallel');
          return;
        }
      }

      // Bug 1: Same-parent index adjustment
      // The C++ backend extracts the node first, then inserts at the given index.
      // So if we're moving within the same parent and the source is before the target,
      // we need to subtract 1 because extraction shifts everything down.
      const sourceParent = findParentOf(nodes, draggedNodeId);
      const sourceParentId = sourceParent?.id ?? ROOT_PARENT_ID;
      const sourceIndex = findIndexInParent(nodes, draggedNodeId, sourceParentId);

      if (sourceParentId === targetParentId && sourceIndex !== -1) {
        // Bug 8: No-op detection — dropping in the same position
        if (sourceIndex === targetIndex || sourceIndex === targetIndex - 1) return;

        // Bug 1: Adjust for extraction
        if (sourceIndex < targetIndex) {
          targetIndex -= 1;
        }
      }

      await moveNode(draggedNodeId, targetParentId, targetIndex);

      // Bug 2: Read fresh state for auto-dissolve (not stale closure `nodes`)
      // Bug 3: Use dissolveGroupSilent to avoid double undo push
      const freshNodes = useChainStore.getState().nodes;
      if (sourceParent && sourceParent.type === 'group' && sourceParent.id !== ROOT_PARENT_ID) {
        const freshParent = findNodeById(freshNodes, sourceParent.id);
        if (freshParent && freshParent.type === 'group' && freshParent.children.length <= 1) {
          await dissolveGroupSilent(sourceParent.id);
        }
      }
    } else if (overId.startsWith('slot:')) {
      // Dropped onto another plugin → create a group
      const targetNodeId = parseInt(overId.split(':')[1], 10);
      if (isNaN(targetNodeId) || targetNodeId === draggedNodeId) return;

      // Bug 4: Prevent dropping group onto its own descendant
      if (isAncestorOf(nodes, draggedNodeId, targetNodeId)) return;

      const mode = getLastSlotHoverSide() === 'left' ? 'serial' : 'parallel';
      await createGroup([targetNodeId, draggedNodeId], mode);
    } else if (overId.startsWith('group:')) {
      // Dropped onto a group container → append to end
      const targetGroupId = parseInt(overId.split(':')[1], 10);
      if (isNaN(targetGroupId)) return;

      // Bug 7: Prevent dropping a group onto itself
      if (targetGroupId === draggedNodeId) return;
      // Bug 4: Prevent dropping into own subtree
      if (isAncestorOf(nodes, draggedNodeId, targetGroupId)) return;

      // Find the group to determine insert index
      const targetGroup = findNodeById(nodes, targetGroupId);
      let insertIndex = targetGroup?.type === 'group' ? targetGroup.children.length : 0;

      // Bug 1: Same-parent index adjustment for group targets too
      const sourceParent = findParentOf(nodes, draggedNodeId);
      const sourceParentId = sourceParent?.id ?? ROOT_PARENT_ID;

      if (sourceParentId === targetGroupId) {
        const sourceIndex = findIndexInParent(nodes, draggedNodeId, targetGroupId);
        // Bug 8: No-op if already at the end
        if (sourceIndex === insertIndex - 1) return;
        if (sourceIndex !== -1 && sourceIndex < insertIndex) {
          insertIndex -= 1;
        }
      }

      await moveNode(draggedNodeId, targetGroupId, insertIndex);

      // Bug 2 & 3: Fresh state auto-dissolve with silent history
      const freshNodes = useChainStore.getState().nodes;
      if (sourceParent && sourceParent.type === 'group' && sourceParent.id !== ROOT_PARENT_ID) {
        const freshParent = findNodeById(freshNodes, sourceParent.id);
        if (freshParent && freshParent.type === 'group' && freshParent.children.length <= 1) {
          await dissolveGroupSilent(sourceParent.id);
        }
      }
    }
  }, [nodes, moveNode, createGroup, dissolveGroupSilent, shiftHeld]);

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

  // Compute 1-based DFS slot numbers for all plugins
  const slotNumbers = useMemo(() => computeSlotNumbers(nodes), [nodes]);

  return (
    <div className="relative flex flex-col h-full overflow-hidden">

      {/* Unified Header Menu — save/load/browse/chain name */}
      <HeaderMenu />

      {/* Chain Toolbar */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-plugin-border/30">
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
              <MousePointer2 className="w-3.5 h-3.5" />
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

          <span className="text-[10px] font-mono uppercase text-plugin-dim ml-1">
            {totalPlugins}
          </span>
        </div>
      </div>

      {/* Chain */}
      <div
        className="flex-1 overflow-y-auto p-2 chain-scrollbar"
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
            onDragCancel={handleDragCancel}
          >
            <div className="space-y-2">
              {/* Input indicator */}
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-plugin-muted">
                <div className="w-2 h-2 rounded-full bg-plugin-success" />
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
                disabledDropIds={disabledDropIds}
                slotNumbers={slotNumbers}
              />

              {/* Empty slot at bottom — always visible drop target */}
              <EmptySlot
                parentId={ROOT_PARENT_ID}
                insertIndex={nodes.length}
                isDragActive={isDragActive}
              />

              {/* Output indicator */}
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-plugin-muted">
                <div className="w-2 h-2 rounded-full bg-plugin-accent" />
                Audio Output
              </div>
            </div>

            {/* Drag overlay - follows cursor */}
            <DragOverlay dropAnimation={{
              duration: 200,
              easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
              keyframes({ transform: { initial } }) {
                return [
                  { transform: `translate3d(${initial.x}px, ${initial.y}px, 0) scale(1)`, opacity: '1' },
                  { transform: `translate3d(${initial.x}px, ${initial.y}px, 0) scale(0.92)`, opacity: '0' },
                ];
              },
              sideEffects: defaultDropAnimationSideEffects({
                styles: { active: { opacity: '0.5' } },
              }),
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
            <Layers className="w-4 h-4 text-plugin-serial" />
            Create Serial Group
            <span className="ml-auto text-xxs text-plugin-muted">⌘G</span>
          </button>
          <button
            onClick={() => handleCreateGroup('parallel')}
            className="w-full px-3 py-1.5 text-left text-sm text-plugin-text hover:bg-plugin-border/50 flex items-center gap-2"
          >
            <GitBranch className="w-4 h-4 text-plugin-parallel" />
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

/**
 * Find the index of a node within its parent's children array.
 * Returns -1 if not found.
 */
function findIndexInParent(allNodes: ChainNodeUI[], nodeId: number, parentId: number): number {
  const parentChildren = parentId === 0
    ? allNodes
    : (() => {
        const parent = findNodeById(allNodes, parentId);
        return parent?.type === 'group' ? parent.children : [];
      })();

  return parentChildren.findIndex(n => n.id === nodeId);
}

/**
 * Check if potentialAncestorId is an ancestor of (or equal to) targetId in the tree.
 * Used to prevent dropping a group into itself or its descendants.
 */
function isAncestorOf(nodes: ChainNodeUI[], potentialAncestorId: number, targetId: number): boolean {
  if (potentialAncestorId === targetId) return true;
  const ancestor = findNodeById(nodes, potentialAncestorId);
  if (!ancestor || ancestor.type !== 'group') return false;
  // Search the ancestor's subtree for targetId
  for (const child of ancestor.children) {
    if (containsNodeId(child, targetId)) return true;
  }
  return false;
}

/** Check if a node or any of its descendants has the given ID */
function containsNodeId(node: ChainNodeUI, targetId: number): boolean {
  if (node.id === targetId) return true;
  if (node.type === 'group') {
    for (const child of node.children) {
      if (containsNodeId(child, targetId)) return true;
    }
  }
  return false;
}

/**
 * Collect all node IDs in a subtree (including the root node itself).
 * Used to build the set of disabled drop target IDs.
 */
function collectSubtreeIds(node: ChainNodeUI, ids: Set<number>): void {
  ids.add(node.id);
  if (node.type === 'group') {
    for (const child of node.children) {
      collectSubtreeIds(child, ids);
    }
  }
}

/**
 * Compute a map of nodeId → 1-based DFS slot number for all plugin nodes.
 */
function computeSlotNumbers(nodes: ChainNodeUI[]): Map<number, number> {
  const map = new Map<number, number>();
  let counter = 1;
  function dfs(nodes: ChainNodeUI[]) {
    for (const node of nodes) {
      if (node.type === 'plugin') {
        map.set(node.id, counter++);
      } else if (node.type === 'group') {
        dfs(node.children);
      }
    }
  }
  dfs(nodes);
  return map;
}

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

  const handleClick = useCallback(() => {
    if (!isDragActive) {
      window.dispatchEvent(new Event('openPluginBrowser'));
    }
  }, [isDragActive]);

  return (
    <div
      ref={setNodeRef}
      onClick={handleClick}
      className={`
        mx-0 rounded-lg border-2 border-dashed transition-all duration-200
        flex items-center justify-center gap-2
        ${isOver && isDragActive
          ? 'border-plugin-accent bg-plugin-accent/10 py-4 cursor-default'
          : isDragActive
            ? 'border-plugin-border/70 bg-plugin-bg/30 py-3 cursor-default'
            : 'border-plugin-border/40 py-2.5 cursor-pointer hover:border-plugin-accent/40 hover:bg-plugin-accent/5'
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
            : 'Add plugin'
        }
      </span>
    </div>
  );
}

