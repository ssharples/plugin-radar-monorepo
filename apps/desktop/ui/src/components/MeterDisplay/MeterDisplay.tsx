import { useMemo } from 'react';

interface MeterDisplayProps {
  peakL: number;           // Linear peak value (0-1+)
  peakR: number;
  peakHoldL?: number;      // Peak hold value (linear)
  peakHoldR?: number;
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

function MeterBar({
  percent,
  peakHoldPercent,
  isClipping,
  gradient,
  width,
  height,
}: {
  percent: number;
  peakHoldPercent?: number;
  isClipping: boolean;
  gradient: string;
  width: number;
  height: number;
}) {
  return (
    <div
      className="relative rounded-sm overflow-hidden shadow-meter"
      style={{ width, height, background: '#000000' }}
    >
      {/* Segment lines for pro look */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          backgroundImage: `repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,0.4) 2px, rgba(0,0,0,0.4) 3px)`,
        }}
      />

      {/* Level bar */}
      <div
        className="absolute bottom-0 left-0 right-0 transition-[height] duration-[30ms] ease-linear"
        style={{
          height: `${percent}%`,
          background: gradient,
        }}
      />

      {/* Peak hold indicator */}
      {peakHoldPercent !== undefined && peakHoldPercent > 0 && (
        <div
          className="absolute left-0 right-0 h-[1px] transition-all duration-100"
          style={{
            bottom: `${peakHoldPercent}%`,
            backgroundColor: peakHoldPercent > ZERO_DB_PERCENT ? '#ef4444' : 'rgba(255,255,255,0.8)',
            boxShadow: peakHoldPercent > ZERO_DB_PERCENT ? '0 0 4px rgba(239,68,68,0.6)' : 'none',
          }}
        />
      )}

      {/* Clip indicator */}
      {isClipping && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-red-500 animate-pulse-soft" />
      )}
    </div>
  );
}

export function MeterDisplay({
  peakL,
  peakR,
  peakHoldL,
  peakHoldR,
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

  const isClippingL = peakLDb > 0;
  const isClippingR = peakRDb > 0;

  const barWidth = showScale ? (width - 16) / 2 - 1 : (width / 2) - 1;

  // Scale markings - create a new array to avoid mutating
  const scaleMarks = [-48, -24, -12, -6, 0];

  return (
    <div className="flex" style={{ height }}>
      {/* Scale markings */}
      {showScale && (
        <div className="relative font-mono pr-1" style={{ width: 16, height }}>
          {scaleMarks.map((db) => (
            <div
              key={db}
              className="absolute right-1 transform -translate-y-1/2 text-[9px] text-plugin-dim"
              style={{ bottom: `${dbToPercent(db)}%` }}
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
          peakHoldPercent={peakHoldLPercent}
          isClipping={isClippingL}
          gradient={gradient}
          width={barWidth}
          height={height}
        />
        <MeterBar
          percent={peakRPercent}
          peakHoldPercent={peakHoldRPercent}
          isClipping={isClippingR}
          gradient={gradient}
          width={barWidth}
          height={height}
        />
      </div>
    </div>
  );
}
