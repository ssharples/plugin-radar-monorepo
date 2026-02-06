import { GripVertical } from 'lucide-react';
import type { ChainNodeUI } from '../../api/types';

interface DragPreviewProps {
  node: ChainNodeUI;
}

/**
 * Drag overlay preview rendered at cursor position during drag.
 * Shows a compact, elevated version of the plugin/group being dragged.
 */
export function DragPreview({ node }: DragPreviewProps) {
  if (node.type === 'plugin') {
    return (
      <div
        className="
          flex items-center gap-2 p-2 rounded-lg border
          bg-plugin-bg border-plugin-accent
          shadow-lg shadow-plugin-accent/20
          opacity-90 backdrop-blur-sm
          w-[280px] pointer-events-none
        "
        style={{ transform: 'rotate(1.5deg)' }}
      >
        {/* Drag handle icon */}
        <div className="flex-shrink-0 p-1 rounded text-plugin-accent">
          <GripVertical className="w-4 h-4" />
        </div>

        {/* Plugin info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate text-plugin-text font-medium">
            {node.name}
          </p>
          <p className="text-xs text-plugin-muted truncate">
            {node.manufacturer} {node.format && `• ${node.format}`}
          </p>
        </div>
      </div>
    );
  }

  if (node.type === 'group') {
    const isParallel = node.mode === 'parallel';
    const accentColor = isParallel ? 'border-orange-500' : 'border-blue-500';
    const bgColor = isParallel ? 'bg-orange-500/5' : 'bg-blue-500/5';
    const childCount = countPlugins(node.children);

    return (
      <div
        className={`
          rounded-lg border ${accentColor} ${bgColor}
          shadow-lg shadow-plugin-accent/20
          opacity-90 backdrop-blur-sm
          w-[280px] pointer-events-none
        `}
        style={{ transform: 'rotate(1.5deg)' }}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex-shrink-0 p-1 rounded text-plugin-accent">
            <GripVertical className="w-4 h-4" />
          </div>
          <span className={`text-xs font-medium ${isParallel ? 'text-orange-400' : 'text-blue-400'}`}>
            {isParallel ? '||' : '>'} {node.name}
          </span>
          <span className="text-xs text-plugin-muted ml-auto">
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
