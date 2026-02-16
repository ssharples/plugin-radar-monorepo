import { ChevronDown, ChevronRight, Layers, GitBranch, X, GripVertical, Save, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useChainActions } from '../../stores/chainStore';
import type { GroupNodeUI, ChainNodeUI } from '../../api/types';
import { ChainNodeList } from './ChainNodeList';
import { Slider } from '../Slider/Slider';
import { SaveGroupTemplateModal } from './SaveGroupTemplateModal';

interface GroupContainerProps {
  node: GroupNodeUI;
  depth: number;
  parentId: number;
  onNodeSelect?: (e: React.MouseEvent, nodeId: number) => void;
  selectedIds?: Set<number>;
  isDragActive?: boolean;
  draggedNodeId?: number | null;
  groupSelectMode?: boolean;
  /** Set of node IDs whose drop targets should be disabled (self-drop prevention) */
  disabledDropIds?: Set<number>;
  /** Map of nodeId → 1-based DFS plugin slot number */
  slotNumbers?: Map<number, number>;
  /** Whether this group is the source of the current drag (detach visual) */
  isSourceGroup?: boolean;
  /** ID of the source group for forwarding to nested ChainNodeList */
  sourceGroupId?: number | null;
  /** Whether this group is currently animating its collapse before dissolve */
  isDissolvingGroup?: boolean;
  /** ID of a group currently dissolving, forwarded to nested ChainNodeList */
  dissolvingGroupId?: number | null;
}

