import { useMemo } from 'react';
import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  pluginNode: { width: 200, height: 60 },
  groupHeaderNode: { width: 220, height: 40 },
  groupMergeNode: { width: 40, height: 20 },
  addNode: { width: 30, height: 30 },
};

const DEFAULT_DIMENSIONS = { width: 100, height: 40 };

/**
 * Apply dagre top-to-bottom auto-layout to ReactFlow nodes.
 * Returns new nodes array with positions set. Edges are unchanged.
 */
export function useCanvasLayout(
  nodes: Node[],
  edges: Edge[],
): Node[] {
  return useMemo(() => {
    if (nodes.length === 0) return nodes;

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
      rankdir: 'TB',
      nodesep: 40,
      ranksep: 60,
    });

    for (const node of nodes) {
      const dim = NODE_DIMENSIONS[node.type ?? ''] ?? DEFAULT_DIMENSIONS;
      g.setNode(node.id, { width: dim.width, height: dim.height });
    }

    for (const edge of edges) {
      g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    return nodes.map(node => {
      const pos = g.node(node.id);
      const dim = NODE_DIMENSIONS[node.type ?? ''] ?? DEFAULT_DIMENSIONS;
      return {
        ...node,
        position: {
          x: pos.x - dim.width / 2,
          y: pos.y - dim.height / 2,
        },
      };
    });
  }, [nodes, edges]);
}
