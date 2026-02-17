interface ToolbarMeterProps {
  peakL: number;
  peakR: number;
  label: string;
}

function linearToDb(linear: number): number {
  if (linear <= 0.00001) return -60;
  return 20 * Math.log10(linear);
}

function dbToPercent(db: number): number {
  if (db <= -60) return 0;
  if (db >= 0) return 100;
  return ((db + 60) / 60) * 100;
}

function meterColor(percent: number): string {
  if (percent > 85) return '#ef4444';
  if (percent > 70) return '#eab308';
  return '#22c55e';
}

function formatDb(db: number): string {
  if (db <= -60) return '-\u221E';
  return `${db >= 0 ? '+' : ''}${db.toFixed(1)}`;
}

export function ToolbarMeter({ peakL, peakR, label }: ToolbarMeterProps) {
  const dbL = linearToDb(peakL);
  const dbR = linearToDb(peakR);
  const pctL = dbToPercent(dbL);
  const pctR = dbToPercent(dbR);
  const peakDb = Math.max(dbL, dbR);

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[7px] font-mono text-white tracking-wider">{label}</span>
      <div className="flex gap-px" style={{ width: 24, height: 14 }}>
        {/* L bar */}
        <div className="flex-1 bg-white/5 rounded-sm overflow-hidden relative">
          <div
            className="absolute bottom-0 left-0 right-0 rounded-sm transition-all duration-75"
            style={{
              height: `${pctL}%`,
              background: meterColor(pctL),
              opacity: 0.85,
            }}
          />
        </div>
        {/* R bar */}
        <div className="flex-1 bg-white/5 rounded-sm overflow-hidden relative">
          <div
            className="absolute bottom-0 left-0 right-0 rounded-sm transition-all duration-75"
            style={{
              height: `${pctR}%`,
              background: meterColor(pctR),
              opacity: 0.85,
            }}
          />
        </div>
      </div>
      <span
        className="text-[8px] font-mono tabular-nums leading-none"
        style={{
          color:
            peakDb > -3
              ? '#ef4444'
              : peakDb > -12
                ? '#eab308'
                : 'rgba(255,255,255,0.4)',
        }}
      >
        {formatDb(peakDb)}
      </span>
    </div>
  );
}
