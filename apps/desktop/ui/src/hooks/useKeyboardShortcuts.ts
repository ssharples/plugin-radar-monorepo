import { useEffect, useCallback, useRef, type RefObject } from 'react';
import { useChainStore } from '../stores/chainStore';

interface KeyboardShortcutOptions {
  /** Ref to the PluginBrowser search input element */
  searchInputRef: RefObject<HTMLInputElement | null>;
  /** Whether the search input is currently focused */
  isSearchFocused: boolean;
}

/**
 * Central keyboard shortcut handler for the desktop UI.
 *
 * Handles:
 * - Cmd/Ctrl+F → focus the PluginBrowser search input
 * - Backspace / Delete → remove selected node from chain
 * - Escape → blur search input and clear query
 */
export function useKeyboardShortcuts({ searchInputRef, isSearchFocused }: KeyboardShortcutOptions) {
  const isSearchFocusedRef = useRef(isSearchFocused);
  isSearchFocusedRef.current = isSearchFocused;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isMod = e.metaKey || e.ctrlKey;
    const target = e.target as HTMLElement;
    const isInputFocused =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable;

    // Cmd/Ctrl+F → focus the existing PluginBrowser search input
    if (isMod && e.key === 'f') {
      e.preventDefault();
      e.stopPropagation();
      const input = searchInputRef.current;
      if (input) {
        input.focus();
        input.select();
      }
      return;
    }

    // Don't process delete shortcuts when any input is focused
    if (isInputFocused) return;

    // Backspace / Delete → remove selected node
    if (e.key === 'Backspace' || e.key === 'Delete') {
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
  }, [searchInputRef]);

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
