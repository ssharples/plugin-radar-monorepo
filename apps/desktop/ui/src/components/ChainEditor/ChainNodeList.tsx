import type { ChainNodeUI } from '../../api/types';
import { useMemo, useCallback } from 'react';
import { useChainStore, useChainActions } from '../../stores/chainStore';
import { ChainSlotCyber } from './ChainSlotCyber';
import { GroupContainer } from './GroupContainer';
import { ParallelBranchControls } from './ParallelBranchControls';
import { DropZone } from './DropZone';
import { InlinePluginSearch } from './InlinePluginSearch';

interface ChainNodeListProps {
  nodes: ChainNodeUI[];
  depth: number;
  parentId: number;
  isParallelParent?: boolean;
  onNodeSelect?: (e: React.MouseEvent, nodeId: number) => void;
  selectedIds?: Set<number>;
  isDragActive?: boolean;
  draggedNodeId?: number | null;
  groupSelectMode?: boolean;
  /** Set of node IDs whose drop targets should be disabled (self-drop prevention) */
  disabledDropIds?: Set<number>;
  /** Map of nodeId → 1-based DFS plugin slot number */
  slotNumbers?: Map<number, number>;
  /** ID of the group the dragged node originated from (for "detach" visual) */
  sourceGroupId?: number | null;
  /** ID of a group currently animating its collapse before dissolve */
  dissolvingGroupId?: number | null;
}

