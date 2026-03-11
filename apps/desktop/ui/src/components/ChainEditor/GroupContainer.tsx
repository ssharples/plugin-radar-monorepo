import { ChevronDown, ChevronRight, GitBranch, X, GripVertical, Save, Plus, Layers, Power } from 'lucide-react';
import { useState, useCallback, memo } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useChainActions } from '../../stores/chainStore';
import type { GroupNodeUI, ChainNodeUI } from '../../api/types';
import { ChainNodeList } from './ChainNodeList';

import { SaveGroupTemplateModal } from './SaveGroupTemplateModal';
import { InlinePluginSearch } from './InlinePluginSearch';
import { ContextMenu, buildGroupMenu } from '../ContextMenu';

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

export const GroupContainer = memo(function GroupContainer({
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
    dissolveGroup,
    removeNode,
    toggleGroupCollapsed,
    toggleNodeBypass,
    showInlineSearchBelow,
  } = useChainActions();

  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [groupContextMenu, setGroupContextMenu] = useState<{ x: number; y: number } | null>(null);
  const handleGroupContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setGroupContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

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

  const childCount = countNodes(node.children);

  // Parallel-only color scheme
  const groupBorderColor = isGroupDropOver && isDragActive
    ? 'rgba(222, 255, 10, 0.5)'
    : 'rgba(222, 255, 10, 0.2)';
  const accentColor = 'var(--color-accent-cyan)';

  // For "+ SEND" — insert after the last child
  const handleAddBranch = useCallback(() => {
    if (node.children.length > 0) {
      const lastChild = node.children[node.children.length - 1];
      showInlineSearchBelow(lastChild.id, node.id, node.children.length);
    }
  }, [node.children, node.id, showInlineSearchBelow]);

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
        ${isDragging ? 'opacity-30 scale-[0.98]' : node.bypassed ? 'opacity-50' : ''}
        ${isDragActive && !isDragging && node.id !== draggedNodeId
          ? (isGroupDropOver ? 'drop-target-active' : 'drop-target-valid')
          : ''}
        ${isDissolvingGroup ? 'animate-group-collapse' : ''}
      `}
      style={{
        position: 'relative' as const,
        zIndex: 2,
        border: isSourceGroup
          ? '1px dashed rgba(222, 255, 10, 0.4)'
          : `1px solid ${groupBorderColor}`,
        background: 'linear-gradient(135deg, rgba(222, 255, 10, 0.04) 0%, rgba(255,255,255,0.02) 50%, rgba(222, 255, 10, 0.03) 100%)',
        boxShadow: isGroupDropOver && isDragActive
          ? '0 0 16px rgba(222, 255, 10, 0.15), inset 0 1px 0 rgba(255,255,255,0.08)'
          : '0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
        transition: 'all var(--duration-fast) var(--ease-snap)',
      }}
    >
      {/* Group Header — entire row is draggable */}
      <div
        {...dragAttributes}
        {...dragListeners}
        className="flex items-center gap-1.5 px-2 py-1.5 cursor-grab active:cursor-grabbing"
        onContextMenu={handleGroupContextMenu}
      >
        {/* Drag handle */}
        <div className="flex-shrink-0 p-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
          <GripVertical className="w-3 h-3" />
        </div>

        {/* Collapse toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleGroupCollapsed(node.id); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex-shrink-0 p-0.5 rounded"
          style={{ color: 'var(--color-text-secondary)', transition: 'all var(--duration-fast) var(--ease-snap)' }}
        >
          {node.collapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>

        {/* Group icon */}
        <GitBranch className="w-3 h-3 flex-shrink-0" style={{ color: accentColor }} />

        {/* Group name */}
        <span
          className="text-body font-bold truncate min-w-0"
          style={{
            fontFamily: 'var(--font-extended)',
            textTransform: 'uppercase' as const,
            letterSpacing: 'var(--tracking-wider)',
            color: 'var(--color-text-primary)',
            maxWidth: '80px',
          }}
        >
          {node.name}
        </span>

        {/* Bypass toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleNodeBypass(node.id); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex-shrink-0 p-1 rounded"
          style={{
            color: node.bypassed ? 'var(--color-text-tertiary)' : accentColor,
            background: node.bypassed ? 'rgba(255, 255, 255, 0.04)' : 'rgba(222, 255, 10, 0.12)',
            transition: 'all var(--duration-fast) var(--ease-snap)',
          }}
          title={node.bypassed ? 'Enable bus' : 'Bypass bus'}
        >
          <Power className="w-3.5 h-3.5" />
        </button>

        {/* Spacer to push actions to the right */}
        <div className="flex-1 min-w-0" />

        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => setShowSaveTemplateModal(true)}
            className="p-0.5 rounded"
            style={{
              color: 'var(--color-text-secondary)',
              transition: 'all var(--duration-fast) var(--ease-snap)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-cyan)'; e.currentTarget.style.background = 'rgba(222, 255, 10, 0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
            title="Save send bus as template"
          >
            <Save className="w-3 h-3" />
          </button>
          <button
            onClick={() => dissolveGroup(node.id)}
            className="p-0.5 rounded"
            style={{
              color: 'var(--color-text-secondary)',
              transition: 'all var(--duration-fast) var(--ease-snap)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
            title="Remove Bus"
          >
            <Layers className="w-3 h-3" />
          </button>
          <button
            onClick={() => removeNode(node.id)}
            className="p-0.5 rounded"
            style={{
              color: 'var(--color-text-secondary)',
              transition: 'all var(--duration-fast) var(--ease-snap)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-status-error)'; e.currentTarget.style.background = 'rgba(255, 0, 51, 0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
            title="Delete bus and all contents"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Children */}
      {!node.collapsed && (
        <div className="px-2 pb-2 pt-1">
          {node.children.length === 0 ? (
            <EmptyGroupDropZone
              groupId={node.id}
              isDragActive={isDragActive}
            />
          ) : (
            <ChainNodeList
              nodes={node.children}
              depth={depth + 1}
              parentId={node.id}
              isParallelParent={true}
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

          {/* Group action buttons */}
          <div
            className="mt-1.5 px-1"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Action buttons row */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddBranch}
                className="flex items-center gap-1 px-2 py-1 rounded text-body font-bold"
                style={{
                  letterSpacing: 'var(--tracking-wide)',
                  color: 'var(--color-text-tertiary)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px dashed rgba(255, 255, 255, 0.1)',
                  transition: 'all var(--duration-fast) var(--ease-snap)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--color-accent-cyan)';
                  e.currentTarget.style.borderColor = 'rgba(222, 255, 10, 0.3)';
                  e.currentTarget.style.background = 'rgba(222, 255, 10, 0.06)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--color-text-tertiary)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                }}
                title="Add a new send"
              >
                <Plus className="w-3 h-3" />
                Send
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Collapsed summary */}
      {node.collapsed && (
        <div
          className="px-3 pb-2 text-body"
          style={{
            fontFamily: 'var(--font-system)',
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
            boxShadow: '0 0 0 2px rgba(222, 255, 10, 0.4)',
            transition: 'all var(--duration-fast) var(--ease-snap)',
          }}
        >
          <div
            className="absolute bottom-0 left-0 right-0 flex items-center justify-center py-1 rounded-b-lg"
            style={{ background: 'rgba(222, 255, 10, 0.1)' }}
          >
            <span
              className="text-body font-bold"
              style={{
                letterSpacing: 'var(--tracking-wide)',
                color: 'rgba(222, 255, 10, 0.7)',
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

      {/* Group Context Menu */}
      {groupContextMenu && (
        <ContextMenu
          x={groupContextMenu.x}
          y={groupContextMenu.y}
          items={buildGroupMenu(
            {
              node,
              nodeId: node.id,
              isSerial: false,
              isCollapsed: !!node.collapsed,
            },
            {
              addPlugin: handleAddBranch,
              toggleBypass: () => toggleNodeBypass(node.id),
              dissolveGroup: () => dissolveGroup(node.id),
              toggleCollapsed: () => toggleGroupCollapsed(node.id),
              saveAsTemplate: () => setShowSaveTemplateModal(true),
              removeGroup: () => removeNode(node.id),
            },
          )}
          onClose={() => setGroupContextMenu(null)}
        />
      )}
    </>
  );
});

/**
 * Empty group placeholder with drop target + inline search.
 */
function EmptyGroupDropZone({
  groupId,
  isDragActive,
}: {
  groupId: number;
  isDragActive: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `drop:${groupId}:0`,
  });

  const [showSearch, setShowSearch] = useState(false);
  const accentColor = 'var(--color-accent-cyan)';

  const handleClick = () => {
    setShowSearch(true);
  };

  return (
    <>
      <div
        ref={setNodeRef}
        onClick={handleClick}
        className="mx-1 rounded-lg flex items-center justify-center gap-2 cursor-pointer"
        style={{
          border: isOver && isDragActive
            ? `2px dashed ${accentColor}`
            : '2px dashed var(--color-border-default)',
          background: isOver && isDragActive
            ? 'rgba(222, 255, 10, 0.08)'
            : 'transparent',
          padding: isOver && isDragActive ? '16px 0' : '12px 0',
          transition: 'all var(--duration-fast) var(--ease-snap)',
        }}
      >
        <span
          className="text-body"
          style={{
            letterSpacing: 'var(--tracking-wide)',
            color: isOver && isDragActive ? accentColor : 'var(--color-text-tertiary)',
          }}
        >
          {isOver && isDragActive
            ? 'Drop plugin here'
            : 'Drop a plugin here or click to browse'
          }
        </span>
      </div>
      {showSearch && (
        <div className="mt-2">
          <InlinePluginSearch
            parentId={groupId}
            insertIndex={0}
            onPluginAdded={() => setShowSearch(false)}
            onClose={() => setShowSearch(false)}
          />
        </div>
      )}
    </>
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
