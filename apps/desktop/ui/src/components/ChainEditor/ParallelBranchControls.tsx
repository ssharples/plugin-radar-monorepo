import { useChainStore } from '../../stores/chainStore';
import type { ChainNodeUI } from '../../api/types';
import { Slider } from '../Slider/Slider';

interface ParallelBranchControlsProps {
  node: ChainNodeUI;
}

export function ParallelBranchControls({ node }: ParallelBranchControlsProps) {
  const { setBranchGain, setBranchSolo, setBranchMute, _endContinuousGesture } = useChainStore();

  const gainDb = node.type === 'plugin' ? node.branchGainDb : 0;
  const isSolo = node.type === 'plugin' ? node.solo : false;
  const isMute = node.type === 'plugin' ? node.mute : false;

  return (
    <div className="flex flex-col items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      {/* Solo/Mute buttons */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => setBranchSolo(node.id, !isSolo)}
          className="px-1 py-0.5 rounded text-xxs font-bold"
          style={{
            fontFamily: 'var(--font-mono)',
            letterSpacing: 'var(--tracking-wide)',
            background: isSolo ? 'rgba(222, 255, 10, 0.2)' : 'rgba(255, 255, 255, 0.04)',
            color: isSolo ? '#deff0a' : 'var(--color-text-tertiary)',
            border: isSolo ? '1px solid rgba(222, 255, 10, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
            transition: 'all var(--duration-fast) var(--ease-snap)',
          }}
          title={isSolo ? 'Unsolo branch' : 'Solo branch'}
        >
          S
        </button>
        <button
          onClick={() => setBranchMute(node.id, !isMute)}
          className="px-1 py-0.5 rounded text-xxs font-bold"
          style={{
            fontFamily: 'var(--font-mono)',
            letterSpacing: 'var(--tracking-wide)',
            background: isMute ? 'rgba(255, 0, 51, 0.2)' : 'rgba(255, 255, 255, 0.04)',
            color: isMute ? '#ff0033' : 'var(--color-text-tertiary)',
            border: isMute ? '1px solid rgba(255, 0, 51, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
            transition: 'all var(--duration-fast) var(--ease-snap)',
          }}
          title={isMute ? 'Unmute branch' : 'Mute branch'}
        >
          M
        </button>
      </div>

      {/* Gain slider */}
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
