import { useCallback, useRef, useState } from 'react';

interface BranchGainBadgeProps {
  gainDb: number;
  onChange: (value: number) => void;
  onDragEnd?: () => void;
}

export function BranchGainBadge({ gainDb, onChange, onDragEnd }: BranchGainBadgeProps) {
  const dragStartY = useRef<number | null>(null);
  const dragStartValue = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const isNonZero = Math.abs(gainDb) > 0.05;
  const formatted = gainDb >= 0 ? `+${gainDb.toFixed(1)}` : gainDb.toFixed(1);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    dragStartY.current = event.clientY;
    dragStartValue.current = gainDb;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [gainDb]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null) return;
    event.stopPropagation();
    const deltaY = dragStartY.current - event.clientY;
    const stepSize = event.shiftKey ? 0.1 : 0.5;
    const steps = Math.round(deltaY / 4);
    const newValue = Math.max(-24, Math.min(24, dragStartValue.current + steps * stepSize));
    onChange(Math.round(newValue * 10) / 10);
  }, [onChange]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null) return;
    event.stopPropagation();
    dragStartY.current = null;
    setIsDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // noop
    }
    onDragEnd?.();
  }, [onDragEnd]);

  const handleDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    onChange(0);
    onDragEnd?.();
  }, [onChange, onDragEnd]);

  return (
    <div
      className="branch-gain-badge"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      title="Send gain (drag up/down, double-click to reset)"
      style={{
        fontFamily: 'var(--font-system)',
        fontSize: 'var(--text-body)',
        fontWeight: 700,
        letterSpacing: 'var(--tracking-wide)',
        color: isNonZero ? 'var(--color-accent-cyan)' : 'var(--color-text-tertiary)',
        border: `1px solid ${isDragging ? 'rgba(222,255,10,0.4)' : 'rgba(255,255,255,0.08)'}`,
        background: isDragging ? 'rgba(222,255,10,0.08)' : 'rgba(255,255,255,0.03)',
        borderRadius: 6,
        padding: '2px 6px',
        cursor: 'ns-resize',
        userSelect: 'none',
      }}
    >
      {formatted} dB
    </div>
  );
}
