import { useCallback, useMemo, useState } from 'react';
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
import type { PluginNodeData, GroupHeaderNodeData } from '../../hooks/useChainToReactFlow';
import { useCanvasKeyboard } from '../../hooks/useCanvasKeyboard';
import { PluginNode } from './PluginNode';
import { GroupHeaderNode } from './GroupHeaderNode';
import { GroupMergeNode } from './GroupMergeNode';
import { AddNode } from './AddNode';
import { SignalEdge } from './SignalEdge';
import { CanvasContextMenu } from './CanvasContextMenu';
import type { ContextMenuState } from './CanvasContextMenu';

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

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Wire keyboard shortcuts
  useCanvasKeyboard({
    closeContextMenu,
    isContextMenuOpen: contextMenu !== null,
  });

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

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    const data = node.data as Record<string, unknown>;

    if (data.nodeType === 'plugin') {
      const pluginData = data as PluginNodeData;
      selectNode(pluginData.chainNodeId);
      setContextMenu({
        nodeId: pluginData.chainNodeId,
        nodeType: 'plugin',
        x: event.clientX,
        y: event.clientY,
      });
    } else if (data.nodeType === 'groupHeader') {
      const headerData = data as GroupHeaderNodeData;
      setContextMenu({
        nodeId: headerData.chainNodeId,
        nodeType: 'groupHeader',
        x: event.clientX,
        y: event.clientY,
      });
    }
  }, [selectNode]);

  // Close context menu on pane click
  const onPaneClick = useCallback(() => {
    if (contextMenu) setContextMenu(null);
    selectNode(null);
  }, [contextMenu, selectNode]);

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
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
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

      {contextMenu && (
        <CanvasContextMenu state={contextMenu} onClose={closeContextMenu} />
      )}
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
