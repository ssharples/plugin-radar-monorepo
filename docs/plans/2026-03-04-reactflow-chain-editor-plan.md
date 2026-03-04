# ReactFlow Chain Editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the dnd-kit list-based chain editor with an interactive ReactFlow node graph canvas, with floating AI chat overlay and ghost node previews.

**Architecture:** Chain tree from `chainStore` converts to ReactFlow nodes/edges via a `useChainToReactFlow()` hook. Dagre auto-layout positions nodes top-to-bottom. User interactions on the canvas call existing `juceBridge` actions. The AI chat floats over the canvas and creates ghost (preview) nodes that become real on "Apply".

**Tech Stack:** `@xyflow/react` v12, `dagre` for auto-layout, React 18, Zustand, existing Propane design system.

**Design Doc:** `docs/plans/2026-03-04-reactflow-chain-editor-design.md`

**Worktree:** Create a git worktree before starting implementation for safe rollback.

---

## Task 0: Setup — Install Dependencies & Create Worktree

**Files:**
- Modify: `apps/desktop/ui/package.json`

**Step 1: Create git worktree**

```bash
cd /Users/satti/Development-projects/plugin-radar-monorepo
git worktree add .claude/worktrees/reactflow-editor -b feat/reactflow-chain-editor
cd .claude/worktrees/reactflow-editor
```

**Step 2: Install ReactFlow and dagre**

```bash
cd apps/desktop/ui
pnpm add @xyflow/react dagre
pnpm add -D @types/dagre
```

**Step 3: Verify Vite build still works**

```bash
cd apps/desktop/ui && npx vite build
```

Expected: Build succeeds. ReactFlow CSS will be inlined by `vite-plugin-singlefile`.

**Step 4: Import ReactFlow CSS**

Add to `apps/desktop/ui/src/main.tsx` (after existing CSS imports):

```typescript
import '@xyflow/react/dist/style.css';
```

**Step 5: Verify build again with CSS import**

```bash
cd apps/desktop/ui && npx vite build
```

Expected: Build succeeds, ReactFlow CSS inlined into single HTML file.

**Step 6: Commit**

```bash
git add -A && git commit -m "chore: add @xyflow/react and dagre dependencies"
```

---

## Task 1: Core Hook — `useChainToReactFlow()`

Convert the chain tree (`ChainNodeUI[]`) to ReactFlow nodes and edges.

**Files:**
- Create: `apps/desktop/ui/src/hooks/useChainToReactFlow.ts`

**Step 1: Create the hook**

This is the critical data bridge. It reads `chainStore.nodes` and produces ReactFlow-compatible `Node[]` and `Edge[]`.

