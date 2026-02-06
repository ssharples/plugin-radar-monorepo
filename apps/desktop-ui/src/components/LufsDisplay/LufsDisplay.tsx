interface LufsDisplayProps {
  lufs: number;        // LUFS value (typically -60 to 0)
  label?: string;      // Optional label (e.g., "IN", "OUT")
  compact?: boolean;   // Compact mode (smaller text)
}

export function LufsDisplay({
  lufs,
  label,
  compact = false,
}: LufsDisplayProps) {
  const formatLufs = (value: number): string => {
    if (value <= -60 || !isFinite(value)) return '-inf';
    return value.toFixed(1);
  };

  const getColor = (value: number): string => {
    if (value <= -60 || !isFinite(value)) return 'text-plugin-dim';
    if (value > -8) return 'text-red-400';
    if (value > -14) return 'text-yellow-400';
    return 'text-plugin-text';
  };

  if (compact) {
    return (
      <div className="flex flex-col items-center min-w-[32px]">
        <span className={`font-mono text-xxs tabular-nums leading-tight ${getColor(lufs)}`}>
          {formatLufs(lufs)}
        </span>
        <span className="text-[7px] text-plugin-dim uppercase tracking-wider font-medium">LUFS</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      {label && (
        <span className="text-[8px] text-plugin-dim uppercase tracking-widest font-medium">
          {label}
        </span>
      )}
      <div className="flex items-baseline gap-0.5">
        <span className={`font-mono text-sm font-medium tabular-nums ${getColor(lufs)}`}>
          {formatLufs(lufs)}
        </span>
        <span className="text-[8px] text-plugin-dim">LUFS</span>
      </div>
    </div>
  );
}
