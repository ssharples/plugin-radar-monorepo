/**
 * Shared meter utilities — dB conversion, peak hold, smoothing.
 * Used by all compact metering widgets.
 */

/** Convert linear amplitude (0..1+) to dBFS. Returns -60 for silence. */
export function linearToDb(linear: number): number {
  if (linear <= 0.00001) return -60;
  return 20 * Math.log10(linear);
}

/** Convert dBFS to linear amplitude. */
export function dbToLinear(db: number): number {
  if (db <= -60) return 0;
  return Math.pow(10, db / 20);
}

/**
 * Map dBFS to a 0..1 range for meter display.
 * -60 dB → 0, 0 dB → ~0.91, +6 dB → 1.
 */
export function dbToNorm(db: number, minDb = -60, maxDb = 6): number {
  if (db <= minDb) return 0;
  if (db >= maxDb) return 1;
  return (db - minDb) / (maxDb - minDb);
}

/** Format dB as a compact string (e.g. "-3.2", "+0.5", "-inf"). */
export function formatDb(db: number, precision = 1): string {
  if (db <= -60 || !isFinite(db)) return '-\u221E';
  const sign = db >= 0 ? '+' : '';
  return `${sign}${db.toFixed(precision)}`;
}

/** Meter color thresholds (audio convention: green → yellow → red). */
export function meterColor(norm: number): string {
  if (norm > 0.91) return '#ef4444'; // red (above 0 dB)
  if (norm > 0.75) return '#eab308'; // yellow (-12 to 0 dB region)
  return '#22c55e'; // green
}

/** Industry-standard meter gradient string (CSS linear-gradient). */
export const METER_GRADIENT = `linear-gradient(to top,
  #1b9e3e 0%,
  #22c55e 40%,
  #a3e635 60%,
  #eab308 75%,
  #f97316 85%,
  #ef4444 95%,
  #ef4444 100%
)`;

/** Semi-transparent RMS gradient (behind peak). */
export const RMS_GRADIENT = `linear-gradient(to top,
  rgba(27, 158, 62, 0.35) 0%,
  rgba(34, 197, 94, 0.35) 40%,
  rgba(163, 230, 53, 0.35) 60%,
  rgba(234, 179, 8, 0.35) 75%,
  rgba(249, 115, 22, 0.35) 85%,
  rgba(239, 68, 68, 0.35) 95%,
  rgba(239, 68, 68, 0.35) 100%
)`;

/** Gain reduction gradient (amber/orange per Propane accent). */
export const GR_GRADIENT = `linear-gradient(to bottom,
  #c9944a 0%,
  #89572a 100%
)`;

/** The 0 dB mark as a normalized position (0..1). */
export const ZERO_DB_NORM = dbToNorm(0);

/** Common monospace font stack. */
export const MONO_FONT = "var(--font-mono, 'JetBrains Mono', monospace)";
