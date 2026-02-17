import type { ChainNodeUI } from '../api/types';

/** Collect all plugin nodes from the tree in DFS order (excludes dry path nodes) */
export function collectPlugins(nodes: ChainNodeUI[]): { id: number; name: string }[] {
  const result: { id: number; name: string }[] = [];
  const walk = (list: ChainNodeUI[]) => {
    for (const node of list) {
      if (node.type === 'plugin' && !node.isDryPath) {
        result.push({ id: node.id, name: node.name });
      } else if (node.type === 'group') {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return result;
}

/** Find a node's parent ID and index within that parent */
export function findNodeParentInfo(
  nodes: ChainNodeUI[],
  targetId: number,
  parentId: number = 0
): { parentId: number; index: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.id === targetId) {
      return { parentId, index: i };
    }
    if (node.type === 'group') {
      const found = findNodeParentInfo(node.children, targetId, node.id);
      if (found) return found;
    }
  }
  return null;
}
