import { ChevronDown, ChevronRight, Layers, GitBranch, X, GripVertical } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useChainStore } from '../../stores/chainStore';
import type { GroupNodeUI, ChainNodeUI } from '../../api/types';
import { ChainNodeList } from './ChainNodeList';
import { Slider } from '../Slider/Slider';

interface GroupContainerProps {
  node: GroupNodeUI;
  depth: number;
  parentId: number;
  onNodeSelect?: (e: React.MouseEvent, nodeId: number) => void;
  selectedIds?: Set<number>;
  isDragActive?: boolean;
  draggedNodeId?: number | null;
  shiftHeld?: boolean;
  groupSelectMode?: boolean;
}

export function GroupContainer({
  node,
  depth,
  parentId: _parentId,
  onNodeSelect,
  selectedIds,
  isDragActive = false,
  draggedNodeId = null,
  shiftHeld = false,
  groupSelectMode = false,
}: GroupContainerProps) {
  const {
    setGroupMode,
    setGroupDryWet,
    dissolveGroup,
    removeNode,
    toggleGroupCollapsed,
  } = useChainStore();

  // Make the group draggable
  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `drag:${node.id}`,
    data: {
      type: 'group',
      nodeId: node.id,
      node: node,
    },
  });

  // Make the group a drop target (drop onto group = append to end)
  const {
    isOver: isGroupDropOver,
    setNodeRef: setDropRef,
  } = useDroppable({
    id: `group:${node.id}`,
    data: {
      type: 'group-target',
      groupId: node.id,
    },
  });

  const isSerial = node.mode === 'serial';
  const isParallel = node.mode === 'parallel';
  const borderColor = isSerial ? 'border-blue-500/30' : 'border-orange-500/30';
  const bgColor = isSerial ? 'bg-blue-500/5' : 'bg-orange-500/5';
  const childCount = countNodes(node.children);

  // Highlight states for drop target
  const dropHighlightBorder = isGroupDropOver && isDragActive
    ? (isParallel ? 'border-orange-500/70' : 'border-blue-500/70')
    : borderColor;
  const dropHighlightBg = isGroupDropOver && isDragActive
    ? (isParallel ? 'bg-orange-500/15' : 'bg-blue-500/15')
    : bgColor;

  // Combine refs for both draggable and droppable
  const setRef = (el: HTMLElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };

  return (
    <div
      ref={setRef}
      className={`
        rounded-lg border transition-all duration-200
        ${dropHighlightBorder} ${dropHighlightBg}
        ${isDragging ? 'opacity-30 scale-[0.98]' : ''}
        overflow-hidden
      `}
      style={{ marginLeft: depth > 0 ? 8 : 0 }}
    >
      {/* Group Header — entire row is draggable (5px movement activates) */}
      <div
        {...dragAttributes}
        {...dragListeners}
        className="flex items-center gap-2 px-3 py-2 cursor-grab active:cursor-grabbing"
      >
        {/* Drag handle indicator */}
        <div className="flex-shrink-0 p-0.5 text-plugin-muted">
          <GripVertical className="w-3.5 h-3.5" />
        </div>

        {/* Collapse toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleGroupCollapsed(node.id); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex-shrink-0 p-0.5 rounded hover:bg-plugin-border/50 text-plugin-muted"
        >
          {node.collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Group icon */}
        {isSerial ? (
          <Layers className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
        ) : (
          <GitBranch className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
        )}

        {/* Group name */}
        <span className="text-xs font-medium text-plugin-text truncate flex-1">
          {node.name}
        </span>

        {/* Mode toggle */}
        <div className="flex items-center bg-plugin-bg rounded overflow-hidden border border-plugin-border" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => setGroupMode(node.id, 'serial')}
            className={`px-2 py-0.5 text-xxs font-medium transition-colors ${
              isSerial
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-plugin-muted hover:text-plugin-text'
            }`}
          >
            SER
          </button>
          <button
            onClick={() => setGroupMode(node.id, 'parallel')}
            className={`px-2 py-0.5 text-xxs font-medium transition-colors ${
              isParallel
                ? 'bg-orange-500/20 text-orange-400'
                : 'text-plugin-muted hover:text-plugin-text'
            }`}
          >
            PAR
          </button>
        </div>

        {/* Dry/Wet for serial groups (non-root) */}
        {isSerial && (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <span className="text-xxs text-plugin-muted">D/W</span>
            <Slider
              value={node.dryWet}
              min={0}
              max={1}
              step={0.01}
              color="blue"
              width="w-14"
              onChange={(v) => setGroupDryWet(node.id, v)}
              title={`Dry/Wet: ${Math.round(node.dryWet * 100)}%`}
            />
            <span className="text-xxs text-plugin-muted w-7 text-right tabular-nums">
              {Math.round(node.dryWet * 100)}%
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          {/* Dissolve group */}
          <button
            onClick={() => dissolveGroup(node.id)}
            className="p-1 rounded text-plugin-muted hover:text-plugin-text hover:bg-plugin-border/50 transition-colors"
            title="Dissolve group (ungroup)"
          >
            <Layers className="w-3 h-3" />
          </button>
          {/* Remove entire group */}
          <button
            onClick={() => removeNode(node.id)}
            className="p-1 rounded text-plugin-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
            title="Remove group and all contents"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Children */}
      {!node.collapsed && (
        <div className="px-2 pb-2">
          {node.children.length === 0 ? (
            <EmptyGroupDropZone
              groupId={node.id}
              isParallel={isParallel}
              isDragActive={isDragActive}
            />
          ) : (
            <ChainNodeList
              nodes={node.children}
              depth={depth + 1}
              parentId={node.id}
              isParallelParent={isParallel}
              onNodeSelect={onNodeSelect}
              selectedIds={selectedIds}
              isDragActive={isDragActive}
              draggedNodeId={draggedNodeId}
              shiftHeld={shiftHeld}
              groupSelectMode={groupSelectMode}
            />
          )}
        </div>
      )}

      {/* Collapsed summary */}
      {node.collapsed && (
        <div className="px-3 pb-2 text-xxs text-plugin-muted">
          {childCount} plugin{childCount !== 1 ? 's' : ''}
        </div>
      )}

      {/* Drop target overlay when dragging over */}
      {isGroupDropOver && isDragActive && !isDragging && (
        <div
          className={`
            absolute inset-0 rounded-lg pointer-events-none z-10
            ${isParallel ? 'ring-2 ring-orange-500/40' : 'ring-2 ring-blue-500/40'}
          `}
        />
      )}
    </div>
  );
}

