import type { ChainNodeUI } from '../../api/types';
import { useChainStore } from '../../stores/chainStore';
import { ChainSlot } from './ChainSlot';
import { GroupContainer } from './GroupContainer';
import { ParallelBranchControls } from './ParallelBranchControls';

interface ChainNodeListProps {
  nodes: ChainNodeUI[];
  depth: number;
  isParallelParent?: boolean;
  onNodeSelect?: (e: React.MouseEvent, nodeId: number) => void;
  selectedIds?: Set<number>;
}

export function ChainNodeList({ nodes, depth, isParallelParent = false, onNodeSelect, selectedIds }: ChainNodeListProps) {
  const {
    openEditors,
    removeNode,
    toggleNodeBypass,
    togglePluginEditor,
  } = useChainStore();

  return (
    <div className="space-y-1.5">
      {nodes.map((node) => {
        if (node.type === 'group') {
          return (
            <div key={node.id}>
              {isParallelParent && (
                <ParallelBranchControls node={node} />
              )}
              <GroupContainer
                node={node}
                depth={depth}
                onNodeSelect={onNodeSelect}
                selectedIds={selectedIds}
              />
            </div>
          );
        }

        // Plugin leaf
        const isMultiSelected = selectedIds?.has(node.id) ?? false;
        return (
          <div
            key={node.id}
            className="flex items-center gap-1.5"
            onClick={onNodeSelect ? (e) => onNodeSelect(e, node.id) : undefined}
          >
            {isParallelParent && (
              <ParallelBranchControls node={node} />
            )}
            <div className="flex-1 min-w-0">
              <ChainSlot
                node={node}
                isEditorOpen={openEditors.has(node.id)}
                isMultiSelected={isMultiSelected}
                onRemove={() => removeNode(node.id)}
                onToggleBypass={() => toggleNodeBypass(node.id)}
                onToggleEditor={() => togglePluginEditor(node.id)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