export function ChainNodeList({
  nodes,
  depth,
  parentId,
  isParallelParent = false,
  onNodeSelect,
  selectedIds,
  isDragActive = false,
  draggedNodeId = null,
  groupSelectMode = false,
  disabledDropIds,
  slotNumbers,
  sourceGroupId = null,
  dissolvingGroupId = null,
}: ChainNodeListProps) {
  const openEditors = useChainStore(s => s.openEditors);
  const selectedNodeId = useChainStore(s => s.selectedNodeId);
  const inlineSearchState = useChainStore(s => s.inlineSearchState);

  const { removeNode, toggleNodeBypass, togglePluginEditor, openInlineEditor, hideInlineSearch } = useChainActions();

  // Filter out the dragged node from display (it shows as overlay)
  const visibleNodes = nodes.filter(n => n.id !== draggedNodeId);

  // Check if any plugin is soloed (recursively check all nodes)
  const hasSoloedPlugin = useMemo(() => {
    const checkSolo = (nodeList: ChainNodeUI[]): boolean => {
      for (const node of nodeList) {
        if (node.type === 'plugin' && node.solo) return true;
        if (node.type === 'group' && checkSolo(node.children)) return true;
      }
      return false;
    };
    return checkSolo(nodes);
  }, [nodes]);

  // Helper: Get the highest slot number in a node's subtree
  const getLastSlotInSubtree = (node: ChainNodeUI): number | null => {
    if (node.type === 'plugin') {
      return slotNumbers?.get(node.id) ?? null;
    }
    if (node.type === 'group' && node.children.length > 0) {
      let maxSlot: number | null = null;
      for (const child of node.children) {
        const childSlot = getLastSlotInSubtree(child);
        if (childSlot !== null && (maxSlot === null || childSlot > maxSlot)) {
          maxSlot = childSlot;
        }
      }
      return maxSlot;
    }
    return null;
  };

  return (
    <div className={`space-y-0 ${hasSoloedPlugin ? 'plugins-soloed' : ''}`}>
      {/* Leading drop zone (before first node) */}
      <DropZone
        droppableId={`drop:${parentId}:0`}
        isParallelContext={isParallelParent}
        isDragActive={isDragActive}
        disabled={disabledDropIds?.has(parentId) ?? false}
        parentId={parentId}
        insertIndex={0}
        slotNumber={1}
      />

      {visibleNodes.map((node, visualIndex) => {
        // Calculate the real insert index for the drop zone after this node.
        const realIndex = nodes.indexOf(node);
        const insertIndexAfter = realIndex + 1;

        // Calculate slot number for drop zone after this node
        const lastSlotInNode = getLastSlotInSubtree(node);
        const dropSlotNumber = lastSlotInNode !== null ? lastSlotInNode + 1 : 1;

        return (
          <div
            key={node.id}
            style={{
              transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {node.type === 'group' ? (
              <div>
                {isParallelParent && (
                  <ParallelBranchControls node={node} />
                )}
                <GroupContainer
                  node={node}
                  depth={depth}
                  parentId={parentId}
                  onNodeSelect={onNodeSelect}
                  selectedIds={selectedIds}
                  isDragActive={isDragActive}
                  draggedNodeId={draggedNodeId}
                  groupSelectMode={groupSelectMode}
                  disabledDropIds={disabledDropIds}
                  slotNumbers={slotNumbers}
                  isSourceGroup={sourceGroupId === node.id}
                  sourceGroupId={sourceGroupId}
                  isDissolvingGroup={dissolvingGroupId === node.id}
                  dissolvingGroupId={dissolvingGroupId}
                />
              </div>
            ) : (
              <div
                className={`
                  flex items-center gap-1.5 dim-during-drag
                  ${isDragActive && node.id !== draggedNodeId ? 'is-dimmed' : ''}
                `}
              >
                {isParallelParent && (
                  <ParallelBranchControls node={node} />
                )}
                <div className="flex-1 min-w-0">
                  <ChainSlotCyberWrapper
                    node={node}
                    slotNumber={slotNumbers?.get(node.id)}
                    isEditorOpen={openEditors.has(node.id)}
                    isMultiSelected={selectedIds?.has(node.id) ?? false}
                    isSelected={selectedNodeId === node.id && !(selectedIds?.has(node.id) ?? false)}
                    removeNode={removeNode}
                    toggleNodeBypass={toggleNodeBypass}
                    togglePluginEditor={togglePluginEditor}
                    openInlineEditor={openInlineEditor}
                    isDragActive={isDragActive}
                    groupSelectMode={groupSelectMode}
                    onNodeSelect={onNodeSelect}
                    disabledDropIds={disabledDropIds}
                    parentId={parentId}
                    indexInParent={realIndex}
                  />
                </div>
              </div>
            )}

            {/* Drop zone after this node */}
            <DropZone
              droppableId={`drop:${parentId}:${insertIndexAfter}`}
              isParallelContext={isParallelParent}
              isDragActive={isDragActive}
              disabled={disabledDropIds?.has(parentId) ?? false}
              parentId={parentId}
              insertIndex={insertIndexAfter}
              slotNumber={dropSlotNumber}
            />

            {/* Inline plugin search - shown between nodes */}
            {inlineSearchState?.nodeId === node.id && (
              <div className="my-2">
                <InlinePluginSearch
                  parentId={inlineSearchState.parentId}
                  insertIndex={inlineSearchState.insertIndex}
                  onPluginAdded={hideInlineSearch}
                  onClose={hideInlineSearch}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Empty state when no visible nodes */}
      {visibleNodes.length === 0 && !isDragActive && (
        <div className="px-3 py-2 text-xxs text-plugin-muted italic">
          Empty group
        </div>
      )}
    </div>
  );
}

/** Wrapper to avoid creating inline closures per-node in ChainNodeList */
function ChainSlotCyberWrapper({
  node,
  slotNumber,
  isEditorOpen,
  isMultiSelected,
  isSelected,
  removeNode,
  toggleNodeBypass,
  togglePluginEditor,
  openInlineEditor,
  isDragActive,
  groupSelectMode,
  onNodeSelect,
  disabledDropIds,
  parentId,
  indexInParent,
}: {
  node: ChainNodeUI;
  slotNumber?: number;
  isEditorOpen: boolean;
  isMultiSelected: boolean;
  isSelected: boolean;
  removeNode: (id: number) => void;
  toggleNodeBypass: (id: number) => void;
  togglePluginEditor: (id: number) => void;
  openInlineEditor: (id: number) => Promise<void>;
  isDragActive: boolean;
  groupSelectMode: boolean;
  onNodeSelect?: (e: React.MouseEvent, nodeId: number) => void;
  disabledDropIds?: Set<number>;
  parentId: number;
  indexInParent: number;
}) {
  const handleRemove = useCallback(() => removeNode(node.id), [removeNode, node.id]);
  const handleToggleBypass = useCallback(() => toggleNodeBypass(node.id), [toggleNodeBypass, node.id]);
  const handleToggleEditor = useCallback(() => togglePluginEditor(node.id), [togglePluginEditor, node.id]);
  const handleOpenInline = useCallback(() => openInlineEditor(node.id), [openInlineEditor, node.id]);
  const handleSelect = useCallback(
    (e: React.MouseEvent) => onNodeSelect?.(e, node.id),
    [onNodeSelect, node.id]
  );

  return (
    <ChainSlotCyber
      node={node}
      slotNumber={slotNumber}
      isEditorOpen={isEditorOpen}
      isMultiSelected={isMultiSelected}
      isSelected={isSelected}
      onRemove={handleRemove}
      onToggleBypass={handleToggleBypass}
      onToggleEditor={handleToggleEditor}
      onOpenInline={handleOpenInline}
      isDragActive={isDragActive}
      groupSelectMode={groupSelectMode}
      onSelect={onNodeSelect ? handleSelect : undefined}
      disabledDropIds={disabledDropIds}
      parentId={parentId}
      indexInParent={indexInParent}
    />
  );
}
