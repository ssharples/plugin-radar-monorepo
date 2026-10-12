import { useState, useRef, useCallback, useEffect } from 'react';

interface KnobProps {
  value: number;           // Value in dB
  min?: number;            // Min dB (default -60)
  max?: number;            // Max dB (default +24)
  defaultValue?: number;   // Default value for double-click reset
  size?: number;           // Size in pixels (default 48)
  label?: string;          // Label below knob
  step?: number;           // Value rounding (default 0.1)
  formatValue?: (value: number) => string; // Custom value text
  /** 'stack' puts value and label under the knob; 'side' puts them to the right */
  layout?: 'stack' | 'side';
  /** Arc colour (CSS colour). Defaults to the accent. */
  color?: string;
  onChange: (value: number) => void;
  /** Called when a mouse drag starts and ends, so a drag can be one automation move */
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** Turns typed text into a value; return null to reject. Defaults to parseKnobText. */
  parseValue?: (text: string) => number | null;
}

/** Reads a typed value: plain numbers, "1k" for thousands, or "50%" for a share of the range. */
export function parseKnobText(text: string, min: number, max: number): number | null {
  const t = text.trim().toLowerCase().replace(/db|hz|ms/g, '').trim();
  if (t === '-inf' || t === 'inf') return min;
  const pct = /^(-?\d*\.?\d+)\s*%$/.exec(t);
  if (pct) return min + (parseFloat(pct[1]) / 100) * (max - min);
  const kilo = /^(-?\d*\.?\d+)\s*k$/.exec(t);
  if (kilo) return parseFloat(kilo[1]) * 1000;
  const n = parseFloat(t.replace(/^\+/, ''));
  return Number.isFinite(n) ? n : null;
}

export function Knob({
  value,
  min = -60,
  max = 24,
  defaultValue = 0,
  size = 48,
  label,
  step = 0.1,
  formatValue: customFormat,
  layout = 'stack',
  color = '#8b7cff',
  onChange,
  onDragStart,
  onDragEnd,
  parseValue,
}: KnobProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
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
    onDragStart?.();
  }, [value, onDragStart]);

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
    onChange(Math.round(newValue / step) * step);
  }, [value, min, max, onChange, step]);

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
      onChange(Math.round(clampedValue / step) * step);
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
  }, [isDragging, min, max, onChange, step, onDragEnd]);

  const commitDraft = () => {
    setEditing(false);
    const parsed = parseValue ? parseValue(draft) : parseKnobText(draft, min, max);
    if (parsed == null || !Number.isFinite(parsed)) return;
    onChange(Math.round(Math.max(min, Math.min(max, parsed)) / step) * step);
  };

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

  // Knob cap geometry
  const capR = radius * 0.78;
  const pointerAngle = (angle - 90) * (Math.PI / 180);
  const pX1 = center + Math.cos(pointerAngle) * capR * 0.35;
  const pY1 = center + Math.sin(pointerAngle) * capR * 0.35;
  const pX2 = center + Math.cos(pointerAngle) * capR * 0.92;
  const pY2 = center + Math.sin(pointerAngle) * capR * 0.92;
  const gradId = `knob-cap-${size}`;

  const valueText = customFormat ? customFormat(safeValue) : formatValue(safeValue);

  const dial = (
    <div
      ref={knobRef}
      className={`relative select-none flex-shrink-0 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{ width: size, height: size }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(safeValue * 10) / 10}
      title={label ? `${label}: ${valueText}. Drag or scroll (Shift for fine); double-click to reset; click the value to type one` : undefined}
    >
      <svg width={size} height={size} className="absolute inset-0 pointer-events-none">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a3f48" />
            <stop offset="100%" stopColor="#1b1e23" />
          </linearGradient>
        </defs>
        {/* Track arc */}
        <path
          d={createArc(-135, 135, radius * 1.12)}
          fill="none"
          stroke="#2a2e35"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        {/* Value arc */}
        {safeValue > min && (
          <path
            d={createArc(-135, angle, radius * 1.12)}
            fill="none"
            stroke={color}
            strokeOpacity={isDragging ? 1 : 0.85}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        )}
        {/* 0 dB tick */}
        <line
          x1={tickX1 + (tickX1 - center) * 0.12}
          y1={tickY1 + (tickY1 - center) * 0.12}
          x2={tickX2 + (tickX2 - center) * 0.12}
          y2={tickY2 + (tickY2 - center) * 0.12}
          stroke={isAtZero ? color : '#5d636e'}
          strokeWidth={1}
          strokeLinecap="round"
        />
        {/* Cap */}
        <circle cx={center} cy={center} r={capR} fill={`url(#${gradId})`} stroke="#0c0d10" strokeWidth={1} />
        <circle cx={center} cy={center} r={capR - 1} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
        {/* Pointer */}
        <line x1={pX1} y1={pY1} x2={pX2} y2={pY2} stroke="#eceef2" strokeWidth={1.75} strokeLinecap="round" />
      </svg>
    </div>
  );

  const valueNode = (className: string) => editing ? (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commitDraft}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commitDraft();
        if (e.key === 'Escape') setEditing(false);
      }}
      onClick={(e) => e.stopPropagation()}
      className={`num text-[11px] w-12 bg-transparent text-center text-plugin-accent outline-none border-b border-plugin-accent ${className}`}
      aria-label={label ? `Type a value for ${label}` : 'Type a value'}
    />
  ) : (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setDraft(valueText); setEditing(true); }}
      title="Click to type a value"
      className={`num text-[11px] transition-colors hover:text-plugin-accent ${isDragging ? 'text-plugin-accent' : 'text-plugin-text'} ${className}`}
    >
      {valueText}
    </button>
  );

  if (layout === 'side') {
    return (
      <div className="flex items-center gap-1.5">
        {dial}
        <div className="flex flex-col leading-none gap-1">
          {label && (
            <span className="text-[10px] font-semibold text-plugin-dim uppercase tracking-wider">{label}</span>
          )}
          {valueNode('text-left')}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-0.5 relative">
      {dial}
      {valueNode('')}
      {label && (
        <div className="text-[10px] text-plugin-muted uppercase tracking-wider font-semibold">
          {label}
        </div>
      )}
    </div>
  );
}
