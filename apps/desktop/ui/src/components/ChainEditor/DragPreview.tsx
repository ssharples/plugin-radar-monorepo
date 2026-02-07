import { GripVertical } from 'lucide-react';
import type { ChainNodeUI } from '../../api/types';

interface DragPreviewProps {
  node: ChainNodeUI;
}

/**
 * Drag overlay preview rendered at cursor position during drag.
 * Compact, elevated card at 70% scale with soft shadow.
 */
export function DragPreview({ node }: DragPreviewProps) {
  if (node.type === 'plugin') {
    return (
      <div
        className="
          flex items-center gap-2 p-1.5 rounded-lg border
          bg-plugin-bg/95 border-plugin-accent/60
          shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)]
          backdrop-blur-sm
          w-[220px] pointer-events-none
        "
      >
        <div className="flex-shrink-0 p-0.5 rounded text-plugin-accent">
          <GripVertical className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] truncate text-plugin-text font-medium">
            {node.name}
          </p>
          <p className="text-[11px] text-plugin-muted truncate">
            {node.manufacturer} {node.format && `· ${node.format}`}
          </p>
        </div>
      </div>
    );
  }

  if (node.type === 'group') {
    const isParallel = node.mode === 'parallel';
    const accentColor = isParallel ? 'border-plugin-parallel/60' : 'border-plugin-serial/60';
    const bgColor = isParallel ? 'bg-plugin-parallel/5' : 'bg-plugin-serial/5';
    const childCount = countPlugins(node.children);

    return (
      <div
        className={`
          rounded-lg border ${accentColor} ${bgColor}
          shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)]
          backdrop-blur-sm
          w-[220px] pointer-events-none
        `}
      >
        <div className="flex items-center gap-2 px-2.5 py-1.5">
          <div className="flex-shrink-0 p-0.5 rounded text-plugin-muted">
            <GripVertical className="w-3.5 h-3.5" />
          </div>
          <span className={`text-[11px] font-medium ${isParallel ? 'text-plugin-parallel' : 'text-plugin-serial'}`}>
            {isParallel ? '||' : '>'} {node.name}
          </span>
          <span className="text-[11px] text-plugin-muted ml-auto">
            {childCount} plugin{childCount !== 1 ? 's' : ''}
          </span>
        </div>
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
