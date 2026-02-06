import { ChevronDown, ChevronRight, Layers, GitBranch, X } from 'lucide-react';
import { useChainStore } from '../../stores/chainStore';
import type { GroupNodeUI, ChainNodeUI } from '../../api/types';
import { ChainNodeList } from './ChainNodeList';

interface GroupContainerProps {
  node: GroupNodeUI;
  depth: number;
  onNodeSelect?: (e: React.MouseEvent, nodeId: number) => void;
  selectedIds?: Set<number>;
}

export function GroupContainer({ node, depth, onNodeSelect, selectedIds }: GroupContainerProps) {
  const {
    setGroupMode,
    setGroupDryWet,
    dissolveGroup,
    removeNode,
    toggleGroupCollapsed,
  } = useChainStore();

  const isSerial = node.mode === 'serial';
  const isParallel = node.mode === 'parallel';
  const borderColor = isSerial ? 'border-blue-500/30' : 'border-orange-500/30';
  const bgColor = isSerial ? 'bg-blue-500/5' : 'bg-orange-500/5';
  const childCount = countNodes(node.children);

  return (
    <div
      className={`rounded-lg border ${borderColor} ${bgColor} overflow-hidden`}
      style={{ marginLeft: depth > 0 ? 8 : 0 }}
    >
      {/* Group Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Collapse toggle */}
        <button
          onClick={() => toggleGroupCollapsed(node.id)}
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
        <div className="flex items-center bg-plugin-bg rounded overflow-hidden border border-plugin-border" onClick={(e) => e.stopPropagation()}>
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
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <span className="text-xxs text-plugin-muted">D/W</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={node.dryWet}
              onChange={(e) => setGroupDryWet(node.id, parseFloat(e.target.value))}
              className="w-12 h-1 accent-blue-400 cursor-pointer"
              title={`Dry/Wet: ${Math.round(node.dryWet * 100)}%`}
            />
            <span className="text-xxs text-plugin-muted w-7 text-right tabular-nums">
              {Math.round(node.dryWet * 100)}%
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
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
            <div className="px-3 py-2 text-xxs text-plugin-muted italic">
              Empty group
            </div>
          ) : (
            <ChainNodeList
              nodes={node.children}
              depth={depth + 1}
              isParallelParent={isParallel}
              onNodeSelect={onNodeSelect}
              selectedIds={selectedIds}
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
