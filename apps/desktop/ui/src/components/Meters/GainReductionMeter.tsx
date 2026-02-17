import { memo } from 'react';
import { linearToDb, GR_GRADIENT, MONO_FONT } from './MeterUtils';

interface GainReductionMeterProps {
  /** Input peak L (linear 0..1+). */
  inputPeakL: number;
  /** Input peak R (linear 0..1+). */
  inputPeakR: number;
  /** Output peak L (linear 0..1+). */
  outputPeakL: number;
  /** Output peak R (linear 0..1+). */
  outputPeakR: number;
  /** Orientation. Default: vertical. */
  orientation?: 'vertical' | 'horizontal';
  /** Bar length in px. Default: 48. */
  length?: number;
  /** Bar thickness in px. Default: 8. */
  thickness?: number;
}

export const GainReductionMeter = memo(function GainReductionMeter({
  inputPeakL,
  inputPeakR,
  outputPeakL,
  outputPeakR,
  orientation = 'vertical',
  length = 48,
  thickness = 8,
}: GainReductionMeterProps) {
  // Estimate gain reduction from the louder channel
  const inputDb = Math.max(linearToDb(inputPeakL), linearToDb(inputPeakR));
  const outputDb = Math.max(linearToDb(outputPeakL), linearToDb(outputPeakR));

  // GR is negative (or zero). If output > input, there's no reduction.
  const grDb = Math.min(0, outputDb - inputDb);
  // Normalize: 0 dB GR → 0 (no bar), -30 dB GR → 1 (full bar)
  const grNorm = Math.min(1, Math.abs(grDb) / 30);

  const grLabel = grDb <= -0.1 ? grDb.toFixed(1) : '0.0';

  if (orientation === 'horizontal') {
    return (
      <div className="flex items-center gap-1">
        <span
          style={{
            fontFamily: MONO_FONT,
            fontSize: 8,
            letterSpacing: '0.08em',
            color: 'var(--color-text-tertiary, #606060)',
          }}
        >
          GR
        </span>
        <div
          className="relative overflow-hidden"
          style={{
            width: length,
            height: thickness,
            background: '#0a0a0a',
            borderRadius: 1,
            boxShadow: 'inset 0 0 4px rgba(0,0,0,0.6)',
          }}
        >
          {/* GR fill — grows from left */}
          <div
            className="absolute top-0 bottom-0 left-0"
            style={{
              width: `${grNorm * 100}%`,
              background: GR_GRADIENT.replace(/to bottom/g, 'to right'),
              transition: 'width 60ms linear',
            }}
          />
        </div>
        <span
          className="tabular-nums"
          style={{
            fontFamily: MONO_FONT,
            fontSize: 9,
            color: grDb <= -3 ? '#c9944a' : 'var(--color-text-tertiary, #606060)',
            minWidth: 28,
            textAlign: 'right',
          }}
        >
          {grLabel}
        </span>
      </div>
    );
  }

  // Vertical: bar fills from top down
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className="tabular-nums"
        style={{
          fontFamily: MONO_FONT,
          fontSize: 9,
          color: grDb <= -3 ? '#c9944a' : 'var(--color-text-tertiary, #606060)',
        }}
      >
        {grLabel}
      </span>
      <div
        className="relative overflow-hidden"
        style={{
          width: thickness,
          height: length,
          background: '#0a0a0a',
          borderRadius: 1,
          boxShadow: 'inset 0 0 4px rgba(0,0,0,0.6)',
        }}
      >
        {/* GR fill — grows from top down */}
        <div
          className="absolute top-0 left-0 right-0"
          style={{
            height: `${grNorm * 100}%`,
            background: GR_GRADIENT,
            transition: 'height 60ms linear',
          }}
        />
      </div>
      <span
        style={{
          fontFamily: MONO_FONT,
          fontSize: 8,
          letterSpacing: '0.08em',
          color: 'var(--color-text-tertiary, #606060)',
        }}
      >
        GR
      </span>
    </div>
  );
});
