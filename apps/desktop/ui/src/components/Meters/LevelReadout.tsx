import { memo } from 'react';
import { linearToDb, formatDb, MONO_FONT } from './MeterUtils';

interface LevelReadoutProps {
  /** Linear peak L (0..1+). */
  peakL: number;
  /** Linear peak R (0..1+). */
  peakR: number;
  /** Label text (e.g. "IN", "OUT", "PEAK"). */
  label?: string;
  /** Show both L/R values separately. Default: false (shows max). */
  stereo?: boolean;
}

function dbColor(db: number): string {
  if (db > 0) return '#ff0033';
  if (db > -6) return '#ef4444';
  if (db > -12) return '#eab308';
  return '#ffffff';
}

export const LevelReadout = memo(function LevelReadout({
  peakL,
  peakR,
  label,
  stereo = false,
}: LevelReadoutProps) {
  const dbL = linearToDb(peakL);
  const dbR = linearToDb(peakR);
  const dbMax = Math.max(dbL, dbR);

  if (stereo) {
    return (
      <div className="flex flex-col items-center" style={{ minWidth: 44 }}>
        {label && (
          <span
            className="uppercase"
            style={{
              fontFamily: MONO_FONT,
              fontSize: 8,
              letterSpacing: '0.08em',
              color: 'var(--color-text-tertiary, #606060)',
            }}
          >
            {label}
          </span>
        )}
        <div className="flex gap-1">
          <div className="flex flex-col items-end">
            <span
              style={{
                fontFamily: MONO_FONT,
                fontSize: 7,
                color: 'var(--color-text-tertiary, #606060)',
              }}
            >
              L
            </span>
            <span
              className="tabular-nums leading-tight"
              style={{
                fontFamily: MONO_FONT,
                fontSize: 10,
                color: dbColor(dbL),
              }}
            >
              {formatDb(dbL)}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span
              style={{
                fontFamily: MONO_FONT,
                fontSize: 7,
                color: 'var(--color-text-tertiary, #606060)',
              }}
            >
              R
            </span>
            <span
              className="tabular-nums leading-tight"
              style={{
                fontFamily: MONO_FONT,
                fontSize: 10,
                color: dbColor(dbR),
              }}
            >
              {formatDb(dbR)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center" style={{ minWidth: 40 }}>
      {label && (
        <span
          className="uppercase"
          style={{
            fontFamily: MONO_FONT,
            fontSize: 8,
            letterSpacing: '0.08em',
            color: 'var(--color-text-tertiary, #606060)',
          }}
        >
          {label}
        </span>
      )}
      <span
        className="tabular-nums leading-tight"
        style={{
          fontFamily: MONO_FONT,
          fontSize: 10,
          color: dbColor(dbMax),
        }}
      >
        {formatDb(dbMax)}
      </span>
      <span
        style={{
          fontFamily: MONO_FONT,
          fontSize: 7,
          color: 'var(--color-text-tertiary, #606060)',
        }}
      >
        dB
      </span>
    </div>
  );
});
