import { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, GripVertical, Plus, Star, SlidersHorizontal, ListMusic, Route, LayoutList } from 'lucide-react';
import { useChainStore, useChainActions } from '../stores/chainStore';
import { useKeyboardStore, ShortcutPriority } from '../stores/keyboardStore';
import { collectPlugins, findNodeParentInfo } from '../utils/chainHelpers';
import { usePanelStore, type PanelId } from '../stores/panelStore';
import { ContextMenu, buildPluginSlotMenu } from './ContextMenu';
import type { MenuItemDef } from './ContextMenu';
import type { ChainNodeUI, PluginNodeUI } from '../api/types';
import { juceBridge } from '../api/juce-bridge';

// Find a plugin node by ID in the tree
function findPluginNode(nodes: ChainNodeUI[], id: number): PluginNodeUI | null {
  for (const node of nodes) {
    if (node.id === id && node.type === 'plugin') return node;
    if (node.type === 'group') {
      const found = findPluginNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

interface InlineEditorSidebarProps {
  galaxyActive?: boolean;
  onToggleGalaxy?: () => void;
}

export function InlineEditorSidebar({ galaxyActive, onToggleGalaxy }: InlineEditorSidebarProps) {
  const nodes = useChainStore(s => s.nodes);
  const inlineEditorNodeId = useChainStore(s => s.inlineEditorNodeId);
  const pluginClipboard = useChainStore(s => s.pluginClipboard);
  const {
    openInlineEditor, closeInlineEditor, closeGalaxy, saveSnapshot, recallSnapshot, moveNode,
    toggleNodeBypass, setBranchSolo, removeNode, duplicateNode, togglePluginEditor,
    createGroup, pastePluginSettings, showInlineSearchBelow,
  } = useChainActions();

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: MenuItemDef[] } | null>(null);

  const plugins = useMemo(() => collectPlugins(nodes), [nodes]);
  const pluginsRef = useRef(plugins);
  pluginsRef.current = plugins;

  // Register Cmd+1..9 shortcuts to switch plugins
  useEffect(() => {
    const register = useKeyboardStore.getState().registerShortcut;
    const cleanups: (() => void)[] = [];

    for (let n = 1; n <= 9; n++) {
      const cleanup = register({
        id: `inline-editor-switch-${n}`,
        key: String(n),
        priority: ShortcutPriority.COMPONENT,
        allowInInputs: false,
        handler: (e) => {
          if (!e.metaKey && !e.ctrlKey) return;
          if (e.altKey) return; // Let Cmd+Option+N pass through for snapshots
          e.preventDefault();
          const target = pluginsRef.current[n - 1];
          if (target) openInlineEditor(target.id);
        },
      });
      cleanups.push(cleanup);
    }

    // Cmd+0 → back to chain
    cleanups.push(register({
      id: 'inline-editor-back',
      key: '0',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: false,
      handler: (e) => {
        if (!e.metaKey && !e.ctrlKey) return;
        e.preventDefault();
        closeGalaxy();
        closeInlineEditor();
      },
    }));

    // Cmd+Option+1..4 → recall snapshot, Cmd+Option+Shift+1..4 → save snapshot
    const snapshotKeys = ['1', '2', '3', '4'];
    const snapshotSaveKeys = ['!', '@', '#', '$'];
    for (let n = 0; n < 4; n++) {
      cleanups.push(register({
        id: `inline-snapshot-recall-${n}`,
        key: snapshotKeys[n],
        priority: ShortcutPriority.COMPONENT,
        allowInInputs: false,
        handler: (e) => {
          if ((!e.metaKey && !e.ctrlKey) || !e.altKey || e.shiftKey) return;
          e.preventDefault();
          recallSnapshot(n);
        },
      }));
      cleanups.push(register({
        id: `inline-snapshot-save-${n}`,
        key: snapshotSaveKeys[n],
        priority: ShortcutPriority.COMPONENT,
        allowInInputs: false,
        handler: (e) => {
          if ((!e.metaKey && !e.ctrlKey) || !e.altKey || !e.shiftKey) return;
          e.preventDefault();
          saveSnapshot(n);
        },
      }));
    }

    return () => cleanups.forEach(fn => fn());
  }, [openInlineEditor, closeInlineEditor, closeGalaxy, saveSnapshot, recallSnapshot]);

  // DnD sensors with activation constraint to avoid accidental drags during clicks
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as number;
    const overId = over.id as number;
    const currentPlugins = pluginsRef.current;

    const oldIndex = currentPlugins.findIndex(p => p.id === activeId);
    const newIndex = currentPlugins.findIndex(p => p.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    // Find the parent info for the dragged node
    const info = findNodeParentInfo(nodesRef.current, activeId);
    if (!info) return;

    // Calculate the target index within the parent's children
    // moveNode expects a newIndex relative to the parent's children array
    const targetInfo = findNodeParentInfo(nodesRef.current, overId);
    if (!targetInfo) return;

    // If same parent, simple reorder
    if (info.parentId === targetInfo.parentId) {
      // moveNode uses insert-before semantics: newIndex is where the node will end up
      // If moving down, we need index + 1 because the source is removed first
      const adjustedIndex = newIndex > oldIndex ? targetInfo.index + 1 : targetInfo.index;
      await moveNode(activeId, info.parentId, adjustedIndex);
    }
  }, [moveNode]);

  // Build context menu for a specific plugin in the sidebar
  const handlePluginContextMenu = useCallback((e: React.MouseEvent, pluginId: number) => {
    e.preventDefault();
    e.stopPropagation();
    const node = findPluginNode(nodes, pluginId);
    if (!node) return;
    const info = findNodeParentInfo(nodes, pluginId);
    if (!info) return;

    // Check canMoveUp / canMoveDown
    const canMoveUp = info.index > 0;
    const findChildren = (list: ChainNodeUI[], parentId: number): ChainNodeUI[] | null => {
      if (parentId === 0) return list;
      for (const n of list) {
        if (n.id === parentId && n.type === 'group') return n.children;
        if (n.type === 'group') {
          const found = findChildren(n.children, parentId);
          if (found) return found;
        }
      }
      return null;
    };
    const siblings = findChildren(nodes, info.parentId);
    const canMoveDown = siblings ? info.index < siblings.length - 1 : false;

    const items = buildPluginSlotMenu(
      {
        node,
        nodeId: pluginId,
        parentId: info.parentId,
        indexInParent: info.index,
        hasMatchedPlugin: false, // no swap in sidebar
        isEditorOpen: false,
        hasClipboard: !!pluginClipboard,
        canMoveUp,
        canMoveDown,
      },
      {
        toggleBypass: () => toggleNodeBypass(pluginId),
        toggleSolo: () => setBranchSolo(pluginId, !(node.solo ?? false)),
        remove: () => removeNode(pluginId),
        duplicate: () => duplicateNode(pluginId),
        replaceWithSimilar: () => {},
        moveUp: () => moveNode(pluginId, info.parentId, Math.max(0, info.index - 1)),
        moveDown: () => moveNode(pluginId, info.parentId, info.index + 1),
        savePreset: () => juceBridge.savePreset(node.name, ''),
        loadPreset: () => {},
        openPluginWindow: () => togglePluginEditor(pluginId),
        openInlineEditor: () => openInlineEditor(pluginId),
        copyPluginSettings: () => {
          useChainStore.setState({
            pluginClipboard: { name: node.name, fileOrIdentifier: node.fileOrIdentifier ?? '', nodeId: pluginId },
          });
        },
        pastePluginSettings: () => {
          if (pluginClipboard) pastePluginSettings(pluginClipboard.nodeId, pluginId);
        },
        createSerialGroup: () => createGroup([pluginId], 'serial'),
        createParallelGroup: () => createGroup([pluginId], 'parallel'),
        insertBelow: () => showInlineSearchBelow(pluginId, info.parentId, info.index + 1),
      },
    );

    setContextMenu({ x: e.clientX, y: e.clientY, items });
  }, [nodes, pluginClipboard, toggleNodeBypass, setBranchSolo, removeNode, duplicateNode,
      moveNode, togglePluginEditor, openInlineEditor, pastePluginSettings, createGroup, showInlineSearchBelow]);

  // Context menu for empty area — "Add Plugin"
  const handleEmptyContextMenu = useCallback((e: React.MouseEvent) => {
    // Only if click target is the container itself (empty space), not a child
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    const items: MenuItemDef[] = [
      {
        id: 'add-plugin',
        label: 'Add Plugin...',
        action: () => {
          // Add after last plugin in root
          const lastPlugin = plugins[plugins.length - 1];
          if (lastPlugin) {
            const info = findNodeParentInfo(nodes, lastPlugin.id);
            if (info) showInlineSearchBelow(lastPlugin.id, info.parentId, info.index + 1);
          } else {
            showInlineSearchBelow(0, 0, 0);
          }
        },
      },
    ];
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  }, [plugins, nodes, showInlineSearchBelow]);

  // + button handler — add plugin after last
  const handleAddPlugin = useCallback(() => {
    const lastPlugin = plugins[plugins.length - 1];
    if (lastPlugin) {
      const info = findNodeParentInfo(nodes, lastPlugin.id);
      if (info) showInlineSearchBelow(lastPlugin.id, info.parentId, info.index + 1);
    } else {
      showInlineSearchBelow(0, 0, 0);
    }
  }, [plugins, nodes, showInlineSearchBelow]);

  return (
    <div className="flex flex-col h-full w-[44px] bg-[#0a0a0a] shrink-0">
      {/* Back button */}
      <button
        onClick={() => { closeGalaxy(); closeInlineEditor(); }}
        className="flex items-center justify-center w-full py-3 text-white hover:text-plugin-accent hover:bg-white/5 transition-colors border-b border-white/5 shrink-0"
        title="Back to chain (Cmd+0)"
      >
        <ArrowLeft size={16} />
      </button>

      {/* Plugin list — scrollable, with drag-and-drop reordering */}
      <div
        className="flex-1 min-h-0 overflow-y-auto flex flex-col"
        onContextMenu={handleEmptyContextMenu}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={plugins.map(p => p.id)}
            strategy={verticalListSortingStrategy}
          >
            {plugins.map((plugin, i) => (
              <SortablePluginItem
                key={plugin.id}
                plugin={plugin}
                index={i}
                isActive={plugin.id === inlineEditorNodeId}
                galaxyActive={galaxyActive}
                onToggleGalaxy={onToggleGalaxy}
                onSelect={openInlineEditor}
                onContextMenu={handlePluginContextMenu}
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* + button to add plugin */}
        <button
          onClick={handleAddPlugin}
          className="flex items-center justify-center w-full py-1.5 text-white/30 hover:text-plugin-accent hover:bg-white/5 transition-colors border-b border-white/5 shrink-0"
          title="Add Plugin"
        >
          <Plus size={14} />
        </button>

        {/* Spacer pushes panel buttons + galaxy to bottom */}
        <div className="flex-1" />

        {/* Panel toggle buttons */}
        <PanelToggleButtons />

        {/* Galaxy visualizer toggle */}
        {onToggleGalaxy && (
          <button
            onClick={onToggleGalaxy}
            className={`
              flex items-center justify-center w-full py-2.5 shrink-0
              border-t border-white/5 transition-colors
              ${galaxyActive
                ? 'text-[#deff0a] bg-[#deff0a]/10'
                : 'text-white hover:text-plugin-accent hover:bg-white/5'
              }
            `}
            title="Galaxy Visualizer"
          >
            <Star size={16} fill={galaxyActive ? '#deff0a' : 'none'} />
          </button>
        )}
      </div>

      {/* Context menu (portal) */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

// ============================================
// Sortable plugin item for the sidebar
// ============================================

interface SortablePluginItemProps {
  plugin: { id: number; name: string };
  index: number;
  isActive: boolean;
  galaxyActive?: boolean;
  onToggleGalaxy?: () => void;
  onSelect: (nodeId: number) => void;
  onContextMenu?: (e: React.MouseEvent, pluginId: number) => void;
}

function SortablePluginItem({ plugin, index, isActive, galaxyActive, onToggleGalaxy, onSelect, onContextMenu }: SortablePluginItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: plugin.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        relative w-full flex items-center justify-center py-1.5 transition-colors border-b border-white/5
        ${isDragging ? 'opacity-50 z-50' : ''}
        ${isActive
          ? 'bg-plugin-accent/20 text-plugin-accent'
          : 'text-white hover:text-plugin-accent hover:bg-white/5'
        }
      `}
      title={`${plugin.name} (Cmd+${index + 1})`}
      onContextMenu={(e) => onContextMenu?.(e, plugin.id)}
    >
      {/* Drag handle area — grip dots shown on hover */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 hover:opacity-40 transition-opacity"
      >
        <GripVertical size={8} className="text-white" />
      </div>

      <button
        onClick={() => {
          if (!isActive) {
            if (galaxyActive) onToggleGalaxy?.();
            onSelect(plugin.id);
          }
        }}
        className="flex items-center justify-center w-full"
      >
        <span className={`
          font-mono text-xs w-6 h-6 rounded flex items-center justify-center
          ${isActive ? 'bg-plugin-accent text-black' : 'bg-white/10 text-white'}
        `}>
          {index + 1}
        </span>
      </button>
    </div>
  );
}

// ============================================
// Panel toggle buttons for the sidebar
// ============================================

const PANEL_BUTTONS: { id: PanelId; icon: typeof SlidersHorizontal; title: string }[] = [
  { id: 'parameters', icon: SlidersHorizontal, title: 'Parameters' },
  { id: 'presets', icon: ListMusic, title: 'Presets' },
  { id: 'routing', icon: Route, title: 'Routing' },
  { id: 'chain-overview', icon: LayoutList, title: 'Chain Overview' },
];

function PanelToggleButtons() {
  const openPanels = usePanelStore(s => s.openPanels);
  const togglePanel = usePanelStore(s => s.togglePanel);

  return (
    <div className="flex flex-col border-t border-white/5 shrink-0">
      {PANEL_BUTTONS.map(({ id, icon: Icon, title }) => {
        const isOpen = openPanels.includes(id);
        return (
          <button
            key={id}
            onClick={() => togglePanel(id)}
            className={`
              flex items-center justify-center w-full py-2 transition-colors
              ${isOpen
                ? 'text-plugin-accent bg-plugin-accent/10'
                : 'text-white hover:text-plugin-accent hover:bg-white/5'
              }
            `}
            title={`${title}${isOpen ? ' (active)' : ''}`}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
