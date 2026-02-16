/**
 * ChainSlot Component - "Digital Underground" Aesthetic
 * Fast, keyboard-first workflow with cyber visual identity
 */

import { useState, useRef, useEffect, useMemo, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useDraggable } from '@dnd-kit/core';
import { ClipboardPaste, Trash2, CopyPlus, Plus, ChevronRight, ChevronDown } from 'lucide-react';
import type { PluginNodeUI, ChainSlot as ChainSlotType, ChainNodeUI } from '../../api/types';
import { useChainStore } from '../../stores/chainStore';
import { Knob } from '../Knob/Knob';
import './ChainSlotCyber.css';

// Convert linear to dB
function linearToDb(linear: number): number {
  if (linear <= 0.00001) return -60;
  return 20 * Math.log10(linear);
}

interface ChainSlotCyberProps {
  // V2: node-based
  node?: PluginNodeUI;
  // V1 compat: slot-based
  slot?: ChainSlotType;
  /** 1-based DFS plugin index */
  slotNumber?: number;
  isEditorOpen: boolean;
  isMultiSelected?: boolean;
  isSelected?: boolean;
  onRemove: () => void;
  onToggleBypass: () => void;
  onToggleEditor: () => void;
  /** Whether any drag is currently active */
  isDragActive?: boolean;
  /** Whether group select mode is active */
  groupSelectMode?: boolean;
  /** Called when the slot is clicked */
  onSelect?: (e: React.MouseEvent) => void;
  /** Set of node IDs whose drop targets should be disabled */
  disabledDropIds?: Set<number>;
  /** Parent node ID (for inline plugin insertion) */
  parentId?: number;
  /** Index of this node in parent's children array (for inline plugin insertion) */
  indexInParent?: number;
}

