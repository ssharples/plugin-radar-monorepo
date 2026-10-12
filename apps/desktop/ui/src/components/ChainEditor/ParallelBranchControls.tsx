import { useChainStore } from '../../stores/chainStore';
import type { ChainNodeUI } from '../../api/types';
import { Slider } from '../Slider/Slider';

interface ParallelBranchControlsProps {
  node: ChainNodeUI;
  /** 0-based branch position, shown as "Branch N" */
  branchIndex?: number;
}

/**
 * Per-branch strip for a parallel group: solo, mute, phase invert and gain.
 * Sits above each branch so the branch content keeps its full width.
 */
export function ParallelBranchControls({ node, branchIndex }: ParallelBranchControlsProps) {
  const { setBranchGain, setBranchSolo, setBranchMute, setBranchPolarity } = useChainStore();

  const isSoloed = node.type === 'plugin' ? node.solo : false;
  const isMuted = node.type === 'plugin' ? node.mute : false;
  const gainDb = node.type === 'plugin' ? node.branchGainDb : 0;
  const isInverted = node.polarityInverted ?? false;

  const toggle = 'w-6 h-5 inline-flex items-center justify-center rounded text-[11px] font-bold transition-colors border';
  const off = 'bg-plugin-bg text-plugin-dim hover:text-plugin-text border-plugin-border';

  return (
    <div className="flex items-center gap-1 h-6 pl-1" onClick={(e) => e.stopPropagation()}>
      <span className="section-label !text-plugin-parallel/80 mr-1 whitespace-nowrap">
        Branch {branchIndex != null ? branchIndex + 1 : ''}
      </span>

      {/* Solo */}
      <button
        onClick={() => setBranchSolo(node.id, !isSoloed)}
        className={`${toggle} ${isSoloed ? 'bg-yellow-500/25 text-yellow-300 border-yellow-500/50' : off}`}
        title={isSoloed ? 'Unsolo' : 'Solo'}
        aria-pressed={isSoloed}
      >
        S
      </button>

      {/* Mute */}
      <button
        onClick={() => setBranchMute(node.id, !isMuted)}
        className={`${toggle} ${isMuted ? 'bg-red-500/25 text-red-300 border-red-500/50' : off}`}
        title={isMuted ? 'Unmute' : 'Mute'}
        aria-pressed={isMuted}
      >
        M
      </button>

      {/* Phase invert */}
      <button
        onClick={() => setBranchPolarity(node.id, !isInverted)}
        className={`${toggle} ${isInverted ? 'bg-plugin-accent/25 text-plugin-accent-bright border-plugin-accent/50' : off}`}
        title={isInverted ? 'Restore phase' : 'Invert phase'}
        aria-pressed={isInverted}
      >
        Ø
      </button>

      {/* Gain */}
      <div className="flex items-center gap-1.5 ml-2">
        <span className="section-label">Gain</span>
        <Slider
          value={gainDb}
          min={-60}
          max={12}
          step={0.5}
          color="orange"
          width="w-20"
          onChange={(v) => setBranchGain(node.id, v)}
          title={`${gainDb.toFixed(1)} dB`}
        />
        <span className="num text-[10px] text-plugin-muted w-11 text-right">
          {gainDb >= 0 ? '+' : ''}{gainDb.toFixed(1)} dB
        </span>
      </div>
    </div>
  );
}
