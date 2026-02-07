import { useState, useCallback, useRef, useMemo } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { GripVertical, Power, X, ArrowLeftRight, Layers, GitBranch } from 'lucide-react';
import type { PluginNodeUI, ChainSlot as ChainSlotType } from '../../api/types';
import { useChainStore } from '../../stores/chainStore';
import { PluginSwapMenu } from './PluginSwapMenu';

// Convert linear to dB
function linearToDb(linear: number): number {
  if (linear <= 0.00001) return -60;
  return 20 * Math.log10(linear);
}

// Convert dB to percentage (0-100) for display
function dbToPercent(db: number): number {
  const minDb = -60;
  const maxDb = 6;
  const clamped = Math.max(minDb, Math.min(maxDb, db));
  return ((clamped - minDb) / (maxDb - minDb)) * 100;
}

const ZERO_DB_PERCENT = dbToPercent(0);

const METER_GRADIENT = `linear-gradient(to top,
  #1b9e3e 0%,
  #22c55e 40%,
  #a3e635 60%,
  #eab308 75%,
  #f97316 85%,
  #ef4444 95%,
  #ef4444 100%
)`;

function InlineMeterBar({ percent, peakHoldPercent }: { percent: number; peakHoldPercent?: number }) {
  return (
    <div
      className="relative rounded-sm overflow-hidden"
      style={{ width: 3, height: '100%', background: '#0a0a0a' }}
    >
      {/* Level bar */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: `${percent}%`,
          background: METER_GRADIENT,
          transition: 'height 30ms linear',
        }}
      />

      {/* Peak hold indicator */}
      {peakHoldPercent !== undefined && peakHoldPercent > 0 && (
        <div
          className="absolute left-0 right-0 h-[1px]"
          style={{
            bottom: `${peakHoldPercent}%`,
            backgroundColor: peakHoldPercent > ZERO_DB_PERCENT ? '#ef4444' : 'rgba(255,255,255,0.7)',
          }}
        />
      )}
    </div>
  );
}

// Module-level: last hover side communicated to ChainEditor's handleDragEnd
let _lastSlotHoverSide: 'left' | 'right' = 'right';
export function getLastSlotHoverSide() { return _lastSlotHoverSide; }

interface ChainSlotProps {
  // V2: node-based
  node?: PluginNodeUI;
  // V1 compat: slot-based
  slot?: ChainSlotType;
  isEditorOpen: boolean;
  isMultiSelected?: boolean;
  isSelected?: boolean;
  /** The matched PluginRadar catalog ID (from scannedPlugins matching) */
  matchedPluginId?: string;
  onRemove: () => void;
  onToggleBypass: () => void;
  onToggleEditor: () => void;
  /** Called when a plugin swap completes successfully */
  onSwapComplete?: (newPluginName: string, confidence: number) => void;
  /** Whether any drag is currently active (for dimming non-dragged items) */
  isDragActive?: boolean;
  /** Whether group select mode is active */
  groupSelectMode?: boolean;
  /** Called when the slot is clicked in selection context (group mode or ctrl/cmd click) */
  onSelect?: (e: React.MouseEvent) => void;
}

