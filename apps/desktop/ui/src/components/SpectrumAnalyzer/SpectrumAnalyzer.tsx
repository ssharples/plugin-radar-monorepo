import { useRef, useEffect, useCallback, useState } from 'react';
import { juceBridge } from '../../api/juce-bridge';
import type { FFTData } from '../../api/types';

// ============================================
// Types
// ============================================

type VisualizationMode = 'bars' | 'line' | 'octave';

interface SpectrumAnalyzerProps {
  height?: number;
}

interface PeakEntry {
  value: number;
  timestamp: number;
}

interface OctaveBand {
  lo: number;
  ctr: number;
  hi: number;
}

// ============================================
// Constants
// ============================================

const MIN_DB = -90;
const MAX_DB = 0;
const DB_RANGE = MAX_DB - MIN_DB;

const FREQ_LABELS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const DB_LABELS = [0, -12, -24, -36, -48, -60];

const PEAK_HOLD_MS = 1500;
const PEAK_DECAY_RATE = 0.4; // dB per frame (~60fps)

const MIN_FREQ = 20;
const MAX_FREQ = 20000;

// ============================================
// Gradient colors (inspired by audioMotion classic)
// ============================================

const GRADIENT_STOPS: [number, string][] = [
  [0.0, '#1b9e3e'],
  [0.35, '#22c55e'],
  [0.55, '#a3e635'],
  [0.70, '#eab308'],
  [0.82, '#f97316'],
  [0.92, '#ef4444'],
  [1.0, '#ef4444'],
];

// ============================================
// Octave band generation (1/3 octave & full octave)
// ============================================

function generateOctaveBands(fraction: number): OctaveBand[] {
  const bands: OctaveBand[] = [];
  const ratio = Math.pow(2, 1 / (2 * fraction));

  // Start from 15.625 Hz (ANSI standard base)
  // Generate center frequencies: f_n = 1000 * 2^((n - 30) / (3 * fraction))
  // For 1/3 octave (fraction=3), n ranges produce bands from ~16Hz to ~20kHz
  // For full octave (fraction=1), fewer bands
  const nMin = Math.floor(fraction * 3 * Math.log2(MIN_FREQ / 1000)) + 30;
  const nMax = Math.ceil(fraction * 3 * Math.log2(MAX_FREQ / 1000)) + 30;

  for (let n = nMin; n <= nMax; n++) {
    const ctr = 1000 * Math.pow(2, (n - 30) / (3 * fraction));
    if (ctr < MIN_FREQ * 0.9 || ctr > MAX_FREQ * 1.1) continue;
    const lo = ctr / ratio;
    const hi = ctr * ratio;
    bands.push({ lo, ctr, hi });
  }

  return bands;
}

const THIRD_OCTAVE_BANDS = generateOctaveBands(3);
const FULL_OCTAVE_BANDS = generateOctaveBands(1);

// ============================================
// Utility functions
// ============================================

function linearToDb(linear: number): number {
  if (linear <= 1e-10) return MIN_DB;
  return 20 * Math.log10(linear);
}

function dbToY(db: number, canvasHeight: number, topPad: number, bottomPad: number): number {
  const plotHeight = canvasHeight - topPad - bottomPad;
  const clamped = Math.max(MIN_DB, Math.min(MAX_DB, db));
  const normalized = (clamped - MIN_DB) / DB_RANGE; // 0 (bottom/min) to 1 (top/max)
  return topPad + plotHeight * (1 - normalized);
}

function freqToX(freq: number, width: number, leftPad: number, rightPad: number): number {
  const plotWidth = width - leftPad - rightPad;
  const logMin = Math.log10(MIN_FREQ);
  const logMax = Math.log10(MAX_FREQ);
  const logFreq = Math.log10(Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq)));
  return leftPad + plotWidth * (logFreq - logMin) / (logMax - logMin);
}

function formatFreq(freq: number): string {
  if (freq >= 1000) return `${(freq / 1000).toFixed(freq >= 10000 ? 0 : 0)}k`;
  return `${freq}`;
}

// ============================================
// Component
// ============================================

