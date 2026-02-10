import { useState, useCallback, useRef, useMemo, useEffect, memo } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Layers, GitBranch, X, ArrowLeftRight } from 'lucide-react';
import type { PluginNodeUI, ChainSlot as ChainSlotType } from '../../api/types';
import { useChainStore } from '../../stores/chainStore';
import { PluginSwapMenu } from './PluginSwapMenu';
import stripBg from '../../assets/rackmount-strip.png';
import containerBg from '../../assets/plugin-container.png';
import interfaceBg from '../../assets/plugin-instance-interface.png';
import bypassIconSvg from '../../assets/bypass-icon.svg';
import duplicateIconSvg from '../../assets/duplicate-icon.svg';

// Convert linear to dB
function linearToDb(linear: number): number {
  if (linear <= 0.00001) return -60;
  return 20 * Math.log10(linear);
}

// Convert dB to percentage (0-100) for meter bar fill
function dbToPercent(db: number): number {
  const minDb = -60;
  const maxDb = 6;
  const clamped = Math.max(minDb, Math.min(maxDb, db));
  return ((clamped - minDb) / (maxDb - minDb)) * 100;
}

// Format dB for display
function formatDb(db: number): string {
  if (db <= -59) return '-\u221E';
  return Math.round(db).toString();
}

const AMBER_METER_GRADIENT = `linear-gradient(to top,
  #3d2a14 0%,
  #89572a 40%,
  #c9944a 70%,
  #e6b96e 100%
)`;

// Module-level: last hover side communicated to ChainEditor's handleDragEnd
let _lastSlotHoverSide: 'left' | 'right' = 'right';
export function getLastSlotHoverSide() { return _lastSlotHoverSide; }
export function resetLastSlotHoverSide() { _lastSlotHoverSide = 'right'; }

interface ChainSlotProps {
  // V2: node-based
  node?: PluginNodeUI;
  // V1 compat: slot-based
  slot?: ChainSlotType;
  /** 1-based DFS plugin index */
  slotNumber?: number;
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
  /** Set of node IDs whose drop targets should be disabled (self-drop prevention) */
  disabledDropIds?: Set<number>;
}