```typescript
// apps/desktop/ui/src/hooks/useChainToReactFlow.ts
import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { ChainNodeUI, PluginNodeUI, GroupNodeUI } from '../api/types';

// Node data types for each custom node
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
  isGhost?: boolean; // AI preview node
  category?: string; // For badge color
}

export interface GroupHeaderNodeData {
  nodeType: 'groupHeader';
  chainNodeId: number;
  name: string;
  mode: 'serial' | 'parallel' | 'midside' | 'fxselector';
  bypassed: boolean;
  dryWet: number;
  branchCount: number;
}

export interface GroupMergeNodeData {
  nodeType: 'groupMerge';
  chainNodeId: number;
  mode: string;
}

export interface AddButtonNodeData {
  nodeType: 'addButton';
  parentId: number;
  insertIndex: number;
}

export type ChainReactFlowNode = Node<PluginNodeData | GroupHeaderNodeData | GroupMergeNodeData | AddButtonNodeData>;

/**
 * Convert chain tree to ReactFlow nodes and edges.
 * Layout is done separately by dagre — this only produces the graph structure.
 */
export function useChainToReactFlow(
  chainNodes: ChainNodeUI[],
  selectedNodeId: number | null,
  ghostNodes?: ChainNodeUI[] // AI preview nodes
): { nodes: ChainReactFlowNode[]; edges: Edge[] } {
  return useMemo(() => {
    const rfNodes: ChainReactFlowNode[] = [];
    const rfEdges: Edge[] = [];
    let prevNodeRfId: string | null = null;

    // Process root-level nodes (children of the implicit root serial group)
    processNodeList(chainNodes, rfNodes, rfEdges, 0, selectedNodeId);

    // Add ghost nodes from AI preview
    if (ghostNodes?.length) {
      processNodeList(ghostNodes, rfNodes, rfEdges, 0, null, true);
    }

    return { nodes: rfNodes, edges: rfEdges };
  }, [chainNodes, selectedNodeId, ghostNodes]);
}

function processNodeList(
  nodes: ChainNodeUI[],
  rfNodes: ChainReactFlowNode[],
  rfEdges: Edge[],
  parentId: number,
  selectedNodeId: number | null,
  isGhost = false,
  prevRfId: string | null = null
): string | null {
  let lastRfId = prevRfId;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isSelected = node.id === selectedNodeId;

    if (node.type === 'plugin') {
      const rfId = `plugin-${node.id}${isGhost ? '-ghost' : ''}`;
      rfNodes.push({
        id: rfId,
        type: 'pluginNode',
        position: { x: 0, y: 0 }, // dagre will set this
        selected: isSelected,
        data: {
          nodeType: 'plugin',
          chainNodeId: node.id,
          name: node.name,
          manufacturer: node.manufacturer,
          format: node.format,
          fileOrIdentifier: node.fileOrIdentifier,
          bypassed: node.bypassed,
          muted: node.mute,
          solo: node.solo,
          branchGainDb: node.branchGainDb,
          latency: node.latency,
          autoGainEnabled: node.autoGainEnabled,
          duckEnabled: node.duckEnabled,
          isGhost,
        },
      });

      if (lastRfId) {
        rfEdges.push({
          id: `e-${lastRfId}-${rfId}`,
          source: lastRfId,
          target: rfId,
          type: 'signalEdge',
          animated: !isGhost,
          style: isGhost ? { opacity: 0.3, strokeDasharray: '5 5' } : undefined,
        });
      }

      // Add "+" button between nodes (not for ghost nodes)
      if (!isGhost && i < nodes.length - 1) {
        const addId = `add-${parentId}-${i + 1}`;
        rfNodes.push({
          id: addId,
          type: 'addNode',
          position: { x: 0, y: 0 },
          data: { nodeType: 'addButton', parentId, insertIndex: i + 1 },
        });
        rfEdges.push({
          id: `e-${rfId}-${addId}`,
          source: rfId,
          target: addId,
          type: 'signalEdge',
        });
        lastRfId = addId;
      } else {
        lastRfId = rfId;
      }
    } else if (node.type === 'group') {
      const group = node as GroupNodeUI;
      lastRfId = processGroup(group, rfNodes, rfEdges, parentId, selectedNodeId, isGhost, lastRfId);
    }
  }

  return lastRfId;
}

function processGroup(
  group: GroupNodeUI,
  rfNodes: ChainReactFlowNode[],
  rfEdges: Edge[],
  parentId: number,
  selectedNodeId: number | null,
  isGhost: boolean,
  prevRfId: string | null
): string {
  const headerId = `group-header-${group.id}${isGhost ? '-ghost' : ''}`;
  const mergeId = `group-merge-${group.id}${isGhost ? '-ghost' : ''}`;

  // Group header node
  rfNodes.push({
    id: headerId,
    type: 'groupHeaderNode',
    position: { x: 0, y: 0 },
    selected: group.id === selectedNodeId,
    data: {
      nodeType: 'groupHeader',
      chainNodeId: group.id,
      name: group.name,
      mode: group.mode,
      bypassed: group.bypassed,
      dryWet: group.dryWet,
      branchCount: group.mode === 'parallel' ? group.children.length : 0,
    },
  });

  // Edge from previous node to group header
  if (prevRfId) {
    rfEdges.push({
      id: `e-${prevRfId}-${headerId}`,
      source: prevRfId,
      target: headerId,
      type: 'signalEdge',
      animated: !isGhost,
    });
  }

  if (group.mode === 'parallel' && group.children.length > 0) {
    // Parallel: fan-out from header to each branch, fan-in to merge
    const branchEndIds: string[] = [];

    for (let b = 0; b < group.children.length; b++) {
      const child = group.children[b];
      // Each branch is a single node or a sub-chain
      const branchNodes = child.type === 'group' && (child as GroupNodeUI).children
        ? (child as GroupNodeUI).children
        : [child];

      const branchEndId = processNodeList(
        child.type === 'plugin' ? [child] : (child as GroupNodeUI).children || [child],
        rfNodes, rfEdges, group.id, selectedNodeId, isGhost, headerId
      );

      if (branchEndId) branchEndIds.push(branchEndId);
    }

    // Merge node
    rfNodes.push({
      id: mergeId,
      type: 'groupMergeNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'groupMerge', chainNodeId: group.id, mode: group.mode },
    });

    for (const endId of branchEndIds) {
      rfEdges.push({
        id: `e-${endId}-${mergeId}`,
        source: endId,
        target: mergeId,
        type: 'signalEdge',
        animated: !isGhost,
      });
    }

    return mergeId;
  } else {
    // Serial: chain children sequentially from header
    const lastChild = processNodeList(
      group.children, rfNodes, rfEdges, group.id, selectedNodeId, isGhost, headerId
    );

    // For serial groups, add a merge node to maintain consistent output point
    rfNodes.push({
      id: mergeId,
      type: 'groupMergeNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'groupMerge', chainNodeId: group.id, mode: group.mode },
    });

    if (lastChild) {
      rfEdges.push({
        id: `e-${lastChild}-${mergeId}`,
        source: lastChild,
        target: mergeId,
        type: 'signalEdge',
        animated: !isGhost,
      });
    }

    return mergeId;
  }
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd apps/desktop/ui && npx tsc --noEmit
```