export const ChainSlotCyber = memo(function ChainSlotCyber({
  node,
  slot,
  slotNumber,
  isEditorOpen,
  isMultiSelected = false,
  isSelected = false,
  onRemove,
  onToggleBypass,
  onToggleEditor,
  isDragActive = false,
  groupSelectMode = false,
  onSelect,
  disabledDropIds,
  parentId = 0,
  indexInParent = -1,
}: ChainSlotCyberProps) {
  // Unified data access
  const id = node?.id ?? slot?.index ?? 0;
  const name = node?.name ?? slot?.name ?? '';
  const bypassed = node?.bypassed ?? slot?.bypassed ?? false;
  const isSoloed = node?.solo ?? false;
  const isMuted = node?.mute ?? false;
  const latency = node?.latency ?? 0;

  const duplicateNode = useChainStore((s) => s.duplicateNode);
  const setBranchSolo = useChainStore((s) => s.setBranchSolo);
  const pastePluginSettings = useChainStore((s) => s.pastePluginSettings);
  const nodes = useChainStore((s) => s.nodes);
  const showToast = useChainStore((s) => s.showToast);
  const createGroup = useChainStore((s) => s.createGroup);

  // Per-plugin expandable controls
  const expandedNodeIds = useChainStore((s) => s.expandedNodeIds);
  const toggleNodeExpanded = useChainStore((s) => s.toggleNodeExpanded);
  const setNodeInputGain = useChainStore((s) => s.setNodeInputGain);
  const setNodeOutputGain = useChainStore((s) => s.setNodeOutputGain);
  const setNodeDryWet = useChainStore((s) => s.setNodeDryWet);
  const setNodeMidSideMode = useChainStore((s) => s.setNodeMidSideMode);
  const setNodeSidechainSource = useChainStore((s) => s.setNodeSidechainSource);
  const _endContinuousGesture = useChainStore((s) => s._endContinuousGesture);
  const isExpanded = expandedNodeIds.has(id);

  // Hover and menu state
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState<{ x: number; y: number } | null>(null);
  const showInlineSearchBelow = useChainStore((s) => s.showInlineSearchBelow);
  const [showPasteSubmenu, setShowPasteSubmenu] = useState(false);
  const slotRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Swipe-to-delete state (refs for synchronous access in native DOM listeners)
  const [swipeOffset, setSwipeOffset] = useState(0);
  const swipeOffsetRef = useRef(0);
  const isSwipingRef = useRef(false);
  const swipeDecidedRef = useRef(false);
  const justSwipedRef = useRef(false);
  const swipeStartX = useRef<number | null>(null);
  const swipeStartY = useRef<number | null>(null);
  const swipeThreshold = 120; // pixels to trigger delete

  // Stable refs for values used in native event listeners (avoids re-attaching on every render)
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;
  const groupSelectModeRef = useRef(groupSelectMode);
  groupSelectModeRef.current = groupSelectMode;
  const isMultiSelectedRef = useRef(isMultiSelected);
  isMultiSelectedRef.current = isMultiSelected;
  const showContextMenuRef = useRef(showContextMenu);
  showContextMenuRef.current = showContextMenu;

  // Subscribe to meter data
  const meterData = useChainStore((s) => s.nodeMeterData[String(id)]);

  // Calculate current output level in dB
  const currentLevelDb = useMemo(() => {
    if (!meterData || bypassed) return -60;
    const outLDb = linearToDb(meterData.peakL);
    const outRDb = linearToDb(meterData.peakR);
    return Math.max(outLDb, outRDb);
  }, [meterData, bypassed]);

  // Calculate current RMS level in dB
  const currentRmsDb = useMemo(() => {
    if (!meterData || bypassed) return -60;
    const rmsLDb = linearToDb(meterData.rmsL ?? 0);
    const rmsRDb = linearToDb(meterData.rmsR ?? 0);
    return Math.max(rmsLDb, rmsRDb);
  }, [meterData, bypassed]);

  // Peak hold: tracks highest dB, decays after 1.5s hold time
  const peakHoldRef = useRef(-60);
  const peakHoldTimestamp = useRef(0);
  const [peakHoldDb, setPeakHoldDb] = useState(-60);

  useEffect(() => {
    const now = Date.now();
    if (currentLevelDb > peakHoldRef.current) {
      peakHoldRef.current = currentLevelDb;
      peakHoldTimestamp.current = now;
      setPeakHoldDb(currentLevelDb);
    } else if (now - peakHoldTimestamp.current > 3000) {
      // Decay: drop 20dB/sec
      const elapsed = (now - peakHoldTimestamp.current - 3000) / 1000;
      const decayed = peakHoldRef.current - elapsed * 20;
      if (decayed <= currentLevelDb) {
        // Current level caught up — latch to it
        peakHoldRef.current = currentLevelDb;
        peakHoldTimestamp.current = now;
        setPeakHoldDb(currentLevelDb);
      } else {
        setPeakHoldDb(decayed);
      }
    }
  }, [currentLevelDb]);

  // Calculate meter width (dB to percentage)
  const getMeterWidth = () => {
    // Map -60dB to 0dB → 0% to 100%
    const normalized = Math.max(0, Math.min(100, ((currentLevelDb + 60) / 60) * 100));
    return normalized;
  };

  // Calculate RMS meter width
  const getRmsMeterWidth = () => {
    const normalized = Math.max(0, Math.min(100, ((currentRmsDb + 60) / 60) * 100));
    return normalized;
  };

  // Close context menu on outside click
  useEffect(() => {
    if (!showContextMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showContextMenu]);

  const handlePasteToInstance = useCallback(async (targetNodeId: number, targetName: string) => {
    const success = await pastePluginSettings(id, targetNodeId);
    if (success) {
      showToast(`Pasted settings to: ${targetName}`);
    }
    setShowContextMenu(null);
    setShowPasteSubmenu(false);
  }, [id, pastePluginSettings, showToast]);

  // Find all instances of the same plugin type (excluding self)
  const collectAllPluginNodes = (nodeList: ChainNodeUI[], currentFileOrId: string): Array<{ id: number; name: string; slotNum: number }> => {
    const results: Array<{ id: number; name: string; slotNum: number }> = [];
    let slotCounter = 0;

    const walk = (nodes: ChainNodeUI[]) => {
      for (const n of nodes) {
        if (n.type === 'plugin') {
          slotCounter++;
          if (n.fileOrIdentifier === currentFileOrId && n.id !== id) {
            results.push({ id: n.id, name: n.name, slotNum: slotCounter });
          }
        } else if (n.type === 'group') {
          walk(n.children);
        }
      }
    };

    walk(nodeList);
    return results;
  };

  const samePluginInstances = useMemo(() => {
    if (!node) return [];
    return collectAllPluginNodes(nodes, node.fileOrIdentifier);
  }, [nodes, node]);

  // Glitch animation trigger on bypass
  const [glitchTrigger, setGlitchTrigger] = useState(0);
  useEffect(() => {
    if (bypassed) {
      setGlitchTrigger(prev => prev + 1);
    }
  }, [bypassed]);

  // Format plugin name for display
  const formatPluginName = (pluginName: string) => {
    return pluginName
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  };

  // Handle duplicate
  const handleDuplicate = () => {
    if (node) {
      duplicateNode(node.id);
    }
  };

  // Handle solo toggle
  const handleSolo = () => {
    if (node) {
      setBranchSolo(node.id, !isSoloed);
    }
  };

  // Handle dB reset (click to reset all meter peaks)
  const handleDbReset = () => {
    peakHoldRef.current = -60;
    peakHoldTimestamp.current = 0;
    setPeakHoldDb(-60);
    useChainStore.setState({ nodeMeterData: {} });
    showToast('All meter peaks reset');
  };

  // Handle group creation
  const handleCreateSerialGroup = () => {
    if (node) {
      createGroup([node.id], 'serial', 'Serial Group');
    }
  };

  const handleCreateParallelGroup = () => {
    if (node) {
      createGroup([node.id], 'parallel', 'Parallel Group');
    }
  };

  // Drag and drop setup
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `drag:${id}`,
    data: { node, nodeId: id },
    disabled: groupSelectMode || isMultiSelected,
  });

  // Wrap dnd-kit listeners to intercept right-click before dnd-kit's
  // pointer sensor captures it (which blocks contextmenu in JUCE WebView)
  const wrappedListeners = useMemo(() => {
    if (!listeners) return {};
    return {
      ...listeners,
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button === 2) {
          e.preventDefault();
          e.stopPropagation();
          setShowContextMenu({ x: e.clientX, y: e.clientY });
          return;
        }
        (listeners as Record<string, Function>).onPointerDown?.(e);
      },
    };
  }, [listeners]);

  // Click handler
  const handleClick = (e: React.MouseEvent) => {
    // Don't trigger click if we just completed a swipe
    if (justSwipedRef.current) {
      justSwipedRef.current = false;
      return;
    }

    if (groupSelectMode || e.metaKey || e.ctrlKey) {
      onSelect?.(e);
    } else {
      // Normal click - open plugin editor window
      e.stopPropagation();
      onToggleEditor();
    }
  };

  // Native DOM listeners for swipe detection in capture phase.
  // Capture phase on the element fires BEFORE dnd-kit's bubble-phase document listeners,
  // letting us claim horizontal gestures before dnd-kit can activate its drag.
  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      if (groupSelectModeRef.current || isMultiSelectedRef.current || showContextMenuRef.current) return;
      swipeStartX.current = e.clientX;
      swipeStartY.current = e.clientY;
      swipeDecidedRef.current = false;
      isSwipingRef.current = false;
      // Don't stop propagation — let dnd-kit also start its activation
    };

    const onPointerMove = (e: PointerEvent) => {
      if (swipeStartX.current === null || swipeStartY.current === null) return;
      // Already decided it's a vertical drag — bail out, let dnd-kit handle
      if (swipeDecidedRef.current && !isSwipingRef.current) return;

      const deltaX = e.clientX - swipeStartX.current;
      const deltaY = e.clientY - swipeStartY.current;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      if (!swipeDecidedRef.current) {
        // Need minimum movement before deciding direction
        if (absDeltaX < 5 && absDeltaY < 5) return;

        if (absDeltaX > absDeltaY * 1.2) {
          // Horizontal swipe — claim the gesture
          swipeDecidedRef.current = true;
          isSwipingRef.current = true;
          el.setPointerCapture(e.pointerId);
          e.stopImmediatePropagation(); // prevents dnd-kit's document listener
          e.preventDefault();
          swipeOffsetRef.current = deltaX;
          setSwipeOffset(deltaX);
          return;
        } else {
          // Vertical/diagonal — let dnd-kit handle
          swipeDecidedRef.current = true;
          isSwipingRef.current = false;
          swipeStartX.current = null;
          swipeStartY.current = null;
          return;
        }
      }

      // Continue swiping
      e.stopImmediatePropagation();
      e.preventDefault();
      swipeOffsetRef.current = deltaX;
      setSwipeOffset(deltaX);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (isSwipingRef.current) {
        e.stopImmediatePropagation();
        e.preventDefault();

        // Check if swipe exceeded delete threshold
        if (Math.abs(swipeOffsetRef.current) >= swipeThreshold) {
          onRemoveRef.current();
        }

        try { el.releasePointerCapture(e.pointerId); } catch {}

        // Suppress the click event that follows a pointer sequence
        justSwipedRef.current = true;
        setTimeout(() => { justSwipedRef.current = false; }, 100);
      }

      // Reset all state
      isSwipingRef.current = false;
      swipeDecidedRef.current = false;
      swipeOffsetRef.current = 0;
      setSwipeOffset(0);
      swipeStartX.current = null;
      swipeStartY.current = null;
    };

    el.addEventListener('pointerdown', onPointerDown, { capture: true });
    el.addEventListener('pointermove', onPointerMove, { capture: true });
    el.addEventListener('pointerup', onPointerUp, { capture: true });

    return () => {
      el.removeEventListener('pointerdown', onPointerDown, { capture: true });
      el.removeEventListener('pointermove', onPointerMove, { capture: true });
      el.removeEventListener('pointerup', onPointerUp, { capture: true });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — all deps are stable refs

  return (
    <div className="chain-slot-wrapper">
    <div className="relative overflow-hidden">
      {/* Delete background - revealed during swipe */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          background: 'linear-gradient(90deg, rgba(255, 0, 51, 0.9), rgba(255, 0, 51, 0.7))',
          opacity: Math.abs(swipeOffset) / swipeThreshold,
          pointerEvents: 'none',
        }}
      >
        <Trash2
          className="w-6 h-6"
          style={{
            color: '#ffffff',
            transform: `scale(${Math.min(1.5, Math.abs(swipeOffset) / swipeThreshold)})`,
            transition: 'transform 100ms ease-out',
          }}
        />
      </div>

      {/* Swipeable slot content */}
      <div
        ref={(el) => {
          slotRef.current = el;
          setDragRef(el);
        }}
        className={`
          chain-slot-cyber
          ${bypassed ? 'bypassed' : ''}
          ${isSoloed ? 'soloed' : ''}
          ${isMuted ? 'muted' : ''}
          ${isSelected || isMultiSelected ? 'selected' : ''}
          ${isDragging ? 'dragging' : ''}
          ${isDragActive && !isDragging ? 'dim-during-drag is-dimmed' : ''}
        `}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: swipeOffset !== 0 ? 'none' : 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
          touchAction: 'none', // Prevent default touch behaviors
          zIndex: showContextMenu ? 100 : undefined,
        }}
        onClick={handleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowContextMenu({ x: e.clientX, y: e.clientY });
        }}
        onMouseEnter={() => setShowShortcuts(true)}
        onMouseLeave={() => setShowShortcuts(false)}
        {...wrappedListeners}
        {...attributes}
      >
      {/* Slot Number Badge */}
      {slotNumber !== undefined && (
        <div className="slot-number">
          {slotNumber}
        </div>
      )}

      {/* Plugin Name - Extended Bold */}
      <div
        className={`slot-name ${glitchTrigger > 0 ? 'glitch-trigger' : ''}`}
        key={glitchTrigger}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onToggleEditor();
        }}
      >
        {formatPluginName(name)}
      </div>

      {/* Inline Meter */}
      <div className="slot-meter">
        <div
          className="meter-rms-fill"
          style={{
            width: `${getRmsMeterWidth()}%`,
          }}
        />
        <div
          className="meter-fill"
          style={{
            width: `${getMeterWidth()}%`,
          }}
        />
      </div>

      {/* Technical Info - Monospace */}
      <div className="slot-info">
        <span
          className="level"
          onClick={(e) => {
            e.stopPropagation();
            handleDbReset();
          }}
          style={{ cursor: 'pointer' }}
          title="Click to reset all meter peaks"
        >
          {peakHoldDb > -60 ? `${peakHoldDb.toFixed(1)}dB` : '---'}
        </span>
        {latency > 0 && (
          <span className="latency">{latency.toFixed(2)}ms</span>
        )}
      </div>

      {/* Keyboard Shortcuts (Visible on Hover/Select) */}
      <div className={`slot-shortcuts ${showShortcuts || isSelected ? 'visible' : ''}`}>
        <kbd className={isSoloed ? 'active' : ''}>S</kbd>
        <kbd className={isMuted ? 'active' : ''}>M</kbd>
        <kbd className={bypassed ? 'active' : ''}>B</kbd>
      </div>

      {/* Control Buttons */}
      <div className="slot-controls">
        <button
          className={`ctrl-btn solo ${isSoloed ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            handleSolo();
          }}
          title="Solo (S)"
        >
          S
        </button>
        <button
          className={`ctrl-btn mute ${isMuted ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (node) {
              useChainStore.getState().setBranchMute(node.id, !isMuted);
            }
          }}
          title="Mute (M)"
        >
          M
        </button>
        <button
          className={`ctrl-btn bypass ${bypassed ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleBypass();
          }}
          title="Bypass (B)"
        >
          B
        </button>

        {/* Group Creation Buttons - Small stacked at end */}
        <div className="flex flex-col gap-0.5 ml-1">
          <button
            className="ctrl-btn-mini"
            onClick={(e) => {
              e.stopPropagation();
              handleCreateSerialGroup();
            }}
            title="Create Serial Group"
            style={{
              width: '10px',
              height: '10px',
              fontSize: '6px',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(201, 148, 74, 0.15)',
              border: '1px solid rgba(201, 148, 74, 0.4)',
              color: 'rgba(201, 148, 74, 0.9)',
              borderRadius: '2px',
              cursor: 'pointer',
              transition: 'all 100ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(201, 148, 74, 0.25)';
              e.currentTarget.style.borderColor = 'rgba(201, 148, 74, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(201, 148, 74, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(201, 148, 74, 0.4)';
            }}
          >
            S
          </button>
          <button
            className="ctrl-btn-mini"
            onClick={(e) => {
              e.stopPropagation();
              handleCreateParallelGroup();
            }}
            title="Create Parallel Group"
            style={{
              width: '10px',
              height: '10px',
              fontSize: '6px',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(90, 120, 66, 0.15)',
              border: '1px solid rgba(90, 120, 66, 0.4)',
              color: 'rgba(90, 120, 66, 0.9)',
              borderRadius: '2px',
              cursor: 'pointer',
              transition: 'all 100ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(90, 120, 66, 0.25)';
              e.currentTarget.style.borderColor = 'rgba(90, 120, 66, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(90, 120, 66, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(90, 120, 66, 0.4)';
            }}
          >
            P
          </button>
        </div>

      </div>

      {/* Expand Chevron — per-plugin controls */}
      {node && (
        <button
          className={`expand-chevron ${isExpanded ? 'rotated' : ''} ${showShortcuts || isSelected ? 'visible' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleNodeExpanded(id);
          }}
          title="Per-plugin controls"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Right-click context menu — portaled to document.body to escape
           transform/will-change containing blocks that break position:fixed */}
      {showContextMenu && createPortal(
        <>
          <div className="fixed inset-0 z-[99]" onClick={() => setShowContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setShowContextMenu(null); }} />
          <div
            ref={menuRef}
            className="fixed z-[100]"
            style={{
              left: showContextMenu.x,
              top: showContextMenu.y,
              minWidth: '180px',
              background: 'rgba(15, 15, 15, 0.98)',
              border: '1px solid var(--color-border-strong)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-elevated)',
              overflow: 'visible',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Duplicate */}
            <ContextMenuItem
              icon={<CopyPlus className="w-3.5 h-3.5" />}
              label="Duplicate"
              onClick={() => { handleDuplicate(); setShowContextMenu(null); }}
            />

            {/* Paste Settings To (with submenu) */}
            {samePluginInstances.length > 0 ? (
              <div
                className="relative"
                onMouseEnter={() => setShowPasteSubmenu(true)}
                onMouseLeave={(e) => {
                  const relatedTarget = e.relatedTarget as HTMLElement;
                  if (!relatedTarget?.closest('.paste-submenu')) {
                    setShowPasteSubmenu(false);
                  }
                }}
              >
                <ContextMenuItem
                  icon={<ClipboardPaste className="w-3.5 h-3.5" />}
                  label={`Paste Settings To (${samePluginInstances.length})`}
                  rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
                  onClick={() => setShowPasteSubmenu(prev => !prev)}
                />

                {/* Submenu */}
                {showPasteSubmenu && (
                  <div
                    className="paste-submenu absolute left-full top-0 ml-1 min-w-[200px] rounded-lg py-1"
                    style={{
                      background: 'var(--color-bg-elevated)',
                      border: '1px solid var(--color-border-strong)',
                      boxShadow: 'var(--shadow-elevated)',
                      zIndex: 1000,
                    }}
                  >
                    {samePluginInstances.map((instance) => (
                      <button
                        key={instance.id}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left"
                        onClick={() => handlePasteToInstance(instance.id, instance.name)}
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--text-sm)',
                          fontWeight: 600,
                          letterSpacing: 'var(--tracking-wide)',
                          color: 'var(--color-text-primary)',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all var(--duration-fast) var(--ease-snap)',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{
                            fontFamily: 'var(--font-mono)',
                            background: 'rgba(222, 255, 10, 0.12)',
                            color: 'var(--color-accent-cyan)',
                            border: '1px solid rgba(222, 255, 10, 0.3)',
                          }}
                        >
                          #{instance.slotNum}
                        </span>
                        <span className="flex-1 truncate">{instance.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <ContextMenuItem
                icon={<ClipboardPaste className="w-3.5 h-3.5" />}
                label="Paste Settings To"
                onClick={() => {}}
                disabled={true}
              />
            )}

            {/* Divider */}
            <div style={{ height: '1px', background: 'var(--color-border-default)', margin: '4px 0' }} />

            {/* Insert Plugin Below */}
            <ContextMenuItem
              icon={<Plus className="w-3.5 h-3.5" />}
              label="Insert Plugin Below"
              onClick={() => {
                showInlineSearchBelow(id, parentId, indexInParent + 1);
                setShowContextMenu(null);
              }}
            />

            {/* Divider */}
            <div style={{ height: '1px', background: 'var(--color-border-default)', margin: '4px 0' }} />

            {/* Remove */}
            <ContextMenuItem
              icon={<Trash2 className="w-3.5 h-3.5" />}
              label="Remove"
              shortcut="Del"
              onClick={() => { onRemove(); setShowContextMenu(null); }}
              accent="error"
            />
          </div>
        </>,
        document.body
      )}

      {/* Selection Indicator - Neon Accent */}
      {(isSelected || isMultiSelected) && (
        <div className="selection-indicator" />
      )}

      {/* Status Badges */}
      <div className="slot-badges">
        {isSoloed && (
          <span className="badge badge-solo">SOLO</span>
        )}
        {isMuted && (
          <span className="badge badge-mute">MUTE</span>
        )}
        {bypassed && (
          <span className="badge badge-bypass">BYPASS</span>
        )}
      </div>
      </div>
    </div>

    {/* Expandable Controls Panel */}
    {node && (
      <div className={`plugin-controls-panel ${isExpanded ? 'expanded' : ''}`}>
        <div className="plugin-controls-inner">
          <Knob
            value={node.inputGainDb}
            min={-24}
            max={24}
            defaultValue={0}
            size={32}
            label="IN"
            onChange={(v) => setNodeInputGain(id, v)}
            onDragEnd={_endContinuousGesture}
          />
          <Knob
            value={node.outputGainDb}
            min={-24}
            max={24}
            defaultValue={0}
            size={32}
            label="OUT"
            onChange={(v) => setNodeOutputGain(id, v)}
            onDragEnd={_endContinuousGesture}
          />
          <Knob
            value={node.pluginDryWet * 100}
            min={0}
            max={100}
            defaultValue={100}
            size={32}
            label="DRY/WET"
            formatValue={(v) => `${Math.round(v)}%`}
            onChange={(v) => setNodeDryWet(id, v / 100)}
            onDragEnd={_endContinuousGesture}
          />
          {/* M/S Mode Selector */}
          <div
            className="flex flex-col items-center gap-0.5"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span
              className="text-xxs font-bold"
              style={{
                fontFamily: 'var(--font-mono)',
                letterSpacing: 'var(--tracking-wide)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              M/S
            </span>
            <div
              className="flex rounded overflow-hidden"
              style={{
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(0,0,0,0.3)',
              }}
            >
              {(['L/R', 'MID', 'SIDE', 'M/S'] as const).map((label, idx) => {
                const isActive = (node.midSideMode ?? 0) === idx;
                return (
                  <button
                    key={label}
                    onClick={() => setNodeMidSideMode(id, idx)}
                    className="px-1.5 py-0.5 text-xxs font-bold"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: 'var(--tracking-wide)',
                      background: isActive ? 'rgba(137, 87, 42, 0.25)' : 'transparent',
                      color: isActive ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                      transition: 'all var(--duration-fast) var(--ease-snap)',
                      minWidth: '28px',
                      fontSize: '9px',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          {node.hasSidechain && (
            <div className="sc-control">
              <label className="sc-label">SC</label>
              <select
                className="sc-select"
                value={node.sidechainSource}
                onChange={(e) => {
                  e.stopPropagation();
                  setNodeSidechainSource(id, parseInt(e.target.value));
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <option value={0}>None</option>
                <option value={1}>External</option>
              </select>
            </div>
          )}
        </div>
      </div>
    )}

    </div>
  );
});

/**
 * Context menu item with Digital Underground styling.
 */
function ContextMenuItem({
  icon,
  label,
  shortcut,
  rightIcon,
  onClick,
  disabled = false,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  rightIcon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  accent?: 'lime' | 'error';
}) {
  const accentColor = accent === 'lime'
    ? 'var(--color-accent-lime)'
    : accent === 'error'
      ? 'var(--color-status-error)'
      : 'var(--color-text-primary)';

  const hoverBg = accent === 'lime'
    ? 'rgba(204, 255, 0, 0.08)'
    : accent === 'error'
      ? 'rgba(255, 0, 51, 0.08)'
      : 'var(--color-bg-hover)';

  return (
    <button
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left"
      disabled={disabled}
      onClick={onClick}
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-sm)',
        fontWeight: 600,
        letterSpacing: 'var(--tracking-wide)',
        color: disabled ? 'var(--color-text-disabled)' : accentColor,
        background: 'transparent',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'all var(--duration-fast) var(--ease-snap)',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = hoverBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <span style={{ color: disabled ? 'var(--color-text-disabled)' : accentColor, opacity: disabled ? 0.4 : 0.7 }}>
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {shortcut && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-tertiary)',
          }}
        >
          {shortcut}
        </span>
      )}
      {rightIcon && (
        <span style={{ color: disabled ? 'var(--color-text-disabled)' : 'var(--color-text-tertiary)', opacity: 0.7 }}>
          {rightIcon}
        </span>
      )}
    </button>
  );
}
