import { useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useChainStore, useChainActions } from '../../stores/chainStore';
import type { ChainNodeUI } from '../../api/types';

const NEON = '#deff0a';
const SERIAL_COLOR = '#c9944a';
const PARALLEL_COLOR = '#5a7842';
const ROOT_PARENT_ID = 0;

export function ChainOverviewPanel() {
  const nodes = useChainStore(s => s.nodes);
  const inlineEditorNodeId = useChainStore(s => s.inlineEditorNodeId);
  const { openInlineEditor, moveNode } = useChainActions();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeData = active.data.current as { nodeId: number; parentId: number } | undefined;
    const overData = over.data.current as { nodeId: number; parentId: number; index: number } | undefined;
    if (!activeData || !overData) return;

    // Only reorder within the same parent
    if (activeData.parentId !== overData.parentId) return;

    const parentId = activeData.parentId;

    // Find the source index by looking at siblings
    const siblings = getSiblings(nodes, parentId);
    const oldIndex = siblings.findIndex(n => n.id === activeData.nodeId);
    const newIndex = siblings.findIndex(n => n.id === overData.nodeId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    await moveNode(activeData.nodeId, parentId, newIndex);
  }, [nodes, moveNode]);

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[10px] font-sans text-white">
        Empty chain
      </div>
    );
  }

  const rootSortableIds = nodes.map(n => `sort:${n.id}`);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={rootSortableIds} strategy={horizontalListSortingStrategy}>
        <div className="flex items-center h-full p-2 overflow-x-auto gap-0.5">
          {nodes.map((node, i) => (
            <ChainNodeMini
              key={node.id}
              node={node}
              parentId={ROOT_PARENT_ID}
              parentIndex={i}
              activeId={inlineEditorNodeId}
              onSelect={openInlineEditor}
              isLast={i === nodes.length - 1}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ============================================
// Helper: get children of a parent by parentId
// ============================================

function getSiblings(nodes: ChainNodeUI[], parentId: number): ChainNodeUI[] {
  if (parentId === ROOT_PARENT_ID) return nodes;
  const parent = findNodeById(nodes, parentId);
  if (parent && parent.type === 'group') return parent.children;
  return [];
}

function findNodeById(nodes: ChainNodeUI[], id: number): ChainNodeUI | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.type === 'group') {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

// ============================================
// Sortable plugin item
// ============================================

interface SortablePluginItemProps {
  node: ChainNodeUI & { type: 'plugin' };
  parentId: number;
  index: number;
  activeId: number | null;
  onSelect: (id: number) => void;
  isLast: boolean;
}

function SortablePluginItem({ node, parentId, index, activeId, onSelect, isLast }: SortablePluginItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `sort:${node.id}`,
    data: { nodeId: node.id, parentId, index },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    scale: isDragging ? '1.02' : '1',
    zIndex: isDragging ? 10 : undefined,
  };

  const isActive = node.id === activeId;
  const shortName = node.name.length > 12 ? node.name.slice(0, 12) + '...' : node.name;

  return (
    <>
      <button
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onClick={() => onSelect(node.id)}
        className="
          flex items-center px-1.5 py-1 rounded shrink-0
          transition-all duration-100 cursor-grab active:cursor-grabbing
        "
        style={{
          ...style,
          background: isActive ? 'rgba(222, 255, 10, 0.15)' : 'rgba(255,255,255,0.04)',
          border: isActive ? `1px solid ${NEON}` : '1px solid rgba(255,255,255,0.06)',
          boxShadow: isDragging
            ? '0 2px 8px rgba(0,0,0,0.4)'
            : isActive
              ? `0 0 6px rgba(222, 255, 10, 0.3)`
              : 'none',
          opacity: isDragging ? 0.4 : node.bypassed ? 0.4 : 1,
        }}
        title={node.name}
      >
        <span
          className="text-[8px] font-sans whitespace-nowrap"
          style={{ color: isActive ? NEON : '#ffffff' }}
        >
          {shortName}
        </span>
      </button>
      {!isLast && <Arrow />}
    </>
  );
}

// ============================================
// Mini node rendering
// ============================================

interface ChainNodeMiniProps {
  node: ChainNodeUI;
  parentId: number;
  parentIndex: number;
  activeId: number | null;
  onSelect: (id: number) => void;
  isLast: boolean;
}

function ChainNodeMini({ node, parentId, parentIndex, activeId, onSelect, isLast }: ChainNodeMiniProps) {
  if (node.type === 'plugin') {
    return (
      <SortablePluginItem
        node={node}
        parentId={parentId}
        index={parentIndex}
        activeId={activeId}
        onSelect={onSelect}
        isLast={isLast}
      />
    );
  }

  // Group node
  const isSerial = node.mode === 'serial';
  const color = isSerial ? SERIAL_COLOR : PARALLEL_COLOR;
  const sortableIds = node.children.map(c => `sort:${c.id}`);

  return (
    <>
      <div
        className="flex items-center rounded shrink-0 px-1 py-0.5 gap-0.5"
        style={{
          border: `1px solid ${color}40`,
          background: `${color}08`,
        }}
      >
        <span
          className="text-[7px] font-sans font-bold uppercase mr-0.5"
          style={{ color: `${color}99` }}
        >
          {isSerial ? 'S' : 'P'}
        </span>
        {isSerial ? (
          // Serial: inline sequence — sortable within this group
          <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
            <div className="flex items-center gap-0.5">
              {node.children.map((child, i) => (
                <ChainNodeMini
                  key={child.id}
                  node={child}
                  parentId={node.id}
                  parentIndex={i}
                  activeId={activeId}
                  onSelect={onSelect}
                  isLast={i === node.children.length - 1}
                />
              ))}
            </div>
          </SortableContext>
        ) : (
          // Parallel: stacked vertically — sortable within this group
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-0.5">
              {node.children.map((child, i) => (
                <div key={child.id} className="flex items-center gap-0.5">
                  <ChainNodeMini
                    node={child}
                    parentId={node.id}
                    parentIndex={i}
                    activeId={activeId}
                    onSelect={onSelect}
                    isLast={true}
                  />
                </div>
              ))}
            </div>
          </SortableContext>
        )}
      </div>
      {!isLast && <Arrow />}
    </>
  );
}

function Arrow() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" className="shrink-0 text-white/15">
      <path d="M1 4 L6 4 M4 2 L6 4 L4 6" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  );
}
