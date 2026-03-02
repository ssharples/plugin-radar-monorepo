import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  defaultDropAnimationSideEffects,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
  pointerWithin,
  rectIntersection,
  closestCenter,
  type CollisionDetection,
} from '@dnd-kit/core';
import { Layers, GitBranch, Undo2, Redo2, Power, Plus } from 'lucide-react';
import { useChainStore, useChainActions } from '../../stores/chainStore';
import { useChainEditorShortcuts } from '../../hooks/useChainEditorShortcuts';
import { juceBridge } from '../../api/juce-bridge';
import type { ChainNodeUI, GainSettings } from '../../api/types';
import { ChainNodeList } from './ChainNodeList';
import { DragPreview } from './DragPreview';
import { MirrorIndicator } from './MirrorIndicator';
import { HeaderMenu } from '../HeaderMenu';
import { EmptyStateKit } from './EmptyStateKit';
import { LatencyDisplay } from './LatencyDisplay';
import { InstancesBadge } from './InstancesBadge';
import { EmptySlot } from './EmptySlot';
import { ContextMenu, buildEmptySpaceMenu } from '../ContextMenu';
import { MiniPluginBrowser } from '../MiniPluginBrowser';
import { Knob } from '../Knob';
import { findNodeById, computeSlotNumbers, countPluginsInTree, findIndexInParent, isAncestorOf, collectSubtreeIds, findParentOf } from '../../utils/chainHelpers';
import { formatTimeAgo } from '../../utils/timeFormatting';

// Root parent ID (the implicit root group)
const ROOT_PARENT_ID = 0;

/**
 * Simplified collision detection: prefer drop zones, then groups.
 * No slot-based group creation - that's handled by hover buttons now.
 *
 * IMPORTANT: dnd-kit's collision detection runs BEFORE checking the disabled flag,
 * so we don't need to manually filter out disabled droppables here - they're
 * automatically excluded by dnd-kit's core logic after collision detection.
 */

const customCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length === 0) {
    return rectIntersection(args);
  }

  const dropCollisions = pointerCollisions.filter(c => String(c.id).startsWith('drop:'));
  const groupCollisions = pointerCollisions.filter(c => String(c.id).startsWith('group:'));

  // Prefer drop zones for reordering
  if (dropCollisions.length === 1) return dropCollisions;
  if (dropCollisions.length > 1) {
    // Multiple overlapping drop zones — use closestCenter as tiebreaker
    // to pick a single deterministic result and prevent flickering
    const dropIds = new Set(dropCollisions.map(c => c.id));
    const filtered = args.droppableContainers.filter(c => dropIds.has(c.id));
    return closestCenter({ ...args, droppableContainers: filtered });
  }
  // Then group targets
  if (groupCollisions.length > 0) return groupCollisions;

  return pointerCollisions;
};

