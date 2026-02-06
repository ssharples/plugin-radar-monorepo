import { useDroppable } from '@dnd-kit/core';
import { useState, useEffect, useRef } from 'react';
import { GitBranch } from 'lucide-react';

interface DropZoneProps {
  /** Unique droppable ID encoding: `{parentId}:{insertIndex}` */
  droppableId: string;
  /** Whether the parent context is parallel (orange) or serial (blue) */
  isParallelContext: boolean;
  /** Whether a drag is currently active anywhere */
  isDragActive: boolean;
  /** ID of the node above this drop zone (for group creation) */
  nodeAboveId?: number;
  /** ID of the node below this drop zone (for group creation) */
  nodeBelowId?: number;
  /** Whether shift key is held (for group creation hint) */
  shiftHeld?: boolean;
}

/**
 * Reusable drop zone component that renders between plugins/nodes.
 * Shows a thin line when dragging, expands on hover.
 * Supports "Create Parallel Group" hint when hovering with Shift.
 */
export function DropZone({
  droppableId,
  isParallelContext,
  isDragActive,
  nodeAboveId,
  nodeBelowId,
  shiftHeld = false,
}: DropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: droppableId,
  });

  const [showGroupHint, setShowGroupHint] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Track hover duration for group creation hint
  useEffect(() => {
    if (isOver && isDragActive) {
      hoverTimerRef.current = setTimeout(() => {
        if (nodeAboveId != null && nodeBelowId != null) {
          setShowGroupHint(true);
        }
      }, 500);
    } else {
      setShowGroupHint(false);
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    }

    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, [isOver, isDragActive, nodeAboveId, nodeBelowId]);

  // Don't render at all when no drag is happening
  if (!isDragActive) {
    return <div ref={setNodeRef} className="h-0.5" />;
  }

  const lineColor = isParallelContext ? 'bg-orange-500' : 'bg-blue-500';
  const glowColor = isParallelContext ? 'shadow-orange-500/30' : 'shadow-blue-500/30';
  const borderColor = isParallelContext ? 'border-orange-500/50' : 'border-blue-500/50';
  const bgColor = isParallelContext ? 'bg-orange-500/10' : 'bg-blue-500/10';

  const isShowingGroupHint = showGroupHint && shiftHeld && nodeAboveId != null && nodeBelowId != null;

  return (
    <div
      ref={setNodeRef}
      className={`
        relative transition-all duration-200 ease-out
        ${isOver ? 'py-1' : 'py-0.5'}
      `}
    >
      {/* Main drop indicator line */}
      <div
        className={`
          mx-3 rounded-full transition-all duration-200 ease-out
          ${isOver
            ? `h-1 ${lineColor} shadow-md ${glowColor}`
            : `h-0.5 ${lineColor}/40`
          }
        `}
      />

      {/* Group creation hint (appears after 500ms hover + shift) */}
      {isShowingGroupHint && (
        <div
          className={`
            absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50
            flex items-center gap-1.5 px-2.5 py-1 rounded-md
            border ${borderColor} ${bgColor}
            text-xs whitespace-nowrap
            animate-fade-in
            backdrop-blur-sm
          `}
        >
          <GitBranch className={`w-3 h-3 ${isParallelContext ? 'text-orange-400' : 'text-blue-400'}`} />
          <span className="text-plugin-text">
            Drop to create parallel group
          </span>
        </div>
      )}

      {/* Standard group hint tooltip (after 500ms without shift) */}
      {showGroupHint && !shiftHeld && nodeAboveId != null && nodeBelowId != null && (
        <div
          className={`
            absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50
            flex items-center gap-1.5 px-2.5 py-1 rounded-md
            bg-plugin-surface/95 border border-plugin-border
            text-xs text-plugin-muted whitespace-nowrap
            animate-fade-in
            backdrop-blur-sm shadow-lg
          `}
        >
          <span>Hold <kbd className="px-1 py-0.5 rounded bg-plugin-border text-plugin-text text-xxs font-mono">Shift</kbd> + drop to create parallel group</span>
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

  const borderColor = isParallelContext ? 'border-orange-500' : 'border-blue-500';
  const bgColor = isParallelContext ? 'bg-orange-500/10' : 'bg-blue-500/10';
  const textColor = isParallelContext ? 'text-orange-400' : 'text-blue-400';

  // Empty group placeholder
  if (isEmpty) {
    return (
      <div
        ref={setNodeRef}
        onDoubleClick={onBrowsePlugins}
        className={`
          mx-2 rounded-lg border-2 border-dashed transition-all duration-200
          ${isOver && isDragActive
            ? `${borderColor} ${bgColor} py-4`
            : 'border-plugin-border/50 py-3'
          }
          flex items-center justify-center gap-2 cursor-pointer
          hover:border-plugin-border
        `}
      >
        <span className={`text-xs ${isOver ? textColor : 'text-plugin-muted'}`}>
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
      className={`
        absolute inset-0 rounded-lg border-2 pointer-events-none z-10
        transition-all duration-150
        ${borderColor} ${bgColor}
      `}
    />
  );
}
