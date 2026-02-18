import type { ChainNodeUI, PluginNodeUI } from '../api/types';

/** Find any node by ID in the tree (recursive DFS). */
export function findNodeById(nodes: ChainNodeUI[], id: number): ChainNodeUI | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.type === 'group') {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** Find a plugin node specifically by ID (returns undefined if the node is a group). */
export function findPluginNode(nodes: ChainNodeUI[], id: number): PluginNodeUI | undefined {
  for (const node of nodes) {
    if (node.id === id && node.type === 'plugin') return node;
    if (node.type === 'group') {
      const found = findPluginNode(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** Return the path of group nodes from the root down to (and including) the target node. */
export function findNodePath(nodes: ChainNodeUI[], targetId: number): ChainNodeUI[] {
  for (const node of nodes) {
    if (node.id === targetId) return [node];
    if (node.type === 'group') {
      const subPath = findNodePath(node.children, targetId);
      if (subPath.length > 0) return [node, ...subPath];
    }
  }
  return [];
}

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
