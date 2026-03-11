import { useMemo, useCallback } from 'react';
import { useChainStore, useChainActions } from '../../stores/chainStore';
import { useMeterStore } from '../../stores/meterStore';
import { findNodeById } from '../../utils/chainHelpers';
import { Knob } from '../Knob/Knob';

const NEON = 'var(--color-accent-cyan)';

const MS_MODES = [
  { label: 'L/R', desc: 'Normal stereo', tooltip: 'Normal stereo processing (L/R)' },
  { label: 'MID', desc: 'Mid only', tooltip: 'Process mid channel only — preserves stereo width' },
  { label: 'SIDE', desc: 'Side only', tooltip: 'Process side channel only — preserves center content' },
  { label: 'M/S', desc: 'Full mid/side', tooltip: 'Full M/S processing — both mid and side channels processed' },
] as const;

function formatGain(v: number): string {
  if (v >= 0) return `+${v.toFixed(1)}`;
  return v.toFixed(1);
}

export function RoutingPanel() {
  const inlineEditorNodeId = useChainStore(s => s.inlineEditorNodeId);
  const nodes = useChainStore(s => s.nodes);
  const nodeMeterData = useMeterStore(s => s.nodeMeterData);
  const {
    setNodeInputGain, setNodeOutputGain, setNodeDryWet,
    setNodeMidSideMode, _endContinuousGesture,
  } = useChainActions();

  const currentNode = useMemo(() => {
    if (inlineEditorNodeId == null) return undefined;
    return findNodeById(nodes, inlineEditorNodeId);
  }, [nodes, inlineEditorNodeId]);

  if (!currentNode || currentNode.type !== 'plugin') {
    return (
      <div className="flex items-center justify-center h-full text-[10px] font-sans text-white">
        No plugin selected
      </div>
    );
  }

  const node = currentNode;
  const id = node.id;
  const meterData = nodeMeterData[String(id)];

  return (
    <div className="flex items-start gap-4 h-full p-3 overflow-x-auto">
      {/* I/O Gains */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <span className="text-pico font-sans text-plugin-accent uppercase tracking-wider mb-1">I/O</span>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-0.5">
            <Knob
              value={node.inputGainDb}
              min={-24}
              max={24}
              defaultValue={0}
              size={28}
              hideValue
              hideLabel
              onChange={(v) => setNodeInputGain(id, v)}
              onDragEnd={_endContinuousGesture}
            />
            <span className="text-pico font-sans text-white">IN</span>
            <span className="text-micro font-sans tabular-nums text-white">
              {formatGain(node.inputGainDb)}
            </span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <Knob
              value={node.outputGainDb}
              min={-24}
              max={24}
              defaultValue={0}
              size={28}
              hideValue
              hideLabel
              onChange={(v) => setNodeOutputGain(id, v)}
              onDragEnd={_endContinuousGesture}
            />
            <span className="text-pico font-sans text-white">OUT</span>
            <span className="text-micro font-sans tabular-nums text-white">
              {formatGain(node.outputGainDb)}
            </span>
          </div>
        </div>
      </div>

      {/* Separator */}
      <div className="w-px self-stretch bg-white/10 shrink-0" />

      {/* Dry/Wet */}
      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <span className="text-pico font-sans text-plugin-accent uppercase tracking-wider mb-1">Mix</span>
        <Knob
          value={node.pluginDryWet * 100}
          min={0}
          max={100}
          defaultValue={100}
          size={28}
          hideValue
          hideLabel
          onChange={(v) => setNodeDryWet(id, v / 100)}
          onDragEnd={_endContinuousGesture}
        />
        <span className="text-micro font-sans tabular-nums text-white">
          {Math.round(node.pluginDryWet * 100)}%
        </span>
      </div>

      {/* Separator */}
      <div className="w-px self-stretch bg-white/10 shrink-0" />

      {/* Mid/Side Mode */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <span className="text-pico font-sans text-plugin-accent uppercase tracking-wider mb-1">M/S Mode</span>
        <div className="flex flex-row gap-0.5">
          {MS_MODES.map((mode, idx) => {
            const isActive = (node.midSideMode ?? 0) === idx;
            return (
              <button
                key={mode.label}
                onClick={() => setNodeMidSideMode(id, idx)}
                title={mode.tooltip || mode.desc}
                className="px-2 py-1 rounded transition-colors"
                style={{
                  background: isActive ? 'rgba(222, 255, 10, 0.12)' : 'transparent',
                }}
              >
                <span
                  className="text-micro font-sans font-bold"
                  style={{ color: isActive ? NEON : 'rgba(255,255,255,0.3)' }}
                >
                  {mode.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Separator */}
      <div className="w-px self-stretch bg-white/10 shrink-0" />

      {/* Latency info */}
      {node.latency != null && node.latency > 0 && (
        <div className="flex flex-col items-center gap-1 shrink-0">
          <span className="text-pico font-sans text-plugin-accent uppercase tracking-wider mb-1">Latency</span>
          <div className="text-micro font-sans text-white">
            <span className="font-sans tabular-nums">{node.latency}</span> smp
          </div>
        </div>
      )}
    </div>
  );
}
