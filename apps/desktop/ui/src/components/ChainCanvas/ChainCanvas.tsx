import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
} from '@xyflow/react';
import type { Node } from '@xyflow/react';
import { useChainStore } from '../../stores/chainStore';
import { useChainToReactFlow } from '../../hooks/useChainToReactFlow';
import { useCanvasLayout } from '../../hooks/useCanvasLayout';
import type { PluginNodeData } from '../../hooks/useChainToReactFlow';
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

const proOptions = { hideAttribution: true };

function ChainCanvasInner() {
  const nodes = useChainStore(s => s.nodes);
  const selectedNodeId = useChainStore(s => s.selectedNodeId);
  const selectNode = useChainStore(s => s.selectNode);
  const openInlineEditor = useChainStore(s => s.openInlineEditor);

  const { nodes: rfNodes, edges: rfEdges } = useChainToReactFlow(nodes, selectedNodeId);
  const layoutNodes = useCanvasLayout(rfNodes, rfEdges);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    const data = node.data as Record<string, unknown>;
    if (data.nodeType === 'plugin') {
      const pluginData = data as PluginNodeData;
      selectNode(pluginData.chainNodeId);
      openInlineEditor(pluginData.chainNodeId);
    }
  }, [selectNode, openInlineEditor]);

  const defaultEdgeOptions = useMemo(() => ({
    type: 'signalEdge' as const,
  }), []);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={layoutNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        fitView
        panOnScroll
        panOnDrag={false}
        zoomOnDoubleClick={false}
        nodesDraggable={false}
        nodesConnectable={false}
        minZoom={0.5}
        maxZoom={2}
        proOptions={proOptions}
        defaultEdgeOptions={defaultEdgeOptions}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="rgba(255,255,255,0.03)"
          gap={20}
          size={1}
        />
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
