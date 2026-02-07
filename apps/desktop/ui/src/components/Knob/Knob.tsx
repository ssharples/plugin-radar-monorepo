import { useState, useRef, useCallback, useEffect } from 'react';

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
  const knobRef = useRef<SVGSVGElement>(null);

  // Convert dB value to rotation angle (0-270 degrees)
  const valueToAngle = (dB: number): number => {
    const normalized = (dB - min) / (max - min);
    return normalized * 270 - 135; // -135 to +135 degrees
  };

  const angle = valueToAngle(value);
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
      // Fine control when Shift is held (5x more precise)
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
    if (dB <= min) return '-inf';
    if (dB >= 0) return `+${dB.toFixed(1)}`;
    return dB.toFixed(1);
  };

  const center = size / 2;
  const radius = size * 0.38;
  const indicatorLength = radius * 0.65;

  // Calculate indicator end point
  const indicatorAngle = (angle - 90) * (Math.PI / 180);
  const indicatorX = center + Math.cos(indicatorAngle) * indicatorLength;
  const indicatorY = center + Math.sin(indicatorAngle) * indicatorLength;

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

  const isAtZero = Math.abs(value) < 0.05;

  return (
    <div className="flex flex-col items-center gap-0.5 relative">
      <svg
        ref={knobRef}
        width={size}
        height={size}
        className={`select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        {/* Outer shadow ring */}
        <circle
          cx={center}
          cy={center}
          r={radius + 1}
          fill="none"
          stroke="#0a0a0a"
          strokeWidth={2}
        />

        {/* Background circle with subtle gradient */}
        <defs>
          <radialGradient id={`knob-bg-${label}`} cx="40%" cy="35%">
            <stop offset="0%" stopColor="#2a2a2a" />
            <stop offset="100%" stopColor="#151515" />
          </radialGradient>
        </defs>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill={`url(#knob-bg-${label})`}
          stroke="#333"
          strokeWidth={1.5}
        />

        {/* Track arc (background) — thicker */}
        <path
          d={createArc(-135, 135, radius * 0.85)}
          fill="none"
          stroke="#222"
          strokeWidth={3}
          strokeLinecap="round"
        />

        {/* Value arc (filled portion) — thicker */}
        {value > min && (
          <path
            d={createArc(-135, angle, radius * 0.85)}
            fill="none"
            stroke={isDragging ? '#818cf8' : '#6366f1'}
            strokeWidth={3}
            strokeLinecap="round"
          />
        )}

        {/* 0 dB tick mark */}
        <line
          x1={tickX1}
          y1={tickY1}
          x2={tickX2}
          y2={tickY2}
          stroke={isAtZero ? '#6366f1' : '#444'}
          strokeWidth={1}
          strokeLinecap="round"
        />

        {/* Center dot */}
        <circle
          cx={center}
          cy={center}
          r={radius * 0.12}
          fill="#1a1a1a"
        />

        {/* Indicator line */}
        <line
          x1={center}
          y1={center}
          x2={indicatorX}
          y2={indicatorY}
          stroke="#6366f1"
          strokeWidth={2}
          strokeLinecap="round"
        />

        {/* Value inside knob circle when dragging */}
        {isDragging && (
          <text
            x={center}
            y={center + radius * 0.45}
            textAnchor="middle"
            fontSize={size * 0.18}
            fontFamily="monospace"
            fill="#818cf8"
          >
            {formatValue(value)}
          </text>
        )}
      </svg>

      {/* Value display */}
      <div className={`text-[10px] font-mono tabular-nums transition-colors ${
        isDragging ? 'text-plugin-accent' : 'text-plugin-text'
      }`}>
        {formatValue(value)}
      </div>

      {/* Label — bumped from 8px to 9px minimum */}
      {label && (
        <div className="text-[9px] text-plugin-muted uppercase tracking-widest font-medium">
          {label}
        </div>
      )}
    </div>
  );
}
