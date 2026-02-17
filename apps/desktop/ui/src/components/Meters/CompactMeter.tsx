import { memo, useMemo } from 'react';
import { linearToDb, dbToNorm, METER_GRADIENT, RMS_GRADIENT, ZERO_DB_NORM } from './MeterUtils';

interface CompactMeterProps {
  /** Linear peak amplitude 0..1+ (left channel). */
  peakL: number;
  /** Linear peak amplitude 0..1+ (right channel). */
  peakR: number;
  /** Linear peak hold (left). */
  peakHoldL?: number;
  /** Linear peak hold (right). */
  peakHoldR?: number;
  /** Linear RMS (left). */
  rmsL?: number;
  /** Linear RMS (right). */
  rmsR?: number;
  /** Orientation. Default: vertical. */
  orientation?: 'vertical' | 'horizontal';
  /** Height in px (vertical) or width in px (horizontal). Default: 48. */
  length?: number;
  /** Width per channel in px. Default: 5. */
  channelWidth?: number;
}

const BarV = memo(function BarV({
  peak,
  rms,
  peakHold,
  width,
  height,
}: {
  peak: number;
  rms?: number;
  peakHold?: number;
  width: number;
  height: number;
}) {
  const peakNorm = dbToNorm(linearToDb(peak));
  const rmsNorm = rms !== undefined ? dbToNorm(linearToDb(rms)) : undefined;
  const holdNorm = peakHold !== undefined ? dbToNorm(linearToDb(peakHold)) : undefined;
  const isClipping = peakNorm > ZERO_DB_NORM;

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width,
        height,
        background: '#0a0a0a',
        borderRadius: 1,
        boxShadow: 'inset 0 0 4px rgba(0,0,0,0.6)',
      }}
    >
      {/* Segment lines */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,0.5) 2px, rgba(0,0,0,0.5) 3px)',
        }}
      />

      {/* RMS fill */}
      {rmsNorm !== undefined && rmsNorm > 0 && (
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: `${rmsNorm * 100}%`,
            background: RMS_GRADIENT,
            transition: 'height 80ms linear',
          }}
        />
      )}

      {/* Peak fill */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: `${peakNorm * 100}%`,
          background: METER_GRADIENT,
          transition: 'height 30ms linear',
        }}
      />

      {/* Peak hold line */}
      {holdNorm !== undefined && holdNorm > 0 && (
        <div
          className="absolute left-0 right-0"
          style={{
            bottom: `${holdNorm * 100}%`,
            height: 1,
            backgroundColor:
              holdNorm > ZERO_DB_NORM
                ? '#ff0033'
                : 'rgba(222, 255, 10, 0.8)',
            transition: 'bottom 100ms ease',
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
          }}
        />
      )}
    </div>
  );
});

const BarH = memo(function BarH({
  peak,
  rms,
  peakHold,
  width,
  height,
}: {
  peak: number;
  rms?: number;
  peakHold?: number;
  width: number;
  height: number;
}) {
  const peakNorm = dbToNorm(linearToDb(peak));
  const rmsNorm = rms !== undefined ? dbToNorm(linearToDb(rms)) : undefined;
  const holdNorm = peakHold !== undefined ? dbToNorm(linearToDb(peakHold)) : undefined;
  const isClipping = peakNorm > ZERO_DB_NORM;

  const hGrad = useMemo(() => METER_GRADIENT.replace(/to top/g, 'to right'), []);
  const hRmsGrad = useMemo(() => RMS_GRADIENT.replace(/to top/g, 'to right'), []);

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width,
        height,
        background: '#0a0a0a',
        borderRadius: 1,
        boxShadow: 'inset 0 0 4px rgba(0,0,0,0.6)',
      }}
    >
      {/* RMS fill */}
      {rmsNorm !== undefined && rmsNorm > 0 && (
        <div
          className="absolute top-0 bottom-0 left-0"
          style={{
            width: `${rmsNorm * 100}%`,
            background: hRmsGrad,
            transition: 'width 80ms linear',
          }}
        />
      )}

      {/* Peak fill */}
      <div
        className="absolute top-0 bottom-0 left-0"
        style={{
          width: `${peakNorm * 100}%`,
          background: hGrad,
          transition: 'width 30ms linear',
        }}
      />

      {/* Peak hold line */}
      {holdNorm !== undefined && holdNorm > 0 && (
        <div
          className="absolute top-0 bottom-0"
          style={{
            left: `${holdNorm * 100}%`,
            width: 1,
            backgroundColor:
              holdNorm > ZERO_DB_NORM
                ? '#ff0033'
                : 'rgba(222, 255, 10, 0.8)',
            transition: 'left 100ms ease',
          }}
        />
      )}

      {/* Clip indicator */}
      {isClipping && (
        <div
          className="absolute top-0 bottom-0 right-0 animate-pulse-soft"
          style={{
            width: 2,
            background: '#ff0033',
          }}
        />
      )}
    </div>
  );
});

export const CompactMeter = memo(function CompactMeter({
  peakL,
  peakR,
  peakHoldL,
  peakHoldR,
  rmsL,
  rmsR,
  orientation = 'vertical',
  length = 48,
  channelWidth = 5,
}: CompactMeterProps) {
  if (orientation === 'horizontal') {
    return (
      <div className="flex flex-col gap-px">
        <BarH peak={peakL} rms={rmsL} peakHold={peakHoldL} width={length} height={channelWidth} />
        <BarH peak={peakR} rms={rmsR} peakHold={peakHoldR} width={length} height={channelWidth} />
      </div>
    );
  }

  return (
    <div className="flex gap-px">
      <BarV peak={peakL} rms={rmsL} peakHold={peakHoldL} width={channelWidth} height={length} />
      <BarV peak={peakR} rms={rmsR} peakHold={peakHoldR} width={channelWidth} height={length} />
    </div>
  );
});
