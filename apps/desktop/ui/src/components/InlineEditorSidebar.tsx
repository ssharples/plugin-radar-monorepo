import { useMemo, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronUp, ChevronDown } from 'lucide-react';
import { useChainStore, useChainActions } from '../stores/chainStore';
import { useKeyboardStore, ShortcutPriority } from '../stores/keyboardStore';
import { collectPlugins, findNodeParentInfo } from '../utils/chainHelpers';

export function InlineEditorSidebar() {
  const nodes = useChainStore(s => s.nodes);
  const inlineEditorNodeId = useChainStore(s => s.inlineEditorNodeId);
  const { openInlineEditor, closeInlineEditor, saveSnapshot, recallSnapshot, moveNode } = useChainActions();

  const plugins = useMemo(() => collectPlugins(nodes), [nodes]);
  const pluginsRef = useRef(plugins);
  pluginsRef.current = plugins;

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

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
  }, [openInlineEditor, closeInlineEditor, saveSnapshot, recallSnapshot]);

  // Reorder handler
  const handleMove = async (pluginId: number, direction: 'up' | 'down') => {
    const info = findNodeParentInfo(nodes, pluginId);
    if (!info) return;
    const newIndex = direction === 'up' ? info.index - 1 : info.index + 2;
    if (newIndex < 0) return;
    await moveNode(pluginId, info.parentId, newIndex);
  };

  // Check if a plugin can move in a direction (same parent only)
  const canMove = (pluginId: number, direction: 'up' | 'down'): boolean => {
    const info = findNodeParentInfo(nodes, pluginId);
    if (!info) return false;
    const findChildren = (list: typeof nodes, parentId: number): typeof nodes | null => {
      if (parentId === 0) return list;
      for (const node of list) {
        if (node.id === parentId && node.type === 'group') return node.children;
        if (node.type === 'group') {
          const found = findChildren(node.children, parentId);
          if (found) return found;
        }
      }
      return null;
    };
    const siblings = findChildren(nodes, info.parentId);
    if (!siblings) return false;
    if (direction === 'up') return info.index > 0;
    return info.index < siblings.length - 1;
  };

  return (
    <div className="flex flex-col h-full w-[44px] bg-[#0a0a0a] shrink-0">
      {/* Back button */}
      <button
        onClick={() => closeInlineEditor()}
        className="flex items-center justify-center w-full py-3 text-plugin-muted hover:text-plugin-foreground hover:bg-white/5 transition-colors border-b border-white/5 shrink-0"
        title="Back to chain (Cmd+0)"
      >
        <ArrowLeft size={16} />
      </button>

      {/* Plugin list — scrollable, numbers with reorder arrows on hover */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {plugins.map((plugin, i) => {
          const isActive = plugin.id === inlineEditorNodeId;
          const isHovered = hoveredIdx === i;
          const showUp = isHovered && canMove(plugin.id, 'up');
          const showDown = isHovered && canMove(plugin.id, 'down');

          return (
            <div
              key={plugin.id}
              className={`
                relative w-full flex flex-col items-center py-1.5 transition-colors border-b border-white/5
                ${isActive
                  ? 'bg-plugin-accent/20 text-plugin-accent'
                  : 'text-plugin-muted hover:text-plugin-foreground hover:bg-white/5'
                }
              `}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              title={`${plugin.name} (Cmd+${i + 1})`}
            >
              {showUp && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleMove(plugin.id, 'up'); }}
                  className="w-full flex items-center justify-center h-3 text-plugin-muted hover:text-plugin-foreground"
                >
                  <ChevronUp size={10} />
                </button>
              )}

              <button
                onClick={() => { if (!isActive) openInlineEditor(plugin.id); }}
                className="flex items-center justify-center w-full"
              >
                <span className={`
                  font-mono text-xs w-6 h-6 rounded flex items-center justify-center
                  ${isActive ? 'bg-plugin-accent text-black' : 'bg-white/10 text-plugin-muted'}
                `}>
                  {i + 1}
                </span>
              </button>

              {showDown && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleMove(plugin.id, 'down'); }}
                  className="w-full flex items-center justify-center h-3 text-plugin-muted hover:text-plugin-foreground"
                >
                  <ChevronDown size={10} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
