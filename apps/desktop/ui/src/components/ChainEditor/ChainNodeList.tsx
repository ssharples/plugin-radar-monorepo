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
  groupSelectMode?: boolean;
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
        const realIndex = nodes.indexOf(node);
        const insertIndexAfter = realIndex + 1;
        const isLastNode = visualIndex === visibleNodes.length - 1;

        return (
          <div key={node.id}>
            {/* Signal flow connector line (before each node except first) */}
            {visualIndex > 0 && !isParallelParent && (
              <div className="flex justify-center py-0">
                <div className="w-px h-1.5 bg-plugin-border-bright" />
              </div>
            )}

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
                  groupSelectMode={groupSelectMode}
                />
              </div>
            ) : (
              <div
                className={`
                  flex items-center gap-1.5 transition-opacity duration-200
                  ${node.id === draggedNodeId ? 'opacity-30' : 'opacity-100'}
                `}
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
                    groupSelectMode={groupSelectMode}
                    onSelect={onNodeSelect ? (e) => onNodeSelect(e, node.id) : undefined}
                  />
                </div>
              </div>
            )}

            {/* Signal flow connector line (after last node, before output) */}
            {isLastNode && !isParallelParent && depth === 0 && (
              <div className="flex justify-center py-0">
                <div className="w-px h-1.5 bg-plugin-border-bright" />
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
