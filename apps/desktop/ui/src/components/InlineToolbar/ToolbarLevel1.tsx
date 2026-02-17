import { useMemo } from 'react';
import { useChainStore, useChainActions } from '../../stores/chainStore';
import { ToolbarMeter } from './ToolbarMeter';
import type { PluginNodeUI } from '../../api/types';

interface ToolbarLevel1Props {
  node: PluginNodeUI;
}

const NEON = '#deff0a';

export function ToolbarLevel1({ node }: ToolbarLevel1Props) {
  const nodeMeterData = useChainStore(s => s.nodeMeterData);
  const snapshots = useChainStore(s => s.snapshots);
  const activeSnapshot = useChainStore(s => s.activeSnapshot);
  const { toggleNodeBypass, saveSnapshot, recallSnapshot } = useChainActions();

  const meterData = nodeMeterData[String(node.id)];

  return (
    <div className="flex items-center gap-2 h-full">
      {/* Bypass toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); toggleNodeBypass(node.id); }}
        className="w-6 h-6 rounded flex items-center justify-center shrink-0 transition-colors"
        style={{
          background: node.bypassed ? 'rgba(255,255,255,0.05)' : 'rgba(222, 255, 10, 0.15)',
          border: node.bypassed ? '1px solid rgba(255,255,255,0.08)' : `1px solid rgba(222, 255, 10, 0.3)`,
          color: node.bypassed ? '#555' : NEON,
        }}
        title={node.bypassed ? 'Enable plugin (B)' : 'Bypass plugin (B)'}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2" />
          {!node.bypassed && <circle cx="5" cy="5" r="1.5" fill="currentColor" />}
        </svg>
      </button>

      {/* Plugin name */}
      <span className="text-[11px] font-mono text-white truncate max-w-[120px] shrink-0" title={node.name}>
        {node.name}
      </span>

      {/* Separator */}
      <div className="w-px h-5 bg-white/8 shrink-0" />

      {/* A/B/C/D Snapshots */}
      <div className="flex gap-0.5 shrink-0">
        {[0, 1, 2, 3].map((i) => {
          const label = ['A', 'B', 'C', 'D'][i];
          const snapshot = snapshots[i];
          const isActive = activeSnapshot === i && snapshot != null;
          return (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                if (e.shiftKey) {
                  saveSnapshot(i);
                } else if (snapshot) {
                  recallSnapshot(i);
                } else {
                  saveSnapshot(i);
                }
              }}
              className="w-5 h-5 rounded text-[8px] font-bold font-mono"
              style={{
                transition: 'all 150ms ease',
                background: isActive
                  ? NEON
                  : snapshot
                    ? 'rgba(222, 255, 10, 0.12)'
                    : 'rgba(255,255,255,0.05)',
                color: isActive
                  ? '#000'
                  : snapshot
                    ? NEON
                    : '#555',
                border: snapshot && !isActive
                  ? `1px solid rgba(222, 255, 10, 0.3)`
                  : '1px solid rgba(255,255,255,0.08)',
                boxShadow: isActive
                  ? `0 0 6px rgba(222, 255, 10, 0.3)`
                  : 'none',
              }}
              title={
                snapshot
                  ? `${isActive ? 'Active' : 'Recall'} ${label}`
                  : `Save snapshot ${label}`
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Spacer to push meters to the right */}
      <div className="flex-1" />

      {/* Compact I/O meters */}
      <div className="flex items-center gap-2 shrink-0">
        <ToolbarMeter
          peakL={meterData?.inputPeakL ?? 0}
          peakR={meterData?.inputPeakR ?? 0}
          label="IN"
        />
        <ToolbarMeter
          peakL={meterData?.peakL ?? 0}
          peakR={meterData?.peakR ?? 0}
          label="OUT"
        />
      </div>
    </div>
  );
}
