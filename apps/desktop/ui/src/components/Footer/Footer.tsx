import { useState, useEffect, useCallback } from 'react';
import { Folder, Link2, SlidersVertical, CloudOff, RefreshCw, AlertTriangle, Check } from 'lucide-react';
import { Knob } from '../Knob';
import { MeterDisplay } from '../MeterDisplay';
import { LufsDisplay } from '../LufsDisplay';
import { MacroPanel } from '../Macros';
import { juceBridge } from '../../api/juce-bridge';
import { useChainStore } from '../../stores/chainStore';
import { useOfflineStore } from '../../stores/offlineStore';
import type { MeterData, GainSettings } from '../../api/types';

interface FooterProps {
  currentPresetName?: string;
  onPresetClick: () => void;
}

export function Footer({ currentPresetName, onPresetClick }: FooterProps) {
  const [inputGain, setInputGain] = useState(0);
  const [outputGain, setOutputGain] = useState(0);
  const [meterData, setMeterData] = useState<MeterData | null>(null);
  const [matchLocked, setMatchLocked] = useState(false);
  const [matchLockWarning, setMatchLockWarning] = useState<string | null>(null);
  const [showMacros, setShowMacros] = useState(false);

  const { targetInputLufs } = useChainStore();
  const { syncStatus, pendingWrites, online } = useOfflineStore();

  // Load initial gain settings and match lock state
  useEffect(() => {
    juceBridge.getGainSettings().then((settings: GainSettings) => {
      setInputGain(settings.inputGainDB);
      setOutputGain(settings.outputGainDB);
    });
    juceBridge.getMatchLockState().then((state) => {
      setMatchLocked(state.matchLockEnabled);
    });
  }, []);

  // Subscribe to meter data
  useEffect(() => {
    const unsubscribe = juceBridge.onMeterData((data: MeterData) => {
      setMeterData(data);
    });
    return unsubscribe;
  }, []);

  // Subscribe to gain changes (from match lock auto-adjustment)
  useEffect(() => {
    const unsubscribe = juceBridge.onGainChanged((data) => {
      if (data.outputGainDB !== undefined) {
        setOutputGain(data.outputGainDB);
      }
    });
    return unsubscribe;
  }, []);

  // Subscribe to match lock warning events
  useEffect(() => {
    const unsubscribe = juceBridge.onMatchLockWarning((data) => {
      setMatchLocked(data.matchLockEnabled);
      setMatchLockWarning(data.warning);
      setTimeout(() => setMatchLockWarning(null), 4000);
    });
    return unsubscribe;
  }, []);

  const handleInputGainChange = useCallback((value: number) => {
    setInputGain(value);
    juceBridge.setInputGain(value);
  }, []);

  const handleOutputGainChange = useCallback((value: number) => {
    setOutputGain(value);
    juceBridge.setOutputGain(value);
  }, []);

  const handleMatchToggle = useCallback(async () => {
    const newState = !matchLocked;
    const result = await juceBridge.setMatchLock(newState);
    if (result.success) {
      setMatchLocked(newState);
    }
  }, [matchLocked]);

  const syncTitle =
    syncStatus === 'synced' ? 'All changes synced' :
    syncStatus === 'pending' ? `${pendingWrites} change${pendingWrites !== 1 ? 's' : ''} pending sync` :
    syncStatus === 'offline' ? 'Offline — changes will sync when reconnected' :
    syncStatus === 'conflict' ? 'Sync conflict detected' :
    'Sync error';

  const pill = 'h-7 inline-flex items-center gap-1.5 px-2.5 rounded-md text-xs font-semibold transition-colors border';
  const pillOff = 'border-plugin-border bg-plugin-surface-alt text-plugin-muted hover:text-plugin-text hover:border-plugin-border-bright';

  return (
    <div className="relative flex items-center gap-2 h-full px-3 bg-plugin-surface border-t border-plugin-border">
      {showMacros && <MacroPanel onClose={() => setShowMacros(false)} />}

      {/* Input */}
      <div className="flex items-center gap-2.5">
        <Knob
          value={inputGain}
          onChange={handleInputGainChange}
          size={34}
          label="Input"
          layout="side"
        />
        <MeterDisplay
          peakL={meterData?.inputPeakL ?? 0}
          peakR={meterData?.inputPeakR ?? 0}
          peakHoldL={meterData?.inputPeakHoldL}
          peakHoldR={meterData?.inputPeakHoldR}
          height={36}
          width={12}
        />
        <LufsDisplay
          lufs={meterData?.inputLufs ?? -100}
          compact
          target={targetInputLufs}
        />
      </div>

      <div className="w-px h-8 bg-plugin-border flex-shrink-0 mx-1" />

      {/* Center controls */}
      <div className="flex items-center gap-1.5">
        <div className="relative">
          <button
            onClick={handleMatchToggle}
            className={`${pill} ${
              matchLocked
                ? 'border-plugin-accent/60 bg-plugin-accent/15 text-plugin-accent-bright'
                : pillOff
            }`}
            title={matchLocked ? 'Output level is matched to input (click to stop)' : 'Match output level to input level'}
            aria-pressed={matchLocked}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>{matchLocked ? 'Matched' : 'Match'}</span>
          </button>
          {matchLockWarning && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-amber-500 text-plugin-on-accent text-xs font-medium rounded-md shadow-panel whitespace-nowrap animate-fade-in">
              {matchLockWarning}
            </div>
          )}
        </div>

        <button
          onClick={() => setShowMacros((open) => !open)}
          aria-expanded={showMacros}
          className={`${pill} ${
            showMacros ? 'border-plugin-accent bg-plugin-accent text-plugin-on-accent' : pillOff
          }`}
          title="Macro knobs: one knob, many parameters"
        >
          <SlidersVertical className="w-3.5 h-3.5" />
          <span>Macros</span>
        </button>

        {targetInputLufs !== null && (
          <div className="hidden lg:flex items-center gap-1 h-7 px-2 rounded-md border border-plugin-border" title="Target input loudness for this chain">
            <span className="section-label">Target</span>
            <span className="num text-[11px] text-plugin-accent-bright">{targetInputLufs} LUFS</span>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Preset */}
      <button
        onClick={onPresetClick}
        className="h-7 inline-flex items-center gap-1.5 px-2 rounded-md text-xs text-plugin-muted hover:text-plugin-text hover:bg-plugin-raised transition-colors max-w-[180px]"
        title="Presets"
      >
        <Folder className="w-3.5 h-3.5 text-plugin-accent flex-shrink-0" />
        <span className="truncate font-medium">{currentPresetName || 'Presets'}</span>
      </button>

      {/* Sync status */}
      <div className="flex items-center gap-1 px-1" title={syncTitle}>
        {syncStatus === 'synced' && online && <Check className="w-3.5 h-3.5 text-green-400" />}
        {syncStatus === 'pending' && (
          <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" style={{ animationDuration: '2s' }} />
        )}
        {syncStatus === 'offline' && <CloudOff className="w-3.5 h-3.5 text-plugin-muted" />}
        {(syncStatus === 'conflict' || syncStatus === 'error') && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
        {syncStatus !== 'synced' && (
          <span className="text-[11px] text-plugin-muted">
            {syncStatus === 'pending' ? `${pendingWrites}` :
             syncStatus === 'offline' ? 'Offline' :
             syncStatus === 'conflict' ? 'Conflict' : ''}
          </span>
        )}
      </div>

      <div className="w-px h-8 bg-plugin-border flex-shrink-0 mx-1" />

      {/* Output */}
      <div className="flex items-center gap-2.5">
        <LufsDisplay
          lufs={meterData?.outputLufs ?? -100}
          compact
        />
        <MeterDisplay
          peakL={meterData?.outputPeakL ?? 0}
          peakR={meterData?.outputPeakR ?? 0}
          peakHoldL={meterData?.outputPeakHoldL}
          peakHoldR={meterData?.outputPeakHoldR}
          height={36}
          width={12}
        />
        <Knob
          value={outputGain}
          onChange={handleOutputGainChange}
          size={34}
          label="Output"
          layout="side"
        />
      </div>
    </div>
  );
}
