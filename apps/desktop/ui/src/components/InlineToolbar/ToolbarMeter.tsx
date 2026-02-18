import { linearToDb, dbToNorm, meterColor, formatDb } from '../Meters/MeterUtils';

interface ToolbarMeterProps {
  peakL: number;
  peakR: number;
  label: string;
}

export function ToolbarMeter({ peakL, peakR, label }: ToolbarMeterProps) {
  const dbL = linearToDb(peakL);
  const dbR = linearToDb(peakR);
  const normL = dbToNorm(dbL);
  const normR = dbToNorm(dbR);
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
              height: `${normL * 100}%`,
              background: meterColor(normL),
              opacity: 0.85,
            }}
          />
        </div>
        {/* R bar */}
        <div className="flex-1 bg-white/5 rounded-sm overflow-hidden relative">
          <div
            className="absolute bottom-0 left-0 right-0 rounded-sm transition-all duration-75"
            style={{
              height: `${normR * 100}%`,
              background: meterColor(normR),
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