Note: tsc may report warnings from other files; focus on errors in the new file.

**Step 3: Commit**

```bash
git add apps/desktop/ui/src/hooks/useChainToReactFlow.ts
git commit -m "feat: add useChainToReactFlow hook for chain tree → ReactFlow conversion"
```

---

## Task 2: Auto-Layout Hook — `useCanvasLayout()`

Dagre auto-layout for top-to-bottom signal flow.

**Files:**
- Create: `apps/desktop/ui/src/hooks/useCanvasLayout.ts`

**Step 1: Create the layout hook**

```typescript
// apps/desktop/ui/src/hooks/useCanvasLayout.ts
import { useMemo, useRef } from 'react';
import type { Node, Edge } from '@xyflow/react';
import dagre from 'dagre';

const LAYOUT_OPTIONS = {
  rankdir: 'TB' as const, // Top to bottom
  nodesep: 40,            // Horizontal separation between nodes
  ranksep: 60,            // Vertical separation between ranks
  marginx: 20,
  marginy: 20,
};

// Node dimensions by type
const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  pluginNode: { width: 200, height: 60 },
  groupHeaderNode: { width: 220, height: 40 },
  groupMergeNode: { width: 40, height: 20 },
  addNode: { width: 30, height: 30 },
};

/**
 * Apply dagre auto-layout to ReactFlow nodes.
 * Returns new node array with positions set.
 */
export function useCanvasLayout(
  nodes: Node[],
  edges: Edge[]
): Node[] {
  // Cache key based on node IDs and edge connections
  const cacheKeyRef = useRef<string>('');

  return useMemo(() => {
    if (nodes.length === 0) return nodes;

    // Generate cache key from structure (not positions)
    const newKey = nodes.map(n => n.id).join(',') + '|' + edges.map(e => `${e.source}-${e.target}`).join(',');

    const g = new dagre.graphlib.Graph();
    g.setGraph(LAYOUT_OPTIONS);
    g.setDefaultEdgeLabel(() => ({}));

    // Add nodes with dimensions
    for (const node of nodes) {
      const dims = NODE_DIMENSIONS[node.type || 'pluginNode'] || { width: 200, height: 60 };
      g.setNode(node.id, { width: dims.width, height: dims.height });
    }

    // Add edges
    for (const edge of edges) {
      g.setEdge(edge.source, edge.target);
    }

    // Calculate layout
    dagre.layout(g);

    // Apply positions (dagre centers nodes, so offset by half dimensions)
    const layoutedNodes = nodes.map(node => {
      const dagreNode = g.node(node.id);
      if (!dagreNode) return node;

      const dims = NODE_DIMENSIONS[node.type || 'pluginNode'] || { width: 200, height: 60 };
      return {
        ...node,
        position: {
          x: dagreNode.x - dims.width / 2,
          y: dagreNode.y - dims.height / 2,
        },
      };
    });

    cacheKeyRef.current = newKey;
    return layoutedNodes;
  }, [nodes, edges]);
}
```

**Step 2: Commit**

```bash
git add apps/desktop/ui/src/hooks/useCanvasLayout.ts
git commit -m "feat: add useCanvasLayout hook with dagre top-to-bottom layout"
```

---

## Task 3: Custom Node Components

Build the 4 custom ReactFlow node types matching the Propane design system.

**Files:**
- Create: `apps/desktop/ui/src/components/ChainCanvas/PluginNode.tsx`
- Create: `apps/desktop/ui/src/components/ChainCanvas/GroupHeaderNode.tsx`
- Create: `apps/desktop/ui/src/components/ChainCanvas/GroupMergeNode.tsx`
- Create: `apps/desktop/ui/src/components/ChainCanvas/AddNode.tsx`
- Create: `apps/desktop/ui/src/components/ChainCanvas/SignalEdge.tsx`

