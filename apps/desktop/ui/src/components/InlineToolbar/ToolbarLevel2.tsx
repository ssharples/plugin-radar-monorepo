import { useChainActions } from '../../stores/chainStore';
import { ToolbarKnob } from './ToolbarKnob';
import { ToolbarPresetNav } from './ToolbarPresetNav';
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
    _endContinuousGesture,
  } = useChainActions();

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
        <span className="text-[7px] font-mono text-white tracking-wider">M/S</span>
        <MidSideSelector nodeId={id} currentMode={node.midSideMode ?? 0} />
      </div>
    </div>
  );
}

function MidSideSelector({ nodeId, currentMode }: { nodeId: number; currentMode: number }) {
  const { setNodeMidSideMode } = useChainActions();
  const NEON = '#deff0a';

  return (
    <div
      className="flex rounded overflow-hidden"
      style={{
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(0,0,0,0.3)',
      }}
    >
      {(['L/R', 'MID', 'SIDE', 'M/S'] as const).map((label, idx) => {
        const isActive = currentMode === idx;
        return (
          <button
            key={label}
            onClick={() => setNodeMidSideMode(nodeId, idx)}
            className="px-1 py-0.5 text-[7px] font-bold font-mono"
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
