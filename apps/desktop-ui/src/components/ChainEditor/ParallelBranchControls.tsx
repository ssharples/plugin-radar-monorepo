import { useChainStore } from '../../stores/chainStore';
import type { ChainNodeUI } from '../../api/types';

interface ParallelBranchControlsProps {
  node: ChainNodeUI;
}

export function ParallelBranchControls({ node }: ParallelBranchControlsProps) {
  const { setBranchGain, setBranchSolo, setBranchMute } = useChainStore();

  const isSoloed = node.type === 'plugin' ? node.solo : false;
  const isMuted = node.type === 'plugin' ? node.mute : false;
  const gainDb = node.type === 'plugin' ? node.branchGainDb : 0;

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {/* Solo */}
      <button
        onClick={() => setBranchSolo(node.id, !isSoloed)}
        className={`w-6 h-5 flex items-center justify-center rounded text-xxs font-bold transition-colors ${
          isSoloed
            ? 'bg-yellow-500/30 text-yellow-400 border border-yellow-500/50'
            : 'bg-plugin-bg text-plugin-muted hover:text-plugin-text border border-plugin-border'
        }`}
        title={isSoloed ? 'Unsolo' : 'Solo'}
      >
        S
      </button>

      {/* Mute */}
      <button
        onClick={() => setBranchMute(node.id, !isMuted)}
        className={`w-6 h-5 flex items-center justify-center rounded text-xxs font-bold transition-colors ${
          isMuted
            ? 'bg-red-500/30 text-red-400 border border-red-500/50'
            : 'bg-plugin-bg text-plugin-muted hover:text-plugin-text border border-plugin-border'
        }`}
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        M
      </button>

      {/* Gain slider */}
      <div className="flex items-center gap-1">
        <input
          type="range"
          min={-60}
          max={12}
          step={0.5}
          value={gainDb}
          onChange={(e) => setBranchGain(node.id, parseFloat(e.target.value))}
          className="w-14 h-1 accent-plugin-accent cursor-pointer"
          title={`${gainDb.toFixed(1)} dB`}
        />
        <span className="text-xxs text-plugin-muted w-10 text-right tabular-nums">
          {gainDb >= 0 ? '+' : ''}{gainDb.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
