import { Knob } from '../Knob/Knob';
import { useChainStore } from '../../stores/chainStore';
import type { PluginNodeUI } from '../../api/types';

interface PluginControlsPanelProps {
  node: PluginNodeUI;
  isExpanded: boolean;
}

export function PluginControlsPanel({ node, isExpanded }: PluginControlsPanelProps) {
  const setNodeInputGain = useChainStore((s) => s.setNodeInputGain);
  const setNodeOutputGain = useChainStore((s) => s.setNodeOutputGain);
  const setNodeDryWet = useChainStore((s) => s.setNodeDryWet);
  const setNodeMidSideMode = useChainStore((s) => s.setNodeMidSideMode);
  const setNodeAutoGain = useChainStore((s) => s.setNodeAutoGain);
  const endContinuousGesture = useChainStore((s) => s._endContinuousGesture);
  const isAutoGain = node.autoGainEnabled ?? false;

  if (!isExpanded) return null;

  return (
    <div
      className="plugin-controls-panel"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 10px 10px',
        background: 'rgba(255,255,255,0.02)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <Knob
        value={node.inputGainDb}
        min={-24}
        max={24}
        defaultValue={0}
        size={26}
        label="IN"
        onChange={(value) => setNodeInputGain(node.id, value)}
        onDragEnd={endContinuousGesture}
      />
      <div style={{ opacity: isAutoGain ? 0.4 : 1, pointerEvents: isAutoGain ? 'none' : 'auto' }}>
        <Knob
          value={node.outputGainDb}
          min={-24}
          max={24}
          defaultValue={0}
          size={26}
          label="OUT"
          onChange={(value) => setNodeOutputGain(node.id, value)}
          onDragEnd={endContinuousGesture}
        />
      </div>
      <Knob
        value={node.pluginDryWet * 100}
        min={0}
        max={100}
        defaultValue={100}
        size={26}
        label="DRY/WET"
        formatValue={(value) => `${Math.round(value)}%`}
        onChange={(value) => setNodeDryWet(node.id, value / 100)}
        onDragEnd={endContinuousGesture}
      />
      <div className="flex items-center gap-1">
        {['L/R', 'MID', 'SIDE', 'M/S'].map((label, index) => {
          const isActive = (node.midSideMode ?? 0) === index;
          return (
            <button
              key={label}
              onClick={() => setNodeMidSideMode(node.id, index)}
              className="px-2 py-1 rounded text-[10px] font-bold"
              style={{
                background: isActive ? 'rgba(222,255,10,0.15)' : 'rgba(255,255,255,0.04)',
                color: isActive ? 'var(--color-accent-cyan)' : 'var(--color-text-tertiary)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <button
        onClick={() => setNodeAutoGain(node.id, !isAutoGain)}
        className="ml-auto px-2 py-1 rounded text-[10px] font-bold uppercase"
        style={{
          background: isAutoGain ? 'rgba(222,255,10,0.15)' : 'rgba(255,255,255,0.04)',
          color: isAutoGain ? 'var(--color-accent-cyan)' : 'var(--color-text-tertiary)',
        }}
      >
        Auto Gain
      </button>
    </div>
  );
}
