import { useMemo, useCallback } from 'react';
import { useChainStore, useChainActions } from '../../stores/chainStore';
import { findNodeById } from '../../utils/chainHelpers';
import { Knob } from '../Knob/Knob';

const NEON = '#deff0a';

const MS_MODES = [
  { label: 'L/R', desc: 'Normal stereo' },
  { label: 'MID', desc: 'Mid only' },
  { label: 'SIDE', desc: 'Side only' },
  { label: 'M/S', desc: 'Full mid/side' },
] as const;

function formatGain(v: number): string {
  if (v >= 0) return `+${v.toFixed(1)}`;
  return v.toFixed(1);
}

export function RoutingPanel() {
  const inlineEditorNodeId = useChainStore(s => s.inlineEditorNodeId);
  const nodes = useChainStore(s => s.nodes);
  const nodeMeterData = useChainStore(s => s.nodeMeterData);
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
        <span className="text-[8px] font-sans text-plugin-accent uppercase tracking-wider mb-1">I/O</span>
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
            <span className="text-[8px] font-sans text-white">IN</span>
            <span className="text-[9px] font-mono tabular-nums text-white">
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
            <span className="text-[8px] font-sans text-white">OUT</span>
            <span className="text-[9px] font-mono tabular-nums text-white">
              {formatGain(node.outputGainDb)}
            </span>
          </div>
        </div>
      </div>

      {/* Separator */}
      <div className="w-px self-stretch bg-white/10 shrink-0" />

      {/* Dry/Wet */}
      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <span className="text-[8px] font-sans text-plugin-accent uppercase tracking-wider mb-1">Mix</span>
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
        <span className="text-[9px] font-mono tabular-nums text-white">
          {Math.round(node.pluginDryWet * 100)}%
        </span>
      </div>

      {/* Separator */}
      <div className="w-px self-stretch bg-white/10 shrink-0" />

      {/* Mid/Side Mode */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <span className="text-[8px] font-sans text-plugin-accent uppercase tracking-wider mb-1">M/S Mode</span>
        <div className="flex flex-col gap-0.5">
          {MS_MODES.map((mode, idx) => {
            const isActive = (node.midSideMode ?? 0) === idx;
            return (
              <button
                key={mode.label}
                onClick={() => setNodeMidSideMode(id, idx)}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded transition-colors"
                style={{
                  background: isActive ? 'rgba(222, 255, 10, 0.12)' : 'transparent',
                }}
              >
                <span
                  className="text-[9px] font-sans font-bold w-7"
                  style={{ color: isActive ? NEON : 'rgba(255,255,255,0.3)' }}
                >
                  {mode.label}
                </span>
                <span className="text-[8px] font-sans text-white">
                  {mode.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Separator */}
      <div className="w-px self-stretch bg-white/10 shrink-0" />

      {/* Sidechain info */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <span className="text-[8px] font-sans text-plugin-accent uppercase tracking-wider mb-1">Sidechain</span>
        <div className="flex items-center gap-1 px-2 py-1 rounded bg-white/[0.03]">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{
              background: node.hasSidechain ? NEON : 'rgba(255,255,255,0.1)',
              boxShadow: node.hasSidechain ? `0 0 4px ${NEON}` : 'none',
            }}
          />
          <span className="text-[9px] font-sans text-white">
            {node.hasSidechain ? 'Available' : 'None'}
          </span>
        </div>
        {node.latency != null && node.latency > 0 && (
          <div className="text-[8px] font-sans text-white mt-1">
            Latency: <span className="font-mono tabular-nums">{node.latency}</span> smp
          </div>
        )}
      </div>
    </div>
  );
}
