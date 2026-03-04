import { useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useChainStore } from '../../stores/chainStore';
import { juceBridge } from '../../api/juce-bridge';
import type { ChainNodeUI } from '../../api/types';

// Helper: find a node by ID in the tree
function findNodeById(nodes: ChainNodeUI[], id: number): ChainNodeUI | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.type === 'group') {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

export interface ContextMenuState {
  nodeId: number;
  nodeType: 'plugin' | 'groupHeader';
  x: number;
  y: number;
}

interface CanvasContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
}

interface MenuItemProps {
  label: string;
  shortcut?: string;
  danger?: boolean;
  onClick: () => void;
}

function MenuItem({ label, shortcut, danger, onClick }: MenuItemProps) {
  const color = danger ? 'var(--color-status-error, #ff3333)' : 'rgba(255,255,255,0.85)';
  const hoverBg = danger ? 'rgba(255, 0, 51, 0.08)' : 'rgba(255,255,255,0.06)';

  return (
    <button
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left"
      onClick={onClick}
      style={{
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.03em',
        fontFamily: 'var(--font-mono, monospace)',
        color,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        transition: 'background 80ms ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span className="flex-1 truncate">{label}</span>
      {shortcut && (
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
          {shortcut}
        </span>
      )}
    </button>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />;
}

export function CanvasContextMenu({ state, onClose }: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const nodes = useChainStore((s) => s.nodes);
  const node = findNodeById(nodes, state.nodeId);

  // Close on outside click
  const handleBackdropClick = useCallback(() => {
    onClose();
  }, [onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (rect.right > vw) {
      menuRef.current.style.left = `${vw - rect.width - 8}px`;
    }
    if (rect.bottom > vh) {
      menuRef.current.style.top = `${vh - rect.height - 8}px`;
    }
  }, [state.x, state.y]);

  if (!node) return null;

  if (state.nodeType === 'plugin' && node.type === 'plugin') {
    const isBypassed = node.bypassed;
    const isMuted = node.mute;

    return createPortal(
      <>
        <div
          className="fixed inset-0 z-[99]"
          onClick={handleBackdropClick}
          onContextMenu={(e) => { e.preventDefault(); handleBackdropClick(); }}
        />
        <div
          ref={menuRef}
          className="fixed z-[100] py-1"
          style={{
            left: state.x,
            top: state.y,
            minWidth: 180,
            background: 'rgba(15, 15, 15, 0.98)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem
            label="Open Editor"
            shortcut="Enter"
            onClick={() => {
              useChainStore.getState().openInlineEditor(state.nodeId);
              onClose();
            }}
          />
          <MenuItem
            label={isBypassed ? 'Enable' : 'Bypass'}
            shortcut="B"
            onClick={() => {
              useChainStore.getState().toggleNodeBypass(state.nodeId);
              onClose();
            }}
          />
          <MenuItem
            label={isMuted ? 'Unmute' : 'Mute'}
            shortcut="M"
            onClick={() => {
              juceBridge.setNodeMute(state.nodeId, !isMuted);
              onClose();
            }}
          />
          <Divider />
          <MenuItem
            label="Duplicate"
            shortcut="D"
            onClick={() => {
              useChainStore.getState().duplicateNode(state.nodeId);
              onClose();
            }}
          />
          <MenuItem
            label="Swap Plugin"
            onClick={() => {
              // Open inline search for swapping - select the node and show search
              useChainStore.getState().selectNode(state.nodeId);
              onClose();
            }}
          />
          <Divider />
          <MenuItem
            label="Remove"
            shortcut="Del"
            danger
            onClick={() => {
              useChainStore.getState().removeNode(state.nodeId);
              useChainStore.getState().selectNode(null);
              onClose();
            }}
          />
        </div>
      </>,
      document.body,
    );
  }

  if (state.nodeType === 'groupHeader' && node.type === 'group') {
    const isBypassed = node.bypassed;

    return createPortal(
      <>
        <div
          className="fixed inset-0 z-[99]"
          onClick={handleBackdropClick}
          onContextMenu={(e) => { e.preventDefault(); handleBackdropClick(); }}
        />
        <div
          ref={menuRef}
          className="fixed z-[100] py-1"
          style={{
            left: state.x,
            top: state.y,
            minWidth: 180,
            background: 'rgba(15, 15, 15, 0.98)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem
            label={isBypassed ? 'Enable Group' : 'Bypass Group'}
            shortcut="B"
            onClick={() => {
              useChainStore.getState().toggleNodeBypass(state.nodeId);
              onClose();
            }}
          />
          <MenuItem
            label="Add Plugin"
            onClick={() => {
              // Add plugin at end of group
              useChainStore.getState().selectNode(state.nodeId);
              onClose();
            }}
          />
          <Divider />
          <MenuItem
            label="Dissolve Group"
            onClick={() => {
              useChainStore.getState().dissolveGroup(state.nodeId);
              onClose();
            }}
          />
          <MenuItem
            label="Remove Group"
            danger
            onClick={() => {
              useChainStore.getState().removeNode(state.nodeId);
              useChainStore.getState().selectNode(null);
              onClose();
            }}
          />
        </div>
      </>,
      document.body,
    );
  }

  return null;
}