export function ChainSlot({
  node,
  slot,
  isEditorOpen,
  isMultiSelected = false,
  isSelected = false,
  matchedPluginId,
  onRemove,
  onToggleBypass,
  onToggleEditor,
  onSwapComplete,
  isDragActive: _isDragActive = false,
  groupSelectMode = false,
  onSelect,
}: ChainSlotProps) {
  // Unified data access
  const id = node?.id ?? slot?.index ?? 0;
  const name = node?.name ?? slot?.name ?? '';
  const manufacturer = node?.manufacturer ?? slot?.manufacturer ?? '';
  const format = node?.format ?? slot?.format ?? '';
  const bypassed = node?.bypassed ?? slot?.bypassed ?? false;
  const uid = node?.uid ?? slot?.uid;

  // Subscribe to meter data for this specific node
  const meterData = useChainStore((s) => s.nodeMeterData[String(id)]);

  const meterValues = useMemo(() => {
    if (!meterData || bypassed) {
      return { peakLPercent: 0, peakRPercent: 0, peakHoldLPercent: 0, peakHoldRPercent: 0 };
    }
    return {
      peakLPercent: dbToPercent(linearToDb(meterData.peakL)),
      peakRPercent: dbToPercent(linearToDb(meterData.peakR)),
      peakHoldLPercent: dbToPercent(linearToDb(meterData.peakHoldL)),
      peakHoldRPercent: dbToPercent(linearToDb(meterData.peakHoldR)),
    };
  }, [meterData, bypassed]);

  const [showSwapMenu, setShowSwapMenu] = useState(false);
  const [swapToast, setSwapToast] = useState<string | null>(null);
  const [hoverSide, setHoverSide] = useState<'left' | 'right' | null>(null);
  const slotRef = useRef<HTMLDivElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `drag:${id}`,
    data: {
      type: 'plugin',
      nodeId: id,
      node: node,
    },
  });

  // Also a drop target: dropping a plugin onto this slot creates a group
  const {
    isOver: isDropOver,
    setNodeRef: setDropRef,
  } = useDroppable({
    id: `slot:${id}`,
    data: { type: 'plugin-slot', nodeId: id },
  });

  const handleSwapComplete = useCallback((newPluginName: string, confidence: number) => {
    setSwapToast(`Swapped ${name} → ${newPluginName} (${confidence}% match)`);
    setTimeout(() => setSwapToast(null), 3000);
    onSwapComplete?.(newPluginName, confidence);
  }, [name, onSwapComplete]);

  // Combine drag + drop refs
  const combinedRef = useCallback((el: HTMLElement | null) => {
    setDragRef(el);
    setDropRef(el);
    (slotRef as React.MutableRefObject<HTMLDivElement | null>).current = el as HTMLDivElement | null;
  }, [setDragRef, setDropRef]);

  const isGroupDropTarget = isDropOver && _isDragActive && !isDragging;

  // Track left/right hover position for serial vs parallel
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!slotRef.current) return;
    const rect = slotRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const side = relX < 0.5 ? 'left' : 'right';
    setHoverSide(side);
    _lastSlotHoverSide = side;
  }, []);

  // Reset hover side when not a drop target
  const effectiveHoverSide = isGroupDropTarget ? hoverSide : null;

  return (
    <div className="relative">
      <div
        ref={combinedRef}
        onClick={(e) => {
          e.stopPropagation();
          if ((groupSelectMode || e.ctrlKey || e.metaKey) && onSelect) {
            onSelect(e);
          } else {
            onToggleEditor();
          }
        }}
        onPointerMove={isGroupDropTarget ? handlePointerMove : undefined}
        onPointerLeave={() => setHoverSide(null)}
        className={`
          relative flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer overflow-hidden
          ${isDragging ? 'opacity-30 scale-[0.98]' : ''}
          ${isGroupDropTarget
            ? 'border-plugin-accent ring-1 ring-plugin-accent/50 bg-plugin-bg'
            : isMultiSelected
              ? 'bg-plugin-accent/10 border-plugin-accent ring-1 ring-plugin-accent/50'
              : isSelected
                ? 'bg-plugin-accent/8 border-plugin-accent/70 ring-1 ring-plugin-accent/30 shadow-glow-accent'
                : bypassed
                  ? 'bg-plugin-bg/50 border-plugin-border/50'
                  : isEditorOpen
                    ? 'bg-plugin-bg border-plugin-accent shadow-glow-accent'
                    : 'bg-plugin-bg border-plugin-border hover:border-plugin-accent/50'
          }
        `}
      >
        {/* Left/right split highlight when dragging over */}
        {isGroupDropTarget && (
          <>
            <div
              className={`absolute inset-y-0 left-0 w-1/2 transition-colors duration-100 pointer-events-none ${
                effectiveHoverSide === 'left' ? 'bg-blue-500/20' : ''
              }`}
            />
            <div
              className={`absolute inset-y-0 right-0 w-1/2 transition-colors duration-100 pointer-events-none ${
                effectiveHoverSide === 'right' ? 'bg-orange-500/20' : ''
              }`}
            />
            {/* Center divider */}
            <div className="absolute inset-y-1 left-1/2 w-px bg-plugin-border/50 pointer-events-none" />
          </>
        )}

        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="relative z-10 flex-shrink-0 p-1 rounded hover:bg-plugin-border cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4 text-plugin-muted" />
        </button>

        {/* Plugin info */}
        <div className="relative z-10 flex-1 min-w-0">
          <p
            className={`text-sm truncate ${
              bypassed ? 'text-plugin-muted line-through' : 'text-plugin-text'
            }`}
          >
            {name}
          </p>
          <p className="text-xs text-plugin-muted truncate">
            {manufacturer} {format && `• ${format}`}
          </p>
        </div>

        {/* Controls */}
        <div className="relative z-10 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {/* Swap button */}
          {matchedPluginId && (
            <button
              onClick={() => setShowSwapMenu(!showSwapMenu)}
              className={`p-1.5 rounded transition-colors ${
                showSwapMenu
                  ? 'bg-plugin-accent/20 text-plugin-accent'
                  : 'hover:bg-plugin-border text-plugin-muted hover:text-plugin-text'
              }`}
              title="Swap plugin"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          )}

          {/* Bypass toggle */}
          <button
            onClick={onToggleBypass}
            className={`p-1.5 rounded transition-colors ${
              bypassed
                ? 'bg-yellow-500/20 text-yellow-500'
                : 'hover:bg-plugin-border text-plugin-muted hover:text-plugin-text'
            }`}
            title={bypassed ? 'Enable' : 'Bypass'}
          >
            <Power className="w-4 h-4" />
          </button>

          {/* Remove */}
          <button
            onClick={onRemove}
            className="p-1.5 rounded hover:bg-red-500/20 text-plugin-muted hover:text-red-500 transition-colors"
            title="Remove from chain"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Inline meter bars */}
        <div className="relative z-10 flex gap-[1px] h-8 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <InlineMeterBar
            percent={meterValues.peakLPercent}
            peakHoldPercent={meterValues.peakHoldLPercent}
          />
          <InlineMeterBar
            percent={meterValues.peakRPercent}
            peakHoldPercent={meterValues.peakHoldRPercent}
          />
        </div>
      </div>

      {/* Group creation hint when dragging over */}
      {isGroupDropTarget && (
        <div className="absolute -top-6 left-0 right-0 z-50 flex justify-center pointer-events-none">
          <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-md shadow-lg text-[10px] font-medium whitespace-nowrap ${
            effectiveHoverSide === 'left'
              ? 'bg-blue-500/90 text-white'
              : 'bg-orange-500/90 text-white'
          }`}>
            {effectiveHoverSide === 'left' ? (
              <>
                <Layers className="w-3 h-3" />
                Serial Group
              </>
            ) : (
              <>
                <GitBranch className="w-3 h-3" />
                Parallel Group
              </>
            )}
          </div>
        </div>
      )}

      {/* Swap Menu Dropdown */}
      {showSwapMenu && matchedPluginId && (
        <PluginSwapMenu
          nodeId={id}
          pluginName={name}
          matchedPluginId={matchedPluginId}
          pluginUid={uid}
          onSwapComplete={handleSwapComplete}
          onClose={() => setShowSwapMenu(false)}
        />
      )}

      {/* Swap Toast */}
      {swapToast && (
        <div className="absolute -bottom-8 left-0 right-0 z-50 flex justify-center">
          <div className="bg-plugin-accent/90 text-white text-xs px-3 py-1 rounded-full shadow-lg animate-fade-in-up">
            {swapToast}
          </div>
        </div>
      )}
    </div>
  );
}
