import { useState, useCallback, useRef, useMemo, useEffect, memo, type PointerEvent as ReactPointerEvent } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Layers, GitBranch, X, ArrowLeftRight } from 'lucide-react';
import type { PluginNodeUI, ChainSlot as ChainSlotType } from '../../api/types';
import { useChainStore } from '../../stores/chainStore';
import { PluginSwapMenu } from './PluginSwapMenu';
import { findCompatibleSwaps, translateParameters } from '../../api/convex-client';
import { juceBridge } from '../../api/juce-bridge';
import { ContextMenu, buildPluginSlotMenu } from '../ContextMenu';
import sidePanelBg from '../../assets/side-panel.png';
import rackmountBg from '../../assets/rackmount-bg.png';
import bypassIconSvg from '../../assets/bypass-icon.svg';
import duplicateIconSvg from '../../assets/duplicate-icon.svg';
import closeIconSvg from '../../assets/close.svg';
import soloButtonActive from '../../assets/solo-button-active.png';
import soloButtonInactive from '../../assets/solo-button-inactive.png';
import muteButtonActive from '../../assets/mute-button-active.png';
import muteButtonInactive from '../../assets/mute-button-inactive.png';
import ledLight from '../../assets/led-light-0-db-indication.png';

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
  #444444 0%,
  #999999 40%,
  #cccccc 70%,
  #ffffff 100%
)`;

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
  /** Open plugin editor inline (embedded in host window). Falls back to onToggleEditor if not provided. */
  onOpenInline?: () => void;
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
  /** Parent node ID (for inline plugin insertion) */
  parentId?: number;
  /** Index of this node in parent's children array (for inline plugin insertion) */
  indexInParent?: number;
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
  onOpenInline,
  onSwapComplete,
  isDragActive: _isDragActive = false,
  groupSelectMode = false,
  onSelect,
  disabledDropIds,
  parentId = 0,
  indexInParent = -1,
}: ChainSlotProps) {
  // Unified data access
  const id = node?.id ?? slot?.index ?? 0;
  const name = node?.name ?? slot?.name ?? '';
  const manufacturer = node?.manufacturer ?? slot?.manufacturer ?? '';
  const bypassed = node?.bypassed ?? slot?.bypassed ?? false;
  const uid = node?.uid ?? slot?.uid;
  const isSoloed = node?.solo ?? false;
  const isMuted = node?.mute ?? false;

  const duplicateNode = useChainStore((s) => s.duplicateNode);
  const createGroup = useChainStore((s) => s.createGroup);
  const setBranchSolo = useChainStore((s) => s.setBranchSolo);
  const setBranchMute = useChainStore((s) => s.setBranchMute);
  const togglePluginEditor = useChainStore((s) => s.togglePluginEditor);
  const openInlineEditor = useChainStore((s) => s.openInlineEditor);
  const pluginClipboard = useChainStore((s) => s.pluginClipboard);
  const pastePluginSettings = useChainStore((s) => s.pastePluginSettings);
  const moveNode = useChainStore((s) => s.moveNode);
  
  // Hover state for progressive disclosure
  const [isHovered, setIsHovered] = useState(false);

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

  // Determine if plugin is processing (has meter activity)
  const isProcessing = useMemo(() => {
    if (!meterData || bypassed) return false;
    const hasActivity = (meterData.peakL > 0.001 || meterData.peakR > 0.001);
    return hasActivity;
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
    // Reset all peaks (input, output, and all node peaks)
    juceBridge.resetAllNodePeaks();
    inputPeakRef.current = -Infinity;
    outputPeakRef.current = -Infinity;
    if (outputPeakElRef.current) {
      outputPeakElRef.current.firstChild!.textContent = formatDb(-Infinity);
    }
  }, []);

  const [showSwapMenu, setShowSwapMenu] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState<{ x: number; y: number } | null>(null);
  const showInlineSearchBelow = useChainStore((s) => s.showInlineSearchBelow);
  const [swapToast, setSwapToast] = useState<string | null>(null);

  // Similar plugins for prev/next navigation
  const [similarPlugins, setSimilarPlugins] = useState<Array<{pluginId: string; pluginName: string; uid?: number}>>([]);
  const [currentPluginIndex, setCurrentPluginIndex] = useState(0);
  const [isSwapping, setIsSwapping] = useState(false);

  // Fetch similar plugins when matchedPluginId changes
  useEffect(() => {
    if (!matchedPluginId) {
      setSimilarPlugins([]);
      return;
    }

    findCompatibleSwaps(matchedPluginId).then((results) => {
      if (results.length > 0) {
      }
      setSimilarPlugins(results.map(r => ({
        pluginId: r.pluginId,
        pluginName: r.pluginName,
        uid: undefined, // We'll need to find this in the plugin list
      })));
      // Current plugin is at index 0
      setCurrentPluginIndex(0);
    }).catch((err) => {
      setSimilarPlugins([]);
    });
  }, [matchedPluginId]);

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

  // Wrap dnd-kit listeners to intercept right-click before dnd-kit's
  // pointer sensor captures it (which blocks contextmenu in JUCE WebView)
  const wrappedListeners = useMemo(() => {
    if (!listeners) return {};
    return {
      ...listeners,
      onPointerDown: (e: ReactPointerEvent) => {
        if (e.button === 2) {
          e.preventDefault();
          e.stopPropagation();
          setShowContextMenu({ x: e.clientX, y: e.clientY });
          return;
        }
        // Forward non-right-click to dnd-kit
        (listeners as Record<string, Function>).onPointerDown?.(e);
      },
    };
  }, [listeners]);

  const handleSwapComplete = useCallback((newPluginName: string, confidence: number) => {
    setSwapToast(`Swapped \u2192 ${newPluginName} (${confidence}%)`);
    setTimeout(() => setSwapToast(null), 3000);
    onSwapComplete?.(newPluginName, confidence);
  }, [onSwapComplete]);

  // Navigate to previous similar plugin
  const handlePrevPlugin = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (similarPlugins.length === 0 || isSwapping || !matchedPluginId) return;

    const nextIndex = (currentPluginIndex - 1 + similarPlugins.length) % similarPlugins.length;
    const targetPlugin = similarPlugins[nextIndex];

    setIsSwapping(true);
    try {
      // 1. Read current parameters from the loaded plugin
      const readResult = await juceBridge.readPluginParameters(id);
      if (!readResult.success || !readResult.parameters) {
        setSwapToast('Failed to read parameters');
        setTimeout(() => setSwapToast(null), 2000);
        setIsSwapping(false);
        return;
      }

      // 2. Translate parameters via Convex
      const sourceParams = readResult.parameters.map((p) => ({
        paramId: p.name,
        paramIndex: p.index,
        normalizedValue: p.normalizedValue,
      }));

      const translation = await translateParameters(
        matchedPluginId,
        targetPlugin.pluginId,
        sourceParams
      );

      if (!translation) {
        setSwapToast('Translation failed');
        setTimeout(() => setSwapToast(null), 2000);
        setIsSwapping(false);
        return;
      }

      if (translation.unmappedParams.length > 0) {
        }

      // 3. Build translated params for JUCE bridge
      const translatedParams = translation.targetParams
        .filter((p) => p.paramIndex !== undefined)
        .map((p) => ({
          paramIndex: p.paramIndex!,
          value: p.value,
        }));

      // 4. Find the JUCE plugin UID for the target
      const pluginList = await juceBridge.getPluginList();
      const targetJucePlugin = pluginList.find(
        (p) => p.name.toLowerCase().includes(targetPlugin.pluginName.toLowerCase()) ||
               targetPlugin.pluginName.toLowerCase().includes(p.name.toLowerCase())
      );

      if (!targetJucePlugin) {
        setSwapToast(`Not installed: ${targetPlugin.pluginName}`);
        setTimeout(() => setSwapToast(null), 2000);
        setIsSwapping(false);
        return;
      }

      // 5. Execute the swap with parameter translation
      const result = await juceBridge.swapPluginInChain(
        id,
        targetJucePlugin.id,
        translatedParams
      );

      if (result.success) {
        setCurrentPluginIndex(nextIndex);
        setSwapToast(`\u2190 ${targetPlugin.pluginName} (${Math.round(translation.confidence)}%)`);
        setTimeout(() => setSwapToast(null), 3000);
      } else {
        setSwapToast(result.error || 'Swap failed');
        setTimeout(() => setSwapToast(null), 2000);
      }
    } catch (err) {
      setSwapToast('Swap error');
      setTimeout(() => setSwapToast(null), 2000);
    } finally {
      setIsSwapping(false);
    }
  }, [similarPlugins, currentPluginIndex, id, isSwapping, matchedPluginId]);

  // Navigate to next similar plugin
  const handleNextPlugin = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (similarPlugins.length === 0 || isSwapping || !matchedPluginId) return;

    const nextIndex = (currentPluginIndex + 1) % similarPlugins.length;
    const targetPlugin = similarPlugins[nextIndex];

    setIsSwapping(true);
    try {
      // 1. Read current parameters from the loaded plugin
      const readResult = await juceBridge.readPluginParameters(id);
      if (!readResult.success || !readResult.parameters) {
        setSwapToast('Failed to read parameters');
        setTimeout(() => setSwapToast(null), 2000);
        setIsSwapping(false);
        return;
      }

      // 2. Translate parameters via Convex
      const sourceParams = readResult.parameters.map((p) => ({
        paramId: p.name,
        paramIndex: p.index,
        normalizedValue: p.normalizedValue,
      }));

      const translation = await translateParameters(
        matchedPluginId,
        targetPlugin.pluginId,
        sourceParams
      );

      if (!translation) {
        setSwapToast('Translation failed');
        setTimeout(() => setSwapToast(null), 2000);
        setIsSwapping(false);
        return;
      }

      if (translation.unmappedParams.length > 0) {
        }

      // 3. Build translated params for JUCE bridge
      const translatedParams = translation.targetParams
        .filter((p) => p.paramIndex !== undefined)
        .map((p) => ({
          paramIndex: p.paramIndex!,
          value: p.value,
        }));

      // 4. Find the JUCE plugin UID for the target
      const pluginList = await juceBridge.getPluginList();
      const targetJucePlugin = pluginList.find(
        (p) => p.name.toLowerCase().includes(targetPlugin.pluginName.toLowerCase()) ||
               targetPlugin.pluginName.toLowerCase().includes(p.name.toLowerCase())
      );

      if (!targetJucePlugin) {
        setSwapToast(`Not installed: ${targetPlugin.pluginName}`);
        setTimeout(() => setSwapToast(null), 2000);
        setIsSwapping(false);
        return;
      }

      // 5. Execute the swap with parameter translation
      const result = await juceBridge.swapPluginInChain(
        id,
        targetJucePlugin.id,
        translatedParams
      );

      if (result.success) {
        setCurrentPluginIndex(nextIndex);
        setSwapToast(`${targetPlugin.pluginName} \u2192 (${Math.round(translation.confidence)}%)`);
        setTimeout(() => setSwapToast(null), 3000);
      } else {
        setSwapToast(result.error || 'Swap failed');
        setTimeout(() => setSwapToast(null), 2000);
      }
    } catch (err) {
      setSwapToast('Swap error');
      setTimeout(() => setSwapToast(null), 2000);
    } finally {
      setIsSwapping(false);
    }
  }, [similarPlugins, currentPluginIndex, id, isSwapping, matchedPluginId]);

  const handleCreateSerialGroup = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    createGroup([id], 'serial');
  }, [createGroup, id]);

  const handleCreateParallelGroup = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    createGroup([id], 'parallel');
  }, [createGroup, id]);

  const handleDuplicate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    duplicateNode(id);
  }, [duplicateNode, id]);

  const handleBypass = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleBypass();
  }, [onToggleBypass]);

  const handleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setBranchMute(id, !isMuted);
  }, [setBranchMute, id, isMuted]);

  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove();
  }, [onRemove]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Build dynamic class names for state-aware styling
  const slotClasses = useMemo(() => {
    const classes = ['plugin-slot', 'plugin-slot-wrapper', 'relative', 'flex', 'cursor-grab', 'active:cursor-grabbing', 'select-none'];

    if (bypassed) classes.push('plugin-slot-bypassed');
    if (isSoloed) classes.push('plugin-slot-solo');
    if (isSelected || isMultiSelected) classes.push('plugin-slot-selected');
    if (isHovered && !isDragging) classes.push('plugin-slot-hover');
    if (isDragging) classes.push('opacity-30', 'scale-[0.98]');

    return classes.join(' ');
  }, [bypassed, isSoloed, isSelected, isMultiSelected, isHovered, isDragging]);

  return (
    <div
      className="relative"
      style={{ overflow: 'visible' }}
      onContextMenu={handleContextMenu}
    >
      <div
        ref={setDragRef}
        {...attributes}
        {...wrappedListeners}
        title="Click to edit inline · Shift+Click for external window"
        onClick={(e) => {
          e.stopPropagation();
          setShowContextMenu(null);
          if ((groupSelectMode || e.ctrlKey || e.metaKey) && onSelect) {
            onSelect(e);
          } else if (e.shiftKey) {
            // Shift+click: open external window (backward compat)
            onToggleEditor();
          } else if (onOpenInline) {
            // Regular click: open inline editor
            onOpenInline();
          } else {
            onToggleEditor();
          }
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={slotClasses}
        style={{
          width: '100%',
          height: 42,
          background: 'rgba(15, 15, 15, 0.95)',
          borderRadius: 6,
          border: `1px solid ${
            bypassed
              ? 'rgba(255, 255, 255, 0.03)'
              : isEditorOpen
                ? 'rgba(222, 255, 10, 0.25)'
                : isHovered
                  ? 'rgba(255,255,255,0.12)'
                  : 'rgba(255,255,255,0.06)'
          }`,
          boxShadow: isEditorOpen
            ? '0 0 12px rgba(222, 255, 10, 0.1), inset 0 1px 0 rgba(255,255,255,0.08)'
            : 'inset 0 1px 0 rgba(255,255,255,0.06)',
          opacity: bypassed ? 0.5 : 1,
          transition: 'border-color 150ms ease, box-shadow 150ms ease, opacity 150ms ease',
        }}
      >
        {/* Left side panel — slot number */}
        <div
          className="relative flex-shrink-0"
          style={{
            width: 16,
            height: 42,
            backgroundImage: `url(${sidePanelBg})`,
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
          }}
        >
          {slotNumber != null && (
            <div className="absolute inset-0 flex items-center justify-center font-sans text-white text-[10px] pointer-events-none">
              {slotNumber}
            </div>
          )}
        </div>

        {/* Center rackmount background */}
        <div
          className="relative flex-1"
          style={{
            height: 42,
            backgroundImage: `url(${rackmountBg})`,
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
          }}
        >

          {/* Plugin name with swap navigation arrows */}
          <div
            className="absolute flex items-center text-white capitalize"
            style={{
              left: 20,
              top: 9,
              height: 24,
            }}
          >
            {/* Prev plugin swap arrow */}
            {isHovered && similarPlugins.length > 0 && (
              <button
                className="flex items-center justify-center transition-opacity duration-150 opacity-50 hover:opacity-100"
                style={{ width: 14, height: 24, flexShrink: 0 }}
                onClick={handlePrevPlugin}
                onPointerDown={(e) => e.stopPropagation()}
                title={`Previous alternative${isSwapping ? ' (swapping...)' : ''}`}
              >
                <svg width="8" height="10" viewBox="0 0 8 10" fill="none">
                  <path d="M6 1L2 5L6 9" stroke={isSwapping ? '#666' : '#c9944a'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}

            <div
              className="flex items-center justify-center px-1"
              style={{
                width: Math.max(114, Math.min(280, name.length * 8 + 40)),
                height: 24,
                fontFamily: 'Eurostile, "Arial Black", "Helvetica Bold", sans-serif',
                fontWeight: 700,
                fontSize: name.length > 20 ? 10 : name.length > 15 ? 11 : name.length > 12 ? 12 : name.length > 10 ? 13 : 14,
                lineHeight: name.length > 20 ? '11px' : name.length > 15 ? '12px' : name.length > 12 ? '13px' : name.length > 10 ? '14px' : '15px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {name.toLowerCase()}
            </div>

            {/* Next plugin swap arrow */}
            {isHovered && similarPlugins.length > 0 && (
              <button
                className="flex items-center justify-center transition-opacity duration-150 opacity-50 hover:opacity-100"
                style={{ width: 14, height: 24, flexShrink: 0 }}
                onClick={handleNextPlugin}
                onPointerDown={(e) => e.stopPropagation()}
                title={`Next alternative${isSwapping ? ' (swapping...)' : ''}`}
              >
                <svg width="8" height="10" viewBox="0 0 8 10" fill="none">
                  <path d="M2 1L6 5L2 9" stroke={isSwapping ? '#666' : '#c9944a'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>

          {/* Visual meter bar with dB value */}
          <div className="absolute flex items-center gap-1" style={{ left: 200, top: 13 }}>
            {/* Meter bar container */}
            <div
              className={`relative overflow-hidden ${isProcessing ? 'meter-processing' : ''}`}
              style={{
                width: 60,
                height: 16,
                background: 'rgba(0, 0, 0, 0.5)',
                borderRadius: '2px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
              }}
            >
              {/* Green segment (-∞ to -18dB) */}
              <div
                className="absolute left-0 top-0 h-full transition-all duration-75"
                style={{
                  width: `${Math.min(meterValues.peakRPercent, dbToPercent(-18))}%`,
                  background: 'linear-gradient(to right, #22c55e, #16a34a)',
                }}
              />
              {/* Yellow segment (-18dB to -6dB) */}
              {meterValues.peakRPercent > dbToPercent(-18) && (
                <div
                  className="absolute top-0 h-full transition-all duration-75"
                  style={{
                    left: `${dbToPercent(-18)}%`,
                    width: `${Math.min(meterValues.peakRPercent - dbToPercent(-18), dbToPercent(-6) - dbToPercent(-18))}%`,
                    background: 'linear-gradient(to right, #eab308, #f59e0b)',
                  }}
                />
              )}
              {/* Red segment (-6dB to 0dB) */}
              {meterValues.peakRPercent > dbToPercent(-6) && (
                <div
                  className="absolute top-0 h-full transition-all duration-75"
                  style={{
                    left: `${dbToPercent(-6)}%`,
                    width: `${Math.min(meterValues.peakRPercent - dbToPercent(-6), 100 - dbToPercent(-6))}%`,
                    background: 'linear-gradient(to right, #ef4444, #dc2626)',
                  }}
                />
              )}
            </div>

            {/* Peak dB value */}
            <button
              ref={outputPeakElRef}
              className="font-sans lowercase text-white hover:text-plugin-accent transition-colors cursor-pointer text-[11px] min-w-[32px] text-right"
              onClick={resetOutputPeak}
              onPointerDown={(e) => e.stopPropagation()}
              title="Click to reset all peak meters"
            >
              {formatDb(outputPeakRef.current)} db
            </button>

            {/* Red LED clip indicator */}
            {meterValues.peakRPercent > 95 && (
              <div
                className="w-[5px] h-[5px]"
                style={{
                  backgroundImage: `url(${ledLight})`,
                  backgroundSize: '100% 100%',
                }}
              />
            )}
          </div>

          {/* Latency display */}
          {meterData?.latencyMs !== undefined && meterData.latencyMs > 0.1 && (
            <div className="absolute" style={{ left: 305, top: 16 }}>
              <span className="font-sans text-[10px] text-white">
                {meterData.latencyMs.toFixed(1)}ms
              </span>
            </div>
          )}

          {/* Persistent state indicators — always visible when active (like console LEDs) */}
          {!isHovered && !isSelected && (isSoloed || isMuted) && (
            <div className="absolute flex flex-row gap-[3px]" style={{ right: 32, top: 15 }}>
              {isSoloed && (
                <div
                  className="flex items-center justify-center rounded-[2px]"
                  style={{
                    width: 14,
                    height: 12,
                    background: '#c9944a',
                    fontSize: 8,
                    fontWeight: 800,
                    color: '#000',
                    lineHeight: '12px',
                    letterSpacing: '0.5px',
                  }}
                >
                  S
                </div>
              )}
              {isMuted && (
                <div
                  className="flex items-center justify-center rounded-[2px]"
                  style={{
                    width: 14,
                    height: 12,
                    background: '#dc2626',
                    fontSize: 8,
                    fontWeight: 800,
                    color: '#000',
                    lineHeight: '12px',
                    letterSpacing: '0.5px',
                  }}
                >
                  M
                </div>
              )}
            </div>
          )}

          {/* Group creation icons - progressive disclosure */}
          {(isHovered || isSelected) && (
            <>
              <div className="absolute flex flex-row gap-[3px] transition-opacity duration-200" style={{ left: 320, top: 13.5 }}>
                {/* Serial group icon */}
                <button
                  onClick={handleCreateSerialGroup}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="bg-plugin-serial/60 hover:bg-plugin-serial transition-all rounded-[2px] flex items-center justify-center"
                  style={{ width: 15, height: 15 }}
                  title="Create serial group from this plugin"
                >
                  <Layers className="w-2.5 h-2.5 text-black" strokeWidth={2.5} />
                </button>
                {/* Parallel group icon */}
                <button
                  onClick={handleCreateParallelGroup}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="bg-plugin-parallel/60 hover:bg-plugin-parallel transition-all rounded-[2px] flex items-center justify-center"
                  style={{ width: 15, height: 15 }}
                  title="Create parallel group from this plugin"
                >
                  <GitBranch className="w-2.5 h-2.5 text-black" strokeWidth={2.5} />
                </button>
              </div>

              {/* Separator 1 (after group icons) */}
              <div
                className="absolute bg-white/20 transition-opacity duration-200"
                style={{ left: 356, top: 12, width: 1, height: 18 }}
              />

              {/* Solo button (15×15px) */}
              <button
                className="absolute transition-opacity duration-200 hover:opacity-100"
                style={{ left: 362, top: 13.5, width: 15, height: 15 }}
                onClick={(e) => { e.stopPropagation(); setBranchSolo(id, !isSoloed); }}
                onPointerDown={(e) => e.stopPropagation()}
                title="Solo plugin"
              >
                <img
                  src={isSoloed ? soloButtonActive : soloButtonInactive}
                  alt="S"
                  className="w-full h-full"
                  draggable={false}
                />
              </button>

              {/* Mute button (15×15px) */}
              <button
                className="absolute transition-opacity duration-200 hover:opacity-100"
                style={{ left: 380, top: 13.5, width: 15, height: 15 }}
                onClick={handleMute}
                onPointerDown={(e) => e.stopPropagation()}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                <img
                  src={isMuted ? muteButtonActive : muteButtonInactive}
                  alt="M"
                  className="w-full h-full"
                  draggable={false}
                />
              </button>

              {/* Separator 2 (after S/M buttons) */}
              <div
                className="absolute bg-white/20 transition-opacity duration-200"
                style={{ left: 398, top: 12, width: 1, height: 18 }}
              />

              {/* Duplicate icon (13×13px) */}
              <button
                className="absolute opacity-60 hover:opacity-100 transition-opacity duration-200"
                style={{ left: 403, top: 14.5, width: 13, height: 13 }}
                onClick={handleDuplicate}
                onPointerDown={(e) => e.stopPropagation()}
                title="Duplicate plugin"
              >
                <img src={duplicateIconSvg} alt="" className="w-full h-full" draggable={false} />
              </button>
            </>
          )}

          {/* Bypass/power icon (10×12px) */}
          <button
            className={`absolute transition-opacity ${bypassed ? 'brightness-150' : 'opacity-60 hover:opacity-100'}`}
            style={{ left: 420, top: 15, width: 10, height: 12 }}
            onClick={handleBypass}
            onPointerDown={(e) => e.stopPropagation()}
            title={bypassed ? 'Enable' : 'Bypass'}
          >
            <img src={bypassIconSvg} alt="" className="w-full h-full" draggable={false} />
          </button>
        </div>

        {/* Right side panel — close/remove button */}
        <div
          className="relative flex-shrink-0"
          style={{
            width: 16,
            height: 42,
            backgroundImage: `url(${sidePanelBg})`,
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
          }}
        >
          {/* Close X button to remove plugin */}
          <button
            className="absolute inset-0 flex items-center justify-center text-white hover:text-red-400 transition-colors"
            onClick={handleRemove}
            onPointerDown={(e) => e.stopPropagation()}
            title="Remove plugin"
          >
            <img src={closeIconSvg} alt="×" className="w-1.5 h-1.5" draggable={false} />
          </button>
        </div>
      </div>

      {/* Context menu (right-click) */}
      {showContextMenu && (
        <ContextMenu
          x={showContextMenu.x}
          y={showContextMenu.y}
          items={buildPluginSlotMenu(
            {
              node: node as any,
              nodeId: id,
              parentId,
              indexInParent,
              hasMatchedPlugin: !!matchedPluginId,
              isEditorOpen: !!isEditorOpen,
              hasClipboard: !!pluginClipboard,
              canMoveUp: indexInParent > 0,
              canMoveDown: indexInParent >= 0, // will be refined by parent
            },
            {
              toggleBypass: () => onToggleBypass(),
              toggleSolo: () => setBranchSolo(id, !(node?.solo ?? false)),
              remove: () => onRemove(),
              duplicate: () => duplicateNode(id),
              replaceWithSimilar: () => setShowSwapMenu(true),
              moveUp: () => moveNode(id, parentId, Math.max(0, indexInParent - 1)),
              moveDown: () => moveNode(id, parentId, indexInParent + 1),
              savePreset: () => juceBridge.savePreset(name, ''),
              loadPreset: () => { /* open preset browser */ },
              openPluginWindow: () => togglePluginEditor(id),
              openInlineEditor: () => openInlineEditor(id),
              copyPluginSettings: () => {
                useChainStore.setState({
                  pluginClipboard: { name, fileOrIdentifier: node?.fileOrIdentifier ?? '', nodeId: id },
                });
              },
              pastePluginSettings: () => {
                if (pluginClipboard) pastePluginSettings(pluginClipboard.nodeId, id);
              },
              createSerialGroup: () => createGroup([id], 'serial'),
              createParallelGroup: () => createGroup([id], 'parallel'),
              insertBelow: () => showInlineSearchBelow(id, parentId, indexInParent + 1),
            },
          )}
          onClose={() => setShowContextMenu(null)}
        />
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