export const ChainSlot = memo(function ChainSlot({
  node,
  slot,
  slotNumber,
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
  disabledDropIds,
}: ChainSlotProps) {
  // Unified data access
  const id = node?.id ?? slot?.index ?? 0;
  const name = node?.name ?? slot?.name ?? '';
  const manufacturer = node?.manufacturer ?? slot?.manufacturer ?? '';
  const bypassed = node?.bypassed ?? slot?.bypassed ?? false;
  const uid = node?.uid ?? slot?.uid;

  const duplicateNode = useChainStore((s) => s.duplicateNode);

  // Subscribe to meter data for this specific node
  const meterData = useChainStore((s) => s.nodeMeterData[String(id)]);

  // Real-time meter bar fill percentages
  const meterValues = useMemo(() => {
    if (!meterData || bypassed) return { peakLPercent: 0, peakRPercent: 0 };
    const outLDb = linearToDb(meterData.peakL);
    const outRDb = linearToDb(meterData.peakR);
    return {
      peakLPercent: dbToPercent(outLDb),
      peakRPercent: dbToPercent(outRDb),
    };
  }, [meterData, bypassed]);

  // Peak-hold dB values — tracked via refs + direct DOM mutation to avoid
  // 2N state updates per frame. Only the formatted string is checked so the
  // DOM is touched only when the displayed text actually changes.
  const inputPeakRef = useRef(-Infinity);
  const outputPeakRef = useRef(-Infinity);
  const inputPeakElRef = useRef<HTMLButtonElement>(null);
  const outputPeakElRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!meterData || bypassed) return;
    const inDb = Math.max(
      linearToDb(meterData.inputPeakL ?? 0),
      linearToDb(meterData.inputPeakR ?? 0),
    );
    const outDb = Math.max(
      linearToDb(meterData.peakL),
      linearToDb(meterData.peakR),
    );
    const newIn = Math.max(inputPeakRef.current, inDb);
    const newOut = Math.max(outputPeakRef.current, outDb);
    // Only touch DOM when the rounded display value changes
    if (formatDb(newIn) !== formatDb(inputPeakRef.current)) {
      inputPeakRef.current = newIn;
      if (inputPeakElRef.current) {
        inputPeakElRef.current.firstChild!.textContent = formatDb(newIn);
      }
    } else {
      inputPeakRef.current = newIn;
    }
    if (formatDb(newOut) !== formatDb(outputPeakRef.current)) {
      outputPeakRef.current = newOut;
      if (outputPeakElRef.current) {
        outputPeakElRef.current.firstChild!.textContent = formatDb(newOut);
      }
    } else {
      outputPeakRef.current = newOut;
    }
  }, [meterData, bypassed]);

  const resetInputPeak = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    inputPeakRef.current = -Infinity;
    if (inputPeakElRef.current) {
      inputPeakElRef.current.firstChild!.textContent = formatDb(-Infinity);
    }
  }, []);

  const resetOutputPeak = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    outputPeakRef.current = -Infinity;
    if (outputPeakElRef.current) {
      outputPeakElRef.current.firstChild!.textContent = formatDb(-Infinity);
    }
  }, []);

  const [showSwapMenu, setShowSwapMenu] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState<{ x: number; y: number } | null>(null);
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
    disabled: disabledDropIds?.has(id),
  });

  const handleSwapComplete = useCallback((newPluginName: string, confidence: number) => {
    setSwapToast(`Swapped \u2192 ${newPluginName} (${confidence}%)`);
    setTimeout(() => setSwapToast(null), 3000);
    onSwapComplete?.(newPluginName, confidence);
  }, [onSwapComplete]);

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

  const handleDuplicate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    duplicateNode(id);
  }, [duplicateNode, id]);

  const handleBypass = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleBypass();
  }, [onToggleBypass]);

  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove();
  }, [onRemove]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div className="relative" style={{ overflow: 'visible' }}>
      <div
        ref={combinedRef}
        {...attributes}
        {...listeners}
        onClick={(e) => {
          e.stopPropagation();
          setShowContextMenu(null);
          if ((groupSelectMode || e.ctrlKey || e.metaKey) && onSelect) {
            onSelect(e);
          } else {
            onToggleEditor();
          }
        }}
        onContextMenu={handleContextMenu}
        onPointerMove={isGroupDropTarget ? handlePointerMove : undefined}
        onPointerLeave={() => setHoverSide(null)}
        className={`
          relative flex cursor-grab active:cursor-grabbing transition-all select-none
          ${isDragging ? 'opacity-30 scale-[0.98]' : ''}
          ${isGroupDropTarget ? 'ring-1 ring-plugin-accent/50' : ''}
          ${isMultiSelected ? 'ring-1 ring-plugin-accent/50' : ''}
          ${!isMultiSelected && isSelected ? 'ring-1 ring-plugin-accent/30' : ''}
          ${!isMultiSelected && !isSelected && isEditorOpen ? 'ring-1 ring-plugin-accent/40' : ''}
        `}
        style={{ width: '100%', maxWidth: 439, height: 69 }}
      >
        {/* Left rackmount strip — slot number */}
        <div
          className="relative flex-shrink-0"
          style={{
            width: 16,
            height: 69,
            backgroundImage: `url(${stripBg})`,
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
          }}
        >
          {slotNumber != null && (
            <div className="absolute inset-0 flex items-center justify-center font-mono text-white/30 text-[10px] pointer-events-none">
              {slotNumber}
            </div>
          )}
        </div>

        {/* Center container */}
        <div
          className="relative flex-1"
          style={{
            height: 69,
            backgroundImage: `url(${containerBg})`,
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
          }}
        >
          {/* Left/right split highlight when dragging over */}
          {isGroupDropTarget && (
            <>
              <div
                className={`absolute inset-y-0 left-0 w-1/2 transition-all duration-150 pointer-events-none ${
                  effectiveHoverSide === 'left'
                    ? 'bg-plugin-serial/25 drop-zone-stripes-serial border-r border-plugin-serial/30'
                    : ''
                }`}
              >
                {/* Serial icon hint */}
                <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-150 ${
                  effectiveHoverSide === 'left' ? 'opacity-0' : 'opacity-20'
                }`}>
                  <Layers className="w-5 h-5 text-plugin-serial" />
                </div>
              </div>
              <div
                className={`absolute inset-y-0 right-0 w-1/2 transition-all duration-150 pointer-events-none ${
                  effectiveHoverSide === 'right'
                    ? 'bg-plugin-parallel/25 drop-zone-stripes-parallel border-l border-plugin-parallel/30'
                    : ''
                }`}
              >
                {/* Parallel icon hint */}
                <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-150 ${
                  effectiveHoverSide === 'right' ? 'opacity-0' : 'opacity-20'
                }`}>
                  <GitBranch className="w-5 h-5 text-plugin-parallel" />
                </div>
              </div>
              <div className="absolute inset-y-1 left-1/2 w-px bg-plugin-border/50 pointer-events-none" />
            </>
          )}

          {/* Interface area — left-aligned, dims when bypassed */}
          <div
            className={`absolute ${bypassed ? 'opacity-40' : ''}`}
            style={{
              left: 0,
              top: 7,
              width: 330,
              height: 55,
              backgroundImage: `url(${interfaceBg})`,
              backgroundSize: '100% 100%',
              backgroundRepeat: 'no-repeat',
              overflow: 'hidden',
            }}
          >
            {/* Plugin name */}
            <div
              className="absolute font-mono uppercase text-white truncate"
              style={{ left: 10, top: 6, fontSize: 17, lineHeight: '20px', maxWidth: 240 }}
            >
              {name}
            </div>

            {/* Manufacturer */}
            <div
              className="absolute font-mono uppercase text-white/70 truncate"
              style={{ left: 10, top: 28, fontSize: 11, lineHeight: '14px', maxWidth: 240 }}
            >
              {manufacturer}
            </div>
          </div>

          {/* Right area — meters, labels, buttons (outside interface bg) */}
          <div className={`absolute ${bypassed ? 'opacity-40' : ''}`} style={{ left: 333, top: 0, right: 0, height: 69 }}>
            {/* IN label */}
            <div
              className="absolute font-mono uppercase text-white/40"
              style={{ left: 0, top: 18, fontSize: 10, lineHeight: '12px' }}
            >
              IN
            </div>
            {/* IN peak value — click to reset */}
            <button
              ref={inputPeakElRef}
              className="absolute font-mono tabular-nums text-white/80 hover:text-plugin-accent transition-colors cursor-pointer"
              style={{ left: 16, top: 18, fontSize: 10, lineHeight: '12px' }}
              onClick={resetInputPeak}
              onPointerDown={(e) => e.stopPropagation()}
              title="Click to reset peak"
            >
              <span>{formatDb(inputPeakRef.current)}</span><span className="text-white/25 ml-px text-[8px]">dB</span>
            </button>

            {/* OUT label */}
            <div
              className="absolute font-mono uppercase text-white/40"
              style={{ left: 0, top: 40, fontSize: 10, lineHeight: '12px' }}
            >
              OUT
            </div>
            {/* OUT peak value — click to reset */}
            <button
              ref={outputPeakElRef}
              className="absolute font-mono tabular-nums text-white/80 hover:text-plugin-accent transition-colors cursor-pointer"
              style={{ left: 16, top: 40, fontSize: 10, lineHeight: '12px' }}
              onClick={resetOutputPeak}
              onPointerDown={(e) => e.stopPropagation()}
              title="Click to reset peak"
            >
              <span>{formatDb(outputPeakRef.current)}</span><span className="text-white/25 ml-px text-[8px]">dB</span>
            </button>

            {/* Duplicate icon button */}
            <button
              className="absolute opacity-60 hover:opacity-100 transition-opacity"
              style={{ left: 45, top: 16, width: 12, height: 12 }}
              onClick={handleDuplicate}
              onPointerDown={(e) => e.stopPropagation()}
              title="Duplicate plugin"
            >
              <img src={duplicateIconSvg} alt="" className="w-full h-full" draggable={false} />
            </button>

            {/* Bypass icon button */}
            <button
              className={`absolute transition-opacity ${bypassed ? 'opacity-100 brightness-150' : 'opacity-60 hover:opacity-100'}`}
              style={{ left: 45, top: 38, width: 12, height: 12 }}
              onClick={handleBypass}
              onPointerDown={(e) => e.stopPropagation()}
              title={bypassed ? 'Enable' : 'Bypass'}
            >
              <img src={bypassIconSvg} alt="" className="w-full h-full" draggable={false} />
            </button>

            {/* Swap icon button — only when matched to catalog */}
            {matchedPluginId && (
              <button
                className="absolute opacity-50 hover:opacity-100 hover:text-plugin-accent transition-all text-white/60"
                style={{ left: 45, top: 55, width: 12, height: 12 }}
                onClick={(e) => { e.stopPropagation(); setShowSwapMenu(true); }}
                onPointerDown={(e) => e.stopPropagation()}
                title="Swap plugin"
              >
                <ArrowLeftRight className="w-full h-full" />
              </button>
            )}

            {/* L meter bar */}
            <div
              className="absolute overflow-hidden rounded-[1px]"
              style={{ left: 61, top: 7, width: 5, height: 55, background: 'rgba(24,24,24,0.4)' }}
            >
              <div
                className="absolute bottom-0 left-0 right-0"
                style={{
                  height: `${meterValues.peakLPercent}%`,
                  background: AMBER_METER_GRADIENT,
                }}
              />
            </div>

            {/* R meter bar */}
            <div
              className="absolute overflow-hidden rounded-[1px]"
              style={{ left: 68, top: 7, width: 5, height: 55, background: 'rgba(24,24,24,0.4)' }}
            >
              <div
                className="absolute bottom-0 left-0 right-0"
                style={{
                  height: `${meterValues.peakRPercent}%`,
                  background: AMBER_METER_GRADIENT,
                }}
              />
            </div>
          </div>
        </div>

        {/* Right rackmount strip — remove button */}
        <div
          className="relative flex-shrink-0"
          style={{
            width: 16,
            height: 69,
            backgroundImage: `url(${stripBg})`,
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
          }}
        >
          <button
            className="absolute inset-0 flex items-center justify-center text-white/20 hover:text-red-400 transition-colors"
            onClick={handleRemove}
            onPointerDown={(e) => e.stopPropagation()}
            title="Remove plugin"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>

      {/* Group creation hint when dragging over */}
      {isGroupDropTarget && (
        <div className="absolute -top-6 left-0 right-0 z-50 flex justify-center pointer-events-none animate-fade-in-up">
          <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-md shadow-lg text-[10px] font-medium whitespace-nowrap ${
            effectiveHoverSide === 'left'
              ? 'bg-plugin-serial text-black'
              : 'bg-plugin-parallel text-black'
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

      {/* Context menu (right-click) */}
      {showContextMenu && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setShowContextMenu(null)} />
          <div
            className="fixed z-[101] bg-plugin-surface border border-plugin-border rounded-lg shadow-xl py-1 min-w-[140px]"
            style={{ left: showContextMenu.x, top: showContextMenu.y }}
          >
            {matchedPluginId && (
              <button
                onClick={() => { setShowContextMenu(null); setShowSwapMenu(true); }}
                className="w-full px-3 py-1.5 text-left text-xs text-plugin-text hover:bg-plugin-border/50 font-mono"
              >
                Swap Plugin
              </button>
            )}
            <button
              onClick={() => { setShowContextMenu(null); onRemove(); }}
              className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-500/10 font-mono"
            >
              Remove
            </button>
          </div>
        </>
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
});