export function GroupContainer({
  node,
  depth,
  parentId: _parentId,
  onNodeSelect,
  selectedIds,
  isDragActive = false,
  draggedNodeId = null,
  groupSelectMode = false,
  disabledDropIds,
  slotNumbers,
  isSourceGroup = false,
  sourceGroupId = null,
  isDissolvingGroup = false,
  dissolvingGroupId = null,
}: GroupContainerProps) {
  const {
    setGroupMode,
    setGroupDryWet,
    setGroupDucking,
    dissolveGroup,
    removeNode,
    toggleGroupCollapsed,
    _endContinuousGesture,
  } = useChainActions();

  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);

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

  // Whether controls have non-default values (for active indicator)
  const hasActiveControls = (node.duckAmount ?? 0) > 0 || (isSerial && node.dryWet !== 1.0);

  // Cyber color scheme: serial=warm (amber/orange), parallel=cool (cyan)
  const groupBorderColor = isGroupDropOver && isDragActive
    ? (isParallel ? 'rgba(222, 255, 10, 0.5)' : 'rgba(255, 170, 0, 0.5)')
    : (isParallel ? 'rgba(222, 255, 10, 0.2)' : 'rgba(255, 170, 0, 0.2)');
  const groupBgColor = isGroupDropOver && isDragActive
    ? (isParallel ? 'rgba(222, 255, 10, 0.08)' : 'rgba(255, 170, 0, 0.08)')
    : (isParallel ? 'rgba(222, 255, 10, 0.03)' : 'rgba(255, 170, 0, 0.03)');
  const accentColor = isParallel ? 'var(--color-accent-cyan)' : 'var(--color-status-warning)';

  // Combine refs for both draggable and droppable
  const setRef = (el: HTMLElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };

  return (
    <>
    <div
      ref={setRef}
      className={`
        rounded-lg dim-during-drag overflow-hidden
        ${isDragging ? 'opacity-30 scale-[0.98]' : ''}
        ${isDragActive && !isDragging && node.id !== draggedNodeId
          ? (isGroupDropOver ? 'drop-target-active' : 'drop-target-valid')
          : ''}
        ${isDissolvingGroup ? 'animate-group-collapse' : ''}
      `}
      style={{
        position: 'relative' as const,
        zIndex: 2, // Sit above DropZone hitboxes (z-index:1) so drag listeners receive pointer events
        border: isSourceGroup
          ? `1px dashed ${isParallel ? 'rgba(222, 255, 10, 0.4)' : 'rgba(255, 170, 0, 0.4)'}`
          : `1px solid ${groupBorderColor}`,
        background: `linear-gradient(135deg, ${
          isParallel
            ? 'rgba(222, 255, 10, 0.04) 0%, rgba(255,255,255,0.02) 50%, rgba(222, 255, 10, 0.03) 100%'
            : 'rgba(255, 170, 0, 0.04) 0%, rgba(255,255,255,0.02) 50%, rgba(255, 170, 0, 0.03) 100%'
        })`,
        boxShadow: isGroupDropOver && isDragActive
          ? `0 0 16px ${isParallel ? 'rgba(222, 255, 10, 0.15)' : 'rgba(255, 170, 0, 0.15)'}, inset 0 1px 0 rgba(255,255,255,0.08)`
          : '0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
        transition: 'all var(--duration-fast) var(--ease-snap)',
      }}
    >
      {/* Group Header — entire row is draggable (5px movement activates) */}
      <div
        {...dragAttributes}
        {...dragListeners}
        className="flex items-center gap-2 px-3 py-2 cursor-grab active:cursor-grabbing"
      >
        {/* Drag handle indicator */}
        <div className="flex-shrink-0 p-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
          <GripVertical className="w-3.5 h-3.5" />
        </div>

        {/* Collapse toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleGroupCollapsed(node.id); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex-shrink-0 p-0.5 rounded"
          style={{ color: 'var(--color-text-secondary)', transition: 'all var(--duration-fast) var(--ease-snap)' }}
        >
          {node.collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Group icon */}
        {isSerial ? (
          <Layers className="w-3.5 h-3.5 flex-shrink-0" style={{ color: accentColor }} />
        ) : (
          <GitBranch className="w-3.5 h-3.5 flex-shrink-0" style={{ color: accentColor }} />
        )}

        {/* Group name */}
        <span
          className="text-xs font-bold truncate flex-1"
          style={{
            fontFamily: 'var(--font-extended)',
            textTransform: 'uppercase' as const,
            letterSpacing: 'var(--tracking-wider)',
            color: 'var(--color-text-primary)',
          }}
        >
          {node.name}
        </span>

        {/* Mode toggle */}
        <div
          className="flex items-center rounded overflow-hidden"
          style={{
            background: 'rgba(0, 0, 0, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setGroupMode(node.id, 'serial')}
            className="px-2 py-0.5 text-xxs font-bold"
            style={{
              fontFamily: 'var(--font-mono)',
              letterSpacing: 'var(--tracking-wide)',
              background: isSerial ? 'rgba(255, 170, 0, 0.15)' : 'transparent',
              color: isSerial ? 'var(--color-status-warning)' : 'var(--color-text-tertiary)',
              transition: 'all var(--duration-fast) var(--ease-snap)',
            }}
          >
            SER
          </button>
          <button
            onClick={() => setGroupMode(node.id, 'parallel')}
            className="px-2 py-0.5 text-xxs font-bold"
            style={{
              fontFamily: 'var(--font-mono)',
              letterSpacing: 'var(--tracking-wide)',
              background: isParallel ? 'rgba(222, 255, 10, 0.15)' : 'transparent',
              color: isParallel ? 'var(--color-accent-cyan)' : 'var(--color-text-tertiary)',
              transition: 'all var(--duration-fast) var(--ease-snap)',
            }}
          >
            PAR
          </button>
        </div>

        {/* Controls dropdown toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); setControlsOpen(!controlsOpen); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="relative p-1 rounded"
          style={{
            color: controlsOpen ? accentColor : 'var(--color-text-secondary)',
            background: controlsOpen ? (isParallel ? 'rgba(222, 255, 10, 0.1)' : 'rgba(255, 170, 0, 0.1)') : 'transparent',
            transition: 'all var(--duration-fast) var(--ease-snap)',
          }}
          title={isParallel ? 'Ducking controls' : 'Mix & ducking controls'}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          {/* Active indicator dot */}
          {hasActiveControls && !controlsOpen && (
            <div
              className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full"
              style={{
                background: '#deff0a',
                boxShadow: '0 0 4px rgba(222, 255, 10, 0.6)',
              }}
            />
          )}
        </button>

        {/* Actions */}
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          {/* Save as template */}
          <button
            onClick={() => setShowSaveTemplateModal(true)}
            className="p-1 rounded"
            style={{
              color: 'var(--color-text-secondary)',
              transition: 'all var(--duration-fast) var(--ease-snap)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-cyan)'; e.currentTarget.style.background = 'rgba(222, 255, 10, 0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
            title="Save group as template"
          >
            <Save className="w-3 h-3" />
          </button>
          {/* Dissolve group */}
          <button
            onClick={() => dissolveGroup(node.id)}
            className="p-1 rounded"
            style={{
              color: 'var(--color-text-secondary)',
              transition: 'all var(--duration-fast) var(--ease-snap)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
            title="Dissolve group (ungroup)"
          >
            <Layers className="w-3 h-3" />
          </button>
          {/* Remove entire group */}
          <button
            onClick={() => removeNode(node.id)}
            className="p-1 rounded"
            style={{
              color: 'var(--color-text-secondary)',
              transition: 'all var(--duration-fast) var(--ease-snap)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-status-error)'; e.currentTarget.style.background = 'rgba(255, 0, 51, 0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
            title="Remove group and all contents"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Collapsible Controls Panel */}
      {controlsOpen && (
        <div
          className="content-reveal px-3 pb-2"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className="flex items-center gap-4 px-3 py-2 rounded-md"
            style={{
              background: 'rgba(15, 15, 15, 0.9)',
              borderTop: `1px solid ${isParallel ? 'rgba(222, 255, 10, 0.15)' : 'rgba(255, 170, 0, 0.15)'}`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            {/* Serial: Dry/Wet control */}
            {isSerial && (
              <div className="flex items-center gap-2 flex-1">
                <span
                  className="text-xxs font-bold"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    textTransform: 'uppercase' as const,
                    letterSpacing: 'var(--tracking-wider)',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  DRY/WET
                </span>
                <Slider
                  value={node.dryWet}
                  min={0}
                  max={1}
                  step={0.01}
                  color="blue"
                  width="w-28"
                  onChange={(v) => setGroupDryWet(node.id, v)}
                  onDragEnd={_endContinuousGesture}
                  title={`Dry/Wet: ${Math.round(node.dryWet * 100)}%`}
                />
                <span
                  className="text-xxs w-8 text-right tabular-nums"
                  style={{ fontFamily: 'var(--font-mono)', color: accentColor }}
                >
                  {Math.round(node.dryWet * 100)}%
                </span>
              </div>
            )}

            {/* Duck Amount + Release (available for all group types) */}
            {isSerial && (
              <div
                className="w-px h-4 flex-shrink-0"
                style={{ background: 'rgba(255, 255, 255, 0.06)' }}
              />
            )}

            <div className="flex items-center gap-2">
              <span
                className="text-xxs font-bold"
                style={{
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase' as const,
                  letterSpacing: 'var(--tracking-wider)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                DUCK
              </span>
              <Slider
                value={node.duckAmount ?? 0}
                min={0}
                max={1}
                step={0.01}
                color="accent"
                width="w-28"
                onChange={(v) => setGroupDucking(node.id, v, node.duckReleaseMs ?? 200)}
                onDragEnd={_endContinuousGesture}
                title={`Duck: ${Math.round((node.duckAmount ?? 0) * 100)}%`}
              />
              <span
                className="text-xxs w-8 text-right tabular-nums"
                style={{ fontFamily: 'var(--font-mono)', color: accentColor }}
              >
                {Math.round((node.duckAmount ?? 0) * 100)}%
              </span>
            </div>

            <div
              className="w-px h-4 flex-shrink-0"
              style={{ background: 'rgba(255, 255, 255, 0.06)' }}
            />

            <div className="flex items-center gap-2">
              <span
                className="text-xxs font-bold"
                style={{
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase' as const,
                  letterSpacing: 'var(--tracking-wider)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                RELEASE
              </span>
              <Slider
                value={node.duckReleaseMs ?? 200}
                min={50}
                max={1000}
                step={10}
                color="accent"
                width="w-24"
                onChange={(v) => setGroupDucking(node.id, node.duckAmount ?? 0, v)}
                onDragEnd={_endContinuousGesture}
                title={`Release: ${node.duckReleaseMs ?? 200}ms`}
              />
              <span
                className="text-xxs w-10 text-right tabular-nums"
                style={{ fontFamily: 'var(--font-mono)', color: accentColor }}
              >
                {node.duckReleaseMs ?? 200}ms
              </span>
            </div>
          </div>
        </div>
      )}

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
              groupSelectMode={groupSelectMode}
              disabledDropIds={disabledDropIds}
              slotNumbers={slotNumbers}
              sourceGroupId={sourceGroupId}
              dissolvingGroupId={dissolvingGroupId}
            />
          )}
        </div>
      )}

      {/* Collapsed summary */}
      {node.collapsed && (
        <div
          className="px-3 pb-2 text-xxs"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-tertiary)',
            letterSpacing: 'var(--tracking-wide)',
          }}
        >
          {childCount} plugin{childCount !== 1 ? 's' : ''}
        </div>
      )}

      {/* Drop target overlay when dragging over */}
      {isGroupDropOver && isDragActive && !isDragging && (
        <div
          className="absolute inset-0 rounded-lg pointer-events-none z-10 animate-fade-in"
          style={{
            boxShadow: isParallel
              ? '0 0 0 2px rgba(222, 255, 10, 0.4)'
              : '0 0 0 2px rgba(255, 170, 0, 0.4)',
            transition: 'all var(--duration-fast) var(--ease-snap)',
          }}
        >
          {/* "Drop to add" label at bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 flex items-center justify-center py-1 rounded-b-lg"
            style={{
              background: isParallel
                ? 'rgba(222, 255, 10, 0.1)'
                : 'rgba(255, 170, 0, 0.1)',
            }}
          >
            <span
              className="text-[10px] font-bold"
              style={{
                fontFamily: 'var(--font-mono)',
                letterSpacing: 'var(--tracking-wide)',
                textTransform: 'uppercase' as const,
                color: isParallel
                  ? 'rgba(222, 255, 10, 0.7)'
                  : 'rgba(255, 170, 0, 0.7)',
              }}
            >
              Drop to add to {node.name}
            </span>
          </div>
        </div>
      )}
    </div>

      {/* Save Template Modal */}
      {showSaveTemplateModal && (
        <SaveGroupTemplateModal
          groupId={node.id}
          groupName={node.name}
          onClose={() => setShowSaveTemplateModal(false)}
        />
      )}
    </>
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

  const accentColor = isParallel ? 'var(--color-accent-cyan)' : 'var(--color-status-warning)';

  const handleClick = () => {
    window.dispatchEvent(new Event('openPluginBrowser'));
  };

  return (
    <div
      ref={setNodeRef}
      onClick={handleClick}
      className="mx-1 rounded-lg flex items-center justify-center gap-2 cursor-pointer"
      style={{
        border: isOver && isDragActive
          ? `2px dashed ${accentColor}`
          : `2px dashed var(--color-border-default)`,
        background: isOver && isDragActive
          ? (isParallel ? 'rgba(222, 255, 10, 0.08)' : 'rgba(255, 170, 0, 0.08)')
          : 'transparent',
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
          color: isOver && isDragActive ? accentColor : 'var(--color-text-tertiary)',
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

function countNodes(nodes: ChainNodeUI[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === 'plugin') count++;
    else if (node.type === 'group') count += countNodes(node.children);
  }
  return count;
}
