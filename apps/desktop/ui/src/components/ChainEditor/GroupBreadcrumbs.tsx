import { ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { useChainStore } from '../../stores/chainStore';
import { findNodePath } from '../../utils/chainHelpers';
import type { GroupNodeUI } from '../../api/types';

interface GroupBreadcrumbsProps {
  /** The current group node ID to show the path to */
  groupId: number;
  /** Called when a breadcrumb is clicked */
  onNavigate?: (groupId: number) => void;
}

/**
 * Breadcrumb navigation for nested groups.
 * Shows: Root > Serial Group 1 > Parallel Group A
 * Click a breadcrumb to navigate/scroll to that group.
 */
export function GroupBreadcrumbs({ groupId, onNavigate }: GroupBreadcrumbsProps) {
  const nodes = useChainStore(s => s.nodes);

  // Build path from root to the target group (only group nodes)
  const path = useMemo(() => {
    const rawPath = findNodePath(nodes, groupId);
    return rawPath
      .filter((n): n is GroupNodeUI => n.type === 'group')
      .map(n => ({ id: n.id, name: n.name, mode: n.mode }));
  }, [nodes, groupId]);

  if (path.length <= 1) return null; // Don't show breadcrumbs for top-level groups

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 overflow-x-auto scrollbar-hide">
      {/* Root indicator */}
      <button
        onClick={() => onNavigate?.(0)}
        className="text-xxs font-bold flex-shrink-0"
        style={{
          fontFamily: 'var(--font-mono)',
          textTransform: 'uppercase' as const,
          letterSpacing: 'var(--tracking-wide)',
          color: 'var(--color-text-tertiary)',
          transition: 'color var(--duration-fast) var(--ease-snap)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#deff0a'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
      >
        ROOT
      </button>

      {path.map((item, idx) => {
        const isLast = idx === path.length - 1;
        const color = item.mode === 'parallel' ? '#5a7842' : '#c9944a';

        return (
          <div key={item.id} className="flex items-center gap-0.5 flex-shrink-0">
            <ChevronRight
              className="w-2.5 h-2.5"
              style={{ color: 'var(--color-text-tertiary)', opacity: 0.5 }}
            />
            <button
              onClick={() => !isLast && onNavigate?.(item.id)}
              className="text-xxs font-bold"
              style={{
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase' as const,
                letterSpacing: 'var(--tracking-wide)',
                color: isLast ? color : 'var(--color-text-tertiary)',
                cursor: isLast ? 'default' : 'pointer',
                transition: 'color var(--duration-fast) var(--ease-snap)',
              }}
              onMouseEnter={(e) => { if (!isLast) e.currentTarget.style.color = '#deff0a'; }}
              onMouseLeave={(e) => { if (!isLast) e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
            >
              {item.name}
            </button>
          </div>
        );
      })}
    </div>
  );
}
