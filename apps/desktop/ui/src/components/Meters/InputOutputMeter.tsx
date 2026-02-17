import { memo } from 'react';
import { CompactMeter } from './CompactMeter';
import { MONO_FONT } from './MeterUtils';

interface InputOutputMeterProps {
  /** Input peak L (linear 0..1+). */
  inputPeakL: number;
  /** Input peak R (linear 0..1+). */
  inputPeakR: number;
  /** Output peak L (linear 0..1+). */
  outputPeakL: number;
  /** Output peak R (linear 0..1+). */
  outputPeakR: number;
  /** Input peak hold L (linear). */
  inputPeakHoldL?: number;
  /** Input peak hold R (linear). */
  inputPeakHoldR?: number;
  /** Output peak hold L (linear). */
  outputPeakHoldL?: number;
  /** Output peak hold R (linear). */
  outputPeakHoldR?: number;
  /** Input RMS L (linear). */
  inputRmsL?: number;
  /** Input RMS R (linear). */
  inputRmsR?: number;
  /** Output RMS L (linear). */
  outputRmsL?: number;
  /** Output RMS R (linear). */
  outputRmsR?: number;
  /** Meter height in px. Default: 48. */
  height?: number;
  /** Orientation. Default: vertical. */
  orientation?: 'vertical' | 'horizontal';
}

export const InputOutputMeter = memo(function InputOutputMeter({
  inputPeakL,
  inputPeakR,
  outputPeakL,
  outputPeakR,
  inputPeakHoldL,
  inputPeakHoldR,
  outputPeakHoldL,
  outputPeakHoldR,
  inputRmsL,
  inputRmsR,
  outputRmsL,
  outputRmsR,
  height = 48,
  orientation = 'vertical',
}: InputOutputMeterProps) {
  const labelStyle = {
    fontFamily: MONO_FONT,
    fontSize: 8,
    letterSpacing: '0.08em',
    color: 'var(--color-text-tertiary, #606060)',
  };

  if (orientation === 'horizontal') {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <span style={{ ...labelStyle, width: 14, textAlign: 'right' }}>IN</span>
          <CompactMeter
            peakL={inputPeakL}
            peakR={inputPeakR}
            peakHoldL={inputPeakHoldL}
            peakHoldR={inputPeakHoldR}
            rmsL={inputRmsL}
            rmsR={inputRmsR}
            orientation="horizontal"
            length={height}
            channelWidth={4}
          />
        </div>
        <div className="flex items-center gap-1">
          <span style={{ ...labelStyle, width: 14, textAlign: 'right' }}>OUT</span>
          <CompactMeter
            peakL={outputPeakL}
            peakR={outputPeakR}
            peakHoldL={outputPeakHoldL}
            peakHoldR={outputPeakHoldR}
            rmsL={outputRmsL}
            rmsR={outputRmsR}
            orientation="horizontal"
            length={height}
            channelWidth={4}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-1">
      {/* Input meter */}
      <div className="flex flex-col items-center gap-0.5">
        <CompactMeter
          peakL={inputPeakL}
          peakR={inputPeakR}
          peakHoldL={inputPeakHoldL}
          peakHoldR={inputPeakHoldR}
          rmsL={inputRmsL}
          rmsR={inputRmsR}
          orientation="vertical"
          length={height}
          channelWidth={4}
        />
        <span style={labelStyle}>IN</span>
      </div>

      {/* Output meter */}
      <div className="flex flex-col items-center gap-0.5">
        <CompactMeter
          peakL={outputPeakL}
          peakR={outputPeakR}
          peakHoldL={outputPeakHoldL}
          peakHoldR={outputPeakHoldR}
          rmsL={outputRmsL}
          rmsR={outputRmsR}
          orientation="vertical"
          length={height}
          channelWidth={4}
        />
        <span style={labelStyle}>OUT</span>
      </div>
    </div>
  );
});