export function ChainEditor() {
  const nodes = useChainStore(s => s.nodes);
  const loading = useChainStore(s => s.loading);
  const snapshots = useChainStore(s => s.snapshots);
  const activeSnapshot = useChainStore(s => s.activeSnapshot);
  const toastMessage = useChainStore(s => s.toastMessage);
  const formatSubstitutions = useChainStore(s => s.formatSubstitutions);
  const pluginClipboard = useChainStore(s => s.pluginClipboard);

  const {
    fetchChainState, moveNode, createGroup, dissolveGroupSilent,
    selectNode, undo, redo, canUndo, canRedo, saveSnapshot, recallSnapshot,
    openInlineEditor, addPluginToGroup,
  } = useChainActions();

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuType, setContextMenuType] = useState<'multiselect' | 'empty'>('multiselect');
  const [activeDragNode, setActiveDragNode] = useState<ChainNodeUI | null>(null);
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const [activeBrowserPlugin, setActiveBrowserPlugin] = useState<{ name: string; manufacturer: string } | null>(null);
  const [groupSelectMode, setGroupSelectMode] = useState(false);
  const [disabledDropIds, setDisabledDropIds] = useState<Set<number>>(new Set());
  const [sourceGroupId, setSourceGroupId] = useState<number | null>(null);
  const [dissolvingGroupId, setDissolvingGroupId] = useState<number | null>(null);
  const [snapshotToast, setSnapshotToast] = useState<string | null>(null);

  // Auto-scroll during drag
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollRafRef = useRef<number | null>(null);

  // Chain-level toggle state
  const [bypassState, setBypassState] = useState<{ allBypassed: boolean; anyBypassed: boolean }>({ allBypassed: false, anyBypassed: false });

  // I/O controls state (moved from Footer)
  const [inputGain, setInputGain] = useState(0);
  const [outputGain, setOutputGain] = useState(0);
  const [masterDryWet, setMasterDryWet] = useState(100);
  // Mini browser collapse state
  const [browserCollapsed, setBrowserCollapsed] = useState(false);

  // Register keyboard shortcuts via centralized manager
  useChainEditorShortcuts({
    undo,
    redo,
    canUndo,
    canRedo,
    selectedIds,
    createGroup,
    clearSelection: () => setSelectedIds(new Set()),
    saveSnapshot,
    recallSnapshot,
    openInlineEditor,
  });

  useEffect(() => {
    fetchChainState();
    // Fetch initial toggle states
    juceBridge.getAllBypassState().then(setBypassState).catch(() => { });
  }, [fetchChainState]);

  // I/O controls: load initial settings
  useEffect(() => {
    juceBridge.getGainSettings().then((settings: GainSettings) => {
      setInputGain(settings.inputGainDB);
      setOutputGain(settings.outputGainDB);
    }).catch(() => { });
    juceBridge.getMasterDryWet().then((mix: number) => {
      setMasterDryWet(mix * 100);
    }).catch(() => { });
  }, []);

  // I/O controls: subscribe to gain changed events (from autoCalibrate or match lock)
  useEffect(() => {
    const unsub = juceBridge.onGainChanged((data) => {
      if (data.inputGainDB !== undefined) setInputGain(data.inputGainDB);
      if (data.outputGainDB !== undefined) setOutputGain(data.outputGainDB);
    });
    return unsub;
  }, []);

  // I/O controls: subscribe to master dry/wet changed events (from snapshot restore)
  useEffect(() => {
    return juceBridge.onMasterDryWetChanged((data) => {
      setMasterDryWet(data.mix * 100);
    });
  }, []);

  // I/O control handlers
  const handleInputGainChange = useCallback((value: number) => {
    setInputGain(value);
    juceBridge.setInputGain(value);
  }, []);

  const handleOutputGainChange = useCallback((value: number) => {
    setOutputGain(value);
    juceBridge.setOutputGain(value);
  }, []);

  const handleMasterDryWetChange = useCallback((value: number) => {
    setMasterDryWet(value);
    juceBridge.setMasterDryWet(value / 100);
  }, []);

  // Listen for browser overlay open/close to collapse mini browser
  useEffect(() => {
    const handleBrowserOpen = () => setBrowserCollapsed(true);
    const handleBrowserClose = () => setBrowserCollapsed(false);
    window.addEventListener('openPluginBrowser', handleBrowserOpen);
    window.addEventListener('closePluginBrowser', handleBrowserClose);
    return () => {
      window.removeEventListener('openPluginBrowser', handleBrowserOpen);
      window.removeEventListener('closePluginBrowser', handleBrowserClose);
    };
  }, []);

  // Snapshot toast notifications
  useEffect(() => {
    const handleSnapshotSaved = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setSnapshotToast(`Snapshot ${detail.label} saved`);
      setTimeout(() => setSnapshotToast(null), 2000);
    };

    const handleSnapshotRecalled = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setSnapshotToast(`Snapshot ${detail.label} recalled`);
      setTimeout(() => setSnapshotToast(null), 1500);
    };

    const handleSnapshotError = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setSnapshotToast(detail.message);
      setTimeout(() => setSnapshotToast(null), 2500);
    };

    window.addEventListener('snapshot-saved', handleSnapshotSaved);
    window.addEventListener('snapshot-recalled', handleSnapshotRecalled);
    window.addEventListener('snapshot-error', handleSnapshotError);

    return () => {
      window.removeEventListener('snapshot-saved', handleSnapshotSaved);
      window.removeEventListener('snapshot-recalled', handleSnapshotRecalled);
      window.removeEventListener('snapshot-error', handleSnapshotError);
    };
  }, []);

  const handleToggleAllBypass = useCallback(async () => {
    try {
      const result = await juceBridge.toggleAllBypass();
      setBypassState({ allBypassed: result.allBypassed, anyBypassed: result.anyBypassed });
    } catch { /* ignore */ }
  }, []);



  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // DnD handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current;

    // Browser plugin drag
    if (data?.type === 'browser-plugin' && data?.plugin) {
      setActiveBrowserPlugin({ name: data.plugin.name, manufacturer: data.plugin.manufacturer });
      return;
    }

    if (data?.node) {
      const dragNode = data.node as ChainNodeUI;
      const dragNodeId = data.nodeId as number;
      setActiveDragNode(dragNode);
      setActiveDragId(dragNodeId);

      // Track source group for "detach" visual effect
      const parent = findParentOf(nodes, dragNodeId);
      setSourceGroupId(parent && parent.id !== ROOT_PARENT_ID ? parent.id : null);

      // Bug 4: Compute disabled drop IDs — the dragged node's entire subtree
      // to prevent dropping a group into itself or its descendants
      const disabled = new Set<number>();
      collectSubtreeIds(dragNode, disabled);
      setDisabledDropIds(disabled);
    }
  }, [nodes]);

  // Bug 6: Cancel handler — resets all drag state when Escape is pressed
  const handleDragCancel = useCallback(() => {
    setActiveDragNode(null);
    setActiveDragId(null);
    setActiveBrowserPlugin(null);
    setDisabledDropIds(new Set());
    setSourceGroupId(null);
    if (autoScrollRafRef.current) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);

  // Auto-scroll when dragging near the top/bottom edges of the scroll container
  const SCROLL_EDGE_PX = 60;
  const SCROLL_MAX_SPEED = 12;
  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Cancel any pending scroll frame
    if (autoScrollRafRef.current) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }

    // Get pointer Y relative to the scroll container
    const rect = container.getBoundingClientRect();
    const pointerY = (event.activatorEvent as PointerEvent).clientY + (event.delta?.y ?? 0);
    const distFromTop = pointerY - rect.top;
    const distFromBottom = rect.bottom - pointerY;

    let scrollSpeed = 0;
    if (distFromTop < SCROLL_EDGE_PX && distFromTop >= 0) {
      // Scroll up — speed proportional to proximity
      scrollSpeed = -SCROLL_MAX_SPEED * (1 - distFromTop / SCROLL_EDGE_PX);
    } else if (distFromBottom < SCROLL_EDGE_PX && distFromBottom >= 0) {
      // Scroll down
      scrollSpeed = SCROLL_MAX_SPEED * (1 - distFromBottom / SCROLL_EDGE_PX);
    }

    if (scrollSpeed !== 0) {
      const doScroll = () => {
        container.scrollBy(0, scrollSpeed);
        autoScrollRafRef.current = requestAnimationFrame(doScroll);
      };
      autoScrollRafRef.current = requestAnimationFrame(doScroll);
    }
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    try {
      const { active, over } = event;
      setActiveDragNode(null);
      setActiveDragId(null);
      setActiveBrowserPlugin(null);
      setDisabledDropIds(new Set());
      setSourceGroupId(null);
      if (autoScrollRafRef.current) {
        cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = null;
      }

      if (!over) return;

      // Parse node ID from active.id ("drag:{nodeId}") instead of active.data.current.
      // The dragged node unmounts during drag (filtered from ChainNodeList), which causes
      // active.data.current to become {} (dnd-kit issue #794). active.id is always reliable.
      const activeIdStr = String(active.id);
      if (!activeIdStr.startsWith('drag:')) return;

      // Handle browser-plugin drags (drag:browser:{uid})
      if (activeIdStr.startsWith('drag:browser:')) {
        const plugin = active.data.current?.plugin;
        if (!plugin || !over) return;
        const overId = String(over.id);
        if (overId.startsWith('drop:')) {
          const parts = overId.split(':');
          const parentId = parseInt(parts[1], 10);
          const insertIndex = parseInt(parts[2], 10);
          if (!isNaN(parentId) && !isNaN(insertIndex)) {
            await addPluginToGroup(plugin.fileOrIdentifier, parentId, insertIndex);
          }
        } else if (overId.startsWith('group:')) {
          const groupId = parseInt(overId.split(':')[1], 10);
          if (!isNaN(groupId)) {
            const freshState = useChainStore.getState().nodes;
            const targetGroup = findNodeById(freshState, groupId);
            const insertIdx = targetGroup?.type === 'group' ? targetGroup.children.length : 0;
            await addPluginToGroup(plugin.fileOrIdentifier, groupId, insertIdx);
          }
        }
        return;
      }

      const draggedNodeId = parseInt(activeIdStr.split(':')[1], 10);
      if (isNaN(draggedNodeId)) return;

      // P2-9: Always read fresh state to avoid stale closure over `nodes`
      const freshState = useChainStore.getState().nodes;

      // Safety: Verify the dragged node exists in the tree
      const draggedNode = findNodeById(freshState, draggedNodeId);
      if (!draggedNode) {
        return;
      }

      const overId = String(over.id);

      // Parse the droppable ID
      if (overId.startsWith('drop:')) {
        // Format: drop:{parentId}:{insertIndex}
        const parts = overId.split(':');
        const targetParentId = parseInt(parts[1], 10);
        let targetIndex = parseInt(parts[2], 10);

        if (isNaN(targetParentId) || isNaN(targetIndex)) return;

        // Bug 4: Prevent dropping into own subtree
        if (isAncestorOf(freshState, draggedNodeId, targetParentId)) return;

        // Bug 1: Same-parent index adjustment
        // The C++ backend extracts the node first, then inserts at the given index.
        // So if we're moving within the same parent and the source is before the target,
        // we need to subtract 1 because extraction shifts everything down.
        const sourceParent = findParentOf(freshState, draggedNodeId);
        const sourceParentId = sourceParent?.id ?? ROOT_PARENT_ID;
        const sourceIndex = findIndexInParent(freshState, draggedNodeId, sourceParentId);

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
        // P2-10: Wrap dissolve in try-catch for error resilience
        try {
          const postMoveNodes = useChainStore.getState().nodes;
          if (sourceParent && sourceParent.type === 'group' && sourceParent.id !== ROOT_PARENT_ID) {
            const freshParent = findNodeById(postMoveNodes, sourceParent.id);
            if (freshParent && freshParent.type === 'group' && freshParent.children.length <= 1) {
              // Animate collapse, then dissolve
              setDissolvingGroupId(sourceParent.id);
              await new Promise(r => setTimeout(r, 200));
              setDissolvingGroupId(null);
              await dissolveGroupSilent(sourceParent.id);
            }
          }
        } catch {
          setDissolvingGroupId(null);
        }
      } else if (overId.startsWith('group:')) {
        // Dropped onto a group container → append to end
        const targetGroupId = parseInt(overId.split(':')[1], 10);
        if (isNaN(targetGroupId)) return;

        // Bug 7: Prevent dropping a group onto itself
        if (targetGroupId === draggedNodeId) return;
        // Bug 4: Prevent dropping into own subtree
        if (isAncestorOf(freshState, draggedNodeId, targetGroupId)) return;

        // Find the group to determine insert index
        const targetGroup = findNodeById(freshState, targetGroupId);
        let insertIndex = targetGroup?.type === 'group' ? targetGroup.children.length : 0;

        // Bug 1: Same-parent index adjustment for group targets too
        const sourceParent = findParentOf(freshState, draggedNodeId);
        const sourceParentId = sourceParent?.id ?? ROOT_PARENT_ID;

        if (sourceParentId === targetGroupId) {
          const sourceIndex = findIndexInParent(freshState, draggedNodeId, targetGroupId);
          // Bug 8: No-op if already at the end
          if (sourceIndex === insertIndex - 1) return;
          if (sourceIndex !== -1 && sourceIndex < insertIndex) {
            insertIndex -= 1;
          }
        }

        await moveNode(draggedNodeId, targetGroupId, insertIndex);

        // Bug 2 & 3: Fresh state auto-dissolve with silent history
        // P2-10: Wrap dissolve in try-catch for error resilience
        try {
          const postMoveNodes = useChainStore.getState().nodes;
          if (sourceParent && sourceParent.type === 'group' && sourceParent.id !== ROOT_PARENT_ID) {
            const freshParent = findNodeById(postMoveNodes, sourceParent.id);
            if (freshParent && freshParent.type === 'group' && freshParent.children.length <= 1) {
              // Animate collapse, then dissolve
              setDissolvingGroupId(sourceParent.id);
              await new Promise(r => setTimeout(r, 200));
              setDissolvingGroupId(null);
              await dissolveGroupSilent(sourceParent.id);
            }
          }
        } catch {
          setDissolvingGroupId(null);
        }
      }
    } catch (error) {
      // Reset drag state on error to prevent UI from getting stuck
      setActiveDragNode(null);
      setActiveDragId(null);
      setActiveBrowserPlugin(null);
      setDisabledDropIds(new Set());
    }
  }, [moveNode, dissolveGroupSilent, addPluginToGroup]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (selectedIds.size >= 2) {
      setContextMenuType('multiselect');
      setContextMenu({ x: e.clientX, y: e.clientY });
    } else {
      // Empty space context menu
      setContextMenuType('empty');
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
  const isDragActive = activeDragNode !== null || activeBrowserPlugin !== null;

  // Compute 1-based DFS slot numbers for all plugins
  const slotNumbers = useMemo(() => computeSlotNumbers(nodes), [nodes]);

  return (
    <div className="relative flex flex-col h-full overflow-hidden">

      {/* Unified Header Menu — save/load/browse/chain name */}
      <HeaderMenu />

      {/* Chain Toolbar — cyber control panel */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{
          background: 'var(--color-bg-secondary)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <div className="flex items-center gap-1">
          {/* Undo/Redo buttons */}
          <div className="relative">
            <button
              onClick={() => undo()}
              disabled={!canUndo()}
              className="p-1 rounded"
              style={{
                color: canUndo() ? 'var(--color-text-secondary)' : 'var(--color-text-disabled)',
                transition: 'all var(--duration-fast) var(--ease-snap)',
                cursor: canUndo() ? 'pointer' : 'not-allowed',
              }}
              onMouseEnter={(e) => { if (canUndo()) { e.currentTarget.style.color = 'var(--color-accent-cyan)'; e.currentTarget.style.background = 'rgba(222, 255, 10, 0.1)'; } }}
              onMouseLeave={(e) => { e.currentTarget.style.color = canUndo() ? 'var(--color-text-secondary)' : 'var(--color-text-disabled)'; e.currentTarget.style.background = 'transparent'; }}
              title="Undo (⌘Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
          </div>
          <div className="relative">
            <button
              onClick={() => redo()}
              disabled={!canRedo()}
              className="p-1 rounded"
              style={{
                color: canRedo() ? 'var(--color-text-secondary)' : 'var(--color-text-disabled)',
                transition: 'all var(--duration-fast) var(--ease-snap)',
                cursor: canRedo() ? 'pointer' : 'not-allowed',
              }}
              onMouseEnter={(e) => { if (canRedo()) { e.currentTarget.style.color = 'var(--color-accent-cyan)'; e.currentTarget.style.background = 'rgba(222, 255, 10, 0.1)'; } }}
              onMouseLeave={(e) => { e.currentTarget.style.color = canRedo() ? 'var(--color-text-secondary)' : 'var(--color-text-disabled)'; e.currentTarget.style.background = 'transparent'; }}
              title="Redo (⌘⇧Z)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* A/B/C/D Snapshots — neon glow when active */}
          <div className="flex items-center gap-0.5 ml-1">
            {[0, 1, 2, 3].map((i) => {
              const label = ['A', 'B', 'C', 'D'][i];
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
                  className="w-5 h-5 rounded text-[10px] font-bold"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: 'var(--tracking-wide)',
                    transition: 'all var(--duration-fast) var(--ease-snap)',
                    background: isActive
                      ? 'var(--color-accent-cyan)'
                      : snapshot
                        ? 'rgba(222, 255, 10, 0.12)'
                        : 'var(--color-bg-elevated)',
                    color: isActive
                      ? 'var(--color-bg-primary)'
                      : snapshot
                        ? 'var(--color-accent-cyan)'
                        : 'var(--color-text-disabled)',
                    border: snapshot && !isActive
                      ? '1px solid rgba(222, 255, 10, 0.3)'
                      : '1px solid var(--color-border-default)',
                    boxShadow: isActive
                      ? '0 0 12px rgba(222, 255, 10, 0.6), 0 0 4px rgba(222, 255, 10, 0.3)'
                      : 'none',
                  }}
                  title={
                    snapshot
                      ? `${isActive ? 'Active snapshot' : 'Recall snapshot'} ${label} \u2022 Saved ${formatTimeAgo(snapshot.savedAt)} \u2022 Shift+click to overwrite \u2022 \u2318\u2325${i + 1}`
                      : `Save snapshot ${label} \u2022 \u2318\u2325\u21E7${i + 1}`
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Toggle All Bypass */}
          {totalPlugins > 0 && (
            <button
              onClick={handleToggleAllBypass}
              className="p-1 rounded"
              style={{
                color: bypassState.allBypassed
                  ? 'var(--color-status-error)'
                  : bypassState.anyBypassed
                    ? 'var(--color-status-warning)'
                    : 'var(--color-status-active)',
                background: bypassState.allBypassed
                  ? 'rgba(255, 0, 51, 0.12)'
                  : 'transparent',
                transition: 'all var(--duration-fast) var(--ease-snap)',
              }}
              title={
                bypassState.allBypassed
                  ? 'Enable all plugins'
                  : 'Bypass all plugins'
              }
            >
              <Power className="w-3.5 h-3.5" />
            </button>
          )}



          <span
            className="text-[10px] uppercase ml-1"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-tertiary)',
              letterSpacing: 'var(--tracking-wide)',
            }}
          >
            {totalPlugins}
          </span>
        </div>

        {/* I/O controls — fills toolbar gap */}
        <div className="flex-1 flex items-center justify-center gap-3 mx-2" style={{ minWidth: 0 }}>
          {/* Input gain knob */}
          <div className="flex items-center gap-1">
            <Knob
              value={inputGain}
              onChange={handleInputGainChange}
              size={20}
              min={-24}
              max={24}
              defaultValue={0}
              hideLabel
            />
            <span style={{ fontSize: '7px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>IN</span>
          </div>

          {/* Dry/Wet knob */}
          <div className="flex items-center gap-1">
            <Knob
              value={masterDryWet}
              onChange={handleMasterDryWetChange}
              size={20}
              min={0}
              max={100}
              defaultValue={100}
              formatValue={(v) => `${Math.round(v)}%`}
              hideLabel
            />
            <span style={{ fontSize: '7px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>D/W</span>
          </div>

          {/* Output gain knob */}
          <div className="flex items-center gap-1">
            <Knob
              value={outputGain}
              onChange={handleOutputGainChange}
              size={20}
              min={-24}
              max={24}
              defaultValue={0}
              hideLabel
            />
            <span style={{ fontSize: '7px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>OUT</span>
          </div>
        </div>

        {/* Right side: latency, instances, mirror */}
        <div className="flex items-center gap-2">
          <LatencyDisplay />
          <InstancesBadge />
          <MirrorIndicator />
        </div>
      </div>

      {/* DndContext wraps both chain area and mini browser for cross-drag */}
      <DndContext
        sensors={sensors}
        collisionDetection={customCollisionDetection}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* Chain */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-2 chain-scrollbar"
          onContextMenu={handleContextMenu}
          onClick={() => { selectNode(null); setSelectedIds(new Set()); }}
        >
          {loading && !hasNodes ? (
            <div
              className="flex items-center justify-center h-32"
              style={{
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--text-sm)',
                letterSpacing: 'var(--tracking-wide)',
              }}
            >
              Loading...
            </div>
          ) : !hasNodes ? (
            <EmptyStateKit onOpenFullBrowser={() => window.dispatchEvent(new Event('openPluginBrowser'))} />
          ) : (
            <div className="space-y-2">
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
                groupSelectMode={groupSelectMode}
                disabledDropIds={disabledDropIds}
                slotNumbers={slotNumbers}
                sourceGroupId={sourceGroupId}
                dissolvingGroupId={dissolvingGroupId}
              />

              {/* Empty slot at bottom — always visible drop target */}
              <EmptySlot
                parentId={ROOT_PARENT_ID}
                insertIndex={nodes.length}
                isDragActive={isDragActive}
              />
            </div>
          )}
        </div>

        {/* Mini Plugin Browser — replaces Footer */}
        <div
          className="flex-shrink-0 relative z-[1]"
          style={{
            height: browserCollapsed ? 0 : 72,
            opacity: browserCollapsed ? 0 : 1,
            overflow: 'hidden',
            transition: 'height 200ms ease, opacity 150ms ease',
          }}
        >
          <MiniPluginBrowser />
        </div>

        {/* Drag overlay - follows cursor */}
        <DragOverlay dropAnimation={{
          duration: 300,
          easing: 'cubic-bezier(0.32, 1.6, 0.56, 1)', // Overshoot spring
          keyframes({ transform: { initial, final } }) {
            return [
              { transform: initial, opacity: '0.9' },
              { transform: `${final} scale(1.03)`, opacity: '0.6', offset: 0.6 },
              { transform: `${final} scale(1)`, opacity: '0' },
            ];
          },
          sideEffects: defaultDropAnimationSideEffects({
            styles: { active: { opacity: '0.4' } },
          }),
        }}>
          {activeDragNode ? (
            <DragPreview node={activeDragNode} />
          ) : activeBrowserPlugin ? (
            <DragPreview browserPlugin={activeBrowserPlugin} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Floating action bar when 2+ nodes selected */}
      {selectedIds.size >= 2 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40 slide-in">
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
            style={{
              background: 'rgba(15, 15, 15, 0.95)',
              border: '1px solid var(--color-border-strong)',
              boxShadow: 'var(--shadow-elevated)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <span
              className="text-[11px] mr-1"
              style={{
                color: 'var(--color-text-secondary)',
                letterSpacing: 'var(--tracking-wide)',
              }}
            >
              {selectedIds.size} selected
            </span>
            <button
              onClick={() => handleCreateGroup('serial')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold"
              style={{
                letterSpacing: 'var(--tracking-wide)',
                background: 'rgba(255, 170, 0, 0.1)',
                color: 'var(--color-status-warning)',
                border: '1px solid rgba(255, 170, 0, 0.3)',
                transition: 'all var(--duration-fast) var(--ease-snap)',
              }}
            >
              <Layers className="w-3.5 h-3.5" />
              Serial
              <kbd
                className="text-micro font-mono ml-1"
                style={{
                  color: 'var(--color-text-tertiary)',
                }}
              >
                ⌘G
              </kbd>
            </button>
            <button
              onClick={() => handleCreateGroup('parallel')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold"
              style={{
                letterSpacing: 'var(--tracking-wide)',
                background: 'rgba(222, 255, 10, 0.1)',
                color: 'var(--color-accent-cyan)',
                border: '1px solid rgba(222, 255, 10, 0.3)',
                transition: 'all var(--duration-fast) var(--ease-snap)',
              }}
            >
              <GitBranch className="w-3.5 h-3.5" />
              Parallel
              <kbd
                className="text-micro font-mono ml-1"
                style={{
                  color: 'var(--color-text-tertiary)',
                }}
              >
                ⌘⇧G
              </kbd>
            </button>
            <button
              onClick={() => { setSelectedIds(new Set()); setGroupSelectMode(false); }}
              className="p-1 rounded ml-1"
              style={{
                color: 'var(--color-text-secondary)',
                transition: 'all var(--duration-fast) var(--ease-snap)',
              }}
              title="Cancel"
            >
              <Plus className="w-3.5 h-3.5 rotate-45" />
            </button>
          </div>
        </div>
      )}

      {/* Context menu — multi-select group creation OR empty space actions */}
      {contextMenu && contextMenuType === 'multiselect' && selectedIds.size >= 2 && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              id: 'create-serial',
              label: 'Create Serial Group',
              shortcut: '\u2318G',
              action: () => handleCreateGroup('serial'),
            },
            {
              id: 'create-parallel',
              label: 'Create Parallel Group',
              shortcut: '\u2318\u21E7G',
              action: () => handleCreateGroup('parallel'),
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}

      {contextMenu && contextMenuType === 'empty' && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildEmptySpaceMenu(
            {
              hasClipboard: !!pluginClipboard,
              hasNodes: nodes.length > 0,
            },
            {
              addPlugin: () => window.dispatchEvent(new Event('openPluginBrowser')),
              pastePlugin: () => {
                // Paste not applicable to empty space in current model
              },
              importChain: () => juceBridge.importChain({}),
              createSerialGroup: () => createGroup([], 'serial'),
              createParallelGroup: () => createGroup([], 'parallel'),
            },
          )}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Snapshot toast notification */}
      {snapshotToast && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
          <div
            className="px-4 py-2 rounded-lg text-sm font-bold slide-in"
            style={{
              fontSize: 'var(--text-sm)',
              letterSpacing: 'var(--tracking-wide)',
              background: 'var(--color-accent-cyan)',
              color: 'var(--color-bg-primary)',
              boxShadow: '0 0 20px rgba(222, 255, 10, 0.5), var(--shadow-elevated)',
            }}
          >
            {snapshotToast}
          </div>
        </div>
      )}

      {/* Global toast notification */}
      {toastMessage && !snapshotToast && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
          <div
            className="px-4 py-2 rounded-lg text-sm font-bold slide-in"
            style={{
              fontSize: 'var(--text-sm)',
              letterSpacing: 'var(--tracking-wide)',
              background: 'rgba(15, 15, 15, 0.95)',
              backdropFilter: 'blur(12px)',
              color: 'var(--color-accent-cyan)',
              border: '1px solid rgba(222, 255, 10, 0.3)',
              boxShadow: '0 0 16px rgba(222, 255, 10, 0.3), var(--shadow-elevated)',
            }}
          >
            {toastMessage}
          </div>
        </div>
      )}

      {/* Format substitution notice (amber) */}
      {formatSubstitutions.length > 0 && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50">
          <div
            className="px-4 py-2.5 rounded-lg slide-in"
            style={{
              background: 'rgba(15, 15, 15, 0.95)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              boxShadow: '0 0 16px rgba(245, 158, 11, 0.15), var(--shadow-elevated)',
              maxWidth: '360px',
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: '#f59e0b', letterSpacing: 'var(--tracking-wide)' }}>
                  {formatSubstitutions.length} plugin{formatSubstitutions.length > 1 ? 's' : ''} loaded in a different format
                </p>
                <ul className="mt-1 space-y-0.5">
                  {formatSubstitutions.map((s, i) => (
                    <li key={i} style={{ fontSize: 'var(--text-xs)', color: 'rgba(245, 158, 11, 0.7)' }}>
                      {s.pluginName} ({s.savedFormat} &rarr; {s.loadedFormat}){s.hasPresetData ? ' — preset settings may differ' : ''}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => useChainStore.getState().clearFormatSubstitutions()}
                style={{ color: 'rgba(245, 158, 11, 0.5)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', lineHeight: 1, flexShrink: 0 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#f59e0b')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(245, 158, 11, 0.5)')}
              >
                &#x2715;
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
