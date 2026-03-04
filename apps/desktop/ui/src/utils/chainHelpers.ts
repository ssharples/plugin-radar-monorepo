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

/**
 * Find the index of a node within its parent's children array.
 * Returns -1 if not found.
 */
export function findIndexInParent(allNodes: ChainNodeUI[], nodeId: number, parentId: number): number {
  const parentChildren = parentId === 0
    ? allNodes
    : (() => {
      const parent = findNodeById(allNodes, parentId);
      return parent?.type === 'group' ? parent.children : [];
    })();

  return parentChildren.findIndex(n => n.id === nodeId);
}

/**
 * Check if potentialAncestorId is an ancestor of (or equal to) targetId in the tree.
 * Used to prevent dropping a group into itself or its descendants.
 */
export function isAncestorOf(nodes: ChainNodeUI[], potentialAncestorId: number, targetId: number): boolean {
  if (potentialAncestorId === targetId) return true;
  const ancestor = findNodeById(nodes, potentialAncestorId);
  if (!ancestor || ancestor.type !== 'group') return false;
  // Search the ancestor's subtree for targetId
  for (const child of ancestor.children) {
    if (containsNodeId(child, targetId)) return true;
  }
  return false;
}

/** Check if a node or any of its descendants has the given ID */
export function containsNodeId(node: ChainNodeUI, targetId: number): boolean {
  if (node.id === targetId) return true;
  if (node.type === 'group') {
    for (const child of node.children) {
      if (containsNodeId(child, targetId)) return true;
    }
  }
  return false;
}

/**
 * Collect all node IDs in a subtree (including the root node itself).
 * Used to build the set of disabled drop target IDs.
 */
export function collectSubtreeIds(node: ChainNodeUI, ids: Set<number>): void {
  ids.add(node.id);
  if (node.type === 'group') {
    for (const child of node.children) {
      collectSubtreeIds(child, ids);
    }
  }
}

/**
 * Compute a map of nodeId → 1-based DFS slot number for all plugin nodes.
 */
export function computeSlotNumbers(nodes: ChainNodeUI[]): Map<number, number> {
  const map = new Map<number, number>();
  let counter = 1;
  function dfs(nodes: ChainNodeUI[]) {
    for (const node of nodes) {
      if (node.type === 'plugin') {
        map.set(node.id, counter++);
      } else if (node.type === 'group') {
        dfs(node.children);
      }
    }
  }
  dfs(nodes);
  return map;
}

export function countPluginsInTree(nodes: ChainNodeUI[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === 'plugin') count++;
    else if (node.type === 'group') count += countPluginsInTree(node.children);
  }
  return count;
}

/**
 * Find the parent group of a given node ID.
 * Returns null for root-level nodes (parent is implicit root).
 */
export function findParentOf(nodes: ChainNodeUI[], targetId: number, parent?: ChainNodeUI): ChainNodeUI | null {
  for (const node of nodes) {
    if (node.id === targetId) return parent ?? null;
    if (node.type === 'group') {
      const found = findParentOf(node.children, targetId, node);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Check if a node is inside a parallel group (i.e. its parent is a parallel group).
 * Returns false for root-level nodes or nodes inside serial groups.
 */
export function isNodeInParallelGroup(nodes: ChainNodeUI[], nodeId: number): boolean {
  const parent = findParentOf(nodes, nodeId);
  if (!parent || parent.type !== 'group') return false;
  return parent.mode === 'parallel';
}

/**
 * Find the adjacent node ID at a given insert position within a parent.
 * Used for shift+drop group creation — returns the node that would be
 * "next to" the drop position.
 */
export function findAdjacentNodeId(
  allNodes: ChainNodeUI[],
  parentId: number,
  insertIndex: number,
): number | null {
  const parentChildren = parentId === 0
    ? allNodes
    : (() => {
      const parent = findNodeById(allNodes, parentId);
      return parent?.type === 'group' ? parent.children : [];
    })();

  // Prefer the node just before the insert index, fall back to the one after
  if (insertIndex > 0 && parentChildren[insertIndex - 1]) {
    return parentChildren[insertIndex - 1].id;
  }
  if (parentChildren[insertIndex]) {
    return parentChildren[insertIndex].id;
  }
  return null;
}
