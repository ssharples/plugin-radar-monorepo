import { useEffect, useCallback, useRef } from 'react';
import { useChainStore } from '../stores/chainStore';

interface KeyboardShortcutOptions {
  onOpenSearch: () => void;
  isSearchOpen: boolean;
}

/**
 * Central keyboard shortcut handler for the chain editor.
 *
 * Handles:
 * - Cmd/Ctrl+F → open quick search (prevents browser find)
 * - Backspace / Delete → remove selected node from chain
 * - Undo / Redo already handled in ChainEditor's own effect
 */
export function useKeyboardShortcuts({ onOpenSearch, isSearchOpen }: KeyboardShortcutOptions) {
  const onOpenSearchRef = useRef(onOpenSearch);
  onOpenSearchRef.current = onOpenSearch;

  const isSearchOpenRef = useRef(isSearchOpen);
  isSearchOpenRef.current = isSearchOpen;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isMod = e.metaKey || e.ctrlKey;
    const target = e.target as HTMLElement;
    const isInputFocused =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable;

    // Cmd/Ctrl+F → open quick search
    if (isMod && e.key === 'f') {
      e.preventDefault();
      e.stopPropagation();
      onOpenSearchRef.current();
      return;
    }

    // Don't process delete shortcuts when search is open or input focused
    if (isSearchOpenRef.current || isInputFocused) return;

    // Backspace / Delete → remove selected node
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const { selectedNodeId, slots, removeNode, selectNode } = useChainStore.getState();
      if (selectedNodeId === null) return;

      e.preventDefault();

      // Find index in flat slots for focus management
      const slotIndex = slots.findIndex((s) => s.index === selectedNodeId || s.uid === selectedNodeId);

      // Remove via tree API
      removeNode(selectedNodeId).then((success) => {
        if (!success) return;

        // Move focus to adjacent node
        const { nodes: newNodes } = useChainStore.getState();
        const newSlots = useChainStore.getState().slots;

        if (newSlots.length === 0 && newNodes.length === 0) {
          selectNode(null);
          return;
        }

        // Try previous, then next, then first
        if (slotIndex > 0 && newSlots[slotIndex - 1]) {
          // If slots use index as id
          selectNode(newNodes[Math.min(slotIndex - 1, newNodes.length - 1)]?.id ?? null);
        } else if (newNodes.length > 0) {
          // Select the first available node
          selectNode(findFirstPluginId(newNodes));
        } else {
          selectNode(null);
        }
      });
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);
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
