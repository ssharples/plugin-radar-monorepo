import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { ChainNodeUI, PluginNodeUI, GroupNodeUI } from '../api/types';

// ============================================
// Data interfaces for custom node types
// ============================================

export interface PluginNodeData {
  nodeType: 'plugin';
  chainNodeId: number;
  name: string;
  manufacturer: string;
  format: string;
  fileOrIdentifier: string;
  bypassed: boolean;
  muted: boolean;
  solo: boolean;
  branchGainDb: number;
  latency?: number;
  autoGainEnabled?: boolean;
  duckEnabled: boolean;
  isGhost?: boolean;
  category?: string;
  [key: string]: unknown;
}

export interface GroupHeaderNodeData {
  nodeType: 'groupHeader';
  chainNodeId: number;
  name: string;
  mode: 'serial' | 'parallel' | 'midside' | 'fxselector';
  bypassed: boolean;
  dryWet: number;
  branchCount: number;
  [key: string]: unknown;
}

export interface GroupMergeNodeData {
  nodeType: 'groupMerge';
  chainNodeId: number;
  mode: 'serial' | 'parallel' | 'midside' | 'fxselector';
  [key: string]: unknown;
}

export interface AddButtonNodeData {
  nodeType: 'addButton';
  parentId: number;
  insertIndex: number;
  [key: string]: unknown;
}

// ============================================
// Conversion logic
// ============================================

let _nodeIdCounter = 0;
function resetCounter() { _nodeIdCounter = 0; }
function nextId(prefix: string) { return `${prefix}_${_nodeIdCounter++}`; }

interface ConversionContext {
  nodes: Node[];
  edges: Edge[];
  ghostNodes?: ChainNodeUI[];
}

function isGhost(chainNodeId: number, ghostNodes?: ChainNodeUI[]): boolean {
  if (!ghostNodes) return false;
  return ghostNodes.some(g => g.id === chainNodeId);
}

function addPluginNode(
  ctx: ConversionContext,
  plugin: PluginNodeUI,
  selected: boolean,
  ghost: boolean,
): string {
  const rfId = nextId('plugin');
  const data: PluginNodeData = {
    nodeType: 'plugin',
    chainNodeId: plugin.id,
    name: plugin.name,
    manufacturer: plugin.manufacturer,
    format: plugin.format,
    fileOrIdentifier: plugin.fileOrIdentifier,
    bypassed: plugin.bypassed,
    muted: plugin.mute,
    solo: plugin.solo,
    branchGainDb: plugin.branchGainDb,
    latency: plugin.latency,
    autoGainEnabled: plugin.autoGainEnabled,
    duckEnabled: plugin.duckEnabled,
    isGhost: ghost,
  };
  ctx.nodes.push({
    id: rfId,
    type: 'pluginNode',
    position: { x: 0, y: 0 },
    data,
    selected,
  });
  return rfId;
}

function addAddNode(ctx: ConversionContext, parentId: number, insertIndex: number): string {
  const rfId = nextId('add');
  const data: AddButtonNodeData = {
    nodeType: 'addButton',
    parentId,
    insertIndex,
  };
  ctx.nodes.push({
    id: rfId,
    type: 'addNode',
    position: { x: 0, y: 0 },
    data,
  });
  return rfId;
}

function addEdge(ctx: ConversionContext, source: string, target: string, ghost: boolean, sourceHandle?: string, targetHandle?: string): void {
  ctx.edges.push({
    id: `e_${source}_${target}`,
    source,
    target,
    type: 'signalEdge',
    ...(sourceHandle ? { sourceHandle } : {}),
    ...(targetHandle ? { targetHandle } : {}),
    style: ghost ? { strokeDasharray: '4 4', opacity: 0.4 } : undefined,
  });
}

/**
 * Process a list of chain children (serial sequence).
 * Returns [firstNodeId, lastNodeId] for connecting to parent group header/merge.
 */
