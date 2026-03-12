/**
 * ChainSlot Component - "Digital Underground" Aesthetic
 * Fast, keyboard-first workflow with cyber visual identity
 */

import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { useDraggable } from '@dnd-kit/core';
import { ChevronDown, AudioLines } from 'lucide-react';
import type { PluginNodeUI, ChainSlot as ChainSlotType } from '../../api/types';
import { useChainStore, useChainActions } from '../../stores/chainStore';
import { useMeterStore } from '../../stores/meterStore';
import { usePluginStore } from '../../stores/pluginStore';
import { PluginSwapMenu } from './PluginSwapMenu';
import { BranchGainBadge } from './BranchGainBadge';
import { PluginControlsPanel } from './PluginControlsPanel';
import { SlotContextMenu } from './SlotContextMenu';

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
  /** Open plugin editor inline (embedded in host window). Falls back to onToggleEditor if not provided. */
  onOpenInline?: () => void;
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
  /** Whether this slot is a direct child of a parallel group */
  isParallelChild?: boolean;
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
  onOpenInline,
  isDragActive = false,
  groupSelectMode = false,
  onSelect,
  disabledDropIds,
  parentId = 0,
  indexInParent = -1,
  isParallelChild = false,
}: ChainSlotCyberProps) {
  // Unified data access
  const id = node?.id ?? slot?.index ?? 0;
  const name = node?.name ?? slot?.name ?? '';
  const bypassed = node?.bypassed ?? slot?.bypassed ?? false;
  const isMuted = node?.mute ?? false;
  const latency = node?.latency ?? 0;

  const { duplicateNode, setBranchMute, setBranchGain, showToast,
    toggleNodeExpanded, _endContinuousGesture, setNodeDucking } = useChainActions();
  const slotColor = useChainStore((s) => s.slotColors[id]);

  // Per-plugin expandable controls — select boolean directly, not the full Set
  const isExpanded = useChainStore((s) => s.expandedNodeIds.has(id));

  // Swap menu state
  const [showSwapMenu, setShowSwapMenu] = useState(false);
  const swapMenuAnchorRef = useRef<HTMLDivElement>(null);
  const getEnrichedDataForPlugin = usePluginStore((s) => s.getEnrichedDataForPlugin);
  const enriched = node ? getEnrichedDataForPlugin(node.uid) : undefined;
  const matchedPluginId = enriched?._id;

  // Hover and menu state
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Subscribe to this slot's meter data (dedicated store to avoid chainStore churn)
  const meterData = useMeterStore((s) => s.nodeMeterData[String(id)]);
  const peakMeterVersion = useMeterStore((s) => s.peakMeterVersion);

  // Instantaneous gain delta: output - input (in dB), per this plugin's own data.
  // This works for every slot: input = what entered the plugin, output = what left it.
  const deltaDb = useMemo(() => {
    if (!meterData || bypassed) return null;
    const outDb = Math.max(linearToDb(meterData.peakL), linearToDb(meterData.peakR));
    const inDb = Math.max(linearToDb(meterData.inputPeakL), linearToDb(meterData.inputPeakR));
    // Only meaningful when there's actual signal coming in
    if (inDb <= -59) return null;
    return outDb - inDb;
  }, [meterData, bypassed]);

  // Peak hold: records the largest-magnitude delta ever seen until user resets.
  // No decay — Ableton-style "sticky" peak hold.
  const peakDeltaRef = useRef<number | null>(null);
  const [peakDeltaDb, setPeakDeltaDb] = useState<number | null>(null);

  useEffect(() => {
    if (deltaDb === null) return;
    const current = peakDeltaRef.current;
    if (current === null || Math.abs(deltaDb) > Math.abs(current)) {
      peakDeltaRef.current = deltaDb;
      setPeakDeltaDb(deltaDb);
    }
  }, [deltaDb]);

  // Reset local peak hold whenever the global meter version is bumped
  useEffect(() => {
    peakDeltaRef.current = null;
    setPeakDeltaDb(null);
  }, [peakMeterVersion]);

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

  // Handle dB reset (click to reset all meter peaks across all slots)
  const handleDbReset = () => {
    useMeterStore.setState((s) => ({
      nodeMeterData: {},
      peakMeterVersion: s.peakMeterVersion + 1,
    }));
    showToast('All meter peaks reset');
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
    if (groupSelectMode || e.metaKey || e.ctrlKey) {
      onSelect?.(e);
    } else if (e.shiftKey) {
      // Shift+click: open external window (backward compat)
      e.stopPropagation();
      onToggleEditor();
    } else if (onOpenInline) {
      // Normal click: open inline editor
      e.stopPropagation();
      onOpenInline();
    } else {
      // Fallback: open external window
      e.stopPropagation();
      onToggleEditor();
    }
  };

  return (
    <div className="chain-slot-wrapper">
      <div className="relative overflow-hidden">
        <div
          ref={setDragRef}
          className={`
          chain-slot-cyber
          ${bypassed ? 'bypassed' : ''}
          ${isMuted ? 'inactive' : ''}
          ${isSelected || isMultiSelected ? 'selected' : ''}
          ${isDragging ? 'dragging' : ''}
          ${isDragActive && !isDragging ? 'dim-during-drag' : ''}
        `}
          style={{
            zIndex: showContextMenu ? 100 : undefined,
            borderLeft: slotColor ? `3px solid ${slotColor}` : undefined,
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

          {/* Branch Gain Badge — only in parallel context */}
          {isParallelChild && node && (
            <BranchGainBadge
              gainDb={node.branchGainDb ?? 0}
              onChange={(db) => setBranchGain(node.id, db)}
              onDragEnd={_endContinuousGesture}
            />
          )}

          {/* Plugin Name */}
          <div className="slot-name-row" ref={swapMenuAnchorRef}>
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
              title="Gain change (input → output) — click to reset all peaks"
            >
              {peakDeltaDb !== null
                ? `${peakDeltaDb >= 0 ? '+' : ''}${peakDeltaDb.toFixed(1)}dB`
                : '---'
              }
            </span>
            {(() => {
              const latMs = meterData?.latencyMs ?? latency;
              if (latMs <= 0.05) return null;
              const latColor = latMs >= 50 ? 'var(--color-status-error)'
                : latMs >= 20 ? '#ff8c00'
                : latMs >= 5 ? 'var(--color-accent-yellow)'
                : undefined;
              return (
                <span className="latency" style={latColor ? { color: latColor } : undefined}>
                  {latMs.toFixed(1)}ms
                </span>
              );
            })()}
          </div>

          {/* Keyboard Shortcuts (Visible on Hover/Select) */}
          <div className={`slot-shortcuts ${showShortcuts || isSelected ? 'visible' : ''}`}>
            <kbd className={!isMuted ? 'active' : ''}>I</kbd>
            <kbd className={bypassed ? 'active' : ''}>B</kbd>
          </div>

          {/* Control Buttons */}
          <div className="slot-controls">
            {node?.autoGainEnabled && (
              <span
                style={{
                  fontSize: 'var(--text-nano)',
                  fontFamily: 'var(--font-system)',
                  fontWeight: 700,
                  color: '#deff0a',
                  letterSpacing: '0.05em',
                  lineHeight: 1,
                  opacity: 0.8,
                }}
              >
                AG
              </span>
            )}
            {isParallelChild && node && !node.isDryPath && (
              <button
                className="ctrl-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setNodeDucking(
                    node.id,
                    !node.duckEnabled,
                    node.duckThresholdDb ?? -20,
                    node.duckAttackMs ?? 5,
                    node.duckReleaseMs ?? 200,
                  );
                }}
                title={node.duckEnabled ? 'Disable ducking' : 'Enable ducking'}
                style={{ color: node.duckEnabled ? 'var(--color-accent-cyan)' : undefined }}
              >
                <AudioLines className="w-3 h-3" />
              </button>
            )}
            <button
              className={`ctrl-btn inout ${!isMuted ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (node) {
                  setBranchMute(node.id, !isMuted);
                }
              }}
              title={isMuted ? 'Activate plugin (I)' : 'Deactivate plugin (I)'}
            >
              I/O
            </button>
            <button
              className={`ctrl-btn bypass ${bypassed ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleBypass();
              }}
              title="Bypass — unload plugin to save CPU (B)"
            >
              B
            </button>

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

          {/* Right-click context menu */}
          {showContextMenu && node && (
            <SlotContextMenu
              position={showContextMenu}
              nodeId={id}
              nodeFileOrIdentifier={node.fileOrIdentifier}
              parentId={parentId}
              indexInParent={indexInParent}
              onClose={() => setShowContextMenu(null)}
              onDuplicate={() => { handleDuplicate(); setShowContextMenu(null); }}
              onRemove={() => { onRemove(); setShowContextMenu(null); }}
              onShowSwapMenu={() => { setShowContextMenu(null); setShowSwapMenu(true); }}
            />
          )}

          {/* Selection Indicator - Neon Accent */}
          {(isSelected || isMultiSelected) && (
            <div className="selection-indicator" />
          )}

          {/* Status Badges */}
          <div className="slot-badges">
            {bypassed && (
              <span className="badge badge-bypass">BYPASS</span>
            )}
          </div>
        </div>
      </div>

      {/* Expandable Controls Panel */}
      {node && (
        <PluginControlsPanel node={node} isExpanded={isExpanded} />
      )}

      {/* Plugin Swap Menu — rendered via portal to escape overflow-hidden */}
      {showSwapMenu && node && createPortal(
        <PluginSwapMenu
          nodeId={node.id}
          pluginName={node.name}
          matchedPluginId={matchedPluginId}
          pluginUid={node.uid}
          anchorRef={swapMenuAnchorRef}
          onSwapComplete={() => setShowSwapMenu(false)}
          onClose={() => setShowSwapMenu(false)}
        />,
        document.body,
      )}

    </div>
  );
});
