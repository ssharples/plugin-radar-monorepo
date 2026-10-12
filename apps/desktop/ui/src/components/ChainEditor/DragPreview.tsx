import { GripVertical, Layers, GitBranch } from 'lucide-react';
import type { ChainNodeUI } from '../../api/types';

interface DragPreviewProps {
  node: ChainNodeUI;
}

/**
 * Drag overlay preview rendered at the cursor during a drag.
 */
export function DragPreview({ node }: DragPreviewProps) {
  if (node.type === 'plugin') {
    return (
      <div className="w-[300px] h-11 flex items-center gap-2 pl-1.5 pr-3 rounded-lg bg-plugin-raised border border-plugin-accent/60 shadow-panel animate-scale-in pointer-events-none">
        <GripVertical className="w-3.5 h-3.5 text-plugin-dim" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold truncate text-plugin-text leading-tight">{node.name}</p>
          <p className="text-[11px] text-plugin-muted truncate leading-tight">{node.manufacturer}</p>
        </div>
      </div>
    );
  }

  if (node.type === 'group') {
    const isParallel = node.mode === 'parallel';
    const childCount = countPlugins(node.children);
    const Icon = isParallel ? GitBranch : Layers;

    return (
      <div
        className={`w-[240px] h-10 flex items-center gap-2 px-3 rounded-lg bg-plugin-raised border shadow-panel animate-scale-in pointer-events-none ${
          isParallel ? 'border-plugin-parallel/60' : 'border-plugin-serial/60'
        }`}
      >
        <Icon className={`w-3.5 h-3.5 ${isParallel ? 'text-plugin-parallel' : 'text-plugin-serial'}`} />
        <span className="text-[13px] font-semibold text-plugin-text truncate">{node.name}</span>
        <span className="text-[11px] text-plugin-muted ml-auto whitespace-nowrap">
          {childCount} plugin{childCount !== 1 ? 's' : ''}
        </span>
      </div>
    );
  }

  return null;
}

function countPlugins(nodes: ChainNodeUI[]): number {
  let count = 0;
  for (const n of nodes) {
    if (n.type === 'plugin') count++;
    else if (n.type === 'group') count += countPlugins(n.children);
  }
  return count;
}
