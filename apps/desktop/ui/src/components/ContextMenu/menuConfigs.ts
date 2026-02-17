import type { MenuItemDef } from './ContextMenu';
import type { PluginNodeUI, GroupNodeUI } from '../../api/types';

// ── Types for action context ───────────────────────────────────────────

export interface PluginSlotContext {
  node: PluginNodeUI;
  nodeId: number;
  parentId: number;
  indexInParent: number;
  hasMatchedPlugin: boolean;
  isEditorOpen: boolean;
  hasClipboard: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export interface GroupContext {
  node: GroupNodeUI;
  nodeId: number;
  isSerial: boolean;
  isCollapsed: boolean;
}

export interface EmptySpaceContext {
  hasClipboard: boolean;
  hasNodes: boolean;
}

// ── Action handlers (to be wired by the integrating component) ─────────

export interface PluginSlotActions {
  toggleBypass: () => void;
  toggleSolo: () => void;
  remove: () => void;
  duplicate: () => void;
  replaceWithSimilar: () => void;
  moveUp: () => void;
  moveDown: () => void;
  savePreset: () => void;
  loadPreset: () => void;
  openPluginWindow: () => void;
  openInlineEditor: () => void;
  copyPluginSettings: () => void;
  pastePluginSettings: () => void;
  createSerialGroup: () => void;
  createParallelGroup: () => void;
  insertBelow: () => void;
}

export interface GroupActions {
  addPlugin: () => void;
  addDryPath?: () => void;
  convertToSerial: () => void;
  convertToParallel: () => void;
  dissolveGroup: () => void;
  setDryWet: () => void;
  toggleCollapsed: () => void;
  saveAsTemplate: () => void;
  removeGroup: () => void;
}

export interface EmptySpaceActions {
  addPlugin: () => void;
  pastePlugin: () => void;
  importChain: () => void;
  createSerialGroup: () => void;
  createParallelGroup: () => void;
}

// ── Menu builders ──────────────────────────────────────────────────────

const IS_MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
const CMD = IS_MAC ? '\u2318' : 'Ctrl+';

export function buildPluginSlotMenu(
  ctx: PluginSlotContext,
  actions: PluginSlotActions,
): MenuItemDef[] {
  const items: MenuItemDef[] = [
    {
      id: 'bypass',
      label: ctx.node.bypassed ? 'Enable' : 'Bypass',
      shortcut: 'B',
      checked: !ctx.node.bypassed,
      action: actions.toggleBypass,
    },
    {
      id: 'solo',
      label: 'Solo',
      shortcut: 'S',
      checked: ctx.node.solo ?? false,
      action: actions.toggleSolo,
    },
    {
      id: 'remove',
      label: 'Remove Plugin',
      shortcut: `${CMD}${IS_MAC ? '\u232B' : 'Del'}`,
      danger: true,
      action: actions.remove,
      dividerAfter: true,
    },
    {
      id: 'duplicate',
      label: 'Duplicate',
      shortcut: `${CMD}D`,
      action: actions.duplicate,
    },
    {
      id: 'insert-below',
      label: 'Insert Plugin Below',
      shortcut: `${CMD}I`,
      action: actions.insertBelow,
      dividerAfter: true,
    },
    {
      id: 'move-up',
      label: 'Move Up',
      shortcut: `${CMD}\u2191`,
      disabled: !ctx.canMoveUp,
      action: actions.moveUp,
    },
    {
      id: 'move-down',
      label: 'Move Down',
      shortcut: `${CMD}\u2193`,
      disabled: !ctx.canMoveDown,
      action: actions.moveDown,
      dividerAfter: true,
    },
    {
      id: 'group-serial',
      label: 'Wrap in Serial Group',
      shortcut: `${CMD}G`,
      action: actions.createSerialGroup,
    },
    {
      id: 'group-parallel',
      label: 'Wrap in Parallel Group',
      shortcut: `${CMD}\u21E7G`,
      action: actions.createParallelGroup,
      dividerAfter: true,
    },
    {
      id: 'save-preset',
      label: 'Save Preset...',
      action: actions.savePreset,
    },
    {
      id: 'load-preset',
      label: 'Load Preset...',
      action: actions.loadPreset,
      dividerAfter: true,
    },
    {
      id: 'open-window',
      label: ctx.isEditorOpen ? 'Close Plugin Window' : 'Open Plugin Window',
      shortcut: 'E',
      action: actions.openPluginWindow,
    },
    {
      id: 'open-inline',
      label: 'Edit Inline',
      shortcut: 'Enter',
      action: actions.openInlineEditor,
      dividerAfter: true,
    },
    {
      id: 'copy-settings',
      label: 'Copy Plugin Settings',
      shortcut: `${CMD}C`,
      action: actions.copyPluginSettings,
    },
    {
      id: 'paste-settings',
      label: 'Paste Plugin Settings',
      shortcut: `${CMD}V`,
      disabled: !ctx.hasClipboard,
      action: actions.pastePluginSettings,
    },
  ];

  // Add "Replace with Similar" only when we have a matched plugin
  if (ctx.hasMatchedPlugin) {
    items.splice(5, 0, {
      id: 'replace-similar',
      label: 'Replace with Similar...',
      action: actions.replaceWithSimilar,
      dividerAfter: true,
    });
  }

  return items;
}

export function buildGroupMenu(
  ctx: GroupContext,
  actions: GroupActions,
): MenuItemDef[] {
  const hasDryPath = !ctx.isSerial && ctx.node.children.some(
    c => c.type === 'plugin' && c.isDryPath
  );

  return [
    {
      id: 'add-plugin',
      label: 'Add Plugin...',
      shortcut: `${CMD}I`,
      action: actions.addPlugin,
      dividerAfter: !(!ctx.isSerial && !hasDryPath && actions.addDryPath),
    },
    // Add Dry Path option for parallel groups without one
    ...(!ctx.isSerial && !hasDryPath && actions.addDryPath ? [{
      id: 'add-dry-path',
      label: 'Add Dry Path',
      action: actions.addDryPath,
      dividerAfter: true as const,
    }] : []),
    {
      id: 'convert-mode',
      label: ctx.isSerial ? 'Convert to Parallel' : 'Convert to Serial',
      action: ctx.isSerial ? actions.convertToParallel : actions.convertToSerial,
    },
    {
      id: 'dissolve',
      label: 'Dissolve Group',
      action: actions.dissolveGroup,
      dividerAfter: true,
    },
    {
      id: 'collapse-expand',
      label: ctx.isCollapsed ? 'Expand' : 'Collapse',
      action: actions.toggleCollapsed,
      dividerAfter: true,
    },
    {
      id: 'save-template',
      label: 'Save as Group Template...',
      action: actions.saveAsTemplate,
      dividerAfter: true,
    },
    {
      id: 'remove-group',
      label: 'Remove Group',
      danger: true,
      action: actions.removeGroup,
    },
  ];
}

export function buildEmptySpaceMenu(
  ctx: EmptySpaceContext,
  actions: EmptySpaceActions,
): MenuItemDef[] {
  return [
    {
      id: 'add-plugin',
      label: 'Add Plugin...',
      shortcut: `${CMD}I`,
      action: actions.addPlugin,
      dividerAfter: true,
    },
    {
      id: 'paste-plugin',
      label: 'Paste Plugin',
      shortcut: `${CMD}V`,
      disabled: !ctx.hasClipboard,
      action: actions.pastePlugin,
      dividerAfter: true,
    },
    {
      id: 'import-chain',
      label: 'Import Chain...',
      action: actions.importChain,
      dividerAfter: true,
    },
    {
      id: 'create-serial',
      label: 'Create Serial Group',
      shortcut: `${CMD}G`,
      action: actions.createSerialGroup,
    },
    {
      id: 'create-parallel',
      label: 'Create Parallel Group',
      shortcut: `${CMD}\u21E7G`,
      action: actions.createParallelGroup,
    },
  ];
}
