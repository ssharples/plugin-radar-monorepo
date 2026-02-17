import { memo } from 'react';
import { MONO_FONT } from './MeterUtils';

interface StereoWidthIndicatorProps {
  /** Linear peak L (0..1+). */
  peakL: number;
  /** Linear peak R (0..1+). */
  peakR: number;
  /** RMS L (linear, optional — used for smoother correlation if available). */
  rmsL?: number;
  /** RMS R (linear, optional). */
  rmsR?: number;
  /** Width in px. Default: 48. */
  width?: number;
}

/**
 * Approximate stereo correlation from L/R levels.
 * Returns -1 (anti-phase) to +1 (mono).
 * This is a rough visual indicator — true correlation needs sample-level data.
 */
function approxCorrelation(l: number, r: number): number {
  const sum = l + r;
  if (sum < 0.0001) return 1; // silence → mono
  // Ratio-based approach: if L ≈ R, correlation is high
  const diff = Math.abs(l - r);
  return 1 - Math.min(1, (diff / sum) * 2);
}

export const StereoWidthIndicator = memo(function StereoWidthIndicator({
  peakL,
  peakR,
  rmsL,
  rmsR,
  width = 48,
}: StereoWidthIndicatorProps) {
  // Use RMS if available for smoother indication, otherwise peaks
  const l = rmsL !== undefined ? rmsL : peakL;
  const r = rmsR !== undefined ? rmsR : peakR;
  const correlation = approxCorrelation(l, r);

  // Map correlation to a visual position:
  // +1 → center dot, 0 → full width, -1 → anti-phase (red flash at edges)
  const spread = 1 - correlation; // 0 = mono, 1 = full anti-phase
  const barWidth = Math.max(2, spread * (width - 4));
  const isAntiPhase = correlation < 0;

  // L/R balance: >0 means right-heavy
  const balance = (l + r) > 0.0001 ? (r - l) / (l + r) : 0;
  // offset from center: -1..+1 → pixel offset
  const centerOffset = balance * (width / 2 - barWidth / 2) * 0.5;

  const indicatorColor = isAntiPhase
    ? '#ff0033'
    : correlation > 0.8
      ? '#22c55e'
      : '#eab308';

  return (
    <div className="flex flex-col items-center gap-0.5">
      {/* Label row: L — — R */}
      <div className="flex justify-between" style={{ width, fontSize: 7, fontFamily: MONO_FONT }}>
        <span style={{ color: 'var(--color-text-tertiary, #606060)' }}>L</span>
        <span style={{ color: 'var(--color-text-tertiary, #606060)' }}>R</span>
      </div>

      {/* Correlation track */}
      <div
        className="relative"
        style={{
          width,
          height: 6,
          background: '#0a0a0a',
          borderRadius: 1,
          boxShadow: 'inset 0 0 4px rgba(0,0,0,0.6)',
        }}
      >
        {/* Center line */}
        <div
          className="absolute top-0 bottom-0"
          style={{
            left: '50%',
            width: 1,
            background: 'rgba(255,255,255,0.1)',
          }}
        />

        {/* Stereo width indicator */}
        <div
          className="absolute top-0 bottom-0"
          style={{
            width: barWidth,
            left: `calc(50% - ${barWidth / 2}px + ${centerOffset}px)`,
            background: indicatorColor,
            borderRadius: 1,
            opacity: 0.8,
            transition: 'all 80ms linear',
            boxShadow: isAntiPhase ? `0 0 4px ${indicatorColor}` : 'none',
          }}
        />
      </div>

      {/* Status text */}
      <span
        style={{
          fontFamily: MONO_FONT,
          fontSize: 7,
          color: indicatorColor,
          letterSpacing: '0.05em',
        }}
      >
        {isAntiPhase ? 'PHASE' : correlation > 0.8 ? 'MONO' : 'WIDE'}
      </span>
    </div>
  );
});
