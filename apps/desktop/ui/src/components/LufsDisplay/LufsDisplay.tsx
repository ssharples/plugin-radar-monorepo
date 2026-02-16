import { ArrowUp, ArrowDown } from 'lucide-react';

interface LufsDisplayProps {
  lufs: number;        // LUFS value (typically -60 to 0)
  label?: string;      // Optional label (e.g., "IN", "OUT")
  compact?: boolean;   // Compact mode (smaller text)
  target?: number | null; // Target LUFS level (from chain metadata)
}

// Design system status colors
const STATUS_ACTIVE = '#00ff41';
const STATUS_WARNING = '#ffaa00';
const STATUS_ERROR = '#ff0033';

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
    if (value <= -60 || !isFinite(value)) return 'var(--color-text-tertiary, #606060)';

    // If we have a target, color-code based on distance from target
    if (target != null && value > -60 && isFinite(value)) {
      const diff = Math.abs(value - target);
      if (diff <= 2) return STATUS_ACTIVE;   // Within +/-2 dB -- on target
      if (diff <= 4) return STATUS_WARNING;   // Within +/-4 dB -- close
      return STATUS_ERROR;                     // More than +/-4 dB -- adjust
    }

    // Default coloring (no target)
    if (value > -8) return STATUS_ERROR;
    if (value > -14) return STATUS_WARNING;
    return 'var(--color-text-primary, #ffffff)';
  };

  const getDirectionArrow = () => {
    if (target == null || lufs <= -60 || !isFinite(lufs)) return null;
    const diff = lufs - target;
    if (Math.abs(diff) <= 2) return null; // On target, no arrow

    if (diff > 0) {
      // Input is too hot -- turn down
      return (
        <ArrowDown
          className="animate-pulse"
          style={{ width: 10, height: 10, color: STATUS_WARNING }}
        />
      );
    } else {
      // Input is too quiet -- turn up
      return (
        <ArrowUp
          className="animate-pulse"
          style={{ width: 10, height: 10, color: STATUS_WARNING }}
        />
      );
    }
  };

  const monoFont = "var(--font-mono, 'JetBrains Mono', monospace)";

  if (compact) {
    return (
      <div className="flex flex-col items-center" style={{ minWidth: 32 }}>
        <div className="flex items-center gap-0.5">
          <span
            className="tabular-nums leading-tight"
            style={{
              fontFamily: monoFont,
              fontSize: 'var(--text-xs, 10px)',
              color: getColor(lufs),
            }}
          >
            {formatLufs(lufs)}
          </span>
          {getDirectionArrow()}
        </div>
        <span
          className="uppercase"
          style={{
            fontFamily: monoFont,
            fontSize: 'var(--text-xs, 10px)',
            letterSpacing: 'var(--tracking-wider, 0.1em)',
            color: 'var(--color-text-tertiary, #606060)',
          }}
        >
          LUFS
        </span>
        {target != null && (
          <span
            className="leading-none mt-px"
            style={{
              fontFamily: monoFont,
              fontSize: 'var(--text-xs, 10px)',
              color: 'var(--color-text-tertiary, #606060)',
            }}
          >
            T:{target}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      {label && (
        <span
          className="uppercase font-medium"
          style={{
            fontFamily: monoFont,
            fontSize: 'var(--text-xs, 10px)',
            letterSpacing: 'var(--tracking-widest, 0.15em)',
            color: 'var(--color-text-tertiary, #606060)',
          }}
        >
          {label}
        </span>
      )}
      <div className="flex items-baseline gap-0.5">
        <span
          className="font-medium tabular-nums"
          style={{
            fontFamily: monoFont,
            fontSize: 'var(--text-lg, 13px)',
            color: getColor(lufs),
            textShadow: lufs > -14 ? `0 0 8px ${getColor(lufs)}40` : 'none',
          }}
        >
          {formatLufs(lufs)}
        </span>
        <span
          className="uppercase"
          style={{
            fontFamily: monoFont,
            fontSize: 'var(--text-xs, 10px)',
            color: 'var(--color-text-tertiary, #606060)',
          }}
        >
          LUFS
        </span>
        {getDirectionArrow()}
      </div>
      {target != null && (
        <div className="flex items-center gap-1">
          <span
            className="uppercase"
            style={{
              fontFamily: monoFont,
              fontSize: 'var(--text-xs, 10px)',
              color: 'var(--color-text-tertiary, #606060)',
            }}
          >
            Target: {target}
          </span>
        </div>
      )}
    </div>
  );
}
