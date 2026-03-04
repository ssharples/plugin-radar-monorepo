import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useReactFlow,
} from '@xyflow/react';
import type { Node } from '@xyflow/react';
import { useChainStore } from '../../stores/chainStore';
import { useChainToReactFlow } from '../../hooks/useChainToReactFlow';
import { useCanvasLayout } from '../../hooks/useCanvasLayout';
import type { PluginNodeData, GroupHeaderNodeData, AddButtonNodeData } from '../../hooks/useChainToReactFlow';
import { useCanvasKeyboard } from '../../hooks/useCanvasKeyboard';
import { PluginNode } from './PluginNode';
import { GroupHeaderNode } from './GroupHeaderNode';
import { GroupMergeNode } from './GroupMergeNode';
import { AddNode } from './AddNode';
import { SignalEdge } from './SignalEdge';
import { CanvasContextMenu } from './CanvasContextMenu';
import type { ContextMenuState } from './CanvasContextMenu';
import { InlinePluginSearch } from '../ChainEditor/InlinePluginSearch';

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

/** State for the floating inline plugin search panel */
interface CanvasSearchState {
  parentId: number;
  insertIndex: number;
  /** Screen-space coordinates where the search panel should appear */
  x: number;
  y: number;
}

function ChainCanvasInner() {
  const nodes = useChainStore(s => s.nodes);
  const selectedNodeId = useChainStore(s => s.selectedNodeId);
  const selectNode = useChainStore(s => s.selectNode);
  const openInlineEditor = useChainStore(s => s.openInlineEditor);
  const reactFlowInstance = useReactFlow();

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // Floating inline search state
  const [canvasSearch, setCanvasSearch] = useState<CanvasSearchState | null>(null);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const closeCanvasSearch = useCallback(() => {
    setCanvasSearch(null);
  }, []);

  // Wire keyboard shortcuts
  useCanvasKeyboard({
    closeContextMenu: useCallback(() => {
      closeContextMenu();
      closeCanvasSearch();
    }, [closeContextMenu, closeCanvasSearch]),
    isContextMenuOpen: contextMenu !== null || canvasSearch !== null,
  });

  const { nodes: rfNodes, edges: rfEdges } = useChainToReactFlow(nodes, selectedNodeId);
  const layoutNodes = useCanvasLayout(rfNodes, rfEdges);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    const data = node.data as Record<string, unknown>;

    if (data.nodeType === 'addButton') {
      const addData = data as AddButtonNodeData;
      // Convert the node's position to screen coordinates for the floating panel
      const screenPos = reactFlowInstance.flowToScreenPosition({
        x: node.position.x + 12,  // center of 24px wide node
        y: node.position.y + 24,  // just below the node
      });
      setCanvasSearch({
        parentId: addData.parentId,
        insertIndex: addData.insertIndex,
        x: screenPos.x,
        y: screenPos.y,
      });
      return;
    }

    // Close search when clicking other nodes
    if (canvasSearch) setCanvasSearch(null);

    if (data.nodeType === 'plugin') {
      const pluginData = data as PluginNodeData;
      selectNode(pluginData.chainNodeId);
      openInlineEditor(pluginData.chainNodeId);
    }
  }, [selectNode, openInlineEditor, reactFlowInstance, canvasSearch]);

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

  // Close context menu and search on pane click
  const onPaneClick = useCallback(() => {
    if (contextMenu) setContextMenu(null);
    if (canvasSearch) setCanvasSearch(null);
    selectNode(null);
  }, [contextMenu, canvasSearch, selectNode]);

  const defaultEdgeOptions = useMemo(() => ({
    type: 'signalEdge' as const,
  }), []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
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

      {/* Floating inline plugin search panel */}
      {canvasSearch && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(canvasSearch.x - 150, window.innerWidth - 320),
            top: Math.min(canvasSearch.y + 4, window.innerHeight - 400),
            width: 300,
            zIndex: 50,
          }}
        >
          <InlinePluginSearch
            parentId={canvasSearch.parentId}
            insertIndex={canvasSearch.insertIndex}
            onPluginAdded={closeCanvasSearch}
            onClose={closeCanvasSearch}
          />
        </div>
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
