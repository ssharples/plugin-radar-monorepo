import type { ChainNodeUI } from '../../api/types';
import { useChainStore } from '../../stores/chainStore';
import { ChainSlot } from './ChainSlot';
import { GroupContainer } from './GroupContainer';
import { ParallelBranchControls } from './ParallelBranchControls';
import { DropZone } from './DropZone';

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
}: ChainNodeListProps) {
  const {
    openEditors,
    selectedNodeId,
    removeNode,
    toggleNodeBypass,
    togglePluginEditor,
  } = useChainStore();

  // Filter out the dragged node from display (it shows as overlay)
  const visibleNodes = nodes.filter(n => n.id !== draggedNodeId);

  return (
    <div className="space-y-0">
      {/* Leading drop zone (before first node) */}
      <DropZone
        droppableId={`drop:${parentId}:0`}
        isParallelContext={isParallelParent}
        isDragActive={isDragActive}
        nodeBelowId={visibleNodes[0]?.id}
        shiftHeld={shiftHeld}
      />

      {visibleNodes.map((node, visualIndex) => {
        // Calculate the real insert index for the drop zone after this node.
        // We need the original index in the parent's children array.
        const realIndex = nodes.indexOf(node);
        const insertIndexAfter = realIndex + 1;

        return (
          <div key={node.id}>
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
                  shiftHeld={shiftHeld}
                />
              </div>
            ) : (
              <div
                className={`
                  flex items-center gap-1.5 transition-opacity duration-200
                  ${node.id === draggedNodeId ? 'opacity-30' : 'opacity-100'}
                `}
                onClick={onNodeSelect ? (e) => onNodeSelect(e, node.id) : undefined}
              >
                {isParallelParent && (
                  <ParallelBranchControls node={node} />
                )}
                <div className="flex-1 min-w-0">
                  <ChainSlot
                    node={node}
                    isEditorOpen={openEditors.has(node.id)}
                    isMultiSelected={selectedIds?.has(node.id) ?? false}
                    isSelected={selectedNodeId === node.id && !(selectedIds?.has(node.id) ?? false)}
                    onRemove={() => removeNode(node.id)}
                    onToggleBypass={() => toggleNodeBypass(node.id)}
                    onToggleEditor={() => togglePluginEditor(node.id)}
                    isDragActive={isDragActive}
                  />
                </div>
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
            />
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
