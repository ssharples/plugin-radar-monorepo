import { useState, useRef, useCallback, useEffect } from 'react';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Color variant for the filled track */
  color?: 'accent' | 'blue' | 'orange';
  /** Width CSS class (e.g. 'w-16', 'w-20') */
  width?: string;
  onChange: (value: number) => void;
  title?: string;
  /** Called when user starts dragging (mouseDown) */
  onDragStart?: () => void;
  /** Called when user stops dragging (mouseUp) */
  onDragEnd?: () => void;
}

const colorMap: Record<string, { fill: string; glow: string }> = {
  accent: { fill: '#deff0a', glow: 'rgba(222, 255, 10, 0.5)' },
  blue:   { fill: '#deff0a', glow: 'rgba(222, 255, 10, 0.4)' },
  orange: { fill: '#ccff00', glow: 'rgba(204, 255, 0, 0.4)' },
};

export function Slider({
  value,
  min,
  max,
  step = 0.01,
  color = 'accent',
  width = 'w-16',
  onChange,
  title,
  onDragStart,
  onDragEnd,
}: SliderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const colors = colorMap[color] || colorMap.accent;

  const fraction = Math.max(0, Math.min(1, (value - min) / (max - min)));

  const updateFromPointer = useCallback((clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const raw = (clientX - rect.left) / rect.width;
    const clamped = Math.max(0, Math.min(1, raw));
    let newValue = min + clamped * (max - min);
    // Snap to step
    newValue = Math.round(newValue / step) * step;
    newValue = Math.max(min, Math.min(max, newValue));
    onChange(newValue);
  }, [min, max, step, onChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    onDragStart?.();
    updateFromPointer(e.clientX);
  }, [updateFromPointer, onDragStart]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateFromPointer(e.clientX);
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
  }, [isDragging, updateFromPointer, onDragEnd]);

  const showTooltip = isDragging || isHovering;
  const isActive = isDragging || isHovering;

  return (
    <div
      className={`relative ${width} h-4 flex items-center group`}
      title={title}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Track */}
      <div
        ref={trackRef}
        className="relative w-full h-[3px] rounded-full cursor-pointer"
        style={{
          background: 'var(--color-bg-input, #1a1a1a)',
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Filled portion */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${fraction * 100}%`,
            background: colors.fill,
            boxShadow: isActive ? `0 0 6px ${colors.glow}` : 'none',
            transition: 'box-shadow 150ms ease',
          }}
        />

        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
          style={{
            left: `${fraction * 100}%`,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: 'var(--color-bg-elevated, #151515)',
            border: `2px solid ${isActive ? colors.fill : 'var(--color-border-strong, #303030)'}`,
            boxShadow: isDragging ? `0 0 8px ${colors.glow}` : 'none',
            transform: `translate(-50%, -50%) scale(${isDragging ? 1.25 : isHovering ? 1.1 : 1})`,
            transition: 'transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease',
          }}
        />
      </div>

      {/* Value tooltip - monospace */}
      {showTooltip && (
        <div
          className="absolute -top-6 -translate-x-1/2 px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none z-50"
          style={{
            left: `${fraction * 100}%`,
            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
            fontSize: 'var(--text-xs, 10px)',
            color: colors.fill,
            background: 'var(--color-bg-primary, #0a0a0a)',
            border: `1px solid ${colors.fill}`,
            boxShadow: `0 0 6px ${colors.glow}`,
          }}
        >
          {typeof value === 'number' ? (step >= 1 ? value.toFixed(0) : value.toFixed(step < 0.1 ? 2 : 1)) : value}
        </div>
      )}
    </div>
  );
}
