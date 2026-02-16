import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { InlinePluginSearch } from './InlinePluginSearch';

interface DropZoneProps {
  /** Unique droppable ID encoding: `{parentId}:{insertIndex}` */
  droppableId: string;
  /** Whether the parent context is parallel (orange) or serial (blue) */
  isParallelContext: boolean;
  /** Whether a drag is currently active anywhere */
  isDragActive: boolean;
  /** Whether this drop zone is disabled (self-drop prevention) */
  disabled?: boolean;
  /** Parent node ID for inline search */
  parentId?: number;
  /** Insert index for inline search */
  insertIndex?: number;
  /** Slot number to display (1-based) */
  slotNumber?: number;
}

/**
 * Enhanced drop zone component with pulse animation and ghost preview.
 * Shows subtle line when dragging, pulses on valid targets, snaps on hover.
 * On 500ms hover dwell, plugins push apart smoothly to reveal a + icon.
 */
export function DropZone({
  droppableId,
  isParallelContext,
  isDragActive,
  disabled = false,
  parentId,
  insertIndex,
  slotNumber,
}: DropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: droppableId,
    disabled,
  });

  const [expanded, setExpanded] = useState(false);
  const [showInlineSearch, setShowInlineSearch] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoneRef = useRef<HTMLDivElement | null>(null);

  // Combined ref for both dnd-kit and our local ref
  const setRefs = useCallback((el: HTMLElement | null) => {
    setNodeRef(el);
    zoneRef.current = el as HTMLDivElement | null;
  }, [setNodeRef]);

  const handleMouseEnter = useCallback(() => {
    if (showInlineSearch) return;
    // Start 500ms dwell timer
    hoverTimerRef.current = setTimeout(() => {
      setExpanded(true);
    }, 500);
  }, [showInlineSearch]);

  const handleMouseLeave = useCallback((e: React.MouseEvent) => {
    // Don't collapse if the mouse is moving to another element
    // inside this DropZone (e.g. the + button or guide line)
    const related = e.relatedTarget as Node | null;
    if (related && zoneRef.current?.contains(related)) return;

    // Cancel pending timer
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    // Collapse if not showing inline search
    if (!showInlineSearch) {
      setExpanded(false);
    }
  }, [showInlineSearch]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  // Use neon yellow (#deff0a) for all contexts
  const lineColor = '#deff0a';

  // When not dragging, show dwell-to-expand + icon
  if (!isDragActive) {
    return (
      <div
        ref={setRefs}
        className="relative"
        style={{ zIndex: expanded || showInlineSearch ? 10 : 1 }}
        onMouseLeave={handleMouseLeave}
      >
        {/* Invisible hover hitbox — extends ±10px above/below the seam
            so the user can trigger it even when plugins are flush.
            The hitbox grows when expanded so the + button stays reachable.
            Disabled (pointerEvents:none) when inline search is open so the search UI receives clicks. */}
        <div
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '-10px',
            bottom: '-10px',
            minHeight: expanded ? '52px' : '20px',
            zIndex: 2,
            cursor: expanded ? 'default' : 'pointer',
            pointerEvents: showInlineSearch ? 'none' : 'auto',
          }}
        />

        {/* Expanding gap — pushes plugins apart on 500ms dwell */}
        <div
          style={{
            height: showInlineSearch ? 'auto' : expanded ? '32px' : '0px',
            transition: expanded
              ? 'height 350ms cubic-bezier(0.34, 1.56, 0.64, 1)'
              : 'height 250ms cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: showInlineSearch ? 'visible' : 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          {/* Subtle guide line */}
          {expanded && !showInlineSearch && (
            <div
              style={{
                position: 'absolute',
                left: '16px',
                right: '16px',
                height: '1px',
                background: 'rgba(222, 255, 10, 0.2)',
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Plus button — scales in when expanded */}
          {!showInlineSearch && parentId !== undefined && insertIndex !== undefined && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowInlineSearch(true);
              }}
              className="relative z-10 flex items-center justify-center w-5 h-5 rounded-full"
              style={{
                background: 'rgba(222, 255, 10, 0.15)',
                border: '1px solid rgba(222, 255, 10, 0.4)',
                color: 'var(--color-accent-cyan)',
                opacity: expanded ? 1 : 0,
                transform: expanded ? 'scale(1)' : 'scale(0)',
                transition: 'opacity 200ms ease-out 80ms, transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1) 80ms',
                pointerEvents: expanded ? 'auto' : 'none',
                cursor: 'pointer',
              }}
              title="Insert plugin here"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Inline Plugin Search */}
        {showInlineSearch && parentId !== undefined && insertIndex !== undefined && (
          <div className="px-4 py-2">
            <InlinePluginSearch
              parentId={parentId}
              insertIndex={insertIndex}
              onPluginAdded={() => {
                setShowInlineSearch(false);
                setExpanded(false);
              }}
              onClose={() => {
                setShowInlineSearch(false);
                setExpanded(false);
              }}
              onOpenFullBrowser={() => window.dispatchEvent(new Event('openPluginBrowser'))}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className="relative"
      style={{
        paddingTop: isOver ? '24px' : '3px',
        paddingBottom: isOver ? '24px' : '3px',
        transition: isOver
          ? 'padding 300ms cubic-bezier(0.34, 1.56, 0.64, 1)'
          : 'padding 200ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Drop indicator line with pulse animation, magnetic snap, and directional caret */}
      <div className="relative mx-3">
        <div
          className={`rounded-full ${isOver ? 'animate-magnetic-snap' : disabled ? '' : 'animate-drop-zone-pulse'}`}
          style={{
            height: isOver ? '6px' : '2px',
            background: isOver
              ? lineColor
              : disabled
                ? 'var(--color-border-subtle)'
                : lineColor,
            opacity: isOver ? 0.9 : disabled ? 0.3 : 0.4,
            boxShadow: isOver ? `0 0 12px ${lineColor}` : 'none',
            transition: 'all var(--duration-fast) var(--ease-snap)',
          }}
        />
        {/* Directional caret — indicates "insert here, push down" */}
        {isOver && !disabled && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: '-2px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: 0,
              height: 0,
              borderLeft: `6px solid ${lineColor}`,
              borderTop: '5px solid transparent',
              borderBottom: '5px solid transparent',
              filter: `drop-shadow(0 0 4px ${lineColor})`,
              opacity: 0.9,
            }}
          />
        )}
      </div>
      {/* Ghost preview bar when hovering with slot number */}
      {isOver && !disabled && (
        <div
          className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-12 mx-2 rounded-lg animate-ghost-preview pointer-events-none flex items-center justify-center"
          style={{
            border: `2px dashed rgba(222, 255, 10, 0.35)`,
            background: 'rgba(222, 255, 10, 0.04)',
          }}
        >
          {slotNumber !== undefined && (
            <div
              className="font-mono font-bold"
              style={{
                fontSize: '20px',
                color: 'rgba(222, 255, 10, 0.6)',
                textShadow: '0 0 8px rgba(222, 255, 10, 0.4)',
              }}
            >
              {slotNumber}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Drop zone that appears within a group container header for "drop into group" functionality.
 */
export function GroupDropZone({
  droppableId,
  isParallelContext,
  isDragActive,
  isEmpty = false,
  onBrowsePlugins,
}: {
  droppableId: string;
  isParallelContext: boolean;
  isDragActive: boolean;
  isEmpty?: boolean;
  onBrowsePlugins?: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: droppableId,
  });

  // Use neon yellow for all contexts
  const accentColor = '#deff0a';
  const accentBg = 'rgba(222, 255, 10, 0.08)';

  // Empty group placeholder
  if (isEmpty) {
    return (
      <div
        ref={setNodeRef}
        onDoubleClick={onBrowsePlugins}
        className="mx-2 rounded-lg flex items-center justify-center gap-2 cursor-pointer"
        style={{
          border: isOver && isDragActive
            ? `2px dashed ${accentColor}`
            : '2px dashed var(--color-border-default)',
          background: isOver && isDragActive ? accentBg : 'transparent',
          padding: isOver && isDragActive ? '16px 0' : '12px 0',
          transition: 'all var(--duration-fast) var(--ease-snap)',
        }}
      >
        <span
          className="text-xs"
          style={{
            fontFamily: 'var(--font-mono)',
            letterSpacing: 'var(--tracking-wide)',
            textTransform: 'uppercase' as const,
            color: isOver ? accentColor : 'var(--color-text-tertiary)',
          }}
        >
          {isOver && isDragActive
            ? 'Drop plugin here'
            : 'Drop a plugin here or click to browse'
          }
        </span>
      </div>
    );
  }

  // Don't show visual indicator when not dragging
  if (!isDragActive) return null;

  // Overlay highlight on the entire group when dragging over it
  if (!isOver) return null;

  return (
    <div
      ref={setNodeRef}
      className="absolute inset-0 rounded-lg pointer-events-none z-10"
      style={{
        border: `2px solid ${accentColor}`,
        background: accentBg,
        transition: 'all var(--duration-fast) var(--ease-snap)',
      }}
    />
  );
}
