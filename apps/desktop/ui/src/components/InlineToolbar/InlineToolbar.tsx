import { useMemo, useState, useEffect } from 'react';
import { useChainStore } from '../../stores/chainStore';
import { usePanelStore } from '../../stores/panelStore';
import { ToolbarLevel1 } from './ToolbarLevel1';
import { ToolbarLevel2 } from './ToolbarLevel2';
import { ToolbarLevel3 } from './ToolbarLevel3';
import { ToolbarOverflow } from './ToolbarOverflow';
import type { PluginNodeUI } from '../../api/types';

export type ToolbarLevel = 1 | 2 | 3;

const LEVEL_HEIGHTS: Record<ToolbarLevel, number> = {
  1: 44,   // Compact
  2: 94,   // Expanded (44 + 50)
  3: 138,  // Full (44 + 50 + 44)
};

export function InlineToolbar() {
  const inlineEditorNodeId = useChainStore(s => s.inlineEditorNodeId);
  const nodes = useChainStore(s => s.nodes);
  const [level, setLevel] = useState<ToolbarLevel>(1);
  const setToolbarExtraHeight = usePanelStore(s => s.setToolbarExtraHeight);

  // Find the current node in the tree
  const currentNode = useMemo(() => {
    if (inlineEditorNodeId == null) return null;
    const find = (list: typeof nodes): typeof nodes[number] | null => {
      for (const n of list) {
        if (n.id === inlineEditorNodeId) return n;
        if (n.type === 'group') {
          const found = find(n.children);
          if (found) return found;
        }
      }
      return null;
    };
    return find(nodes);
  }, [nodes, inlineEditorNodeId]);

  // Sync toolbar expansion height to C++ via panelStore
  useEffect(() => {
    // Base toolbar is 44px (Level 1). Extra height is what's above that.
    const extraHeight = LEVEL_HEIGHTS[level] - LEVEL_HEIGHTS[1];
    setToolbarExtraHeight(extraHeight);
  }, [level, setToolbarExtraHeight]);

  // Reset toolbar extra height when unmounting (e.g. switching away from inline editor)
  useEffect(() => {
    return () => {
      usePanelStore.getState().setToolbarExtraHeight(0);
    };
  }, []);

  if (!currentNode || currentNode.type !== 'plugin') return null;
  const node = currentNode as PluginNodeUI;

  const cycleLevel = () => {
    setLevel(prev => {
      if (prev === 1) return 2;
      if (prev === 2) return 3;
      return 1;
    });
  };

  const toggleExpand = () => {
    setLevel(prev => prev === 1 ? 2 : 1);
  };

  const toggleAdvanced = () => {
    setLevel(prev => prev === 3 ? 2 : 3);
  };

  // Overflow items that are only visible when toolbar is collapsed
  const overflowItems = level === 1
    ? [
        {
          id: 'expand',
          label: 'Show Controls',
          onClick: () => setLevel(2),
        },
        {
          id: 'full',
          label: 'Show Advanced',
          onClick: () => setLevel(3),
        },
      ]
    : [];

  return (
    <div
      className="relative bg-[#0a0a0a] border-t border-white/5 overflow-hidden"
      style={{
        height: LEVEL_HEIGHTS[level],
        transition: 'height 200ms ease-out',
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Level 1: Compact bar — always visible */}
      <div
        className="flex items-center h-[44px] px-2 gap-2"
        style={{ opacity: 1 }}
      >
        {/* Expand/collapse chevron */}
        <button
          onClick={toggleExpand}
          className="w-5 h-5 flex items-center justify-center text-white hover:text-plugin-accent rounded hover:bg-white/5 transition-colors shrink-0"
          title={level === 1 ? 'Expand toolbar' : 'Collapse toolbar'}
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="none"
            style={{
              transform: level >= 2 ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 200ms ease-out',
            }}
          >
            <path d="M1 5.5L4 2.5L7 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <ToolbarLevel1 node={node} />

        {/* Overflow menu (only when compact) */}
        {level === 1 && <ToolbarOverflow items={overflowItems} />}
      </div>

      {/* Level 2: Expanded controls */}
      <div
        className="h-[50px] px-2 flex items-center border-t border-white/5"
        style={{
          opacity: level >= 2 ? 1 : 0,
          transition: 'opacity 150ms ease-out',
          pointerEvents: level >= 2 ? 'auto' : 'none',
        }}
      >
        <ToolbarLevel2 node={node} />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Advanced toggle */}
        <button
          onClick={toggleAdvanced}
          className="flex items-center gap-1 text-[8px] font-mono text-white hover:text-plugin-accent transition-colors px-1.5 py-1 rounded hover:bg-white/5 shrink-0"
          title={level === 3 ? 'Hide advanced' : 'Show advanced'}
        >
          <span className="tracking-wider uppercase">{level === 3 ? 'Less' : 'More'}</span>
          <svg
            width="6"
            height="6"
            viewBox="0 0 6 6"
            fill="none"
            style={{
              transform: level === 3 ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 200ms ease-out',
            }}
          >
            <path d="M0.5 1.5L3 4.5L5.5 1.5" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Level 3: Advanced panel */}
      <div
        className="h-[44px] px-3 flex items-center border-t border-white/5"
        style={{
          opacity: level >= 3 ? 1 : 0,
          transition: 'opacity 150ms ease-out 50ms',
          pointerEvents: level >= 3 ? 'auto' : 'none',
        }}
      >
        <ToolbarLevel3 node={node} />
      </div>
    </div>
  );
}