export function SpectrumAnalyzer({ height = 100 }: SpectrumAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const magnitudesRef = useRef<number[]>([]);
  const sampleRateRef = useRef(44100);
  const fftSizeRef = useRef(2048);
  const smoothedRef = useRef<number[]>([]);
  const peaksRef = useRef<PeakEntry[]>([]);

  const [mode, setMode] = useState<VisualizationMode>('bars');
  const [octaveMode, setOctaveMode] = useState<'third' | 'full'>('third');

  // ============================================
  // Aggregate magnitudes into octave bands
  // ============================================
  const getOctaveBandLevels = useCallback((
    magnitudes: number[],
    fftSize: number,
    sampleRate: number,
    bands: OctaveBand[]
  ): number[] => {
    const binCount = magnitudes.length;
    const levels: number[] = new Array(bands.length).fill(0);

    for (let b = 0; b < bands.length; b++) {
      const { lo, hi } = bands[b];
      const loIndex = Math.max(1, Math.floor((lo * fftSize) / sampleRate));
      const hiIndex = Math.min(binCount - 1, Math.ceil((hi * fftSize) / sampleRate));

      if (loIndex > hiIndex || loIndex >= binCount) {
        levels[b] = 0;
        continue;
      }

      // RMS-style energy sum for the band
      let sum = 0;
      let count = 0;
      for (let i = loIndex; i <= hiIndex; i++) {
        const mag = magnitudes[i] || 0;
        sum += mag * mag;
        count++;
      }
      levels[b] = count > 0 ? Math.sqrt(sum / count) : 0;
    }

    return levels;
  }, []);

  // ============================================
  // Create canvas gradient
  // ============================================
  const createGradient = useCallback((
    ctx: CanvasRenderingContext2D,
    topPad: number,
    bottomY: number
  ): CanvasGradient => {
    const grad = ctx.createLinearGradient(0, bottomY, 0, topPad);
    for (const [stop, color] of GRADIENT_STOPS) {
      grad.addColorStop(stop, color);
    }
    return grad;
  }, []);

  // ============================================
  // Draw functions
  // ============================================

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    }

    const width = rect.width;
    const canvasHeight = rect.height;

    const leftPad = 28;
    const rightPad = 8;
    const topPad = 6;
    const bottomPad = 14;
    const plotWidth = width - leftPad - rightPad;
    const plotHeight = canvasHeight - topPad - bottomPad;

    // Clear
    ctx.clearRect(0, 0, width, canvasHeight);

    // Draw grid
    drawGrid(ctx, width, canvasHeight, leftPad, rightPad, topPad, bottomPad);

    const magnitudes = magnitudesRef.current;
    if (magnitudes.length === 0) return;

    const fftSize = fftSizeRef.current;
    const sampleRate = sampleRateRef.current;
    const gradient = createGradient(ctx, topPad, topPad + plotHeight);
    const now = performance.now();

    if (mode === 'octave') {
      const bands = octaveMode === 'third' ? THIRD_OCTAVE_BANDS : FULL_OCTAVE_BANDS;
      const levels = getOctaveBandLevels(magnitudes, fftSize, sampleRate, bands);
      drawOctaveBars(ctx, levels, bands, gradient, width, canvasHeight, leftPad, rightPad, topPad, bottomPad, now);
    } else if (mode === 'bars') {
      drawBars(ctx, magnitudes, fftSize, sampleRate, gradient, canvasHeight, leftPad, topPad, bottomPad, plotWidth, plotHeight, now);
    } else {
      drawLine(ctx, magnitudes, fftSize, sampleRate, gradient, canvasHeight, leftPad, topPad, bottomPad, plotWidth, plotHeight);
    }
  }, [mode, octaveMode, createGradient, getOctaveBandLevels]);

  // ============================================
  // Grid drawing
  // ============================================

  const drawGrid = useCallback((
    ctx: CanvasRenderingContext2D,
    width: number,
    canvasHeight: number,
    leftPad: number,
    rightPad: number,
    topPad: number,
    bottomPad: number,
  ) => {
    // dB horizontal grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (const db of DB_LABELS) {
      const y = dbToY(db, canvasHeight, topPad, bottomPad);
      ctx.beginPath();
      ctx.moveTo(leftPad, y);
      ctx.lineTo(width - rightPad, y);
      ctx.stroke();
      ctx.fillText(`${db}`, leftPad - 3, y);
    }

    // Frequency vertical grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (const freq of FREQ_LABELS) {
      const x = freqToX(freq, width, leftPad, rightPad);
      if (x < leftPad || x > width - rightPad) continue;
      ctx.beginPath();
      ctx.moveTo(x, topPad);
      ctx.lineTo(x, canvasHeight - bottomPad);
      ctx.stroke();
      ctx.fillText(formatFreq(freq), x, canvasHeight - bottomPad + 2);
    }

    // 0dB line slightly brighter
    const zeroY = dbToY(0, canvasHeight, topPad, bottomPad);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.moveTo(leftPad, zeroY);
    ctx.lineTo(width - rightPad, zeroY);
    ctx.stroke();
  }, []);

  // ============================================
  // Bars mode (discrete FFT bins, log-spaced)
  // ============================================

  const drawBars = useCallback((
    ctx: CanvasRenderingContext2D,
    magnitudes: number[],
    fftSize: number,
    sampleRate: number,
    gradient: CanvasGradient,
    canvasHeight: number,
    leftPad: number,
    topPad: number,
    bottomPad: number,
    plotWidth: number,
    plotHeight: number,
    now: number,
  ) => {
    const binCount = magnitudes.length;
    const bottomY = topPad + plotHeight;

    // Smoothing
    if (smoothedRef.current.length !== binCount) {
      smoothedRef.current = new Array(binCount).fill(0);
    }
    if (peaksRef.current.length !== binCount) {
      peaksRef.current = new Array(binCount).fill(null).map(() => ({ value: MIN_DB, timestamp: 0 }));
    }

    ctx.fillStyle = gradient;

    // Calculate number of visual bars to fit in the plot area
    const numVisualBars = Math.min(binCount, Math.floor(plotWidth / 2.5));
    const barWidth = Math.max(1, (plotWidth / numVisualBars) - 1);
    const barSpacing = plotWidth / numVisualBars;

    for (let i = 0; i < numVisualBars; i++) {
      // Map visual bar index to FFT bin using log scale
      const t = i / numVisualBars;
      const logMin = Math.log10(MIN_FREQ);
      const logMax = Math.log10(Math.min(MAX_FREQ, sampleRate / 2));
      const freq = Math.pow(10, logMin + t * (logMax - logMin));
      const binIndex = Math.round((freq * fftSize) / sampleRate);

      if (binIndex < 1 || binIndex >= binCount) continue;

      const mag = magnitudes[binIndex] || 0;

      // Smooth
      const smoothing = 0.7;
      smoothedRef.current[binIndex] = smoothedRef.current[binIndex] * smoothing + mag * (1 - smoothing);
      const smoothedMag = smoothedRef.current[binIndex];

      const db = linearToDb(smoothedMag);
      const y = dbToY(db, canvasHeight, topPad, bottomPad);
      const barHeight = bottomY - y;

      if (barHeight > 0) {
        const x = leftPad + i * barSpacing;
        ctx.fillRect(x, y, barWidth, barHeight);
      }

      // Peak hold
      const peak = peaksRef.current[binIndex];
      if (db > peak.value || now - peak.timestamp > PEAK_HOLD_MS) {
        if (db > peak.value) {
          peak.value = db;
          peak.timestamp = now;
        } else {
          peak.value -= PEAK_DECAY_RATE;
          if (peak.value < MIN_DB) peak.value = MIN_DB;
        }
      }

      // Draw peak indicator
      if (peak.value > MIN_DB + 3) {
        const peakY = dbToY(peak.value, canvasHeight, topPad, bottomPad);
        const x = leftPad + i * barSpacing;
        const age = now - peak.timestamp;
        const alpha = age < PEAK_HOLD_MS ? 0.9 : Math.max(0, 0.9 - (age - PEAK_HOLD_MS) * 0.002);
        if (alpha > 0.01) {
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.fillRect(x, peakY, barWidth, 1.5);
          ctx.fillStyle = gradient;
        }
      }
    }
  }, []);

  // ============================================
  // Line/area mode
  // ============================================

  const drawLine = useCallback((
    ctx: CanvasRenderingContext2D,
    magnitudes: number[],
    fftSize: number,
    sampleRate: number,
    gradient: CanvasGradient,
    canvasHeight: number,
    leftPad: number,
    topPad: number,
    bottomPad: number,
    plotWidth: number,
    plotHeight: number,
  ) => {
    const binCount = magnitudes.length;
    const bottomY = topPad + plotHeight;

    if (smoothedRef.current.length !== binCount) {
      smoothedRef.current = new Array(binCount).fill(0);
    }

    const numPoints = Math.min(512, plotWidth);
    const points: { x: number; y: number }[] = [];

    for (let i = 0; i < numPoints; i++) {
      const t = i / (numPoints - 1);
      const logMin = Math.log10(MIN_FREQ);
      const logMax = Math.log10(Math.min(MAX_FREQ, sampleRate / 2));
      const freq = Math.pow(10, logMin + t * (logMax - logMin));
      const binIndex = Math.round((freq * fftSize) / sampleRate);

      if (binIndex < 1 || binIndex >= binCount) continue;

      const mag = magnitudes[binIndex] || 0;
      smoothedRef.current[binIndex] = smoothedRef.current[binIndex] * 0.75 + mag * 0.25;

      const db = linearToDb(smoothedRef.current[binIndex]);
      const x = leftPad + t * plotWidth;
      const y = dbToY(db, canvasHeight, topPad, bottomPad);
      points.push({ x, y });
    }

    if (points.length < 2) return;

    // Area fill
    ctx.beginPath();
    ctx.moveTo(points[0].x, bottomY);
    for (const p of points) {
      ctx.lineTo(p.x, p.y);
    }
    ctx.lineTo(points[points.length - 1].x, bottomY);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Line stroke
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, []);

  // ============================================
  // Octave band bars
  // ============================================

  const drawOctaveBars = useCallback((
    ctx: CanvasRenderingContext2D,
    levels: number[],
    bands: OctaveBand[],
    gradient: CanvasGradient,
    width: number,
    canvasHeight: number,
    leftPad: number,
    rightPad: number,
    topPad: number,
    bottomPad: number,
    now: number,
  ) => {
    const plotHeight = canvasHeight - topPad - bottomPad;
    const bottomY = topPad + plotHeight;
    const numBands = bands.length;

    if (peaksRef.current.length !== numBands) {
      peaksRef.current = new Array(numBands).fill(null).map(() => ({ value: MIN_DB, timestamp: 0 }));
    }
    if (smoothedRef.current.length !== numBands) {
      smoothedRef.current = new Array(numBands).fill(0);
    }

    ctx.fillStyle = gradient;

    for (let b = 0; b < numBands; b++) {
      const band = bands[b];
      const x1 = freqToX(band.lo, width, leftPad, rightPad);
      const x2 = freqToX(band.hi, width, leftPad, rightPad);
      const barW = Math.max(1, x2 - x1 - 1);
      const barX = x1 + 0.5;

      // Smooth
      smoothedRef.current[b] = smoothedRef.current[b] * 0.65 + levels[b] * 0.35;
      const db = linearToDb(smoothedRef.current[b]);
      const y = dbToY(db, canvasHeight, topPad, bottomPad);
      const barH = bottomY - y;

      if (barH > 0) {
        ctx.fillStyle = gradient;
        ctx.fillRect(barX, y, barW, barH);
      }

      // Peak hold
      const peak = peaksRef.current[b];
      if (db > peak.value || now - peak.timestamp > PEAK_HOLD_MS) {
        if (db > peak.value) {
          peak.value = db;
          peak.timestamp = now;
        } else {
          peak.value -= PEAK_DECAY_RATE;
          if (peak.value < MIN_DB) peak.value = MIN_DB;
        }
      }

      if (peak.value > MIN_DB + 3) {
        const peakY = dbToY(peak.value, canvasHeight, topPad, bottomPad);
        const age = now - peak.timestamp;
        const alpha = age < PEAK_HOLD_MS ? 0.9 : Math.max(0, 0.9 - (age - PEAK_HOLD_MS) * 0.002);
        if (alpha > 0.01) {
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.fillRect(barX, peakY, barW, 1.5);
        }
      }
    }
  }, []);

  // ============================================
  // Effects
  // ============================================

  useEffect(() => {
    const unsubscribe = juceBridge.onFFTData((data: FFTData) => {
      magnitudesRef.current = data.magnitudes;
      sampleRateRef.current = data.sampleRate;
      fftSizeRef.current = data.fftSize;
    });

    const animate = () => {
      draw();
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      unsubscribe();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [draw]);

  // Reset smoothing state when mode changes
  useEffect(() => {
    smoothedRef.current = [];
    peaksRef.current = [];
  }, [mode, octaveMode]);

  // ============================================
  // Render
  // ============================================

  return (
    <div className="flex flex-col gap-1.5">
      {/* Toggle buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMode('bars')}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xxs font-medium transition-all ${
            mode === 'bars'
              ? 'bg-plugin-accent/12 text-plugin-accent border border-plugin-accent/30'
              : 'text-plugin-dim border border-plugin-border hover:border-plugin-muted'
          }`}
        >
          Bars
        </button>
        <button
          onClick={() => setMode('line')}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xxs font-medium transition-all ${
            mode === 'line'
              ? 'bg-plugin-accent/12 text-plugin-accent border border-plugin-accent/30'
              : 'text-plugin-dim border border-plugin-border hover:border-plugin-muted'
          }`}
        >
          Line
        </button>
        <button
          onClick={() => setMode('octave')}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xxs font-medium transition-all ${
            mode === 'octave'
              ? 'bg-plugin-accent/12 text-plugin-accent border border-plugin-accent/30'
              : 'text-plugin-dim border border-plugin-border hover:border-plugin-muted'
          }`}
        >
          Octave
        </button>

        {mode === 'octave' && (
          <>
            <div className="w-px h-3 bg-plugin-border" />
            <button
              onClick={() => setOctaveMode(octaveMode === 'third' ? 'full' : 'third')}
              className="px-2 py-0.5 rounded text-xxs font-mono text-plugin-dim border border-plugin-border hover:border-plugin-muted transition-all"
            >
              {octaveMode === 'third' ? '1/3 Oct' : '1/1 Oct'}
            </button>
          </>
        )}
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full rounded border border-plugin-border"
        style={{ height: `${height}px`, background: '#050505' }}
      />
    </div>
  );
}
