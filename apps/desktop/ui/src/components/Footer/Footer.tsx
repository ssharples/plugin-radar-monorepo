import { useState, useEffect, useCallback } from 'react';
import { Folder, Link2, CloudOff, RefreshCw, AlertTriangle, Check } from 'lucide-react';
import { Knob } from '../Knob';
import { MeterDisplay } from '../MeterDisplay';
import { LufsDisplay } from '../LufsDisplay';
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

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-plugin-surface border-t border-plugin-accent">
      {/* Input metering section */}
      <div className="flex items-center gap-2 px-2">
        <LufsDisplay
          lufs={meterData?.inputLufs ?? -100}
          compact
          target={targetInputLufs}
        />
        <MeterDisplay
          peakL={meterData?.inputPeakL ?? 0}
          peakR={meterData?.inputPeakR ?? 0}
          peakHoldL={meterData?.inputPeakHoldL}
          peakHoldR={meterData?.inputPeakHoldR}
          height={44}
          width={14}
        />
        <Knob
          value={inputGain}
          onChange={handleInputGainChange}
          size={38}
          label="IN"
        />
      </div>

      {/* Divider */}
      <div className="w-px h-8 bg-plugin-border flex-shrink-0" />

      {/* Center controls */}
      <div className="flex items-center gap-1.5 px-2">
        {/* Match Lock toggle */}
        <div className="relative">
          <button
            onClick={handleMatchToggle}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xxs font-medium transition-all ${
              matchLocked
                ? 'bg-plugin-accent text-black shadow-glow-accent'
                : 'bg-plugin-border-bright hover:bg-plugin-accent/20 text-plugin-muted hover:text-plugin-text'
            }`}
            title={matchLocked ? "Auto-matching enabled (click to disable)" : "Enable auto-matching"}
          >
            <Link2 className="w-3 h-3" />
            <span className="font-mono uppercase">{matchLocked ? 'LOCK' : 'Match'}</span>
          </button>
          {matchLockWarning && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-amber-600/90 text-white text-xxs rounded shadow-lg whitespace-nowrap animate-fade-in">
              {matchLockWarning}
            </div>
          )}
        </div>

        {/* Target LUFS indicator (when a target is set) */}
        {targetInputLufs !== null && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-black/20 border border-plugin-border">
            <span className="text-[9px] font-mono uppercase text-plugin-dim">Target:</span>
            <span className="text-[10px] font-mono uppercase font-medium text-plugin-accent">
              {targetInputLufs} LUFS
            </span>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-8 bg-plugin-border flex-shrink-0" />

      {/* Output metering section */}
      <div className="flex items-center gap-2 px-2">
        <Knob
          value={outputGain}
          onChange={handleOutputGainChange}
          size={38}
          label="OUT"
        />
        <MeterDisplay
          peakL={meterData?.outputPeakL ?? 0}
          peakR={meterData?.outputPeakR ?? 0}
          peakHoldL={meterData?.outputPeakHoldL}
          peakHoldR={meterData?.outputPeakHoldR}
          height={44}
          width={14}
        />
        <LufsDisplay
          lufs={meterData?.outputLufs ?? -100}
          compact
        />
      </div>

      {/* Sync Status Indicator */}
      <div className="flex items-center gap-1 px-2" title={
        syncStatus === 'synced' ? 'All changes synced' :
        syncStatus === 'pending' ? `${pendingWrites} change${pendingWrites !== 1 ? 's' : ''} pending sync` :
        syncStatus === 'offline' ? 'Offline — changes will sync when reconnected' :
        syncStatus === 'conflict' ? 'Sync conflict detected' :
        'Sync error'
      }>
        {syncStatus === 'synced' && online && (
          <Check className="w-3 h-3 text-green-400" />
        )}
        {syncStatus === 'pending' && (
          <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" style={{ animationDuration: '2s' }} />
        )}
        {syncStatus === 'offline' && (
          <CloudOff className="w-3 h-3 text-plugin-muted" />
        )}
        {syncStatus === 'conflict' && (
          <AlertTriangle className="w-3 h-3 text-red-400" />
        )}
        {syncStatus === 'error' && (
          <AlertTriangle className="w-3 h-3 text-red-400" />
        )}
        {syncStatus !== 'synced' && (
          <span className="text-xxs text-plugin-muted">
            {syncStatus === 'pending' ? `${pendingWrites}` :
             syncStatus === 'offline' ? 'Offline' :
             syncStatus === 'conflict' ? 'Conflict' : ''}
          </span>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Preset name (from header) */}
      {currentPresetName && (
        <button
          onClick={onPresetClick}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xxs hover:bg-plugin-border-bright transition-colors group"
        >
          <Folder className="w-3.5 h-3.5 text-plugin-accent group-hover:scale-110 transition-transform" />
          <span className="text-plugin-text font-medium max-w-24 truncate">
            {currentPresetName}
          </span>
        </button>
      )}
    </div>
  );
}
