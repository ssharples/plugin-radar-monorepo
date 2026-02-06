import { useState, useEffect, useCallback } from 'react';
import { Folder, Link2, Cloud, Download } from 'lucide-react';
import { Knob } from '../Knob';
import { MeterDisplay } from '../MeterDisplay';
import { LufsDisplay } from '../LufsDisplay';
import { SaveChainModal, LoadChainModal } from '../CloudSync';
import { juceBridge } from '../../api/juce-bridge';
import { useSyncStore } from '../../stores/syncStore';
import { useChainStore } from '../../stores/chainStore';
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
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);

  const { isLoggedIn } = useSyncStore();
  const { slots } = useChainStore();

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
    <div className="flex items-center gap-1 px-3 py-1.5 bg-plugin-surface border-t border-plugin-border">
      {/* Input metering section */}
      <div className="flex items-center gap-2 px-2">
        <LufsDisplay
          lufs={meterData?.inputLufs ?? -100}
          compact
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
            <span>{matchLocked ? 'LOCK' : 'Match'}</span>
          </button>
          {matchLockWarning && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-amber-600/90 text-white text-xxs rounded shadow-lg whitespace-nowrap animate-fade-in">
              {matchLockWarning}
            </div>
          )}
        </div>

        {/* Cloud Save */}
        <button
          onClick={() => setShowSaveModal(true)}
          disabled={!isLoggedIn || slots.length === 0}
          className={`flex items-center gap-1 px-2.5 py-1 rounded text-xxs font-medium transition-all ${
            isLoggedIn && slots.length > 0
              ? 'bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/25 text-purple-300'
              : 'bg-plugin-border text-plugin-dim cursor-not-allowed'
          }`}
          title={!isLoggedIn ? "Login to save chains" : slots.length === 0 ? "Add plugins to save" : "Save chain to cloud"}
        >
          <Cloud className="w-3 h-3" />
          <span>Save</span>
        </button>

        {/* Cloud Browse */}
        <button
          onClick={() => setShowLoadModal(true)}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xxs font-medium bg-plugin-border-bright hover:bg-plugin-accent/20 text-plugin-muted hover:text-plugin-text transition-all"
          title="Browse community chains"
        >
          <Download className="w-3 h-3" />
          <span>Browse</span>
        </button>
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

      {/* Spacer */}
      <div className="flex-1" />

      {/* Preset Button */}
      <button
        onClick={onPresetClick}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xxs hover:bg-plugin-border-bright transition-colors group"
      >
        <Folder className="w-3.5 h-3.5 text-plugin-accent group-hover:scale-110 transition-transform" />
        <span className="text-plugin-muted group-hover:text-plugin-text transition-colors font-medium">
          Presets
        </span>
        {currentPresetName && (
          <>
            <span className="text-plugin-dim mx-0.5">|</span>
            <span className="text-plugin-text font-medium max-w-24 truncate">
              {currentPresetName}
            </span>
          </>
        )}
      </button>

      {/* Cloud Modals */}
      {showSaveModal && (
        <SaveChainModal
          slots={slots}
          onClose={() => setShowSaveModal(false)}
          onSaved={() => setShowSaveModal(false)}
        />
      )}
      {showLoadModal && (
        <LoadChainModal
          onClose={() => setShowLoadModal(false)}
          onLoad={async (chainData) => {
            const result = await juceBridge.importChain(chainData);
            if (!result.success) {
              console.error('Failed to import chain:', result.error);
            }
            setShowLoadModal(false);
          }}
        />
      )}
    </div>
  );
}
