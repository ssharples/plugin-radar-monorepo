import { useMemo, memo } from 'react';

interface MeterDisplayProps {
  peakL: number;           // Linear peak value (0-1+)
  peakR: number;
  peakHoldL?: number;      // Peak hold value (linear)
  peakHoldR?: number;
  rmsL?: number;           // Linear RMS value (0-1+)
  rmsR?: number;
  height?: number;         // Height in pixels (default 60)
  width?: number;          // Width in pixels (default 24)
  showScale?: boolean;     // Show dB scale markings
}

// Convert linear to dB
function linearToDb(linear: number): number {
  if (linear <= 0.00001) return -60;
  return 20 * Math.log10(linear);
}

// Convert dB to percentage (0-100) for display
function dbToPercent(db: number): number {
  const minDb = -60;
  const maxDb = 6;
  const clamped = Math.max(minDb, Math.min(maxDb, db));
  return ((clamped - minDb) / (maxDb - minDb)) * 100;
}

const ZERO_DB_PERCENT = dbToPercent(0);

const MeterBar = memo(function MeterBar({
  percent,
  rmsPercent,
  peakHoldPercent,
  isClipping,
  gradient,
  rmsGradient,
  width,
  height,
}: {
  percent: number;
  rmsPercent?: number;
  peakHoldPercent?: number;
  isClipping: boolean;
  gradient: string;
  rmsGradient: string;
  width: number;
  height: number;
}) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        width,
        height,
        background: 'var(--color-bg-primary, #0a0a0a)',
        borderRadius: 'var(--radius-sm, 2px)',
        boxShadow: 'inset 0 0 6px rgba(0, 0, 0, 0.6)',
      }}
    >
      {/* Segment lines for pro look */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          backgroundImage: `repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,0.5) 2px, rgba(0,0,0,0.5) 3px)`,
        }}
      />

      {/* RMS bar (behind peak, semi-transparent) */}
      {rmsPercent !== undefined && rmsPercent > 0 && (
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: `${rmsPercent}%`,
            background: rmsGradient,
            transition: 'height 80ms linear',
          }}
        />
      )}

      {/* Peak level bar */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: `${percent}%`,
          background: gradient,
          transition: 'height 30ms linear',
        }}
      />

      {/* Peak hold indicator */}
      {peakHoldPercent !== undefined && peakHoldPercent > 0 && (
        <div
          className="absolute left-0 right-0"
          style={{
            bottom: `${peakHoldPercent}%`,
            height: 1,
            backgroundColor: peakHoldPercent > ZERO_DB_PERCENT
              ? '#ff0033'
              : 'rgba(222, 255, 10, 0.8)',
            boxShadow: peakHoldPercent > ZERO_DB_PERCENT
              ? '0 0 4px rgba(255, 0, 51, 0.6)'
              : '0 0 4px rgba(222, 255, 10, 0.4)',
            transition: 'all 100ms ease',
          }}
        />
      )}

      {/* Clip indicator */}
      {isClipping && (
        <div
          className="absolute top-0 left-0 right-0 animate-pulse-soft"
          style={{
            height: 2,
            background: '#ff0033',
            boxShadow: '0 0 6px rgba(255, 0, 51, 0.6)',
          }}
        />
      )}
    </div>
  );
});

export const MeterDisplay = memo(function MeterDisplay({
  peakL,
  peakR,
  peakHoldL,
  peakHoldR,
  rmsL,
  rmsR,
  height = 60,
  width = 24,
  showScale = false,
}: MeterDisplayProps) {
  const peakLDb = linearToDb(peakL);
  const peakRDb = linearToDb(peakR);
  const peakLPercent = dbToPercent(peakLDb);
  const peakRPercent = dbToPercent(peakRDb);

  const peakHoldLPercent = peakHoldL !== undefined ? dbToPercent(linearToDb(peakHoldL)) : undefined;
  const peakHoldRPercent = peakHoldR !== undefined ? dbToPercent(linearToDb(peakHoldR)) : undefined;

  const rmsLPercent = rmsL !== undefined ? dbToPercent(linearToDb(rmsL)) : undefined;
  const rmsRPercent = rmsR !== undefined ? dbToPercent(linearToDb(rmsR)) : undefined;

  // Industry-standard meter gradient (green -> yellow -> red) - DO NOT CHANGE
  const gradient = useMemo(() => {
    return `linear-gradient(to top,
      #1b9e3e 0%,
      #22c55e 40%,
      #a3e635 60%,
      #eab308 75%,
      #f97316 85%,
      #ef4444 95%,
      #ef4444 100%
    )`;
  }, []);

  // RMS gradient: same colors as peak but semi-transparent (behind peak bar)
  const rmsGradient = useMemo(() => {
    return `linear-gradient(to top,
      rgba(27, 158, 62, 0.35) 0%,
      rgba(34, 197, 94, 0.35) 40%,
      rgba(163, 230, 53, 0.35) 60%,
      rgba(234, 179, 8, 0.35) 75%,
      rgba(249, 115, 22, 0.35) 85%,
      rgba(239, 68, 68, 0.35) 95%,
      rgba(239, 68, 68, 0.35) 100%
    )`;
  }, []);

  const isClippingL = peakLDb > 0;
  const isClippingR = peakRDb > 0;

  const barWidth = showScale ? (width - 16) / 2 - 1 : (width / 2) - 1;

  // Scale markings
  const scaleMarks = [-48, -24, -12, -6, 0];

  return (
    <div className="flex" style={{ height }}>
      {/* Scale markings - monospace */}
      {showScale && (
        <div className="relative pr-1" style={{ width: 16, height }}>
          {scaleMarks.map((db) => (
            <div
              key={db}
              className="absolute right-1 -translate-y-1/2"
              style={{
                bottom: `${dbToPercent(db)}%`,
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                fontSize: 'var(--text-xs, 10px)',
                color: db === 0
                  ? 'var(--color-accent-cyan, #deff0a)'
                  : 'var(--color-text-tertiary, #606060)',
              }}
            >
              {db}
            </div>
          ))}
        </div>
      )}

      {/* Meters container */}
      <div className="flex gap-[1px]" style={{ height }}>
        <MeterBar
          percent={peakLPercent}
          rmsPercent={rmsLPercent}
          peakHoldPercent={peakHoldLPercent}
          isClipping={isClippingL}
          gradient={gradient}
          rmsGradient={rmsGradient}
          width={barWidth}
          height={height}
        />
        <MeterBar
          percent={peakRPercent}
          rmsPercent={rmsRPercent}
          peakHoldPercent={peakHoldRPercent}
          isClipping={isClippingR}
          gradient={gradient}
          rmsGradient={rmsGradient}
          width={barWidth}
          height={height}
        />
      </div>
    </div>
  );
});
