import { useEffect, useState, useRef, useCallback } from 'react';
import { BarChart3 } from 'lucide-react';
import { juceBridge } from '../api/juce-bridge';
import { useChainStore } from '../stores/chainStore';
import { collectPlugins } from '../utils/chainHelpers';
import type { NodeMeterReadings } from '../api/types';

interface InlineMeterPanelProps {
  expanded: boolean;
  onToggle: () => void;
}

function dbToPercent(db: number): number {
  // Map -60dB..0dB to 0..100%
  if (db <= -60) return 0;
  if (db >= 0) return 100;
  return ((db + 60) / 60) * 100;
}

function meterColor(percent: number): string {
  if (percent > 85) return '#ef4444'; // red
  if (percent > 70) return '#eab308'; // yellow
  return '#22c55e'; // green
}

export function InlineMeterPanel({ expanded, onToggle }: InlineMeterPanelProps) {
  const nodes = useChainStore(s => s.nodes);
  const [meterData, setMeterData] = useState<Record<string, NodeMeterReadings>>({});
  const meterDataRef = useRef(meterData);
  meterDataRef.current = meterData;

  const plugins = collectPlugins(nodes);

  // Subscribe to meter data
  useEffect(() => {
    const cleanup = juceBridge.onNodeMeterData((data) => {
      setMeterData(data);
    });
    return cleanup;
  }, []);

  if (!expanded) {
    return (
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-center py-2 text-plugin-muted hover:text-plugin-foreground hover:bg-white/5 transition-colors border-t border-white/5"
        title="Show metering panel"
      >
        <BarChart3 size={14} />
      </button>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] overflow-hidden" style={{ width: 196 }}>
      {/* Header with collapse button */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-white/5 shrink-0">
        <span className="text-[9px] font-mono text-plugin-muted uppercase tracking-wider">Meters</span>
        <button
          onClick={onToggle}
          className="text-plugin-muted hover:text-plugin-foreground"
          title="Collapse metering panel"
        >
          <BarChart3 size={12} />
        </button>
      </div>

      {/* Per-plugin meters */}
      <div className="flex-1 min-h-0 overflow-y-auto px-1.5 py-1">
        {plugins.map((plugin, i) => {
          const meter = meterData[String(plugin.id)];
          const peakL = meter ? dbToPercent(meter.peakL) : 0;
          const peakR = meter ? dbToPercent(meter.peakR) : 0;
          const rmsL = meter ? dbToPercent(meter.rmsL) : 0;
          const rmsR = meter ? dbToPercent(meter.rmsR) : 0;

          return (
            <div key={plugin.id} className="mb-1.5">
              <div className="flex items-center gap-1 mb-0.5">
                <span className="font-mono text-[8px] text-plugin-muted w-3 text-right">{i + 1}</span>
                <span className="text-[8px] text-plugin-muted truncate flex-1" title={plugin.name}>
                  {plugin.name.length > 18 ? plugin.name.slice(0, 18) + '…' : plugin.name}
                </span>
              </div>
              {/* Stereo meter bars */}
              <div className="flex gap-px ml-4">
                {/* L channel */}
                <div className="flex-1 h-2 bg-white/5 rounded-sm overflow-hidden relative">
                  <div
                    className="absolute inset-y-0 left-0 rounded-sm opacity-40"
                    style={{ width: `${rmsL}%`, background: meterColor(rmsL) }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded-sm"
                    style={{ width: `${peakL}%`, background: meterColor(peakL), opacity: 0.8 }}
                  />
                </div>
                {/* R channel */}
                <div className="flex-1 h-2 bg-white/5 rounded-sm overflow-hidden relative">
                  <div
                    className="absolute inset-y-0 left-0 rounded-sm opacity-40"
                    style={{ width: `${rmsR}%`, background: meterColor(rmsR) }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded-sm"
                    style={{ width: `${peakR}%`, background: meterColor(peakR), opacity: 0.8 }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