**Step 1: Create the directory**

```bash
mkdir -p apps/desktop/ui/src/components/ChainCanvas
```

**Step 2: Create PluginNode**

The main node type. Shows plugin name, manufacturer, category badge, bypass/mute state. Has top (target) and bottom (source) handles for signal flow.

```typescript
// apps/desktop/ui/src/components/ChainCanvas/PluginNode.tsx
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { PluginNodeData } from '../../hooks/useChainToReactFlow';
import { getCategoryColor } from '../../constants/categoryColors';

function PluginNodeComponent({ data, selected }: NodeProps) {
  const d = data as PluginNodeData;
  const categoryColor = getCategoryColor(d.category);
  const isGhost = d.isGhost;
  const isBypassed = d.bypassed;
  const isMuted = d.muted;

  return (
    <div
      className={`
        relative rounded-lg border px-3 py-2 min-w-[180px] max-w-[220px]
        transition-all duration-150 cursor-pointer
        ${isGhost ? 'border-dashed border-white/20 animate-pulse' : 'border-white/8'}
        ${selected ? 'border-[var(--color-accent-cyan)] shadow-[0_0_20px_rgba(222,255,10,0.3)]' : ''}
        ${isBypassed || isMuted ? 'opacity-50' : ''}
      `}
      style={{
        background: isGhost ? 'rgba(15, 15, 15, 0.6)' : 'rgba(15, 15, 15, 0.95)',
        opacity: isGhost ? 0.4 : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-white/20 !w-2 !h-1 !min-h-0 !border-0 !rounded-sm" />

      {/* Plugin name */}
      <div className="text-[11px] font-mono uppercase tracking-wider text-white/90 truncate">
        {d.name}
      </div>

      {/* Manufacturer + category */}
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-[9px] text-white/40 truncate">{d.manufacturer}</span>
        {d.category && (
          <span
            className="text-[8px] px-1 py-0 rounded-full text-white/80"
            style={{ backgroundColor: categoryColor + '40' }}
          >
            {d.category}
          </span>
        )}
      </div>

      {/* Status indicators */}
      <div className="absolute top-1 right-1 flex gap-0.5">
        {isBypassed && <span className="text-[8px] text-yellow-500/70">BYP</span>}
        {isMuted && <span className="text-[8px] text-red-500/70">MUTE</span>}
        {d.latency != null && d.latency > 0 && (
          <span className="text-[8px] text-white/30 font-mono">{d.latency}s</span>
        )}
      </div>

      {isGhost && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-[7px] text-cyan-400/60 bg-cyan-400/10 px-1 rounded">
          AI
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-white/20 !w-2 !h-1 !min-h-0 !border-0 !rounded-sm" />
    </div>
  );
}

export const PluginNode = memo(PluginNodeComponent);
```

**Step 3: Create GroupHeaderNode**

```typescript
// apps/desktop/ui/src/components/ChainCanvas/GroupHeaderNode.tsx
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { GroupHeaderNodeData } from '../../hooks/useChainToReactFlow';

function GroupHeaderNodeComponent({ data, selected }: NodeProps) {
  const d = data as GroupHeaderNodeData;
  const isParallel = d.mode === 'parallel';
  const borderColor = isParallel ? '#5a7842' : '#c9944a';

  return (
    <div
      className={`
        rounded border-2 px-3 py-1.5 min-w-[200px] text-center
        transition-all duration-150 cursor-pointer
        ${selected ? 'shadow-[0_0_16px_rgba(222,255,10,0.2)]' : ''}
      `}
      style={{
        borderColor,
        background: `linear-gradient(135deg, ${borderColor}15, ${borderColor}08)`,
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-white/20 !w-2 !h-1 !min-h-0 !border-0 !rounded-sm" />

      <div className="flex items-center justify-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider font-mono" style={{ color: borderColor }}>
          {isParallel ? '⑃' : '≡'} {d.name || (isParallel ? 'Parallel' : 'Serial')}
        </span>
        {d.bypassed && <span className="text-[8px] text-yellow-500/70">BYP</span>}
      </div>

      {d.dryWet < 100 && (
        <div className="text-[8px] text-white/30 font-mono">D/W {d.dryWet}%</div>
      )}

      {/* For parallel groups: multiple source handles (one per branch) */}
      {isParallel && d.branchCount > 1 ? (
        Array.from({ length: d.branchCount }).map((_, i) => (
          <Handle
            key={`branch-${i}`}
            type="source"
            position={Position.Bottom}
            id={`branch-${i}`}
            className="!bg-white/20 !w-2 !h-1 !min-h-0 !border-0 !rounded-sm"
            style={{ left: `${((i + 1) / (d.branchCount + 1)) * 100}%` }}
          />
        ))
      ) : (
        <Handle type="source" position={Position.Bottom} className="!bg-white/20 !w-2 !h-1 !min-h-0 !border-0 !rounded-sm" />
      )}
    </div>
  );
}

export const GroupHeaderNode = memo(GroupHeaderNodeComponent);
```

