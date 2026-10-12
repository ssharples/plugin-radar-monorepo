import type { ChainNodeUI } from '../../api/types';
import { useChainStore } from '../../stores/chainStore';
import { ChainSlot } from './ChainSlot';
import { GroupContainer } from './GroupContainer';
import { ParallelBranchControls } from './ParallelBranchControls';
import { DropZone } from './DropZone';
import { usePluginStore } from '../../stores/pluginStore';
import { normalizeCategory } from '../../constants/categoryColors';

interface ChainNodeListProps {
  nodes: ChainNodeUI[];
  depth: number;
  parentId: number;
  isParallelParent?: boolean;
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

export function ChainNodeList({
  nodes,
  depth,
  parentId,
  isParallelParent = false,
  onNodeSelect,
  selectedIds,
  isDragActive = false,
  draggedNodeId = null,
  shiftHeld = false,
  groupSelectMode = false,
  disabledDropIds,
  slotNumbers,
}: ChainNodeListProps) {
  const {
    openEditors,
    selectedNodeId,
    removeNode,
    toggleNodeBypass,
    togglePluginEditor,
  } = useChainStore();
  const enrichedData = usePluginStore((s) => s.enrichedData);
  const categoryFor = (uid: number | undefined) => {
    if (uid == null || !enrichedData) return null;
    return normalizeCategory(enrichedData.get(uid)?.category);
  };

  // Filter out the dragged node from display (it shows as overlay)
  const visibleNodes = nodes.filter(n => n.id !== draggedNodeId);

  const renderNode = (node: ChainNodeUI) =>
    node.type === 'group' ? (
      <GroupContainer
        node={node}
        depth={depth}
        parentId={parentId}
        onNodeSelect={onNodeSelect}
        selectedIds={selectedIds}
        isDragActive={isDragActive}
        draggedNodeId={draggedNodeId}
        shiftHeld={shiftHeld}
        groupSelectMode={groupSelectMode}
        disabledDropIds={disabledDropIds}
        slotNumbers={slotNumbers}
      />
    ) : (
      <div className={`transition-opacity duration-200 ${node.id === draggedNodeId ? 'opacity-30' : 'opacity-100'}`}>
        <ChainSlot
          node={node}
          slotNumber={slotNumbers?.get(node.id)}
          category={categoryFor(node.uid)}
          isEditorOpen={openEditors.has(node.id)}
          isMultiSelected={selectedIds?.has(node.id) ?? false}
          isSelected={selectedNodeId === node.id && !(selectedIds?.has(node.id) ?? false)}
          onRemove={() => removeNode(node.id)}
          onToggleBypass={() => toggleNodeBypass(node.id)}
          onToggleEditor={() => togglePluginEditor(node.id)}
          isDragActive={isDragActive}
          groupSelectMode={groupSelectMode}
          onSelect={onNodeSelect ? (e) => onNodeSelect(e, node.id) : undefined}
          disabledDropIds={disabledDropIds}
        />
      </div>
    );

  return (
    <div className="space-y-0">
      {/* Leading drop zone (before first node) */}
      <DropZone
        droppableId={`drop:${parentId}:0`}
        isParallelContext={isParallelParent}
        isDragActive={isDragActive}
        nodeBelowId={visibleNodes[0]?.id}
        shiftHeld={shiftHeld}
        disabled={disabledDropIds?.has(parentId) ?? false}
      />

      {visibleNodes.map((node, visualIndex) => {
        // Calculate the real insert index for the drop zone after this node.
        const realIndex = nodes.indexOf(node);
        const insertIndexAfter = realIndex + 1;
        const isLastNode = visualIndex === visibleNodes.length - 1;

        return (
          <div key={node.id}>
            {/* Signal flow connector line (before each node except first) */}
            {visualIndex > 0 && !isParallelParent && (
              <div className="flex pl-[46px] py-0">
                <div className={`w-px h-1.5 bg-plugin-border-bright transition-opacity duration-200 ${isDragActive ? 'opacity-50' : 'opacity-100'}`} />
              </div>
            )}

            {isParallelParent ? (
              /* Parallel branch lane: branch controls on top, content below */
              <div className="relative rounded-md bg-plugin-bg/40 border border-plugin-parallel/15 pl-2 pr-1 pt-1 pb-1">
                <div className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-plugin-parallel/50" />
                <ParallelBranchControls node={node} branchIndex={visualIndex} />
                <div className="mt-1">{renderNode(node)}</div>
              </div>
            ) : (
              renderNode(node)
            )}

            {/* Signal flow connector line (after last node, before output) */}
            {isLastNode && !isParallelParent && depth === 0 && (
              <div className="flex pl-[46px] py-0">
                <div className={`w-px h-1.5 bg-plugin-border-bright transition-opacity duration-200 ${isDragActive ? 'opacity-50' : 'opacity-100'}`} />
              </div>
            )}

            {/* Drop zone after this node */}
            <DropZone
              droppableId={`drop:${parentId}:${insertIndexAfter}`}
              isParallelContext={isParallelParent}
              isDragActive={isDragActive}
              nodeAboveId={node.id}
              nodeBelowId={visibleNodes[visualIndex + 1]?.id}
              shiftHeld={shiftHeld}
              disabled={disabledDropIds?.has(parentId) ?? false}
            />
          </div>
        );
      })}

      {/* Empty state when no visible nodes */}
      {visibleNodes.length === 0 && !isDragActive && (
        <div className="px-3 py-2 text-[11px] text-plugin-dim italic">
          Empty group
        </div>
      )}
    </div>
  );
}
