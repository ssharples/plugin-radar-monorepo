import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
  type DragMoveEvent,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from '@dnd-kit/core';
import { Layers, GitBranch, Undo2, Redo2, Power, AppWindow, Plus, Radio, Copy, Link2, Send } from 'lucide-react';
import { useChainStore, useChainActions } from '../../stores/chainStore';
import { useChainEditorShortcuts } from '../../hooks/useChainEditorShortcuts';
import { juceBridge } from '../../api/juce-bridge';
import type { ChainNodeUI, OtherInstanceInfo, MirrorState, WaveformData } from '../../api/types';
import { ChainNodeList } from './ChainNodeList';
import { DragPreview } from './DragPreview';
import { QuickPluginSearch } from './QuickPluginSearch';
import { InlinePluginSearch } from './InlinePluginSearch';
import { MirrorIndicator } from './MirrorIndicator';
import { HeaderMenu } from '../HeaderMenu';
import { EmptyStateKit } from './EmptyStateKit';

/** Compact output waveform for the toolbar — neon yellow line */
function ToolbarWaveform() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>();
  const dataRef = useRef<number[]>([]);
  const dimsRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        dimsRef.current = {
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        };
      }
    });
    observer.observe(cvs);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const unsub = juceBridge.onWaveformData((d: WaveformData) => {
      dataRef.current = d.post;
    });

    const draw = () => {
      const cvs = canvasRef.current;
      if (!cvs) { animRef.current = requestAnimationFrame(draw); return; }
      const ctx = cvs.getContext('2d');
      if (!ctx) { animRef.current = requestAnimationFrame(draw); return; }

      const dims = dimsRef.current;
      if (dims.width === 0 || dims.height === 0) { animRef.current = requestAnimationFrame(draw); return; }

      const dpr = window.devicePixelRatio || 1;
      if (cvs.width !== dims.width * dpr || cvs.height !== dims.height * dpr) {
        cvs.width = dims.width * dpr;
        cvs.height = dims.height * dpr;
        ctx.scale(dpr, dpr);
      }

      const w = dims.width;
      const h = dims.height;
      ctx.clearRect(0, 0, w, h);

      const data = dataRef.current;
      if (data.length === 0) { animRef.current = requestAnimationFrame(draw); return; }

      // Center line
      ctx.strokeStyle = 'rgba(222, 255, 10, 0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // Draw waveform as a filled area from center
      const step = data.length / w;
      const cy = h / 2;
      const amp = h * 0.85;

      // Top half
      ctx.beginPath();
      ctx.moveTo(0, cy);
      for (let x = 0; x < w; x++) {
        const idx = Math.min(Math.floor(x * step), data.length - 1);
        const v = Math.min(data[idx], 1);
        ctx.lineTo(x, cy - v * amp / 2);
      }
      ctx.lineTo(w, cy);
      ctx.closePath();
      ctx.fillStyle = 'rgba(222, 255, 10, 0.35)';
      ctx.fill();

      // Bottom half (mirror)
      ctx.beginPath();
      ctx.moveTo(0, cy);
      for (let x = 0; x < w; x++) {
        const idx = Math.min(Math.floor(x * step), data.length - 1);
        const v = Math.min(data[idx], 1);
        ctx.lineTo(x, cy + v * amp / 2);
      }
      ctx.lineTo(w, cy);
      ctx.closePath();
      ctx.fill();

      // Bright center line of the waveform
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(222, 255, 10, 0.7)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x++) {
        const idx = Math.min(Math.floor(x * step), data.length - 1);
        const v = Math.min(data[idx], 1);
        const y1 = cy - v * amp / 2;
        if (x === 0) ctx.moveTo(x, y1);
        else ctx.lineTo(x, y1);
      }
      ctx.stroke();

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      unsub();
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full"
      style={{ minWidth: 0 }}
    />
  );
}

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
// Format timestamp as relative time (e.g., "2m ago", "just now")
function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const customCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length === 0) {
    return rectIntersection(args);
  }

  const dropCollisions = pointerCollisions.filter(c => String(c.id).startsWith('drop:'));
  const groupCollisions = pointerCollisions.filter(c => String(c.id).startsWith('group:'));

  // Prefer drop zones for reordering
  if (dropCollisions.length > 0) return dropCollisions;
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

  const {
    fetchChainState, moveNode, createGroup, dissolveGroupSilent,
    selectNode, undo, redo, canUndo, canRedo, saveSnapshot, recallSnapshot,
    openInlineEditor,
  } = useChainActions();

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [activeDragNode, setActiveDragNode] = useState<ChainNodeUI | null>(null);
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
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
  const [windowState, setWindowState] = useState<{ openCount: number; totalCount: number }>({ openCount: 0, totalCount: 0 });

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

  const handleToggleAllWindows = useCallback(async () => {
    try {
      const result = await juceBridge.toggleAllPluginWindows();
      setWindowState({ openCount: result.openCount, totalCount: result.totalCount });
    } catch { /* ignore */ }
  }, []);

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
      const draggedNodeId = parseInt(activeIdStr.split(':')[1], 10);
      if (isNaN(draggedNodeId)) return;

      // Safety: Verify the dragged node exists in the tree
      const draggedNode = findNodeById(nodes, draggedNodeId);
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
      if (isAncestorOf(nodes, draggedNodeId, targetParentId)) return;

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
          // Animate collapse, then dissolve
          setDissolvingGroupId(sourceParent.id);
          await new Promise(r => setTimeout(r, 200));
          setDissolvingGroupId(null);
          await dissolveGroupSilent(sourceParent.id);
        }
      }
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
          // Animate collapse, then dissolve
          setDissolvingGroupId(sourceParent.id);
          await new Promise(r => setTimeout(r, 200));
          setDissolvingGroupId(null);
          await dissolveGroupSilent(sourceParent.id);
        }
      }
    }
    } catch (error) {
      // Reset drag state on error to prevent UI from getting stuck
      setActiveDragNode(null);
      setActiveDragId(null);
      setDisabledDropIds(new Set());
    }
  }, [nodes, moveNode, createGroup, dissolveGroupSilent]);

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
                fontFamily: 'var(--font-mono)',
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
                fontFamily: 'var(--font-mono)',
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
                      ? `${isActive ? 'Active snapshot' : 'Recall snapshot'} ${label} \u2022 Saved ${formatRelativeTime(snapshot.savedAt)} \u2022 Shift+click to overwrite \u2022 \u2318\u2325${i + 1}`
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

          {/* Toggle All Plugin Windows */}
          {totalPlugins > 0 && (
            <button
              onClick={handleToggleAllWindows}
              className="p-1 rounded flex items-center gap-1"
              style={{
                color: windowState.openCount > 0 ? 'var(--color-accent-cyan)' : 'var(--color-text-secondary)',
                background: windowState.openCount > 0 ? 'rgba(222, 255, 10, 0.08)' : 'transparent',
                transition: 'all var(--duration-fast) var(--ease-snap)',
              }}
              title={
                windowState.openCount > 0
                  ? `Close all plugin windows (${windowState.openCount}/${windowState.totalCount} open)`
                  : 'Open all plugin windows'
              }
            >
              <AppWindow className="w-3.5 h-3.5" />
              {windowState.totalCount > 0 && (
                <span
                  className="text-[10px] leading-none"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {windowState.openCount}/{windowState.totalCount}
                </span>
              )}
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

        {/* Output waveform — fills toolbar gap */}
        <div className="flex-1 mx-3" style={{ height: 20, minWidth: 0 }}>
          <ToolbarWaveform />
        </div>

        {/* Right side: latency, instances, mirror */}
        <div className="flex items-center gap-2">
          <LatencyDisplay />
          <InstancesBadge />
          <MirrorIndicator />
        </div>
      </div>

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
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase' as const,
            }}
          >
            Loading...
          </div>
        ) : !hasNodes ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-full max-w-md">
              <InlinePluginSearch
                parentId={ROOT_PARENT_ID}
                insertIndex={0}
                onPluginAdded={() => {}}
                onOpenFullBrowser={() => window.dispatchEvent(new Event('openPluginBrowser'))}
                onClose={undefined}
              />
            </div>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={customCollisionDetection}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
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
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

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
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-secondary)',
                letterSpacing: 'var(--tracking-wide)',
                textTransform: 'uppercase' as const,
              }}
            >
              {selectedIds.size} selected
            </span>
            <button
              onClick={() => handleCreateGroup('serial')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold"
              style={{
                fontFamily: 'var(--font-mono)',
                letterSpacing: 'var(--tracking-wide)',
                textTransform: 'uppercase' as const,
                background: 'rgba(255, 170, 0, 0.1)',
                color: 'var(--color-status-warning)',
                border: '1px solid rgba(255, 170, 0, 0.3)',
                transition: 'all var(--duration-fast) var(--ease-snap)',
              }}
            >
              <Layers className="w-3.5 h-3.5" />
              Serial
              <kbd
                className="text-[9px] ml-1"
                style={{
                  fontFamily: 'var(--font-mono)',
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
                fontFamily: 'var(--font-mono)',
                letterSpacing: 'var(--tracking-wide)',
                textTransform: 'uppercase' as const,
                background: 'rgba(222, 255, 10, 0.1)',
                color: 'var(--color-accent-cyan)',
                border: '1px solid rgba(222, 255, 10, 0.3)',
                transition: 'all var(--duration-fast) var(--ease-snap)',
              }}
            >
              <GitBranch className="w-3.5 h-3.5" />
              Parallel
              <kbd
                className="text-[9px] ml-1"
                style={{
                  fontFamily: 'var(--font-mono)',
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

      {/* Context menu for creating groups */}
      {contextMenu && selectedIds.size >= 2 && (
        <div
          className="fixed z-50 rounded-lg py-1 min-w-[180px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-strong)',
            boxShadow: 'var(--shadow-elevated)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleCreateGroup('serial')}
            className="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-primary)',
              transition: 'all var(--duration-fast) var(--ease-snap)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <Layers className="w-4 h-4" style={{ color: 'var(--color-status-warning)' }} />
            Create Serial Group
            <span className="ml-auto text-xxs" style={{ color: 'var(--color-text-tertiary)' }}>⌘G</span>
          </button>
          <button
            onClick={() => handleCreateGroup('parallel')}
            className="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-primary)',
              transition: 'all var(--duration-fast) var(--ease-snap)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <GitBranch className="w-4 h-4" style={{ color: 'var(--color-accent-cyan)' }} />
            Create Parallel Group
            <span className="ml-auto text-xxs" style={{ color: 'var(--color-text-tertiary)' }}>⌘⇧G</span>
          </button>
        </div>
      )}

      {/* Snapshot toast notification */}
      {snapshotToast && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
          <div
            className="px-4 py-2 rounded-lg text-sm font-bold slide-in"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase' as const,
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
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase' as const,
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

    </div>
  );
}

/**
 * Compact latency readout for the toolbar.
 * Subscribes to chain changes and polls total latency from C++.
 */
function LatencyDisplay() {
  const [latencySamples, setLatencySamples] = useState(0);
  const [sampleRate, setSampleRate] = useState(44100);

  useEffect(() => {
    juceBridge.getTotalLatencySamples().then(setLatencySamples).catch(() => {});
    juceBridge.getSampleRate().then(setSampleRate).catch(() => {});
  }, []);

  useEffect(() => {
    const unsub = juceBridge.onChainChanged(async () => {
      try {
        const latency = await juceBridge.getTotalLatencySamples();
        setLatencySamples(latency);
      } catch { /* ignore */ }
    });
    return unsub;
  }, []);

  const latencyMs = sampleRate > 0 ? (latencySamples / sampleRate) * 1000 : 0;

  if (latencyMs <= 0) return null;

  return (
    <span
      className="text-[10px] tabular-nums"
      style={{
        fontFamily: 'var(--font-mono)',
        color: 'var(--color-text-tertiary)',
        letterSpacing: 'var(--tracking-wide)',
      }}
      title={`Total chain latency: ${latencySamples} samples @ ${sampleRate} Hz`}
    >
      {latencyMs.toFixed(1)} ms
    </span>
  );
}

/**
 * Toolbar badge showing other ProChain instances in the DAW session.
 * Hidden when no other instances exist or when already mirrored.
 * Click to open a dropdown with Copy From / Send To / Mirror actions.
 */
function InstancesBadge() {
  const [instances, setInstances] = useState<OtherInstanceInfo[]>([]);
  const [mirrorState, setMirrorState] = useState<MirrorState>({ isMirrored: false, mirrorGroupId: null, partners: [] });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const showToast = useChainStore((s) => s.showToast);

  useEffect(() => {
    juceBridge.getOtherInstances().then(setInstances).catch(() => {});
    juceBridge.getMirrorState().then(setMirrorState).catch(() => {});
  }, []);

  useEffect(() => {
    const unsub1 = juceBridge.onInstancesChanged((data) => setInstances(data));
    const unsub2 = juceBridge.onMirrorStateChanged((data) => setMirrorState(data));
    return () => { unsub1(); unsub2(); };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-instances-badge]')) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleCopyFrom = useCallback(async (inst: OtherInstanceInfo) => {
    setBusy(`copy-${inst.id}`);
    try {
      const result = await juceBridge.copyChainFromInstance(inst.id);
      if (result.success && result.chainState) {
        useChainStore.setState({
          nodes: result.chainState.nodes || [],
          slots: result.chainState.slots || [],
          lastCloudChainId: null,
        });
        showToast(`Copied chain from ${inst.trackName}`);
      } else {
        showToast(result.error || 'Failed to copy chain');
      }
    } catch {
      showToast('Failed to copy chain');
    }
    setBusy(null);
    setOpen(false);
  }, [showToast]);

  const handleSendTo = useCallback(async (inst: OtherInstanceInfo) => {
    console.log('InstancesBadge handleSendTo clicked', inst.id, inst.trackName);
    setBusy(`send-${inst.id}`);
    try {
      const result = await juceBridge.sendChainToInstance(inst.id);
      if (result.success) {
        showToast(`Sending chain to ${inst.trackName}...`);
      } else {
        showToast(result.error || 'Failed to send chain');
      }
    } catch {
      showToast('Failed to send chain');
    }
    setBusy(null);
    setOpen(false);
  }, [showToast]);

  const handleMirror = useCallback(async (inst: OtherInstanceInfo) => {
    console.log('InstancesBadge handleMirror clicked', inst.id, inst.trackName);
    setBusy(`mirror-${inst.id}`);
    try {
      const result = await juceBridge.startMirror(inst.id);
      if (result.success) {
        showToast(`Mirrored with ${inst.trackName}`);
      } else {
        showToast(result.error || 'Failed to start mirror');
      }
    } catch {
      showToast('Failed to start mirror');
    }
    setBusy(null);
    setOpen(false);
  }, [showToast]);

  // Hide when no other instances or already mirrored (MirrorIndicator handles that)
  if (instances.length === 0 || mirrorState.isMirrored) return null;

  return (
    <div className="relative" data-instances-badge>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1 rounded-md"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          fontWeight: 700,
          letterSpacing: 'var(--tracking-wide)',
          background: open ? 'rgba(222, 255, 10, 0.12)' : 'rgba(0, 200, 255, 0.08)',
          color: 'var(--color-accent-cyan)',
          border: open ? '1px solid rgba(222, 255, 10, 0.4)' : '1px solid rgba(0, 200, 255, 0.2)',
          cursor: 'pointer',
          transition: 'all var(--duration-fast) var(--ease-snap)',
        }}
        title={`${instances.length} other instance${instances.length > 1 ? 's' : ''} detected`}
      >
        <Radio className="w-3 h-3" />
        <span>{instances.length}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 min-w-[240px]"
          style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-strong)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-elevated)',
            overflow: 'hidden',
          }}
        >
          <div
            className="px-3 py-1.5"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase' as const,
              color: 'var(--color-accent-cyan)',
              borderBottom: '1px solid var(--color-border-subtle)',
            }}
          >
            Other Instances
          </div>

          <div className="p-1.5 space-y-1">
            {instances.map((inst) => {
              const chainPreview = inst.pluginNames.length > 0
                ? inst.pluginNames.slice(0, 3).join(' \u2192 ') + (inst.pluginNames.length > 3 ? ' \u2026' : '')
                : 'Empty chain';

              return (
                <div
                  key={inst.id}
                  className="rounded p-2"
                  style={{
                    background: 'var(--color-bg-primary)',
                    border: '1px solid var(--color-border-default)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: 'var(--color-status-active)' }}
                    />
                    <span
                      className="truncate"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 700,
                        letterSpacing: 'var(--tracking-wide)',
                        color: 'var(--color-text-primary)',
                        textTransform: 'uppercase' as const,
                      }}
                    >
                      {inst.trackName || `Instance ${inst.id}`}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      {inst.pluginCount} plugins
                    </span>
                  </div>

                  <div
                    className="truncate mb-2"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: 'var(--color-text-secondary)',
                      paddingLeft: 'var(--space-3)',
                    }}
                  >
                    {chainPreview}
                  </div>

                  <div className="flex items-center gap-1" style={{ paddingLeft: 'var(--space-3)' }}>
                    {inst.pluginCount > 0 && (
                      <button
                        onClick={() => handleCopyFrom(inst)}
                        disabled={busy !== null}
                        className="inst-btn flex items-center gap-1 px-1.5 py-0.5 rounded"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '10px',
                          fontWeight: 700,
                          letterSpacing: 'var(--tracking-wide)',
                          textTransform: 'uppercase' as const,
                          background: 'var(--color-bg-elevated)',
                          color: 'var(--color-text-secondary)',
                          border: '1px solid var(--color-border-default)',
                          cursor: busy !== null ? 'not-allowed' : 'pointer',
                          opacity: busy !== null ? 0.5 : 1,
                          transition: 'all var(--duration-fast) var(--ease-snap)',
                        }}
                        title="Copy chain from this instance (one-time)"
                      >
                        <Copy className="w-2.5 h-2.5" />
                        {busy === `copy-${inst.id}` ? '...' : 'Copy'}
                      </button>
                    )}
                    <button
                      onClick={() => handleSendTo(inst)}
                      disabled={busy !== null}
                      className="inst-btn-send flex items-center gap-1 px-1.5 py-0.5 rounded"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        fontWeight: 700,
                        letterSpacing: 'var(--tracking-wide)',
                        textTransform: 'uppercase' as const,
                        background: 'var(--color-bg-elevated)',
                        color: 'var(--color-text-secondary)',
                        border: '1px solid var(--color-border-default)',
                        cursor: busy !== null ? 'not-allowed' : 'pointer',
                        opacity: busy !== null ? 0.5 : 1,
                        transition: 'all var(--duration-fast) var(--ease-snap)',
                      }}
                      title="Send current chain to this instance"
                    >
                      <Send className="w-2.5 h-2.5" />
                      {busy === `send-${inst.id}` ? 'Sending...' : 'Send'}
                    </button>
                    <button
                      onClick={() => handleMirror(inst)}
                      disabled={busy !== null}
                      className="inst-btn flex items-center gap-1 px-1.5 py-0.5 rounded"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        fontWeight: 700,
                        letterSpacing: 'var(--tracking-wide)',
                        textTransform: 'uppercase' as const,
                        background: 'var(--color-bg-elevated)',
                        color: 'var(--color-text-secondary)',
                        border: '1px solid var(--color-border-default)',
                        cursor: busy !== null ? 'not-allowed' : 'pointer',
                        opacity: busy !== null ? 0.5 : 1,
                        transition: 'all var(--duration-fast) var(--ease-snap)',
                      }}
                      title="Mirror chain (live sync)"
                    >
                      <Link2 className="w-2.5 h-2.5" />
                      {busy === `mirror-${inst.id}` ? '...' : 'Mirror'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
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
  const [showSearch, setShowSearch] = useState(false);
  const { isOver, setNodeRef } = useDroppable({
    id: `drop:${parentId}:${insertIndex}`,
  });

  const handleClick = useCallback(() => {
    if (!isDragActive) {
      setShowSearch(true);
    }
  }, [isDragActive]);

  if (showSearch) {
    return (
      <div ref={setNodeRef} className="mx-0 my-2">
        <InlinePluginSearch
          parentId={parentId}
          insertIndex={insertIndex}
          onPluginAdded={() => setShowSearch(false)}
          onOpenFullBrowser={() => {
            setShowSearch(false);
            window.dispatchEvent(new Event('openPluginBrowser'));
          }}
          onClose={() => setShowSearch(false)}
        />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      onClick={handleClick}
      className="mx-0 rounded-lg flex items-center justify-center gap-2"
      style={{
        border: isOver && isDragActive
          ? '2px dashed var(--color-accent-cyan)'
          : isDragActive
            ? '2px dashed var(--color-border-strong)'
            : '2px dashed var(--color-border-default)',
        background: isOver && isDragActive
          ? 'rgba(222, 255, 10, 0.08)'
          : 'transparent',
        padding: isOver && isDragActive
          ? '16px 0'
          : isDragActive
            ? '12px 0'
            : '10px 0',
        cursor: isDragActive ? 'default' : 'pointer',
        transition: 'all var(--duration-fast) var(--ease-snap)',
      }}
    >
      <Plus className="w-3.5 h-3.5" style={{
        color: isOver && isDragActive ? 'var(--color-accent-cyan)' : 'var(--color-text-disabled)',
      }} />
      <span
        className="text-xs"
        style={{
          fontFamily: 'var(--font-mono)',
          letterSpacing: 'var(--tracking-wide)',
          textTransform: 'uppercase' as const,
          color: isOver && isDragActive
            ? 'var(--color-accent-cyan)'
            : 'var(--color-text-disabled)',
        }}
      >
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

