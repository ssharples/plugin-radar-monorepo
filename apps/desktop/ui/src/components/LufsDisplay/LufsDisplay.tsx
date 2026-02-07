import { ArrowUp, ArrowDown } from 'lucide-react';

interface LufsDisplayProps {
  lufs: number;        // LUFS value (typically -60 to 0)
  label?: string;      // Optional label (e.g., "IN", "OUT")
  compact?: boolean;   // Compact mode (smaller text)
  target?: number | null; // Target LUFS level (from chain metadata)
}

export function LufsDisplay({
  lufs,
  label,
  compact = false,
  target,
}: LufsDisplayProps) {
  const formatLufs = (value: number): string => {
    if (value <= -60 || !isFinite(value)) return '-inf';
    return value.toFixed(1);
  };

  const getColor = (value: number): string => {
    if (value <= -60 || !isFinite(value)) return 'text-plugin-dim';

    // If we have a target, color-code based on distance from target
    if (target != null && value > -60 && isFinite(value)) {
      const diff = Math.abs(value - target);
      if (diff <= 2) return 'text-green-400';  // Within ±2 dB — on target
      if (diff <= 4) return 'text-yellow-400';  // Within ±4 dB — close
      return 'text-red-400';                     // More than ±4 dB — adjust
    }

    // Default coloring (no target)
    if (value > -8) return 'text-red-400';
    if (value > -14) return 'text-yellow-400';
    return 'text-plugin-text';
  };

  const getDirectionArrow = () => {
    if (target == null || lufs <= -60 || !isFinite(lufs)) return null;
    const diff = lufs - target;
    if (Math.abs(diff) <= 2) return null; // On target, no arrow

    if (diff > 0) {
      // Input is too hot — turn down
      return (
        <ArrowDown className="w-2.5 h-2.5 text-yellow-400 animate-pulse" />
      );
    } else {
      // Input is too quiet — turn up
      return (
        <ArrowUp className="w-2.5 h-2.5 text-yellow-400 animate-pulse" />
      );
    }
  };

  if (compact) {
    return (
      <div className="flex flex-col items-center min-w-[32px]">
        <div className="flex items-center gap-0.5">
          <span className={`font-mono text-xxs tabular-nums leading-tight ${getColor(lufs)}`}>
            {formatLufs(lufs)}
          </span>
          {getDirectionArrow()}
        </div>
        <span className="text-[9px] text-plugin-dim uppercase tracking-wider font-medium">LUFS</span>
        {target != null && (
          <span className="text-[9px] text-plugin-dim font-mono leading-none mt-px">
            ⊕{target}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      {label && (
        <span className="text-[9px] text-plugin-dim uppercase tracking-widest font-medium">
          {label}
        </span>
      )}
      <div className="flex items-baseline gap-0.5">
        <span className={`font-mono text-sm font-medium tabular-nums ${getColor(lufs)}`}>
          {formatLufs(lufs)}
        </span>
        <span className="text-[9px] text-plugin-dim">LUFS</span>
        {getDirectionArrow()}
      </div>
      {target != null && (
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-plugin-dim font-mono">
            Target: {target}
          </span>
        </div>
      )}
    </div>
  );
}
