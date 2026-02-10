import type { ChainNodeUI } from '../../api/types';
import rackBg from '../../assets/individual-plugin-rack.png';

interface DragPreviewProps {
  node: ChainNodeUI;
}

/**
 * Drag overlay preview rendered at cursor position during drag.
 * Uses the rack PNG at reduced scale.
 */
export function DragPreview({ node }: DragPreviewProps) {
  if (node.type === 'plugin') {
    return (
      <div
        className="
          rounded-sm overflow-hidden animate-scale-in
          shadow-[0_4px_24px_rgba(137,87,42,0.3),0_0_0_1px_rgba(255,255,255,0.05)]
          w-[300px] pointer-events-none
        "
        style={{
          height: 46,
          backgroundImage: `url(${rackBg})`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <div className="flex items-center gap-2 px-5 py-1.5">
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-mono uppercase truncate text-white font-medium">
              {node.name}
            </p>
            <p className="text-[10px] font-mono text-white/60 truncate">
              {node.manufacturer}
            </p>
          </div>
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
          rounded-lg border ${accentColor} ${bgColor} animate-scale-in
          shadow-[0_4px_24px_rgba(137,87,42,0.3),0_0_0_1px_rgba(255,255,255,0.05)]
          backdrop-blur-sm
          w-[220px] pointer-events-none
        `}
      >
        <div className="flex items-center gap-2 px-2.5 py-1.5">
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
