import { useRef, useCallback, useEffect, type ReactNode } from 'react';
import { type PanelId, PANEL_CONFIGS } from '../../stores/panelStore';
import { usePanel } from './usePanel';

interface PanelProps {
  id: PanelId;
  children: ReactNode;
  /** Extra class names for the content area */
  className?: string;
}

export function Panel({ id, children, className }: PanelProps) {
  const config = PANEL_CONFIGS[id];
  const { setPanelSize, getPanelSize, closingPanel, finishClosing } = usePanel();
  const size = getPanelSize(id);
  const isResizing = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const startSize = useRef({ width: 0, height: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const isClosing = closingPanel === id;

  // When closing animation ends, remove panel from DOM
  useEffect(() => {
    if (!isClosing) return;
    const el = panelRef.current;
    if (!el) {
      finishClosing();
      return;
    }
    const onEnd = () => finishClosing();
    el.addEventListener('animationend', onEnd);
    return () => el.removeEventListener('animationend', onEnd);
  }, [isClosing, finishClosing]);

  const handleResizeStart = useCallback(
    (edge: 'left' | 'top') => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isResizing.current = true;
      startPos.current = { x: e.clientX, y: e.clientY };
      startSize.current = { width: size.width, height: size.height };

      const onMove = (ev: PointerEvent) => {
        if (!isResizing.current) return;
        const dx = ev.clientX - startPos.current.x;
        const dy = ev.clientY - startPos.current.y;

        if (edge === 'left') {
          const newWidth = Math.max(config.minWidth, startSize.current.width - dx);
          setPanelSize(id, { width: newWidth });
        } else {
          const newHeight = Math.max(config.minHeight, startSize.current.height - dy);
          setPanelSize(id, { height: newHeight });
        }
      };

      const onUp = () => {
        isResizing.current = false;
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [id, config.minWidth, config.minHeight, size, setPanelSize]
  );

  const isRight = config.position === 'right';

  // Determine animation class
  const animClass = isClosing
    ? (isRight ? 'animate-panel-slide-out-right' : 'animate-panel-slide-out-bottom')
    : (isRight ? 'animate-panel-slide-in-right' : 'animate-panel-slide-in-bottom');

  return (
    <div
      ref={panelRef}
      className={`flex flex-col bg-black/70 backdrop-blur-md border border-white/10 overflow-hidden relative ${animClass}`}
      style={{
        borderRadius: 8,
        ...(isRight
          ? { width: size.width, height: '100%' }
          : { width: '100%', height: size.height }),
      }}
    >
      {/* Resize handle -- left edge for right panels, top edge for bottom panels */}
      {isRight ? (
        <div
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-plugin-accent/30 transition-colors z-10"
          onPointerDown={handleResizeStart('left')}
        />
      ) : (
        <div
          className="absolute left-0 right-0 top-0 h-1 cursor-row-resize hover:bg-plugin-accent/30 transition-colors z-10"
          onPointerDown={handleResizeStart('top')}
        />
      )}

      {/* Content — fills entire panel */}
      <div className={`flex-1 min-h-0 overflow-hidden ${className ?? ''}`}>
        {children}
      </div>
    </div>
  );
}