function processSerialChildren(
  ctx: ConversionContext,
  children: ChainNodeUI[],
  parentId: number,
  selectedNodeId: number | null,
): [string | null, string | null] {
  if (children.length === 0) return [null, null];

  let prevId: string | null = null;
  let firstId: string | null = null;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const ghost = isGhost(child.id, ctx.ghostNodes);

    // Add "+" button before each child (except first, which gets handled by the header)
    if (i > 0) {
      const addId = addAddNode(ctx, parentId, i);
      if (prevId) addEdge(ctx, prevId, addId, false);
      prevId = addId;
    }

    let childFirstId: string;
    let childLastId: string;

    if (child.type === 'plugin') {
      const selected = child.id === selectedNodeId;
      childFirstId = addPluginNode(ctx, child, selected, ghost);
      childLastId = childFirstId;
    } else {
      // Nested group
      const [gFirst, gLast] = processGroup(ctx, child, selectedNodeId);
      if (!gFirst || !gLast) continue;
      childFirstId = gFirst;
      childLastId = gLast;
    }

    if (!firstId) firstId = childFirstId;
    if (prevId) addEdge(ctx, prevId, childFirstId, ghost);
    prevId = childLastId;
  }

  // Add trailing "+" button
  const trailAddId = addAddNode(ctx, parentId, children.length);
  if (prevId) addEdge(ctx, prevId, trailAddId, false);

  return [firstId, trailAddId];
}

/**
 * Process a group node: creates header, processes children, creates merge node.
 * Returns [headerNodeId, mergeNodeId].
 */
function processGroup(
  ctx: ConversionContext,
  group: GroupNodeUI,
  selectedNodeId: number | null,
): [string | null, string | null] {
  const headerId = nextId('header');
  const mergeId = nextId('merge');

  const branchCount = group.mode === 'parallel' || group.mode === 'midside'
    ? group.children.length
    : 1;

  const headerData: GroupHeaderNodeData = {
    nodeType: 'groupHeader',
    chainNodeId: group.id,
    name: group.name,
    mode: group.mode,
    bypassed: group.bypassed,
    dryWet: group.dryWet,
    branchCount,
  };

  ctx.nodes.push({
    id: headerId,
    type: 'groupHeaderNode',
    position: { x: 0, y: 0 },
    data: headerData,
  });

  const mergeData: GroupMergeNodeData = {
    nodeType: 'groupMerge',
    chainNodeId: group.id,
    mode: group.mode,
  };

  ctx.nodes.push({
    id: mergeId,
    type: 'groupMergeNode',
    position: { x: 0, y: 0 },
    data: mergeData,
  });

  if (group.mode === 'parallel' || group.mode === 'midside') {
    // Each child is a separate branch
    for (let branchIdx = 0; branchIdx < group.children.length; branchIdx++) {
      const child = group.children[branchIdx];
      const ghost = isGhost(child.id, ctx.ghostNodes);
      const sourceHandle = `branch-${branchIdx}`;
      const targetHandle = `branch-${branchIdx}`;

      if (child.type === 'plugin') {
        const selected = child.id === selectedNodeId;
        const plugId = addPluginNode(ctx, child, selected, ghost);
        addEdge(ctx, headerId, plugId, ghost, sourceHandle);
        addEdge(ctx, plugId, mergeId, ghost, undefined, targetHandle);
      } else if (child.type === 'group' && child.mode === 'serial') {
        // Serial sub-group inside a parallel branch: process children inline
        const [first, last] = processSerialChildren(ctx, child.children, child.id, selectedNodeId);
        if (first) addEdge(ctx, headerId, first, false, sourceHandle);
        if (last) addEdge(ctx, last, mergeId, false, undefined, targetHandle);
      } else {
        // Nested group within parallel branch
        const [gFirst, gLast] = processGroup(ctx, child, selectedNodeId);
        if (gFirst) addEdge(ctx, headerId, gFirst, ghost, sourceHandle);
        if (gLast) addEdge(ctx, gLast, mergeId, ghost, undefined, targetHandle);
      }
    }
  } else {
    // Serial group: chain children sequentially
    const [first, last] = processSerialChildren(ctx, group.children, group.id, selectedNodeId);
    if (first) addEdge(ctx, headerId, first, false);
    if (last) addEdge(ctx, last, mergeId, false);
  }

  return [headerId, mergeId];
}

/**
 * Convert the chain tree (root children) into ReactFlow nodes and edges.
 */
export function useChainToReactFlow(
  chainNodes: ChainNodeUI[],
  selectedNodeId: number | null,
  ghostNodes?: ChainNodeUI[],
): { nodes: Node[]; edges: Edge[] } {
  return useMemo(() => {
    resetCounter();

    const ctx: ConversionContext = {
      nodes: [],
      edges: [],
      ghostNodes,
    };

    if (chainNodes.length === 0) {
      // Empty chain — just show an add button
      addAddNode(ctx, 0, 0);
      return { nodes: ctx.nodes, edges: ctx.edges };
    }

    // The root is a serial sequence (root group id=0)
    // Process as serial children of the root
    processSerialChildren(ctx, chainNodes, 0, selectedNodeId);

    return { nodes: ctx.nodes, edges: ctx.edges };
  }, [chainNodes, selectedNodeId, ghostNodes]);
}