**Step 4: Create GroupMergeNode**

```typescript
// apps/desktop/ui/src/components/ChainCanvas/GroupMergeNode.tsx
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { GroupMergeNodeData } from '../../hooks/useChainToReactFlow';

function GroupMergeNodeComponent({ data }: NodeProps) {
  const d = data as GroupMergeNodeData;
  const isParallel = d.mode === 'parallel';
  const color = isParallel ? '#5a7842' : '#c9944a';

  return (
    <div
      className="rounded-full border"
      style={{
        width: 24,
        height: 12,
        borderColor: color,
        background: `${color}20`,
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-transparent !w-full !h-full !min-h-0 !border-0 !top-0 !left-0 !translate-x-0 !translate-y-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-white/20 !w-2 !h-1 !min-h-0 !border-0 !rounded-sm" />
    </div>
  );
}

export const GroupMergeNode = memo(GroupMergeNodeComponent);
```

**Step 5: Create AddNode**

```typescript
// apps/desktop/ui/src/components/ChainCanvas/AddNode.tsx
import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { AddButtonNodeData } from '../../hooks/useChainToReactFlow';

function AddNodeComponent({ data }: NodeProps) {
  const d = data as AddButtonNodeData;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="flex items-center justify-center cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0 !min-h-0" />

      <div
        className={`
          rounded-full border border-white/10 flex items-center justify-center
          transition-all duration-200
          ${hovered ? 'bg-white/10 border-white/20 scale-110' : 'bg-white/[0.03] scale-100'}
        `}
        style={{ width: 24, height: 24 }}
      >
        <span className="text-white/40 text-xs leading-none">+</span>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0 !min-h-0" />
    </div>
  );
}

export const AddNode = memo(AddNodeComponent);
```

**Step 6: Create SignalEdge**

```typescript
// apps/desktop/ui/src/components/ChainCanvas/SignalEdge.tsx
import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

function SignalEdgeComponent(props: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    borderRadius: 8,
  });

  return (
    <BaseEdge
      path={edgePath}
      style={{
        stroke: 'rgba(255, 255, 255, 0.12)',
        strokeWidth: 1.5,
        ...props.style,
      }}
    />
  );
}

export const SignalEdge = memo(SignalEdgeComponent);
```

**Step 7: Commit**

```bash
git add apps/desktop/ui/src/components/ChainCanvas/
git commit -m "feat: add custom ReactFlow node components — PluginNode, GroupHeader, GroupMerge, AddNode, SignalEdge"
```

---

## Task 4: Main Canvas Component — `ChainCanvas.tsx`

Assemble the ReactFlow canvas with all node types, layout, and basic interactions.

**Files:**
- Create: `apps/desktop/ui/src/components/ChainCanvas/ChainCanvas.tsx`
- Create: `apps/desktop/ui/src/components/ChainCanvas/index.ts`

**Step 1: Create ChainCanvas**

