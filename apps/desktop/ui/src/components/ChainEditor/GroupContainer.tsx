import { ChevronDown, ChevronRight, Layers, GitBranch, X, GripVertical, Ungroup } from 'lucide-react';
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
  /** Set of node IDs whose drop targets should be disabled (self-drop prevention) */
  disabledDropIds?: Set<number>;
  /** Map of nodeId → 1-based DFS plugin slot number */
  slotNumbers?: Map<number, number>;
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
  disabledDropIds,
  slotNumbers,
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
    disabled: disabledDropIds?.has(node.id),
  });

  const isSerial = node.mode === 'serial';
  const isParallel = node.mode === 'parallel';
  const childCount = countNodes(node.children);
  const isDropTarget = isGroupDropOver && isDragActive && !isDragging;

  const tone = isSerial
    ? { bar: 'bg-plugin-serial', text: 'text-plugin-serial', border: 'border-plugin-serial/25', bg: 'bg-plugin-serial/[0.035]', ring: 'ring-plugin-serial/50' }
    : { bar: 'bg-plugin-parallel', text: 'text-plugin-parallel', border: 'border-plugin-parallel/25', bg: 'bg-plugin-parallel/[0.035]', ring: 'ring-plugin-parallel/50' };

  // Combine refs for both draggable and droppable
  const setRef = (el: HTMLElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };

  const stop = {
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  };

  return (
    <div
      ref={setRef}
      className={`
        relative rounded-lg border transition-[border-color,background-color,opacity] duration-150 overflow-hidden
        ${tone.border} ${tone.bg}
        ${isDropTarget ? `ring-2 ${tone.ring}` : ''}
        ${isDragging ? 'opacity-30' : ''}
      `}
      style={{ marginLeft: depth > 0 ? 4 : 0 }}
    >
      {/* Mode colour bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${tone.bar} opacity-80`} />

      {/* Group header — entire row is draggable (5px movement activates) */}
      <div
        {...dragAttributes}
        {...dragListeners}
        className="flex items-center gap-1.5 h-9 pl-2.5 pr-1.5 cursor-grab active:cursor-grabbing border-b border-white/[0.04]"
      >
        <GripVertical className="w-3.5 h-3.5 text-plugin-dim flex-shrink-0" />

        <button
          onClick={(e) => { e.stopPropagation(); toggleGroupCollapsed(node.id); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex-shrink-0 w-5 h-5 inline-flex items-center justify-center rounded hover:bg-plugin-raised text-plugin-muted"
          aria-label={node.collapsed ? 'Expand group' : 'Collapse group'}
        >
          {node.collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {isSerial ? (
          <Layers className={`w-3.5 h-3.5 ${tone.text} flex-shrink-0`} />
        ) : (
          <GitBranch className={`w-3.5 h-3.5 ${tone.text} flex-shrink-0`} />
        )}

        <span className="text-[13px] font-semibold text-plugin-text truncate min-w-0">
          {node.name}
        </span>
        <span className="num text-[10px] text-plugin-dim flex-shrink-0">{childCount}</span>

        <div className="flex-1" />

        {/* Mode toggle */}
        <div className="flex items-center p-0.5 rounded-md bg-plugin-bg border border-plugin-border flex-shrink-0" {...stop}>
          <button
            onClick={() => setGroupMode(node.id, 'serial')}
            className={`h-5 px-1.5 rounded text-[11px] font-semibold transition-colors ${
              isSerial ? 'bg-plugin-serial/20 text-plugin-serial' : 'text-plugin-dim hover:text-plugin-text'
            }`}
            title="Serial: plugins run one after another"
          >
            Serial
          </button>
          <button
            onClick={() => setGroupMode(node.id, 'parallel')}
            className={`h-5 px-1.5 rounded text-[11px] font-semibold transition-colors ${
              isParallel ? 'bg-plugin-parallel/20 text-plugin-parallel' : 'text-plugin-dim hover:text-plugin-text'
            }`}
            title="Parallel: branches run side by side and are summed"
          >
            Parallel
          </button>
        </div>

        {/* Dry/Wet for serial groups */}
        {isSerial && (
          <div className="flex items-center gap-1.5 pl-1 flex-shrink-0" {...stop}>
            <span className="section-label">Mix</span>
            <Slider
              value={node.dryWet}
              min={0}
              max={1}
              step={0.01}
              color="blue"
              width="w-16"
              onChange={(v) => setGroupDryWet(node.id, v)}
              title={`Dry/Wet: ${Math.round(node.dryWet * 100)}%`}
            />
            <span className="num text-[10px] text-plugin-muted w-8 text-right">
              {Math.round(node.dryWet * 100)}%
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-0.5 pl-0.5 flex-shrink-0" {...stop}>
          <button
            onClick={() => dissolveGroup(node.id)}
            className="w-6 h-6 inline-flex items-center justify-center rounded text-plugin-dim hover:text-plugin-text hover:bg-plugin-raised transition-colors"
            title="Dissolve group (ungroup)"
            aria-label="Dissolve group"
          >
            <Ungroup className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => removeNode(node.id)}
            className="w-6 h-6 inline-flex items-center justify-center rounded text-plugin-dim hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Remove group and all contents"
            aria-label="Remove group"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Children */}
      {!node.collapsed && (
        <div className="pl-3 pr-1.5 pt-1 pb-1.5">
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
              disabledDropIds={disabledDropIds}
              slotNumbers={slotNumbers}
            />
          )}
        </div>
      )}

      {/* Collapsed summary */}
      {node.collapsed && (
        <div className="pl-9 pr-3 py-1.5 text-[11px] text-plugin-muted">
          {childCount} plugin{childCount !== 1 ? 's' : ''} {isParallel ? 'in parallel' : 'in series'}
        </div>
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

  const borderColor = isParallel ? 'border-plugin-parallel/40' : 'border-plugin-serial/40';
  const bgColor = isParallel ? 'bg-plugin-parallel/10' : 'bg-plugin-serial/10';
  const textColor = isParallel ? 'text-plugin-parallel' : 'text-plugin-serial';

  const handleClick = () => {
    window.dispatchEvent(new Event('openPluginBrowser'));
  };

  return (
    <div
      ref={setNodeRef}
      onClick={handleClick}
      className={`
        rounded-lg border border-dashed transition-colors duration-150 h-10
        ${isOver && isDragActive
          ? `${borderColor} ${bgColor}`
          : 'border-plugin-border-bright/70'
        }
        flex items-center justify-center gap-2 cursor-pointer
        hover:border-plugin-accent/50
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
