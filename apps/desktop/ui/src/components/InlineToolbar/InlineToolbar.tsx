import { useMemo, useEffect } from 'react';
import { useChainStore } from '../../stores/chainStore';
import { usePanelStore } from '../../stores/panelStore';
import { findNodeById, isNodeInParallelGroup } from '../../utils/chainHelpers';
import { ToolbarLevel1 } from './ToolbarLevel1';
import { ToolbarLevel2 } from './ToolbarLevel2';
import type { PluginNodeUI } from '../../api/types';

export type ToolbarLevel = 1 | 2 | 3;

interface InlineToolbarProps {
  aiChatActive?: boolean;
  onToggleAiChat?: () => void;
}

export function InlineToolbar(_props: InlineToolbarProps = {}) {
  const inlineEditorNodeId = useChainStore(s => s.inlineEditorNodeId);
  const nodes = useChainStore(s => s.nodes);
  const setToolbarExtraHeight = usePanelStore(s => s.setToolbarExtraHeight);

  // Find the current node in the tree
  const currentNode = useMemo(() => {
    if (inlineEditorNodeId == null) return undefined;
    return findNodeById(nodes, inlineEditorNodeId);
  }, [nodes, inlineEditorNodeId]);

  const node = (currentNode?.type === 'plugin' ? currentNode : undefined) as PluginNodeUI | undefined;

  // Show second toolbar row when ducking knobs are visible
  const showLevel2 = node != null && !node.isDryPath && node.duckEnabled &&
    isNodeInParallelGroup(nodes, node.id);
  const totalHeight = showLevel2 ? 80 : 44;

  useEffect(() => {
    setToolbarExtraHeight(showLevel2 ? 36 : 0);
  }, [setToolbarExtraHeight, showLevel2]);

  // Reset toolbar extra height when unmounting
  useEffect(() => {
    return () => {
      usePanelStore.getState().setToolbarExtraHeight(0);
    };
  }, []);

  if (!node) return null;

  return (
    <div
      className="relative bg-[#0a0a0a] border-t border-white/5"
      style={{ height: totalHeight }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center h-[44px] px-2 gap-2">
        <ToolbarLevel1 node={node} />
      </div>
      {showLevel2 && (
        <div className="flex items-center h-[36px] px-2 border-t border-white/5">
          <ToolbarLevel2 node={node} />
        </div>
      )}
    </div>
  );
}