```typescript
// apps/desktop/ui/src/components/ChainCanvas/ChainCanvas.tsx
import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  type NodeMouseHandler,
  type Node,
} from '@xyflow/react';
import { useChainStore } from '../../stores/chainStore';
import { useChainToReactFlow } from '../../hooks/useChainToReactFlow';
import { useCanvasLayout } from '../../hooks/useCanvasLayout';
import { PluginNode } from './PluginNode';
import { GroupHeaderNode } from './GroupHeaderNode';
import { GroupMergeNode } from './GroupMergeNode';
import { AddNode } from './AddNode';
import { SignalEdge } from './SignalEdge';

const nodeTypes = {
  pluginNode: PluginNode,
  groupHeaderNode: GroupHeaderNode,
  groupMergeNode: GroupMergeNode,
  addNode: AddNode,
};

const edgeTypes = {
  signalEdge: SignalEdge,
};

function ChainCanvasInner() {
  const nodes = useChainStore(s => s.nodes);
  const selectedNodeId = useChainStore(s => s.selectedNodeId);
  const selectNode = useChainStore(s => s.selectNode);
  const setInlineEditorNodeId = useChainStore(s => s.setInlineEditorNodeId);

  // Convert chain tree to ReactFlow graph
  const { nodes: rfNodes, edges: rfEdges } = useChainToReactFlow(nodes, selectedNodeId);

  // Apply dagre layout
  const layoutedNodes = useCanvasLayout(rfNodes, rfEdges);

  // Handle node click → select + open inline editor
  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    const data = node.data as any;
    if (data.nodeType === 'plugin') {
      selectNode(data.chainNodeId);
      setInlineEditorNodeId(data.chainNodeId);
    } else if (data.nodeType === 'groupHeader') {
      selectNode(data.chainNodeId);
    } else if (data.nodeType === 'addButton') {
      // TODO: Open inline plugin search at this position
    }
  }, [selectNode, setInlineEditorNodeId]);

  // Default edge options
  const defaultEdgeOptions = useMemo(() => ({
    type: 'signalEdge',
  }), []);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={layoutedNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        panOnDrag={false}
        panOnScroll
        zoomOnDoubleClick={false}
        deleteKeyCode={['Backspace', 'Delete']}
        selectionOnDrag={false}
        nodesDraggable={false} // Phase 1: no drag reordering yet
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        minZoom={0.5}
        maxZoom={2}
      >
        <Background color="rgba(255,255,255,0.03)" gap={20} />
      </ReactFlow>
    </div>
  );
}

export function ChainCanvas() {
  return (
    <ReactFlowProvider>
      <ChainCanvasInner />
    </ReactFlowProvider>
  );
}
```

**Step 2: Create index.ts**

```typescript
// apps/desktop/ui/src/components/ChainCanvas/index.ts
export { ChainCanvas } from './ChainCanvas';
```

**Step 3: Commit**

```bash
git add apps/desktop/ui/src/components/ChainCanvas/
git commit -m "feat: add ChainCanvas main component with ReactFlow, dagre layout, and node click handling"
```

---

## Task 5: Wire Into App.tsx — Replace ChainEditor

**Files:**
- Modify: `apps/desktop/ui/src/App.tsx` (line 3: import, line 320: render)

**Step 1: Replace the import and render**

In `apps/desktop/ui/src/App.tsx`:

Replace the import (line 3):
```typescript
// OLD: import { ChainEditor } from './components/ChainEditor';
import { ChainCanvas } from './components/ChainCanvas';
```

Replace the render (line 320):
```typescript
// OLD: <ChainEditor />
<ChainCanvas />
```

**Step 2: Verify build**

```bash
cd apps/desktop/ui && npx vite build
```

Expected: Build succeeds. The canvas renders instead of the old chain editor.

**Step 3: Commit**

```bash
git add apps/desktop/ui/src/App.tsx
git commit -m "feat: replace ChainEditor with ChainCanvas in App.tsx"
```

---

## Task 6: Keyboard Shortcuts for Canvas

Preserve existing keyboard shortcuts (Cmd+Z, B, I, Cmd+G, etc.) on the canvas.

**Files:**
- Create: `apps/desktop/ui/src/hooks/useCanvasKeyboard.ts`
- Modify: `apps/desktop/ui/src/components/ChainCanvas/ChainCanvas.tsx`

**Step 1: Create keyboard hook**

```typescript
// apps/desktop/ui/src/hooks/useCanvasKeyboard.ts
import { useEffect } from 'react';
import { useChainStore } from '../stores/chainStore';
import { juceBridge } from '../api/juce-bridge';

/**
 * Keyboard shortcuts for the ReactFlow canvas.
 * Mirrors the shortcuts from the old ChainEditor.
 */
export function useCanvasKeyboard() {
  const selectedNodeId = useChainStore(s => s.selectedNodeId);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

      // Undo: Cmd+Z
      if (isMeta && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        useChainStore.getState().undo();
        return;
      }

      // Redo: Cmd+Shift+Z
      if (isMeta && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        useChainStore.getState().redo();
        return;
      }

      // Bypass: B
      if (e.key === 'b' && !isMeta && selectedNodeId != null) {
        e.preventDefault();
        juceBridge.toggleBypass(selectedNodeId);
        setTimeout(() => useChainStore.getState().fetchChainState(), 100);
        return;
      }

      // Mute: I
      if (e.key === 'i' && !isMeta && selectedNodeId != null) {
        e.preventDefault();
        juceBridge.toggleMute(selectedNodeId);
        setTimeout(() => useChainStore.getState().fetchChainState(), 100);
        return;
      }

      // Close inline editor: Cmd+0
      if (isMeta && e.key === '0') {
        e.preventDefault();
        useChainStore.getState().setInlineEditorNodeId(null);
        useChainStore.getState().closeAiChat();
        return;
      }

      // Delete selected node: Delete/Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId != null) {
        // Only if not in an input field
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
        e.preventDefault();
        useChainStore.getState().removeNode(selectedNodeId);
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNodeId]);
}
```

