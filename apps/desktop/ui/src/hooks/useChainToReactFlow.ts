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
  branchCount: number;
  [key: string]: unknown;
}

export interface AddButtonNodeData {
  nodeType: 'addButton';
  parentId: number;
  insertIndex: number;
  [key: string]: unknown;
}

// ============================================
// Conversion logic — deterministic IDs from chain node IDs
// ============================================

interface ConversionContext {
  nodes: Node[];
  edges: Edge[];
  ghostNodes?: ChainNodeUI[];
  /** Whether we're inside a parallel branch (suppresses trailing + buttons) */
  inParallelBranch: boolean;
}

function isGhost(chainNodeId: number, ghostNodes?: ChainNodeUI[]): boolean {
  if (!ghostNodes) return false;
  return ghostNodes.some(g => g.id === chainNodeId);
}

function ghostSuffix(ghost: boolean): string {
  return ghost ? '-ghost' : '';
}

function addPluginNode(
  ctx: ConversionContext,
  plugin: PluginNodeUI,
  selected: boolean,
  ghost: boolean,
): string {
  const rfId = `plugin-${plugin.id}${ghostSuffix(ghost)}`;
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
    // category: looked up from pluginStore at render time if needed
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
  const rfId = `add-${parentId}-${insertIndex}`;
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
 * Returns [firstNodeId, lastRealNodeId] for connecting to parent group header/merge.
 * Add buttons are placed between nodes but NOT as the last returned ID,
 * so parent parallel branches connect directly to the last real node.
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
  let lastRealId: string | null = null;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const ghost = isGhost(child.id, ctx.ghostNodes);

    // Add "+" button between children (not before the first)
    if (i > 0 && !ctx.inParallelBranch) {
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
    lastRealId = childLastId;
  }

  // Add trailing "+" button only at root / serial group level (not inside parallel branches)
  if (!ctx.inParallelBranch) {
    const trailAddId = addAddNode(ctx, parentId, children.length);
    if (prevId) addEdge(ctx, prevId, trailAddId, false);
  }

  return [firstId, lastRealId];
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
  const ghost = isGhost(group.id, ctx.ghostNodes);
  const headerId = `group-header-${group.id}${ghostSuffix(ghost)}`;
  const mergeId = `group-merge-${group.id}${ghostSuffix(ghost)}`;

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
    branchCount,
  };

  ctx.nodes.push({
    id: mergeId,
    type: 'groupMergeNode',
    position: { x: 0, y: 0 },
    data: mergeData,
  });

  if (group.mode === 'parallel' || group.mode === 'midside') {
    // Each child is a separate branch
    const savedInParallel = ctx.inParallelBranch;
    ctx.inParallelBranch = true;

    for (let branchIdx = 0; branchIdx < group.children.length; branchIdx++) {
      const child = group.children[branchIdx];
      const childGhost = isGhost(child.id, ctx.ghostNodes);
      const sourceHandle = `branch-${branchIdx}`;
      const targetHandle = `branch-${branchIdx}`;

      if (child.type === 'plugin') {
        const selected = child.id === selectedNodeId;
        const plugId = addPluginNode(ctx, child, selected, childGhost);
        addEdge(ctx, headerId, plugId, childGhost, sourceHandle);
        addEdge(ctx, plugId, mergeId, childGhost, undefined, targetHandle);
      } else if (child.type === 'group' && child.mode === 'serial') {
        // Serial sub-group inside a parallel branch: process children inline
        const [first, last] = processSerialChildren(ctx, child.children, child.id, selectedNodeId);
        if (first) addEdge(ctx, headerId, first, false, sourceHandle);
        if (last) addEdge(ctx, last, mergeId, false, undefined, targetHandle);
      } else {
        // Nested group within parallel branch
        const [gFirst, gLast] = processGroup(ctx, child, selectedNodeId);
        if (gFirst) addEdge(ctx, headerId, gFirst, childGhost, sourceHandle);
        if (gLast) addEdge(ctx, gLast, mergeId, childGhost, undefined, targetHandle);
      }
    }

    ctx.inParallelBranch = savedInParallel;
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
 * Uses deterministic IDs based on chain node IDs for stable rendering.
 */
export function useChainToReactFlow(
  chainNodes: ChainNodeUI[],
  selectedNodeId: number | null,
  ghostNodes?: ChainNodeUI[],
): { nodes: Node[]; edges: Edge[] } {
  return useMemo(() => {
    const ctx: ConversionContext = {
      nodes: [],
      edges: [],
      ghostNodes,
      inParallelBranch: false,
    };

    if (chainNodes.length === 0) {
      // Empty chain — just show an add button
      addAddNode(ctx, 0, 0);
      return { nodes: ctx.nodes, edges: ctx.edges };
    }

    // The root is a serial sequence (root group id=0)
    processSerialChildren(ctx, chainNodes, 0, selectedNodeId);

    return { nodes: ctx.nodes, edges: ctx.edges };
  }, [chainNodes, selectedNodeId, ghostNodes]);
}
