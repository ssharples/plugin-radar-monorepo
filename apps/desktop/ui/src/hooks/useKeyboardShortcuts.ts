import { useEffect, type RefObject } from 'react';
import { useChainStore } from '../stores/chainStore';
import { useKeyboardStore, ShortcutPriority } from '../stores/keyboardStore';

interface KeyboardShortcutOptions {
  /** Ref to the PluginBrowser search input element */
  searchInputRef: RefObject<HTMLInputElement | null>;
  /** Whether the search input is currently focused */
  isSearchFocused: boolean;
}

/**
 * Global keyboard shortcuts for the desktop UI.
 *
 * Handles:
 * - Cmd/Ctrl+F → focus the PluginBrowser search input
 * - Backspace / Delete → remove selected node from chain
 */
export function useKeyboardShortcuts({ searchInputRef, isSearchFocused }: KeyboardShortcutOptions) {
  const registerShortcut = useKeyboardStore((state) => state.registerShortcut);

  // Cmd/Ctrl+F → focus plugin browser search
  useEffect(() => {
    return registerShortcut({
      id: 'focus-plugin-search',
      key: 'f',
      priority: ShortcutPriority.GLOBAL,
      allowInInputs: true, // Should work even when typing elsewhere
      handler: (e) => {
        // Check for Cmd (Mac) or Ctrl (Windows/Linux)
        if (!e.metaKey && !e.ctrlKey) return;

        e.preventDefault();
        e.stopPropagation();
        const input = searchInputRef.current;
        if (input) {
          input.focus();
          input.select();
        }
      }
    });
  }, [registerShortcut, searchInputRef]);

  // Backspace → remove selected node
  useEffect(() => {
    return registerShortcut({
      id: 'delete-node-backspace',
      key: 'Backspace',
      priority: ShortcutPriority.GLOBAL,
      allowInInputs: false, // Don't delete nodes while typing
      handler: (e) => {
        const { selectedNodeId, slots, removeNode, selectNode } = useChainStore.getState();
        if (selectedNodeId === null) return;

        e.preventDefault();

        // Find index in flat slots for focus management
        const slotIndex = slots.findIndex((s) => s.index === selectedNodeId || s.uid === selectedNodeId);

        removeNode(selectedNodeId).then((success) => {
          if (!success) return;

          const { nodes: newNodes } = useChainStore.getState();
          const newSlots = useChainStore.getState().slots;

          if (newSlots.length === 0 && newNodes.length === 0) {
            selectNode(null);
            return;
          }

          // Move focus to previous node, or first if deleted was first
          if (slotIndex > 0 && newNodes.length > 0) {
            selectNode(newNodes[Math.min(slotIndex - 1, newNodes.length - 1)]?.id ?? null);
          } else if (newNodes.length > 0) {
            selectNode(findFirstPluginId(newNodes));
          } else {
            selectNode(null);
          }
        });
      }
    });
  }, [registerShortcut]);

  // Delete → remove selected node
  useEffect(() => {
    return registerShortcut({
      id: 'delete-node-delete',
      key: 'Delete',
      priority: ShortcutPriority.GLOBAL,
      allowInInputs: false, // Don't delete nodes while typing
      handler: (e) => {
        const { selectedNodeId, slots, removeNode, selectNode } = useChainStore.getState();
        if (selectedNodeId === null) return;

        e.preventDefault();

        // Find index in flat slots for focus management
        const slotIndex = slots.findIndex((s) => s.index === selectedNodeId || s.uid === selectedNodeId);

        removeNode(selectedNodeId).then((success) => {
          if (!success) return;

          const { nodes: newNodes } = useChainStore.getState();
          const newSlots = useChainStore.getState().slots;

          if (newSlots.length === 0 && newNodes.length === 0) {
            selectNode(null);
            return;
          }

          // Move focus to previous node, or first if deleted was first
          if (slotIndex > 0 && newNodes.length > 0) {
            selectNode(newNodes[Math.min(slotIndex - 1, newNodes.length - 1)]?.id ?? null);
          } else if (newNodes.length > 0) {
            selectNode(findFirstPluginId(newNodes));
          } else {
            selectNode(null);
          }
        });
      }
    });
  }, [registerShortcut]);
}

/** Walk the node tree and return the ID of the first plugin node */
function findFirstPluginId(nodes: import('../api/types').ChainNodeUI[]): number | null {
  for (const node of nodes) {
    if (node.type === 'plugin') return node.id;
    if (node.type === 'group') {
      const found = findFirstPluginId(node.children);
      if (found !== null) return found;
    }
  }
  return null;
}
