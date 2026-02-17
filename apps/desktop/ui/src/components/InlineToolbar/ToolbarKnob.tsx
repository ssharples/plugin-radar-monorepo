import { useState, useRef, useCallback, useEffect } from 'react';

interface ToolbarKnobProps {
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  label: string;
  formatValue?: (v: number) => string;
  onChange: (v: number) => void;
  onDragEnd?: () => void;
  size?: number;
}

const ARC_SWEEP = 270;
const START_ANGLE = 135; // degrees from 12 o'clock, clockwise

export function ToolbarKnob({
  value,
  min,
  max,
  defaultValue,
  label,
  formatValue,
  onChange,
  onDragEnd,
  size = 28,
}: ToolbarKnobProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ y: 0, value: 0 });
  const knobRef = useRef<HTMLDivElement>(null);

  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  // Rotation: -135deg (min) to +135deg (max), 0 is straight up
  const rotation = -135 + normalized * ARC_SWEEP;

  // Arc for the filled portion (SVG)
  const radius = (size - 4) / 2;
  const cx = size / 2;
  const cy = size / 2;

  const angleToPoint = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };

  const startAngle = START_ANGLE;
  const endAngle = START_ANGLE + normalized * ARC_SWEEP;
  const trackEnd = START_ANGLE + ARC_SWEEP;

  const arcPath = (from: number, to: number) => {
    if (Math.abs(to - from) < 0.1) return '';
    const start = angleToPoint(from);
    const end = angleToPoint(to);
    const largeArc = to - from > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  };

  const displayValue = formatValue
    ? formatValue(value)
    : value >= 0
      ? `+${value.toFixed(1)}`
      : value.toFixed(1);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      dragStartRef.current = { y: e.clientY, value };
    },
    [value],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange(defaultValue);
    },
    [defaultValue, onChange],
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const fine = e.shiftKey;
      const sensitivity = fine ? (max - min) / 2000 : (max - min) / 400;
      const delta = -e.deltaY * sensitivity;
      const newValue = Math.max(min, Math.min(max, value + delta));
      onChange(Math.round(newValue * 10) / 10);
    },
    [value, min, max, onChange],
  );

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
      const clamped = Math.max(min, Math.min(max, newValue));
      onChange(Math.round(clamped * 10) / 10);
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

  return (
    <div
      className="flex flex-col items-center gap-0"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        ref={knobRef}
        className={`relative ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ width: size, height: size }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background track */}
          <path
            d={arcPath(startAngle, trackEnd)}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          {/* Filled arc */}
          {normalized > 0.005 && (
            <path
              d={arcPath(startAngle, endAngle)}
              fill="none"
              stroke={isDragging ? '#deff0a' : '#89572a'}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          )}
          {/* Center dot */}
          <circle cx={cx} cy={cy} r={size * 0.22} fill="#1a1a1a" stroke="rgba(255,255,255,0.12)" strokeWidth={0.5} />
          {/* Indicator line */}
          <line
            x1={cx}
            y1={cy - size * 0.06}
            x2={cx}
            y2={cy - size * 0.2}
            stroke={isDragging ? '#deff0a' : '#ffffff'}
            strokeWidth={1.5}
            strokeLinecap="round"
            transform={`rotate(${rotation} ${cx} ${cy})`}
          />
        </svg>
      </div>
      {/* Label */}
      <span className="text-[7px] font-mono text-white tracking-wider leading-none mt-0.5">
        {label}
      </span>
      {/* Value */}
      <span
        className="text-[8px] font-mono tabular-nums leading-none"
        style={{ color: isDragging ? '#deff0a' : 'rgba(255,255,255,0.5)' }}
      >
        {displayValue}
      </span>
    </div>
  );
}
