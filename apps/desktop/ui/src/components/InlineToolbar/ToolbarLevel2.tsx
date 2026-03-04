import { useMemo } from 'react';
import { useChainStore, useChainActions } from '../../stores/chainStore';
import { ToolbarKnob } from './ToolbarKnob';
import { ToolbarPresetNav } from './ToolbarPresetNav';
import { isNodeInParallelGroup } from '../../utils/chainHelpers';
import type { PluginNodeUI } from '../../api/types';

interface ToolbarLevel2Props {
  node: PluginNodeUI;
}

function formatGain(v: number): string {
  if (v >= 0) return `+${v.toFixed(1)}`;
  return v.toFixed(1);
}

export function ToolbarLevel2({ node }: ToolbarLevel2Props) {
  const {
    setNodeInputGain,
    setNodeOutputGain,
    setNodeDryWet,
    setNodeDucking,
    _endContinuousGesture,
  } = useChainActions();

  const nodes = useChainStore(s => s.nodes);
  const inParallel = useMemo(() => isNodeInParallelGroup(nodes, node.id), [nodes, node.id]);
  const showDuckKnobs = inParallel && !node.isDryPath && node.duckEnabled;

  const id = node.id;

  return (
    <div className="flex items-center gap-3 h-full">
      {/* Gain controls */}
      <div className="flex items-center gap-2">
        <ToolbarKnob
          value={node.inputGainDb}
          min={-24}
          max={24}
          defaultValue={0}
          label="IN"
          formatValue={formatGain}
          onChange={(v) => setNodeInputGain(id, v)}
          onDragEnd={_endContinuousGesture}
          size={26}
        />
        <ToolbarKnob
          value={node.outputGainDb}
          min={-24}
          max={24}
          defaultValue={0}
          label="OUT"
          formatValue={formatGain}
          onChange={(v) => setNodeOutputGain(id, v)}
          onDragEnd={_endContinuousGesture}
          size={26}
        />
        <ToolbarKnob
          value={node.pluginDryWet * 100}
          min={0}
          max={100}
          defaultValue={100}
          label="D/W"
          formatValue={(v) => `${Math.round(v)}%`}
          onChange={(v) => setNodeDryWet(id, v / 100)}
          onDragEnd={_endContinuousGesture}
          size={26}
        />
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-white/8 shrink-0" />

      {/* Preset navigation */}
      <ToolbarPresetNav />

      {/* Separator */}
      <div className="w-px h-6 bg-white/8 shrink-0" />

      {/* M/S Mode */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-nano text-white/60 tracking-wider">M/S</span>
        <MidSideSelector nodeId={id} currentMode={node.midSideMode ?? 0} />
      </div>

      {/* Duck knobs — only when ducking is enabled and node is in a send bus */}
      {showDuckKnobs && (
        <>
          <div className="w-px h-6 bg-white/8 shrink-0" />
          <div className="flex items-center gap-2">
            <ToolbarKnob
              value={node.duckThresholdDb ?? -20}
              min={-60}
              max={0}
              defaultValue={-20}
              label="THR"
              formatValue={(v) => `${v.toFixed(0)}dB`}
              onChange={(v) => setNodeDucking(id, true, v, node.duckAttackMs ?? 5, node.duckReleaseMs ?? 200)}
              onDragEnd={_endContinuousGesture}
              size={26}
            />
            <ToolbarKnob
              value={node.duckAttackMs ?? 5}
              min={0.1}
              max={500}
              defaultValue={5}
              label="ATK"
              formatValue={(v) => `${v.toFixed(0)}ms`}
              onChange={(v) => setNodeDucking(id, true, node.duckThresholdDb ?? -20, v, node.duckReleaseMs ?? 200)}
              onDragEnd={_endContinuousGesture}
              size={26}
            />
            <ToolbarKnob
              value={node.duckReleaseMs ?? 200}
              min={50}
              max={5000}
              defaultValue={200}
              label="REL"
              formatValue={(v) => `${v.toFixed(0)}ms`}
              onChange={(v) => setNodeDucking(id, true, node.duckThresholdDb ?? -20, node.duckAttackMs ?? 5, v)}
              onDragEnd={_endContinuousGesture}
              size={26}
            />
          </div>
        </>
      )}
    </div>
  );
}

function MidSideSelector({ nodeId, currentMode }: { nodeId: number; currentMode: number }) {
  const { setNodeMidSideMode } = useChainActions();
  const NEON = 'var(--color-accent-cyan)';

  return (
    <div
      className="flex rounded overflow-hidden"
      style={{
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(0,0,0,0.3)',
      }}
    >
      {([
        { label: 'L/R', tooltip: 'Normal stereo processing (L/R)' },
        { label: 'MID', tooltip: 'Process mid channel only — preserves stereo width' },
        { label: 'SIDE', tooltip: 'Process side channel only — preserves center content' },
        { label: 'M/S', tooltip: 'Full M/S processing — both mid and side channels processed' },
      ] as const).map(({ label, tooltip }, idx) => {
        const isActive = currentMode === idx;
        return (
          <button
            key={label}
            onClick={() => setNodeMidSideMode(nodeId, idx)}
            title={tooltip}
            className="px-1 py-0.5 text-nano font-bold"
            style={{
              background: isActive ? 'rgba(222, 255, 10, 0.15)' : 'transparent',
              color: isActive ? NEON : 'rgba(255,255,255,0.25)',
              transition: 'all 150ms ease',
              minWidth: '20px',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
