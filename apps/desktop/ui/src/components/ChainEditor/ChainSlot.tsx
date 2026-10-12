import { useState, useCallback, useRef, useMemo, useEffect, memo } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Layers, GitBranch, X, ArrowLeftRight, SlidersHorizontal, Pause, Lock, Timer, Power, Copy, GripVertical, AlertTriangle } from 'lucide-react';
import type { PluginNodeUI, ChainSlot as ChainSlotType } from '../../api/types';
import { useMacroStore } from '../../stores/macroStore';
import { useChainStore } from '../../stores/chainStore';
import { juceBridge } from '../../api/juce-bridge';
import { PluginSwapMenu } from './PluginSwapMenu';
import { CATEGORY_SWATCH, CATEGORY_LABELS } from '../../constants/categoryColors';

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

// Meter gradient follows audio convention: green → yellow → red
const METER_GRADIENT = `linear-gradient(to top,
  #16a34a 0%,
  #22c55e 55%,
  #eab308 80%,
  #ef4444 100%
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
  /** Effect category from the catalog (e.g. 'eq'), used for the colour stripe */
  category?: string | null;
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
  category,
}: ChainSlotProps) {
  // Unified data access
  const id = node?.id ?? slot?.index ?? 0;
  const name = node?.name ?? slot?.name ?? '';
  const manufacturer = node?.manufacturer ?? slot?.manufacturer ?? '';
  const bypassed = node?.bypassed ?? slot?.bypassed ?? false;
  const suspended = node?.suspended ?? false;
  const recallSafe = node?.recallSafe ?? false;
  const ignoreLatency = node?.ignoreLatency ?? false;
  const latencySamples = node?.latencySamples ?? 0;
  const uid = node?.uid ?? slot?.uid;

  const duplicateNode = useChainStore((s) => s.duplicateNode);
  const setNodeSuspended = useChainStore((s) => s.setNodeSuspended);
  const setNodeRecallSafe = useChainStore((s) => s.setNodeRecallSafe);
  const setNodeIgnoreLatency = useChainStore((s) => s.setNodeIgnoreLatency);
  const automation = useChainStore((s) => s.automationByNode?.[String(id)]) || [];
  const fetchAutomationBindings = useChainStore((s) => s.fetchAutomationBindings);
  const assignAutomation = useChainStore((s) => s.assignAutomation);
  const unassignAutomation = useChainStore((s) => s.unassignAutomation);
  const addMacroLink = useMacroStore((s) => s.addLink);
  const [showAutomation, setShowAutomation] = useState(false);
  const automationTriggerRef = useRef<HTMLButtonElement>(null);
  const automationFilterRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (showAutomation) automationFilterRef.current?.focus(); }, [showAutomation]);
  const [parameters, setParameters] = useState<Array<{ index: number; name: string; value: number }>>([]);
  const [parameterFilter, setParameterFilter] = useState('');
  const [automationBusy, setAutomationBusy] = useState(false);

  // Subscribe to meter data for this specific node
  const meterData = useChainStore((s) => s.nodeMeterData?.[String(id)]);

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

  const handleSuspend = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setAutomationBusy(true);
    try { await setNodeSuspended(id, !suspended); } finally { setAutomationBusy(false); }
  }, [id, setNodeSuspended, suspended]);

  const handleRecallSafe = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setNodeRecallSafe(id, !recallSafe);
  }, [id, setNodeRecallSafe, recallSafe]);

  const handleIgnoreLatency = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setNodeIgnoreLatency(id, !ignoreLatency);
  }, [id, setNodeIgnoreLatency, ignoreLatency]);

  const openAutomation = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowAutomation((open) => !open);
    if (!showAutomation) {
      setAutomationBusy(true);
      try {
        const [result] = await Promise.all([juceBridge.getPluginParameters(id), fetchAutomationBindings(id)]);
        if (result.success) setParameters(result.parameters || []);
      } finally { setAutomationBusy(false); }
    }
  }, [fetchAutomationBindings, id, showAutomation]);

  const exposeParameter = useCallback(async (index: number) => {
    setAutomationBusy(true);
    try { await assignAutomation(id, index); } finally { setAutomationBusy(false); }
  }, [assignAutomation, id]);

  const removeAutomation = useCallback(async (proxyId: string) => {
    setAutomationBusy(true);
    try { await unassignAutomation(id, proxyId); } finally { setAutomationBusy(false); }
  }, [id, unassignAutomation]);

  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove();
  }, [onRemove]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const swatch = category ? CATEGORY_SWATCH[category] ?? CATEGORY_SWATCH.utility : null;
  const unavailable = !!(node?.missing || node?.loadError);
  const chipBase = 'h-6 inline-flex items-center gap-1 px-1.5 rounded text-[11px] font-medium transition-colors';
  const chipOff = 'text-plugin-dim hover:text-plugin-text hover:bg-plugin-raised';
  const chipOn = 'text-plugin-accent-bright bg-plugin-accent/15 ring-1 ring-inset ring-plugin-accent/30';
  const iconBtn = 'w-6 h-6 inline-flex items-center justify-center rounded transition-colors';

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
          group/slot relative flex items-stretch h-[52px] w-full rounded-lg overflow-hidden
          cursor-grab active:cursor-grabbing select-none
          border transition-[border-color,background-color,box-shadow,opacity] duration-150
          ${isDragging ? 'opacity-30' : ''}
          ${bypassed ? 'bg-plugin-surface/70' : 'bg-plugin-surface-alt'}
          ${isGroupDropTarget
            ? 'border-plugin-accent/60'
            : isMultiSelected
              ? 'border-plugin-accent shadow-glow-accent'
              : isSelected
                ? 'border-plugin-accent/60'
                : isEditorOpen
                  ? 'border-plugin-accent/40'
                  : 'border-plugin-border hover:border-plugin-border-bright'}
        `}
      >
        {/* Category stripe */}
        <div className={`w-[3px] flex-shrink-0 ${swatch ?? 'bg-plugin-border-bright'} ${bypassed ? 'opacity-30' : ''}`} title={category ? CATEGORY_LABELS[category] ?? category : undefined} />

        {/* Slot number / grip */}
        <div className="relative w-7 flex-shrink-0 flex items-center justify-center text-plugin-dim">
          {slotNumber != null && (
            <span className="num text-[11px] group-hover/slot:opacity-0 transition-opacity">{slotNumber}</span>
          )}
          <GripVertical className="absolute w-3.5 h-3.5 opacity-0 group-hover/slot:opacity-100 transition-opacity" />
        </div>

        {/* Power (bypass) */}
        <div className="flex items-center pr-2">
          <button
            className={`w-7 h-7 rounded-full inline-flex items-center justify-center border transition-colors ${
              bypassed
                ? 'border-plugin-border-bright text-plugin-dim hover:text-plugin-muted'
                : 'border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20'
            }`}
            onClick={handleBypass}
            onPointerDown={(e) => e.stopPropagation()}
            title={bypassed ? 'Enable' : 'Bypass'}
            aria-label={bypassed ? 'Enable plugin' : 'Bypass plugin'}
            aria-pressed={!bypassed}
          >
            <Power className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Name + maker */}
        <div className={`relative flex-1 min-w-0 flex flex-col justify-center pr-2 ${bypassed ? 'opacity-45' : ''}`}>
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className={`truncate text-[14px] leading-tight font-semibold ${bypassed ? 'text-plugin-muted line-through decoration-plugin-dim/60' : 'text-plugin-text'}`}>
              {name}
            </span>
            {isEditorOpen && (
              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-plugin-accent" title="Plugin window open" />
            )}
          </div>
          <div className="flex items-center gap-1.5 min-w-0 text-[11px] leading-tight">
            {unavailable ? (
              <span className="truncate text-amber-300 flex items-center gap-1" title={node?.loadError || 'Plugin unavailable'}>
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                {node?.missing ? 'Plugin unavailable' : node?.loadError}
              </span>
            ) : (
              <span className="truncate text-plugin-muted">{manufacturer}</span>
            )}
            {suspended && (
              <span className="flex-shrink-0 px-1 rounded bg-yellow-500/15 text-yellow-300 text-[10px] font-semibold uppercase tracking-wide">Suspended</span>
            )}
          </div>
        </div>

        {/* Per-slot options */}
        <div className="flex items-center gap-0.5 pr-1.5">
          {node && (
            <>
              <button
                className={`${chipBase} ${recallSafe ? chipOn : chipOff}`}
                onClick={handleRecallSafe}
                onPointerDown={(e) => e.stopPropagation()}
                aria-pressed={recallSafe}
                aria-label="Safe"
                title={recallSafe ? 'Recall-safe: loading a chain or preset keeps this slot. Click to unlock.' : 'Lock this slot so loading a chain or preset keeps it'}
              ><Lock className="w-3 h-3" /><span className="hidden xl:inline">Safe</span></button>
              <button
                className={`${chipBase} ${ignoreLatency ? chipOn : chipOff}`}
                onClick={handleIgnoreLatency}
                onPointerDown={(e) => e.stopPropagation()}
                aria-pressed={ignoreLatency}
                aria-label="Ignore latency"
                title={`${ignoreLatency ? 'Ignoring' : 'Ignore'} this plugin's reported latency (${latencySamples} samples) in delay compensation`}
              ><Timer className="w-3 h-3" /><span className="hidden xl:inline">{ignoreLatency ? 'Lat off' : 'Lat'}</span></button>
            </>
          )}
          <button
            className={`${chipBase} ${suspended ? 'text-yellow-300 bg-yellow-500/15 ring-1 ring-inset ring-yellow-500/30' : chipOff}`}
            onClick={handleSuspend}
            onPointerDown={(e) => e.stopPropagation()}
            aria-pressed={suspended}
            aria-label={suspended ? 'Resume' : 'Suspend'}
            title={suspended ? 'Resume processing' : 'Suspend processing (frees CPU)'}
            disabled={automationBusy}
          ><Pause className="w-3 h-3" /></button>
          <button
            className={`${chipBase} ${showAutomation || automation.length ? chipOn : chipOff}`}
            onClick={openAutomation}
            onPointerDown={(e) => e.stopPropagation()}
            ref={automationTriggerRef}
            aria-expanded={showAutomation}
            title="Automation and macro links"
          ><SlidersHorizontal className="w-3 h-3" /><span className="hidden lg:inline">Auto</span>{automation.length ? <span className="num text-[10px]">{automation.length}</span> : null}</button>
        </div>

        {/* Levels: IN/OUT peak + L/R meters */}
        <div className={`flex items-center gap-2 pl-2 pr-2 border-l border-plugin-border/70 ${bypassed ? 'opacity-40' : ''}`}>
          <div className="hidden sm:flex flex-col justify-center gap-0.5 w-[50px]">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-plugin-dim">In</span>
              <button
                ref={inputPeakElRef}
                className="num text-[10px] text-plugin-muted hover:text-plugin-accent transition-colors"
                onClick={resetInputPeak}
                onPointerDown={(e) => e.stopPropagation()}
                title="Input peak (dB). Click to reset"
              ><span>{formatDb(inputPeakRef.current)}</span></button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-plugin-dim">Out</span>
              <button
                ref={outputPeakElRef}
                className="num text-[10px] text-plugin-text hover:text-plugin-accent transition-colors"
                onClick={resetOutputPeak}
                onPointerDown={(e) => e.stopPropagation()}
                title="Output peak (dB). Click to reset"
              ><span>{formatDb(outputPeakRef.current)}</span></button>
            </div>
          </div>
          <div className="flex gap-[2px] h-9" aria-hidden>
            {[meterValues.peakLPercent, meterValues.peakRPercent].map((pct, i) => (
              <div key={i} className="relative w-1 h-full rounded-sm overflow-hidden bg-plugin-bg shadow-meter">
                <div
                  className="absolute bottom-0 left-0 right-0"
                  style={{
                    height: '100%',
                    background: METER_GRADIENT,
                    clipPath: `inset(${100 - pct}% 0 0 0)`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 pr-1.5 pl-1 border-l border-plugin-border/70">
          <button
            className={`${iconBtn} text-plugin-dim hover:text-plugin-text hover:bg-plugin-raised`}
            onClick={handleDuplicate}
            onPointerDown={(e) => e.stopPropagation()}
            title="Duplicate plugin"
            aria-label="Duplicate plugin"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          {matchedPluginId && (
            <button
              className={`${iconBtn} text-plugin-dim hover:text-plugin-accent hover:bg-plugin-raised`}
              onClick={(e) => { e.stopPropagation(); setShowSwapMenu(true); }}
              onPointerDown={(e) => e.stopPropagation()}
              title="Swap plugin"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            className={`${iconBtn} text-plugin-dim hover:text-red-400 hover:bg-red-500/10`}
            onClick={handleRemove}
            onPointerDown={(e) => e.stopPropagation()}
            title="Remove plugin"
            aria-label="Remove plugin"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Left/right split highlight when dragging over */}
        {isGroupDropTarget && (
          <div className="absolute inset-0 flex pointer-events-none">
            <div
              className={`relative w-1/2 flex items-center justify-center transition-colors duration-150 ${
                effectiveHoverSide === 'left'
                  ? 'bg-plugin-serial/20 drop-zone-stripes-serial'
                  : 'bg-plugin-bg/40'
              }`}
            >
              <Layers className={`w-5 h-5 text-plugin-serial ${effectiveHoverSide === 'left' ? 'opacity-90' : 'opacity-30'}`} />
            </div>
            <div className="w-px bg-plugin-border-bright" />
            <div
              className={`relative w-1/2 flex items-center justify-center transition-colors duration-150 ${
                effectiveHoverSide === 'right'
                  ? 'bg-plugin-parallel/20 drop-zone-stripes-parallel'
                  : 'bg-plugin-bg/40'
              }`}
            >
              <GitBranch className={`w-5 h-5 text-plugin-parallel ${effectiveHoverSide === 'right' ? 'opacity-90' : 'opacity-30'}`} />
            </div>
          </div>
        )}
      </div>

      {showAutomation && (
        <div role="region" aria-label={`Automation for ${name}`} className="absolute right-0 top-[56px] z-[70] w-[min(420px,100%)] rounded-lg border border-plugin-border-bright bg-plugin-raised p-3 shadow-panel animate-fade-in-up" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setShowAutomation(false); automationTriggerRef.current?.focus(); } }}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div><p className="text-xs font-semibold text-plugin-text">Automation &amp; macros</p><p className="text-[11px] text-plugin-muted"><span className="num">{automation.length}</span> / 2048 exposed to the DAW</p></div>
            <button className="text-[11px] text-plugin-muted hover:text-plugin-text" onClick={() => setShowAutomation(false)} aria-label="Close automation">Close</button>
          </div>
          {node?.missing ? <p className="text-xs text-amber-300">Plugin missing — parameters unavailable.</p> : <>
            <input ref={automationFilterRef} className="w-full mb-2 h-7 rounded-md border border-plugin-border bg-plugin-bg px-2 text-xs text-plugin-text placeholder:text-plugin-dim focus:outline-none focus:border-plugin-accent/60" placeholder="Filter parameters" value={parameterFilter} onChange={(e) => setParameterFilter(e.target.value)} aria-label="Filter parameters" />
            <div className="max-h-44 overflow-y-auto -mx-1">
              {parameters.filter((p) => p.name.toLowerCase().includes(parameterFilter.toLowerCase())).map((parameter) => {
                const binding = automation.find((item) => item.parameterIndex === parameter.index);
                return <div key={parameter.index} className="flex items-center justify-between gap-2 px-1 h-7 rounded text-xs text-plugin-text hover:bg-plugin-surface-alt"><span className="truncate flex-1">{parameter.name}</span><select className="h-6 rounded border border-plugin-border bg-plugin-bg px-1 text-[11px] text-plugin-muted hover:border-plugin-border-bright" value="" aria-label={`Link ${parameter.name} to a macro`} onChange={(e) => { const macro = Number(e.target.value); if (e.target.value !== '') addMacroLink(macro, id, parameter.index); }}><option value="">Macro…</option>{Array.from({ length: 8 }, (_, m) => <option key={m} value={m}>Macro {m + 1}</option>)}</select>{binding ? <button className="w-[84px] text-right text-[11px] text-plugin-accent hover:text-plugin-accent-bright" onClick={() => removeAutomation(binding.proxyId)}>Remove</button> : <button className="w-[84px] text-right text-[11px] text-plugin-muted hover:text-plugin-accent" onClick={() => exposeParameter(parameter.index)}>Expose in DAW</button>}</div>;
              })}
              {!parameters.length && <p className="text-xs text-plugin-muted">No parameters reported.</p>}
            </div>
          </>}
        </div>
      )}

      {/* Group creation hint when dragging over */}
      {isGroupDropTarget && (
        <div className="absolute -top-7 left-0 right-0 z-50 flex justify-center pointer-events-none animate-fade-in-up">
          <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-md shadow-lg text-[11px] font-medium whitespace-nowrap ${
            effectiveHoverSide === 'left'
              ? 'bg-plugin-serial text-plugin-on-accent'
              : 'bg-plugin-parallel text-plugin-on-accent'
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
            className="fixed z-[101] bg-plugin-raised border border-plugin-border-bright rounded-lg shadow-panel py-1 min-w-[150px]"
            style={{ left: showContextMenu.x, top: showContextMenu.y }}
          >
            {matchedPluginId && (
              <button
                onClick={() => { setShowContextMenu(null); setShowSwapMenu(true); }}
                className="w-full px-3 py-1.5 text-left text-xs text-plugin-text hover:bg-plugin-border/50 "
              >
                Swap Plugin
              </button>
            )}
            <button
              onClick={() => { setShowContextMenu(null); onRemove(); }}
              className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-500/10 "
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
          <div className="bg-plugin-accent text-plugin-on-accent text-xs font-medium px-3 py-1 rounded-full shadow-panel animate-fade-in-up">
            {swapToast}
          </div>
        </div>
      )}
    </div>
  );
});
