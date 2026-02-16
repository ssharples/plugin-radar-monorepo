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
  openInlineEditor
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
}