**Step 2: Wire into ChainCanvas**

Add `useCanvasKeyboard()` call inside `ChainCanvasInner()`.

**Step 3: Commit**

```bash
git add apps/desktop/ui/src/hooks/useCanvasKeyboard.ts apps/desktop/ui/src/components/ChainCanvas/ChainCanvas.tsx
git commit -m "feat: add keyboard shortcuts for ReactFlow canvas (undo, bypass, mute, delete)"
```

---

## Task 7: Context Menu

Right-click on nodes for swap/duplicate/remove/bypass actions.

**Files:**
- Create: `apps/desktop/ui/src/components/ChainCanvas/CanvasContextMenu.tsx`
- Modify: `apps/desktop/ui/src/components/ChainCanvas/ChainCanvas.tsx`

**Step 1: Create CanvasContextMenu**

A simple positioned div that appears on right-click. Reuse the existing `menuConfigs.ts` patterns for menu items.

Implementation: A floating div positioned at click coordinates with menu items for plugin operations (swap, duplicate, remove, bypass, mute, open editor). For group nodes: add plugin, dissolve, toggle bypass, delete.

**Step 2: Wire into ChainCanvas**

Use ReactFlow's `onNodeContextMenu` handler to show the context menu at click position.

**Step 3: Commit**

```bash
git add apps/desktop/ui/src/components/ChainCanvas/
git commit -m "feat: add context menu for ReactFlow canvas nodes"
```

---

## Task 8: Add Plugin via `+` Nodes

Wire the `AddNode` click to open inline plugin search.

**Files:**
- Modify: `apps/desktop/ui/src/components/ChainCanvas/ChainCanvas.tsx`
- Modify: `apps/desktop/ui/src/components/ChainCanvas/AddNode.tsx`

**Step 1: Implement AddNode click handler**

When user clicks an `AddNode`, set `inlineSearchState` in chainStore with the correct `parentId` and `insertIndex`. The existing `InlinePluginSearch` component or `QuickPluginSearch` should be adapted to appear as a floating panel over the canvas.

**Step 2: Commit**

```bash
git add apps/desktop/ui/src/components/ChainCanvas/
git commit -m "feat: wire AddNode to inline plugin search"
```

---

## Task 9: Floating AI Chat Overlay

Extract the AI chat from the side panel into a floating overlay on the canvas.

**Files:**
- Create: `apps/desktop/ui/src/components/ChainCanvas/FloatingAiChat.tsx`
- Modify: `apps/desktop/ui/src/components/ChainCanvas/ChainCanvas.tsx`
- Reference: `apps/desktop/ui/src/components/AiAssistant/AiChatView.tsx` (extract from here)

**Step 1: Create FloatingAiChat**

A floating panel component:
- **Collapsed**: 48px pill in bottom-right with AI icon + status text
- **Expanded**: ~300x420px panel with chat messages, input, suggestions
- Uses the same `useAiChatStore` for state
- Semi-transparent backdrop: `bg-[#0a0a0a]/90 backdrop-blur-sm`
- Rounded corners, border `border-white/10`
- Close button to collapse back to pill
- Drag handle to reposition (optional, can be fixed position)

**Step 2: Integrate ghost nodes**

When AI calls `build_chain` or `modify_chain`, instead of showing `BuildChainVisual` card:
1. Parse the chain action payload
2. Convert the proposed slots to `ChainNodeUI[]`
3. Pass them as `ghostNodes` to `useChainToReactFlow()`
4. Ghost nodes appear on canvas with dashed borders and "AI" badge
5. "Apply" button in the chat commits the ghost nodes to the real chain

**Step 3: Commit**

```bash
git add apps/desktop/ui/src/components/ChainCanvas/ apps/desktop/ui/src/components/AiAssistant/
git commit -m "feat: add floating AI chat overlay with ghost node previews on canvas"
```

---

## Task 10: Node Drag Reordering

Enable dragging nodes to reorder them in the signal flow.

**Files:**
- Modify: `apps/desktop/ui/src/components/ChainCanvas/ChainCanvas.tsx`

**Step 1: Enable node dragging**

Set `nodesDraggable={true}` on the ReactFlow component.

