import { useChainStore } from '../../stores/chainStore';
import type { ChainNodeUI } from '../../api/types';
import { Slider } from '../Slider/Slider';

interface ParallelBranchControlsProps {
  node: ChainNodeUI;
}

export function ParallelBranchControls({ node }: ParallelBranchControlsProps) {
  const { setBranchGain, _endContinuousGesture } = useChainStore();

  const gainDb = node.type === 'plugin' ? node.branchGainDb : 0;

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {/* Gain slider - embedded in rack, solo/mute now on plugin slot */}
      <div className="flex items-center gap-1">
        <Slider
          value={gainDb}
          min={-60}
          max={12}
          step={0.5}
          color="accent"
          width="w-16"
          onChange={(v) => setBranchGain(node.id, v)}
          onDragEnd={_endContinuousGesture}
          title={`${gainDb.toFixed(1)} dB`}
        />
        <span
          className="text-xxs w-10 text-right tabular-nums"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-tertiary)',
            letterSpacing: 'var(--tracking-wide)',
          }}
        >
          {gainDb >= 0 ? '+' : ''}{gainDb.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
