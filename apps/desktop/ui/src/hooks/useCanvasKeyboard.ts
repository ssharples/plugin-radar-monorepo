import { useEffect } from 'react';
import { useKeyboardStore, ShortcutPriority } from '../stores/keyboardStore';
import { useChainStore } from '../stores/chainStore';
import { juceBridge } from '../api/juce-bridge';
import type { ChainNodeUI } from '../api/types';

// Helper: find a node by ID in the tree
function findNodeById(nodes: ChainNodeUI[], id: number): ChainNodeUI | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.type === 'group') {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

interface CanvasKeyboardOptions {
  closeContextMenu?: () => void;
  isContextMenuOpen?: boolean;
}

/**
 * Keyboard shortcuts for the ReactFlow canvas.
 *
 * - Cmd+Z: Undo
 * - Cmd+Shift+Z: Redo
 * - B: Toggle bypass on selected node
 * - M / I: Toggle mute on selected node
 * - Delete/Backspace: Remove selected node
 * - Escape: Deselect / close context menu
 */
export function useCanvasKeyboard({ closeContextMenu, isContextMenuOpen }: CanvasKeyboardOptions = {}) {
  const registerShortcut = useKeyboardStore((state) => state.registerShortcut);

  // Cmd+Z -> Undo
  useEffect(() => {
    return registerShortcut({
      id: 'canvas-undo',
      key: 'z',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        if ((!e.metaKey && !e.ctrlKey) || e.shiftKey) return;
        e.preventDefault();
        useChainStore.getState().undo();
      },
    });
  }, [registerShortcut]);

  // Cmd+Shift+Z -> Redo
  useEffect(() => {
    return registerShortcut({
      id: 'canvas-redo',
      key: 'z',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        if ((!e.metaKey && !e.ctrlKey) || !e.shiftKey) return;
        e.preventDefault();
        useChainStore.getState().redo();
      },
    });
  }, [registerShortcut]);

  // B -> Toggle bypass on selected node
  useEffect(() => {
    return registerShortcut({
      id: 'canvas-bypass',
      key: 'b',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
        const { selectedNodeId, toggleNodeBypass } = useChainStore.getState();
        if (selectedNodeId === null) return;
        e.preventDefault();
        toggleNodeBypass(selectedNodeId);
      },
    });
  }, [registerShortcut]);

  // M -> Toggle mute on selected node
  useEffect(() => {
    return registerShortcut({
      id: 'canvas-mute-m',
      key: 'm',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
        const { selectedNodeId, nodes } = useChainStore.getState();
        if (selectedNodeId === null) return;
        const node = findNodeById(nodes, selectedNodeId);
        if (!node || node.type !== 'plugin') return;
        e.preventDefault();
        juceBridge.setNodeMute(selectedNodeId, !node.mute);
      },
    });
  }, [registerShortcut]);

  // I -> Toggle mute on selected node (alternative)
  useEffect(() => {
    return registerShortcut({
      id: 'canvas-mute-i',
      key: 'i',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
        const { selectedNodeId, nodes } = useChainStore.getState();
        if (selectedNodeId === null) return;
        const node = findNodeById(nodes, selectedNodeId);
        if (!node || node.type !== 'plugin') return;
        e.preventDefault();
        juceBridge.setNodeMute(selectedNodeId, !node.mute);
      },
    });
  }, [registerShortcut]);

  // Delete -> Remove selected node
  useEffect(() => {
    return registerShortcut({
      id: 'canvas-delete',
      key: 'Delete',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
        const { selectedNodeId, removeNode, selectNode } = useChainStore.getState();
        if (selectedNodeId === null) return;
        e.preventDefault();
        removeNode(selectedNodeId);
        selectNode(null);
      },
    });
  }, [registerShortcut]);

  // Backspace -> Remove selected node
  useEffect(() => {
    return registerShortcut({
      id: 'canvas-backspace',
      key: 'Backspace',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
        const { selectedNodeId, removeNode, selectNode } = useChainStore.getState();
        if (selectedNodeId === null) return;
        e.preventDefault();
        removeNode(selectedNodeId);
        selectNode(null);
      },
    });
  }, [registerShortcut]);

  // Escape -> Close context menu or deselect
  useEffect(() => {
    return registerShortcut({
      id: 'canvas-escape',
      key: 'Escape',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: true,
      handler: (e) => {
        // 1. Close context menu if open
        if (isContextMenuOpen && closeContextMenu) {
          e.preventDefault();
          closeContextMenu();
          return;
        }

        // 2. Deselect selected node
        const { selectedNodeId, selectNode } = useChainStore.getState();
        if (selectedNodeId !== null) {
          e.preventDefault();
          selectNode(null);
          return;
        }
      },
    });
  }, [registerShortcut, isContextMenuOpen, closeContextMenu]);
}
