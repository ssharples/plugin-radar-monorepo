import { useState, useEffect, useCallback, useRef } from 'react';
import { Knob } from '../Knob';
import { juceBridge } from '../../api/juce-bridge';
import { useChainStore } from '../../stores/chainStore';
import type { MeterData, GainSettings } from '../../api/types';

// Convert linear amplitude to dB
const linearToDb = (linear: number): number => {
  if (linear <= 0) return -100;
  return 20 * Math.log10(linear);
};

const KNOB_SIZE = 44;
const CIRCLE_SIZE = KNOB_SIZE + 12; // black circle behind knob
const POP_OUT = KNOB_SIZE * 0.5; // 50% protrusion above footer

const labelStyle: React.CSSProperties = {
  fontSize: '8px',
  fontFamily: 'var(--font-mono)',
  color: '#ffffff',
  textTransform: 'uppercase',
  letterSpacing: 'var(--tracking-wider)',
};

const separatorStyle: React.CSSProperties = {
  width: '1px',
  height: '28px',
  background: 'var(--color-border-subtle)',
};

/** Circular black backdrop that lifts a Knob out of the footer */
function KnobPod({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'relative',
        marginTop: -POP_OUT,
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* Black circle background */}
      <div
        style={{
          width: CIRCLE_SIZE,
          height: CIRCLE_SIZE,
          borderRadius: '50%',
          background: 'var(--color-bg-primary, #0a0a0a)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 -2px 8px rgba(0,0,0,0.6)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Calibration status: green/yellow/red based on current peak vs target range */
type CalStatus = 'in-range' | 'near' | 'out-low' | 'out-high' | 'no-signal';

function getCalStatus(
  avgPeakDb: number,
  min: number,
  max: number
): CalStatus {
  if (avgPeakDb <= -60) return 'no-signal';
  if (avgPeakDb >= min && avgPeakDb <= max) return 'in-range';
  if (avgPeakDb >= min - 3 && avgPeakDb <= max + 3) return 'near';
  if (avgPeakDb < min) return 'out-low';
  return 'out-high';
}

const calStatusColor: Record<CalStatus, string> = {
  'in-range': '#22c55e',  // green
  'near': '#eab308',      // yellow
  'out-low': '#ef4444',   // red
  'out-high': '#ef4444',  // red
  'no-signal': '#666',
};

interface FooterProps {
  currentPresetName?: string;
  onPresetClick: () => void;
}

export function Footer({ currentPresetName, onPresetClick }: FooterProps) {
  const [inputGain, setInputGain] = useState(0);
  const [outputGain, setOutputGain] = useState(0);
  const [masterDryWet, setMasterDryWet] = useState(100);

  // Peak-hold state: tracks the highest dB seen since last reset
  const [inputPeakHold, setInputPeakHold] = useState(-100);
  const [outputPeakHold, setOutputPeakHold] = useState(-100);
  const inputPeakRef = useRef(-100);
  const outputPeakRef = useRef(-100);

  // Avg peak for calibration indicator (updated from meter data)
  const [inputAvgPeakDb, setInputAvgPeakDb] = useState(-100);
  const [calibrating, setCalibrating] = useState(false);

  // Target peak range from chain store
  const targetInputPeakMin = useChainStore((s) => s.targetInputPeakMin);
  const targetInputPeakMax = useChainStore((s) => s.targetInputPeakMax);

  const hasTarget = targetInputPeakMin !== null && targetInputPeakMax !== null;

  // Load initial settings
  useEffect(() => {
    juceBridge.getGainSettings().then((settings: GainSettings) => {
      setInputGain(settings.inputGainDB);
      setOutputGain(settings.outputGainDB);
    });
    juceBridge.getMasterDryWet().then((mix: number) => {
      setMasterDryWet(mix * 100);
    }).catch(() => {});
  }, []);

  // Subscribe to meter data — update peak holds + avg peak
  useEffect(() => {
    const unsubscribe = juceBridge.onMeterData((data: MeterData) => {
      const inDb = Math.max(linearToDb(data.inputPeakL), linearToDb(data.inputPeakR));
      const outDb = Math.max(linearToDb(data.outputPeakL), linearToDb(data.outputPeakR));

      if (inDb > inputPeakRef.current) {
        inputPeakRef.current = inDb;
        setInputPeakHold(inDb);
      }
      if (outDb > outputPeakRef.current) {
        outputPeakRef.current = outDb;
        setOutputPeakHold(outDb);
      }

      // Update avg peak for calibration indicator
      const avgPeak = Math.max(data.inputAvgPeakDbL ?? -100, data.inputAvgPeakDbR ?? -100);
      setInputAvgPeakDb(avgPeak);
    });
    return unsubscribe;
  }, []);

  // Subscribe to gain changed events (from autoCalibrate or match lock)
  useEffect(() => {
    const unsubscribe = juceBridge.onGainChanged((data) => {
      if (data.inputGainDB !== undefined) {
        setInputGain(data.inputGainDB);
      }
      if (data.outputGainDB !== undefined) {
        setOutputGain(data.outputGainDB);
      }
    });
    return unsubscribe;
  }, []);

  // Click to reset all peak holds
  const resetPeaks = useCallback(() => {
    inputPeakRef.current = -100;
    outputPeakRef.current = -100;
    setInputPeakHold(-100);
    setOutputPeakHold(-100);
  }, []);

  const handleInputGainChange = useCallback((value: number) => {
    setInputGain(value);
    juceBridge.setInputGain(value);
  }, []);

  const handleOutputGainChange = useCallback((value: number) => {
    setOutputGain(value);
    juceBridge.setOutputGain(value);
  }, []);

  const handleMasterDryWetChange = useCallback((value: number) => {
    setMasterDryWet(value);
    juceBridge.setMasterDryWet(value / 100);
  }, []);

  const handleCalibrate = useCallback(async () => {
    if (!hasTarget || calibrating) return;
    const midpoint = (targetInputPeakMin! + targetInputPeakMax!) / 2;
    setCalibrating(true);
    try {
      await juceBridge.autoCalibrate(midpoint);
    } catch {
      // ignore
    }
    setCalibrating(false);
  }, [hasTarget, targetInputPeakMin, targetInputPeakMax, calibrating]);

  const calStatus = hasTarget
    ? getCalStatus(inputAvgPeakDb, targetInputPeakMin!, targetInputPeakMax!)
    : null;

  const peakValueStyle = (db: number): React.CSSProperties => ({
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    color: db > -0.1 ? 'var(--color-status-error)' : 'var(--color-text-primary)',
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'color 0.15s ease',
  });

  return (
    <div
      className="flex items-end px-4 pb-2 h-full"
      style={{
        position: 'relative',
        overflow: 'visible',
        background: 'var(--color-bg-primary)',
        borderTop: '1px solid var(--color-border-default)',
      }}
    >
      {/* Left section: Input peak + calibration indicator + Input knob */}
      <div className="flex items-end gap-3 flex-1">
        <div
          className="flex flex-col items-center min-w-[50px] pb-0.5"
          onClick={resetPeaks}
          title="Click to reset peak meters"
        >
          <span style={labelStyle}>Input</span>
          <span style={peakValueStyle(inputPeakHold)}>
            {inputPeakHold > -60 ? `${inputPeakHold.toFixed(1)} dB` : '---'}
          </span>
        </div>

        {/* Calibration indicator + CAL button */}
        {hasTarget && calStatus && (
          <div className="flex flex-col items-center gap-0.5 pb-0.5">
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: calStatusColor[calStatus],
                boxShadow: calStatus === 'in-range' ? `0 0 4px ${calStatusColor[calStatus]}` : 'none',
              }}
              title={
                calStatus === 'in-range'
                  ? 'Input level is within target range'
                  : calStatus === 'near'
                  ? 'Input level is close to target range'
                  : calStatus === 'out-low'
                  ? 'Input level is below target range'
                  : calStatus === 'out-high'
                  ? 'Input level is above target range'
                  : 'No signal detected'
              }
            />
            <button
              onClick={handleCalibrate}
              disabled={calibrating || calStatus === 'no-signal'}
              style={{
                fontSize: '8px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: calibrating ? '#666' : calStatusColor[calStatus],
                background: 'transparent',
                border: `1px solid ${calibrating ? '#333' : calStatusColor[calStatus]}`,
                borderRadius: '3px',
                padding: '1px 4px',
                cursor: calibrating || calStatus === 'no-signal' ? 'not-allowed' : 'pointer',
                letterSpacing: '0.05em',
                lineHeight: 1,
                opacity: calStatus === 'no-signal' ? 0.4 : 1,
              }}
              title={`Auto-calibrate input gain to target range (${targetInputPeakMin} to ${targetInputPeakMax} dBpk)`}
            >
              CAL
            </button>
          </div>
        )}

        <KnobPod>
          <Knob
            value={inputGain}
            onChange={handleInputGainChange}
            size={KNOB_SIZE}
            label="IN"
          />
        </KnobPod>
      </div>

      {/* Centre: Master Dry/Wet */}
      <div className="flex flex-col items-center">
        <KnobPod>
          <Knob
            value={masterDryWet}
            onChange={handleMasterDryWetChange}
            size={KNOB_SIZE}
            label="DRY/WET"
            min={0}
            max={100}
            defaultValue={100}
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </KnobPod>
      </div>

      {/* Right section: Output knob + Output peak */}
      <div className="flex items-end gap-3 flex-1 justify-end">
        <KnobPod>
          <Knob
            value={outputGain}
            onChange={handleOutputGainChange}
            size={KNOB_SIZE}
            label="OUT"
          />
        </KnobPod>
        <div
          className="flex flex-col items-center min-w-[50px] pb-0.5"
          onClick={resetPeaks}
          title="Click to reset peak meters"
        >
          <span style={labelStyle}>Output</span>
          <span style={peakValueStyle(outputPeakHold)}>
            {outputPeakHold > -60 ? `${outputPeakHold.toFixed(1)} dB` : '---'}
          </span>
        </div>
      </div>
    </div>
  );
}
