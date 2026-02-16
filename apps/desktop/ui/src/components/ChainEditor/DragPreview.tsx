import type { ChainNodeUI } from '../../api/types';

interface DragPreviewProps {
  node: ChainNodeUI;
}

/**
 * Drag overlay preview rendered at cursor position during drag.
 * Cyber design with neon glow.
 */
export function DragPreview({ node }: DragPreviewProps) {
  if (node.type === 'plugin') {
    return (
      <div
        className="animate-scale-in drag-preview-active pointer-events-none opacity-90"
        style={{
          width: 447,
          minHeight: 42,
          filter: 'drop-shadow(0 4px 16px rgba(222, 255, 10, 0.4))'
        }}
      >
        <div
          className="relative flex items-center gap-2 px-3 py-2 rounded"
          style={{
            background: 'linear-gradient(135deg, rgba(10, 10, 10, 0.95) 0%, rgba(15, 15, 15, 0.95) 100%)',
            border: '1px solid rgba(222, 255, 10, 0.5)',
            boxShadow: '0 0 20px rgba(222, 255, 10, 0.3), inset 0 1px 0 rgba(222, 255, 10, 0.1)',
          }}
        >
          {/* Plugin name */}
          <div
            className="font-mono font-bold uppercase truncate"
            style={{
              fontSize: '14px',
              letterSpacing: '0.05em',
              color: '#deff0a',
              textShadow: '0 0 8px rgba(222, 255, 10, 0.5)',
            }}
          >
            {node.name}
          </div>

          {/* Manufacturer badge */}
          {node.manufacturer && (
            <div
              className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase whitespace-nowrap"
              style={{
                background: 'rgba(222, 255, 10, 0.12)',
                color: 'rgba(222, 255, 10, 0.7)',
                border: '1px solid rgba(222, 255, 10, 0.2)',
              }}
            >
              {node.manufacturer}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (node.type === 'group') {
    const isParallel = node.mode === 'parallel';
    const accentColor = isParallel ? 'var(--color-accent-cyan)' : 'var(--color-status-warning)';
    const accentBg = isParallel ? 'rgba(222, 255, 10, 0.06)' : 'rgba(255, 170, 0, 0.06)';
    const accentBorder = isParallel ? 'rgba(222, 255, 10, 0.4)' : 'rgba(255, 170, 0, 0.4)';
    const childCount = countPlugins(node.children);

    return (
      <div
        className="rounded-lg animate-scale-in drag-preview-active w-[220px] pointer-events-none"
        style={{
          border: `1px solid ${accentBorder}`,
          background: accentBg,
          filter: `drop-shadow(0 4px 16px ${isParallel ? 'rgba(222, 255, 10, 0.3)' : 'rgba(255, 170, 0, 0.3)'})`,
        }}
      >
        <div className="flex items-center gap-2 px-2.5 py-1.5">
          <span
            className="text-[11px] font-bold"
            style={{
              fontFamily: 'var(--font-mono)',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase' as const,
              color: accentColor,
            }}
          >
            {isParallel ? '||' : '>'} {node.name}
          </span>
          <span
            className="text-[11px] ml-auto"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-tertiary)',
            }}
          >
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
