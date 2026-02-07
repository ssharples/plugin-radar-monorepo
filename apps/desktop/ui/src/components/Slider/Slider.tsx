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
}

const colorMap = {
  accent: { fill: 'bg-plugin-accent', thumb: 'border-plugin-accent', hover: 'bg-plugin-accent-bright' },
  blue: { fill: 'bg-plugin-serial', thumb: 'border-plugin-serial', hover: 'bg-blue-400' },
  orange: { fill: 'bg-plugin-parallel', thumb: 'border-plugin-parallel', hover: 'bg-orange-400' },
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
}: SliderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const colors = colorMap[color];

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
    updateFromPointer(e.clientX);
  }, [updateFromPointer]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateFromPointer(e.clientX);
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
  }, [isDragging, updateFromPointer]);

  const showTooltip = isDragging || isHovering;

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
        className="relative w-full h-[3px] bg-plugin-border rounded-full cursor-pointer"
        onMouseDown={handleMouseDown}
      >
        {/* Filled portion */}
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${colors.fill} transition-colors`}
          style={{ width: `${fraction * 100}%` }}
        />

        {/* Thumb */}
        <div
          className={`
            absolute top-1/2 -translate-y-1/2 -translate-x-1/2
            w-[10px] h-[10px] rounded-full
            bg-plugin-surface-alt border-2 ${colors.thumb}
            shadow-sm transition-transform
            ${isDragging ? 'scale-125' : 'group-hover:scale-110'}
          `}
          style={{ left: `${fraction * 100}%` }}
        />
      </div>

      {/* Value tooltip */}
      {showTooltip && (
        <div
          className="absolute -top-6 -translate-x-1/2 px-1.5 py-0.5 rounded bg-plugin-bg border border-plugin-border text-[9px] font-mono text-plugin-text whitespace-nowrap pointer-events-none z-50"
          style={{ left: `${fraction * 100}%` }}
        >
          {typeof value === 'number' ? (step >= 1 ? value.toFixed(0) : value.toFixed(step < 0.1 ? 2 : 1)) : value}
        </div>
      )}
    </div>
  );
}
