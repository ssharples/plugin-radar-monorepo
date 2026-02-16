import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import knobImg from '../../assets/button-simple.png';

interface KnobProps {
  value: number;
  min?: number;
  max?: number;
  defaultValue?: number;
  size?: number;
  label?: string;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

const TICK_COUNT = 31;
const ARC_SWEEP = 270;
const START_ANGLE = -135;

export function Knob({
  value,
  min = -60,
  max = 24,
  defaultValue = 0,
  size = 48,
  label,
  formatValue: formatValueProp,
  onChange,
  onDragStart,
  onDragEnd,
}: KnobProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ y: 0, value: 0 });
  const knobRef = useRef<HTMLDivElement>(null);
  const safeValue = value ?? defaultValue;
  const normalized = Math.max(0, Math.min(1, (safeValue - min) / (max - min)));
  const litTicks = Math.round(normalized * (TICK_COUNT - 1));
  const knobRotation = START_ANGLE + normalized * ARC_SWEEP;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    onDragStart?.();
    dragStartRef.current = { y: e.clientY, value };
  }, [value, onDragStart]);

  const handleDoubleClick = useCallback(() => {
    onChange(defaultValue);
  }, [defaultValue, onChange]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const fine = e.shiftKey;
    const sensitivity = fine ? (max - min) / 2000 : (max - min) / 400;
    const delta = -e.deltaY * sensitivity;
    const newValue = Math.max(min, Math.min(max, value + delta));
    onChange(Math.round(newValue * 10) / 10);
  }, [value, min, max, onChange]);

  useEffect(() => {
    const el = knobRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = dragStartRef.current.y - e.clientY;
      const sensitivity = e.shiftKey ? (max - min) / 1000 : (max - min) / 200;
      const newValue = dragStartRef.current.value + deltaY * sensitivity;
      const clampedValue = Math.max(min, Math.min(max, newValue));
      onChange(Math.round(clampedValue * 10) / 10);
    };
    const handleMouseUp = () => {
      setIsDragging(false);
      onDragEnd?.();
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, min, max, onChange, onDragEnd]);

  const formatValue = (val: number): string => {
    if (formatValueProp) return formatValueProp(val);
    if (val == null) return '0.0';
    if (val <= min) return '-inf';
    if (val >= 0) return `+${val.toFixed(1)}`;
    return val.toFixed(1);
  };

  // SVG metering ticks sit in a slightly larger canvas around the knob
  const outerSize = size * 1.4;
  const center = outerSize / 2;
  const tickOuterR = outerSize * 0.47;
  const NEON = '#deff0a';

  const ticks = useMemo(() => {
    const result: Array<{
      x1: number; y1: number;
      x2: number; y2: number;
      isMajor: boolean;
    }> = [];
    for (let i = 0; i < TICK_COUNT; i++) {
      const angleDeg = START_ANGLE + (i / (TICK_COUNT - 1)) * ARC_SWEEP;
      const rad = (angleDeg - 90) * (Math.PI / 180);
      const isMajor = i % 5 === 0;
      const tickLen = isMajor ? outerSize * 0.07 : outerSize * 0.04;
      const innerR = tickOuterR - tickLen;
      result.push({
        x1: center + Math.cos(rad) * innerR,
        y1: center + Math.sin(rad) * innerR,
        x2: center + Math.cos(rad) * tickOuterR,
        y2: center + Math.sin(rad) * tickOuterR,
        isMajor,
      });
    }
    return result;
  }, [outerSize, center, tickOuterR]);


  return (
    <div className="flex flex-col items-center gap-0.5 relative">
      <div
        ref={knobRef}
        className={`relative select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ width: outerSize, height: outerSize }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        {/* SVG metering ticks */}
        <svg
          width={outerSize}
          height={outerSize}
          className="absolute inset-0"
          viewBox={`0 0 ${outerSize} ${outerSize}`}
          style={{ pointerEvents: 'none' }}
        >
          {ticks.map((tick, i) => {
            const isLit = i <= litTicks;
            return (
              <line
                key={i}
                x1={tick.x1} y1={tick.y1}
                x2={tick.x2} y2={tick.y2}
                stroke={isLit ? NEON : '#2a2a2a'}
                strokeWidth={tick.isMajor ? 1.5 : 0.8}
                strokeLinecap="butt"
                opacity={isLit ? 1 : 0.5}
              />
            );
          })}
        </svg>

        {/* Combined knob + glow PNG (square, no shadow) */}
        <img
          src={knobImg}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            width: size,
            height: size,
            left: (outerSize - size) / 2,
            top: (outerSize - size) / 2,
            transform: `rotate(${knobRotation}deg)`,
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Value */}
      <div
        className="tabular-nums leading-tight transition-colors"
        style={{
          fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
          fontSize: 'var(--text-xs, 10px)',
          color: isDragging ? NEON : 'var(--color-text-secondary, #a0a0a0)',
          textShadow: isDragging ? `0 0 8px rgba(222, 255, 10, 0.5)` : 'none',
        }}
      >
        {formatValue(safeValue)}
      </div>

      {label && (
        <div
          className="uppercase tracking-widest font-medium"
          style={{
            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
            fontSize: 'var(--text-xs, 10px)',
            letterSpacing: 'var(--tracking-wider, 0.1em)',
            color: 'var(--color-text-tertiary, #606060)',
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