**Step 2: Handle drag end**

On `onNodeDragStop`, determine the new position in the chain based on the node's Y coordinate relative to other nodes. Call `juceBridge.moveNode(nodeId, parentId, newIndex)` to update the actual chain.

**Step 3: Re-layout after move**

After the move completes, `fetchChainState()` triggers a re-render and dagre re-layouts.

**Step 4: Commit**

```bash
git add apps/desktop/ui/src/components/ChainCanvas/
git commit -m "feat: enable node drag reordering on ReactFlow canvas"
```

---

## Task 11: Parallel Group Visual Support

Visual branch splitting and merging for parallel groups.

**Files:**
- Modify: `apps/desktop/ui/src/hooks/useChainToReactFlow.ts`
- Modify: `apps/desktop/ui/src/components/ChainCanvas/GroupHeaderNode.tsx`

**Step 1: Refine parallel layout**

The `useChainToReactFlow` hook already handles parallel branches by creating edges from the header to each branch's first node, and from each branch's last node to the merge point. Dagre will automatically position branches side-by-side.

Verify this works with actual parallel chains. If branches overlap, increase `nodesep` in dagre options.

**Step 2: Add branch controls**

On `GroupHeaderNode` for parallel groups, show:
- Branch count label
- "Add Branch" button (calls `juceBridge.addBranch(groupId)`)
- Per-branch gain badges (if applicable)

**Step 3: Commit**

```bash
git add apps/desktop/ui/src/
git commit -m "feat: visual parallel group support with branch split/merge layout"
```

---

## Task 12: Empty State & Polish

Handle empty chain state, loading, and visual polish.

**Files:**
- Create: `apps/desktop/ui/src/components/ChainCanvas/EmptyCanvasState.tsx`
- Modify: `apps/desktop/ui/src/components/ChainCanvas/ChainCanvas.tsx`

**Step 1: Empty state**

When `nodes.length === 0`, show a centered message: "Drop a plugin to start" with the AI chat pill visible. Reuse styling from existing `EmptyStateKit`.

**Step 2: Loading state**

While `loading` is true in chainStore, show a loading skeleton or spinner.

**Step 3: Final build & test**

```bash
cd apps/desktop/ui && npx vite build
```

Verify the build produces a single HTML file with ReactFlow inlined.

**Step 4: Commit**

```bash
git add apps/desktop/ui/src/
git commit -m "feat: add empty state, loading, and visual polish to ChainCanvas"
```

---

## Task 13: Final Integration & Cleanup

Remove old ChainEditor dependencies if no longer needed. Verify all features work.

**Files:**
- Modify: `apps/desktop/ui/src/components/ChainEditor/index.ts` (keep for now, mark deprecated)
- Modify: `apps/desktop/ui/package.json` (keep @dnd-kit for now — InlineEditorSidebar still uses it)

**Step 1: Full build pipeline**

```bash
cd apps/desktop/ui && npx vite build
cd ../build && zip -r ../resources/ui.zip -j ../ui/dist/index.html
cd ../build && cmake .. && cmake --build . --target ProChain_AU
```

**Step 2: Manual test checklist**

- [ ] Chain loads and displays as node graph
- [ ] Click node → opens inline editor
- [ ] Back button → returns to canvas
- [ ] Right-click → context menu with swap/remove/bypass
- [ ] `+` button → plugin search
- [ ] Cmd+Z → undo
- [ ] B key → bypass selected
- [ ] AI chat floats on canvas
- [ ] AI builds chain → ghost nodes appear
- [ ] Apply → ghost nodes become real
- [ ] Parallel groups show branch split/merge
- [ ] Empty chain shows empty state
- [ ] Build produces single HTML file

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: complete ReactFlow chain editor with floating AI chat"
```

---

## Summary

| Task | What | Est. Complexity |
|------|------|-----------------|
| 0 | Setup deps + worktree | Low |
| 1 | `useChainToReactFlow()` hook | High — core data bridge |
| 2 | `useCanvasLayout()` dagre hook | Medium |
| 3 | Custom node components (5 files) | Medium |
| 4 | ChainCanvas main component | Medium |
| 5 | Wire into App.tsx | Low |
| 6 | Keyboard shortcuts | Low |
| 7 | Context menu | Medium |
| 8 | Add plugin via + nodes | Medium |
| 9 | Floating AI chat + ghost nodes | High — new interaction model |
| 10 | Node drag reordering | Medium |
| 11 | Parallel group visuals | Medium |
| 12 | Empty state & polish | Low |
| 13 | Integration & cleanup | Low |
