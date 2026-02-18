import { useEffect } from 'react';
import { useKeyboardStore, ShortcutPriority } from '../stores/keyboardStore';
import { useChainStore } from '../stores/chainStore';
import { collectPlugins } from '../utils/chainHelpers';

interface ChainEditorShortcutsOptions {
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  selectedIds: Set<number>;
  createGroup: (ids: number[], mode: 'serial' | 'parallel') => void;
  clearSelection: () => void;
  saveSnapshot: (index: number) => void;
  recallSnapshot: (index: number) => void;
  openInlineEditor: (nodeId: number) => void;
  isContextMenuOpen?: boolean;
  closeContextMenu?: () => void;
}

/**
 * ChainEditor-specific keyboard shortcuts
 *
 * Handles:
 * - Cmd+Z → Undo
 * - Cmd+Shift+Z / Cmd+Y → Redo
 * - Cmd+G → Create serial group (2+ nodes selected)
 * - Cmd+Shift+G → Create parallel group
 * - Cmd+Option+1/2/3/4 → Recall snapshot
 * - Cmd+Option+Shift+1/2/3/4 → Save snapshot
 * - Cmd+1-9 → Jump to plugin N (inline editor)
 */
export function useChainEditorShortcuts({
  undo,
  redo,
  canUndo,
  canRedo,
  selectedIds,
  createGroup,
  clearSelection,
  saveSnapshot,
  recallSnapshot,
  openInlineEditor,
  isContextMenuOpen,
  closeContextMenu,
}: ChainEditorShortcutsOptions) {
  const registerShortcut = useKeyboardStore((state) => state.registerShortcut);

  // Cmd+Z → Undo
  useEffect(() => {
    return registerShortcut({
      id: 'chain-editor-undo',
      key: 'z',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false, // CRITICAL: Don't interfere with native input undo
      handler: (e) => {
        // Check for Cmd (Mac) or Ctrl (Windows/Linux), but NOT Shift
        if ((!e.metaKey && !e.ctrlKey) || e.shiftKey) return;

        e.preventDefault();
        if (canUndo()) undo();
      }
    });
  }, [registerShortcut, undo, canUndo]);

  // Cmd+Shift+Z → Redo
  useEffect(() => {
    return registerShortcut({
      id: 'chain-editor-redo-z',
      key: 'z',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        // Check for Cmd (Mac) or Ctrl (Windows/Linux) AND Shift
        if ((!e.metaKey && !e.ctrlKey) || !e.shiftKey) return;

        e.preventDefault();
        if (canRedo()) redo();
      }
    });
  }, [registerShortcut, redo, canRedo]);

  // Cmd+Y → Redo (alternate)
  useEffect(() => {
    return registerShortcut({
      id: 'chain-editor-redo-y',
      key: 'y',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        // Check for Cmd (Mac) or Ctrl (Windows/Linux), but NOT Shift
        if ((!e.metaKey && !e.ctrlKey) || e.shiftKey) return;

        e.preventDefault();
        if (canRedo()) redo();
      }
    });
  }, [registerShortcut, redo, canRedo]);

  // Cmd+G → Create serial group
  useEffect(() => {
    return registerShortcut({
      id: 'chain-editor-serial-group',
      key: 'g',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        // Check for Cmd (Mac) or Ctrl (Windows/Linux), but NOT Shift
        if ((!e.metaKey && !e.ctrlKey) || e.shiftKey) return;
        if (selectedIds.size < 2) return;

        e.preventDefault();
        const ids = Array.from(selectedIds);
        createGroup(ids, 'serial');
        clearSelection();
      }
    });
  }, [registerShortcut, selectedIds, createGroup, clearSelection]);

  // Cmd+Shift+G → Create parallel group
  useEffect(() => {
    return registerShortcut({
      id: 'chain-editor-parallel-group',
      key: 'G',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        // Check for Cmd (Mac) or Ctrl (Windows/Linux) AND Shift
        if ((!e.metaKey && !e.ctrlKey) || !e.shiftKey) return;
        if (selectedIds.size < 2) return;

        e.preventDefault();
        const ids = Array.from(selectedIds);
        createGroup(ids, 'parallel');
        clearSelection();
      }
    });
  }, [registerShortcut, selectedIds, createGroup, clearSelection]);

  // Cmd+1-9 → Jump to plugin N (open inline editor)
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    for (let n = 1; n <= 9; n++) {
      cleanups.push(registerShortcut({
        id: `chain-editor-plugin-jump-${n}`,
        key: String(n),
        priority: ShortcutPriority.COMPONENT,
        allowInInputs: false,
        handler: (e) => {
          // Cmd+N without Alt (Alt+N is for snapshots)
          if ((!e.metaKey && !e.ctrlKey) || e.altKey) return;

          e.preventDefault();
          const nodes = useChainStore.getState().nodes;
          const plugins = collectPlugins(nodes);
          const target = plugins[n - 1];
          if (target) openInlineEditor(target.id);
        },
      }));
    }

    return () => cleanups.forEach(fn => fn());
  }, [registerShortcut, openInlineEditor]);

  // Cmd+Option+1 → Recall snapshot A
  useEffect(() => {
    return registerShortcut({
      id: 'chain-editor-recall-snapshot-1',
      key: '1',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        if ((!e.metaKey && !e.ctrlKey) || !e.altKey || e.shiftKey) return;
        e.preventDefault();
        recallSnapshot(0);
      }
    });
  }, [registerShortcut, recallSnapshot]);

  // Cmd+Option+2 → Recall snapshot B
  useEffect(() => {
    return registerShortcut({
      id: 'chain-editor-recall-snapshot-2',
      key: '2',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        if ((!e.metaKey && !e.ctrlKey) || !e.altKey || e.shiftKey) return;
        e.preventDefault();
        recallSnapshot(1);
      }
    });
  }, [registerShortcut, recallSnapshot]);

  // Cmd+Option+3 → Recall snapshot C
  useEffect(() => {
    return registerShortcut({
      id: 'chain-editor-recall-snapshot-3',
      key: '3',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        if ((!e.metaKey && !e.ctrlKey) || !e.altKey || e.shiftKey) return;
        e.preventDefault();
        recallSnapshot(2);
      }
    });
  }, [registerShortcut, recallSnapshot]);

  // Cmd+Option+4 → Recall snapshot D
  useEffect(() => {
    return registerShortcut({
      id: 'chain-editor-recall-snapshot-4',
      key: '4',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        if ((!e.metaKey && !e.ctrlKey) || !e.altKey || e.shiftKey) return;
        e.preventDefault();
        recallSnapshot(3);
      }
    });
  }, [registerShortcut, recallSnapshot]);

  // Cmd+Option+Shift+1 → Save snapshot A
  useEffect(() => {
    return registerShortcut({
      id: 'chain-editor-save-snapshot-1',
      key: '!', // Shift+1 produces '!'
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        if ((!e.metaKey && !e.ctrlKey) || !e.altKey || !e.shiftKey) return;
        e.preventDefault();
        saveSnapshot(0);
      }
    });
  }, [registerShortcut, saveSnapshot]);

  // Cmd+Option+Shift+2 → Save snapshot B
  useEffect(() => {
    return registerShortcut({
      id: 'chain-editor-save-snapshot-2',
      key: '@', // Shift+2 produces '@'
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        if ((!e.metaKey && !e.ctrlKey) || !e.altKey || !e.shiftKey) return;
        e.preventDefault();
        saveSnapshot(1);
      }
    });
  }, [registerShortcut, saveSnapshot]);

  // Cmd+Option+Shift+3 → Save snapshot C
  useEffect(() => {
    return registerShortcut({
      id: 'chain-editor-save-snapshot-3',
      key: '#', // Shift+3 produces '#'
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        if ((!e.metaKey && !e.ctrlKey) || !e.altKey || !e.shiftKey) return;
        e.preventDefault();
        saveSnapshot(2);
      }
    });
  }, [registerShortcut, saveSnapshot]);

  // Cmd+Option+Shift+4 → Save snapshot D
  useEffect(() => {
    return registerShortcut({
      id: 'chain-editor-save-snapshot-4',
      key: '$', // Shift+4 produces '$'
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        if ((!e.metaKey && !e.ctrlKey) || !e.altKey || !e.shiftKey) return;
        e.preventDefault();
        saveSnapshot(3);
      }
    });
  }, [registerShortcut, saveSnapshot]);

  // =============================================
  // Arrow-key chain navigation
  // =============================================

  // ArrowUp → Select previous plugin
  useEffect(() => {
    return registerShortcut({
      id: 'chain-editor-arrow-up',
      key: 'ArrowUp',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        // Don't interfere with modifier combos
        if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

        const { selectedNodeId, nodes, selectNode } = useChainStore.getState();
        const plugins = collectPlugins(nodes);
        if (plugins.length === 0) return;

        e.preventDefault();

        if (selectedNodeId === null) {
          // Nothing selected — select the last plugin
          selectNode(plugins[plugins.length - 1].id);
          return;
        }

        const currentIndex = plugins.findIndex(p => p.id === selectedNodeId);
        if (currentIndex <= 0) {
          // Already at top or not found — wrap to last
          selectNode(plugins[plugins.length - 1].id);
        } else {
          selectNode(plugins[currentIndex - 1].id);
        }
      }
    });
  }, [registerShortcut]);

  // ArrowDown → Select next plugin
  useEffect(() => {
    return registerShortcut({
      id: 'chain-editor-arrow-down',
      key: 'ArrowDown',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        // Don't interfere with modifier combos
        if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

        const { selectedNodeId, nodes, selectNode } = useChainStore.getState();
        const plugins = collectPlugins(nodes);
        if (plugins.length === 0) return;

        e.preventDefault();

        if (selectedNodeId === null) {
          // Nothing selected — select the first plugin
          selectNode(plugins[0].id);
          return;
        }

        const currentIndex = plugins.findIndex(p => p.id === selectedNodeId);
        if (currentIndex === -1 || currentIndex >= plugins.length - 1) {
          // At bottom or not found — wrap to first
          selectNode(plugins[0].id);
        } else {
          selectNode(plugins[currentIndex + 1].id);
        }
      }
    });
  }, [registerShortcut]);

  // =============================================
  // Quick actions on selected plugin
  // =============================================

  // B → Toggle bypass on selected plugin
  useEffect(() => {
    return registerShortcut({
      id: 'chain-editor-bypass',
      key: 'b',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

        const { selectedNodeId, toggleNodeBypass } = useChainStore.getState();
        if (selectedNodeId === null) return;

        e.preventDefault();
        toggleNodeBypass(selectedNodeId);
      }
    });
  }, [registerShortcut]);

  // D → Duplicate selected plugin
  useEffect(() => {
    return registerShortcut({
      id: 'chain-editor-duplicate',
      key: 'd',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

        const { selectedNodeId, duplicateNode } = useChainStore.getState();
        if (selectedNodeId === null) return;

        e.preventDefault();
        duplicateNode(selectedNodeId);
      }
    });
  }, [registerShortcut]);

  // =============================================
  // Cmd+S → Save chain (dispatch event for HeaderMenu)
  // =============================================

  useEffect(() => {
    return registerShortcut({
      id: 'chain-editor-save',
      key: 's',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        if ((!e.metaKey && !e.ctrlKey) || e.shiftKey || e.altKey) return;

        e.preventDefault();
        window.dispatchEvent(new Event('showSaveDropdown'));
      }
    });
  }, [registerShortcut]);

  // =============================================
  // Escape key hierarchy
  // =============================================

  useEffect(() => {
    return registerShortcut({
      id: 'chain-editor-escape',
      key: 'Escape',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: true, // Escape should work even in inputs
      handler: (e) => {
        // 1. Context menu open → close it
        if (isContextMenuOpen && closeContextMenu) {
          e.preventDefault();
          closeContextMenu();
          return;
        }

        // 2. Search overlay open → close it
        const { searchOverlayActive, hideSearchOverlay } = useChainStore.getState();
        if (searchOverlayActive) {
          e.preventDefault();
          hideSearchOverlay();
          return;
        }

        // 3. Nodes selected → deselect all
        const { selectedNodeId, selectNode } = useChainStore.getState();
        if (selectedNodeId !== null) {
          e.preventDefault();
          selectNode(null);
          return;
        }

        // 4. Inline editor mode → exit
        const { inlineEditorNodeId, closeInlineEditor } = useChainStore.getState();
        if (inlineEditorNodeId !== null) {
          e.preventDefault();
          closeInlineEditor();
          return;
        }
      }
    });
  }, [registerShortcut, isContextMenuOpen, closeContextMenu]);
}