/**
 * Empty group placeholder with drop target.
 */
function EmptyGroupDropZone({
  groupId,
  isParallel,
  isDragActive,
}: {
  groupId: number;
  isParallel: boolean;
  isDragActive: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `drop:${groupId}:0`,
  });

  const borderColor = isParallel ? 'border-orange-500/40' : 'border-blue-500/40';
  const bgColor = isParallel ? 'bg-orange-500/10' : 'bg-blue-500/10';
  const textColor = isParallel ? 'text-orange-400' : 'text-blue-400';

  const handleClick = () => {
    window.dispatchEvent(new Event('openPluginBrowser'));
  };

  return (
    <div
      ref={setNodeRef}
      onClick={handleClick}
      className={`
        mx-1 rounded-lg border-2 border-dashed transition-all duration-200
        ${isOver && isDragActive
          ? `${borderColor} ${bgColor} py-4`
          : 'border-plugin-border/40 py-3'
        }
        flex items-center justify-center gap-2 cursor-pointer
        hover:border-plugin-border/60
      `}
    >
      <span className={`text-xs ${isOver && isDragActive ? textColor : 'text-plugin-muted'}`}>
        {isOver && isDragActive
          ? 'Drop plugin here'
          : 'Drop a plugin here or click to browse'
        }
      </span>
    </div>
  );
}

function countNodes(nodes: ChainNodeUI[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === 'plugin') count++;
    else if (node.type === 'group') count += countNodes(node.children);
  }
  return count;
}
