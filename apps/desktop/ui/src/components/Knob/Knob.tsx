import { useState, useRef, useCallback, useEffect } from 'react';
import knobSvg from '../../assets/volume-knob.svg';

interface KnobProps {
  value: number;           // Value in dB
  min?: number;            // Min dB (default -60)
  max?: number;            // Max dB (default +24)
  defaultValue?: number;   // Default value for double-click reset
  size?: number;           // Size in pixels (default 48)
  label?: string;          // Label below knob
  onChange: (value: number) => void;
}

export function Knob({
  value,
  min = -60,
  max = 24,
  defaultValue = 0,
  size = 48,
  label,
  onChange,
}: KnobProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ y: 0, value: 0 });
  const shiftHeldRef = useRef(false);
  const knobRef = useRef<HTMLDivElement>(null);

  // Convert dB value to rotation angle (0-270 degrees)
  const valueToAngle = (dB: number): number => {
    const normalized = (dB - min) / (max - min);
    return normalized * 270 - 135; // -135 to +135 degrees
  };

  const safeValue = value ?? defaultValue;
  const angle = valueToAngle(safeValue);
  const zeroAngle = valueToAngle(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { y: e.clientY, value };
    shiftHeldRef.current = e.shiftKey;
  }, [value]);

  const handleDoubleClick = useCallback(() => {
    onChange(defaultValue);
  }, [defaultValue, onChange]);

  // Scroll-to-change
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
      shiftHeldRef.current = e.shiftKey;
      const deltaY = dragStartRef.current.y - e.clientY;
      const sensitivity = e.shiftKey ? (max - min) / 1000 : (max - min) / 200;
      const newValue = dragStartRef.current.value + deltaY * sensitivity;
      const clampedValue = Math.max(min, Math.min(max, newValue));
      onChange(Math.round(clampedValue * 10) / 10);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, min, max, onChange]);

  // Format display value
  const formatValue = (dB: number): string => {
    if (dB == null) return '0.0';
    if (dB <= min) return '-inf';
    if (dB >= 0) return `+${dB.toFixed(1)}`;
    return dB.toFixed(1);
  };

  const center = size / 2;
  const radius = size * 0.38;

  // Arc path for track
  const createArc = (startAngle: number, endAngle: number, r: number): string => {
    const start = (startAngle - 90) * (Math.PI / 180);
    const end = (endAngle - 90) * (Math.PI / 180);
    const startX = center + Math.cos(start) * r;
    const startY = center + Math.sin(start) * r;
    const endX = center + Math.cos(end) * r;
    const endY = center + Math.sin(end) * r;
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`;
  };

  // 0 dB tick mark position
  const zeroTickAngle = (zeroAngle - 90) * (Math.PI / 180);
  const tickInner = radius * 0.95;
  const tickOuter = radius * 1.15;
  const tickX1 = center + Math.cos(zeroTickAngle) * tickInner;
  const tickY1 = center + Math.sin(zeroTickAngle) * tickInner;
  const tickX2 = center + Math.cos(zeroTickAngle) * tickOuter;
  const tickY2 = center + Math.sin(zeroTickAngle) * tickOuter;

  const isAtZero = Math.abs(safeValue) < 0.05;

  // Knob image size — slightly smaller than the container to leave room for the arc track
  const knobImgSize = size * 0.82;

  return (
    <div className="flex flex-col items-center gap-0.5 relative">
      <div
        ref={knobRef}
        className={`relative select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ width: size, height: size }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        {/* Track arc + tick behind the knob */}
        <svg
          width={size}
          height={size}
          className="absolute inset-0 pointer-events-none"
        >
          {/* Track arc (background) */}
          <path
            d={createArc(-135, 135, radius * 0.95)}
            fill="none"
            stroke="#222"
            strokeWidth={2.5}
            strokeLinecap="round"
          />

          {/* Value arc (filled portion) */}
          {safeValue > min && (
            <path
              d={createArc(-135, angle, radius * 0.95)}
              fill="none"
              stroke={isDragging ? '#a06830' : '#89572a'}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          )}

          {/* 0 dB tick mark */}
          <line
            x1={tickX1}
            y1={tickY1}
            x2={tickX2}
            y2={tickY2}
            stroke={isAtZero ? '#89572a' : '#444'}
            strokeWidth={1}
            strokeLinecap="round"
          />
        </svg>

        {/* Rotatable knob image */}
        <img
          src={knobSvg}
          alt=""
          draggable={false}
          className="absolute pointer-events-none"
          style={{
            width: knobImgSize,
            height: knobImgSize,
            top: (size - knobImgSize) / 2,
            left: (size - knobImgSize) / 2,
            transform: `rotate(${angle}deg)`,
            transition: isDragging ? 'none' : 'transform 50ms ease-out',
          }}
        />
      </div>

      {/* Value display */}
      <div className={`text-[10px] font-mono tabular-nums transition-colors ${
        isDragging ? 'text-plugin-accent' : 'text-plugin-text'
      }`}>
        {formatValue(safeValue)}
      </div>

      {/* Label */}
      {label && (
        <div className="text-[9px] font-mono text-plugin-muted uppercase tracking-widest font-medium">
          {label}
        </div>
      )}
    </div>
  );
}
