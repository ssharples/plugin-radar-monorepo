import { useMemo } from 'react';
import { ContextMenu, type MenuItemDef } from '../ContextMenu';
import { useChainStore } from '../../stores/chainStore';
import { useChainActions } from '../../stores/chainStore';
import { getCategoryColor } from '../../constants/categoryColors';

interface SlotContextMenuProps {
  position: { x: number; y: number };
  nodeId: number;
  nodeFileOrIdentifier: string;
  parentId: number;
  indexInParent: number;
  onClose: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onShowSwapMenu: () => void;
}

const COLOR_PRESETS = [
  { id: 'eq', label: 'EQ' },
  { id: 'compressor', label: 'Compression' },
  { id: 'reverb', label: 'Reverb' },
  { id: 'delay', label: 'Delay' },
  { id: 'modulation', label: 'Modulation' },
  { id: 'utility', label: 'Utility' },
];

export function SlotContextMenu({
  position,
  nodeId,
  nodeFileOrIdentifier,
  parentId,
  indexInParent,
  onClose,
  onDuplicate,
  onRemove,
  onShowSwapMenu,
}: SlotContextMenuProps) {
  const nodes = useChainStore((s) => s.nodes);
  const currentColor = useChainStore((s) => s.slotColors[nodeId]);
  const pluginClipboard = useChainStore((s) => s.pluginClipboard);
  const setSlotColor = useChainStore((s) => s.setSlotColor);
  const clearSlotColor = useChainStore((s) => s.clearSlotColor);
  const { pastePluginSettings, openInlineEditor, toggleNodeBypass, duplicateNode, showInlineSearchBelow } = useChainActions();

  const matchingInstances = useMemo(() => {
    const result: Array<{ id: number; name: string }> = [];
    const walk = (nodeList: typeof nodes) => {
      for (const node of nodeList) {
        if (node.type === 'plugin' && node.fileOrIdentifier === nodeFileOrIdentifier && node.id !== nodeId) {
          result.push({ id: node.id, name: node.name });
        }
        if (node.type === 'group') walk(node.children);
      }
    };
    walk(nodes);
    return result;
  }, [nodeFileOrIdentifier, nodeId, nodes]);

  const items: MenuItemDef[] = [
    {
      id: 'edit-inline',
      label: 'Edit Inline',
      shortcut: 'Enter',
      action: () => {
        openInlineEditor(nodeId);
        onClose();
      },
    },
    {
      id: 'replace-plugin',
      label: 'Replace Plugin',
      action: () => {
        onShowSwapMenu();
        onClose();
      },
    },
    {
      id: 'insert-below',
      label: 'Insert Plugin Below',
      action: () => {
        showInlineSearchBelow(nodeId, parentId, indexInParent + 1);
        onClose();
      },
      dividerAfter: true,
    },
    {
      id: 'toggle-bypass',
      label: 'Bypass',
      shortcut: 'B',
      action: () => {
        toggleNodeBypass(nodeId);
        onClose();
      },
    },
    {
      id: 'duplicate',
      label: 'Duplicate',
      shortcut: '⌘D',
      action: () => {
        duplicateNode(nodeId);
        onDuplicate();
      },
    },
    {
      id: 'paste-settings',
      label: 'Paste Plugin Settings',
      disabled: !pluginClipboard,
      action: async () => {
        await pastePluginSettings(pluginClipboard?.nodeId ?? nodeId, nodeId);
        onClose();
      },
    },
    {
      id: 'paste-to-instance',
      label: 'Paste Settings To Instance',
      disabled: matchingInstances.length === 0,
      children: matchingInstances.map((instance) => ({
        id: `paste-${instance.id}`,
        label: instance.name,
        action: async () => {
          await pastePluginSettings(nodeId, instance.id);
          onClose();
        },
      })),
      dividerAfter: true,
    },
    {
      id: 'slot-color',
      label: 'Slot Color',
      children: [
        ...COLOR_PRESETS.map((preset) => ({
          id: `color-${preset.id}`,
          label: preset.label,
          checked: currentColor === getCategoryColor(preset.id),
          action: () => {
            setSlotColor(nodeId, getCategoryColor(preset.id));
            onClose();
          },
        })),
        {
          id: 'color-clear',
          label: 'Auto',
          checked: !currentColor,
          action: () => {
            clearSlotColor(nodeId);
            onClose();
          },
        },
      ],
      dividerAfter: true,
    },
    {
      id: 'remove',
      label: 'Delete Plugin',
      danger: true,
      action: onRemove,
    },
  ];

  return <ContextMenu x={position.x} y={position.y} items={items} onClose={onClose} />;
}
