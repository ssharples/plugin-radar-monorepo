import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────

export interface MenuItemDef {
  id: string;
  label: string;
  shortcut?: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  action?: () => void;
  dividerAfter?: boolean;
  children?: MenuItemDef[];
  /** Toggle state: true = active/checked, false = inactive, undefined = not a toggle */
  checked?: boolean;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItemDef[];
  onClose: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Clamp menu position so it doesn't overflow the viewport */
function clampPosition(
  x: number,
  y: number,
  menuW: number,
  menuH: number,
): { x: number; y: number } {
  const pad = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: x + menuW + pad > vw ? Math.max(pad, x - menuW) : x,
    y: y + menuH + pad > vh ? Math.max(pad, vh - menuH - pad) : y,
  };
}

// ── Sub-menu component ─────────────────────────────────────────────────

function SubMenu({
  items,
  parentRect,
  onClose,
  onAction,
}: {
  items: MenuItemDef[];
  parentRect: DOMRect;
  onClose: () => void;
  onAction: (item: MenuItemDef) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: parentRect.right + 2, y: parentRect.top - 4 });

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos(clampPosition(parentRect.right + 2, parentRect.top - 4, rect.width, rect.height));
  }, [parentRect]);

  return createPortal(
    <div
      ref={ref}
      className="context-menu"
      style={{ left: pos.x, top: pos.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <MenuItemRow key={item.id} item={item} onAction={onAction} onClose={onClose} />
      ))}
    </div>,
    document.body,
  );
}

// ── Menu item row ──────────────────────────────────────────────────────

function MenuItemRow({
  item,
  onAction,
  onClose,
  isActive = false,
  onHover,
  forceSubOpen = false,
  onSubClose,
}: {
  item: MenuItemDef;
  onAction: (item: MenuItemDef) => void;
  onClose: () => void;
  isActive?: boolean;
  onHover?: () => void;
  forceSubOpen?: boolean;
  onSubClose?: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [subOpen, setSubOpen] = useState(false);
  const effectiveSubOpen = subOpen || forceSubOpen;
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>();

  const hasChildren = item.children && item.children.length > 0;

  const handleMouseEnter = () => {
    onHover?.();
    if (hasChildren) {
      clearTimeout(hoverTimeout.current);
      hoverTimeout.current = setTimeout(() => setSubOpen(true), 150);
    }
  };

  const handleMouseLeave = () => {
    if (hasChildren) {
      clearTimeout(hoverTimeout.current);
      hoverTimeout.current = setTimeout(() => {
        setSubOpen(false);
        onSubClose?.();
      }, 300);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.disabled) return;
    if (hasChildren) {
      setSubOpen((o) => !o);
      return;
    }
    onAction(item);
  };

  useEffect(() => {
    return () => clearTimeout(hoverTimeout.current);
  }, []);

  return (
    <>
      <div
        ref={rowRef}
        className={`context-menu-item ${item.disabled ? 'disabled' : ''} ${item.danger ? 'danger' : ''} ${isActive ? 'active' : ''}`}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        role="menuitem"
        aria-disabled={item.disabled}
      >
        {/* Icon */}
        {item.icon && <span className="context-menu-icon">{item.icon}</span>}

        {/* Checked indicator */}
        {item.checked !== undefined && (
          <span className="context-menu-check">
            {item.checked ? '\u2713' : '\u00a0'}
          </span>
        )}

        {/* Label */}
        <span className="context-menu-label">{item.label}</span>

        {/* Shortcut or submenu arrow */}
        <span className="context-menu-trail">
          {hasChildren ? (
            <ChevronRight size={12} />
          ) : item.shortcut ? (
            <span className="context-menu-shortcut">{item.shortcut}</span>
          ) : null}
        </span>
      </div>

      {/* Divider */}
      {item.dividerAfter && <div className="context-menu-divider" />}

      {/* Sub-menu */}
      {effectiveSubOpen && hasChildren && rowRef.current && (
        <SubMenu
          items={item.children!}
          parentRect={rowRef.current.getBoundingClientRect()}
          onClose={onClose}
          onAction={onAction}
        />
      )}
    </>
  );
}

// ── Main ContextMenu ───────────────────────────────────────────────────

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [focusIndex, setFocusIndex] = useState(-1);
  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null);

  // Position clamping once DOM is measured
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    setPos(clampPosition(x, y, rect.width, rect.height));
  }, [x, y]);

  // Get only actionable (non-divider, non-disabled) items for keyboard nav
  const actionableIndices = items.reduce<number[]>((acc, item, i) => {
    if (!item.disabled) acc.push(i);
    return acc;
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowDown': {
          e.preventDefault();
          setOpenSubmenuId(null);
          const curPosInActionable = actionableIndices.indexOf(focusIndex);
          const next = curPosInActionable < actionableIndices.length - 1 ? curPosInActionable + 1 : 0;
          setFocusIndex(actionableIndices[next]);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setOpenSubmenuId(null);
          const curPosInActionable = actionableIndices.indexOf(focusIndex);
          const prev = curPosInActionable > 0 ? curPosInActionable - 1 : actionableIndices.length - 1;
          setFocusIndex(actionableIndices[prev]);
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          if (focusIndex >= 0 && focusIndex < items.length) {
            const item = items[focusIndex];
            if (item.children && item.children.length > 0) {
              setOpenSubmenuId(item.id);
            }
          }
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          if (openSubmenuId) {
            setOpenSubmenuId(null);
          }
          break;
        }
        case 'Enter': {
          e.preventDefault();
          if (focusIndex >= 0 && focusIndex < items.length) {
            const item = items[focusIndex];
            if (!item.disabled) {
              if (item.children && item.children.length > 0) {
                setOpenSubmenuId(item.id);
              } else if (item.action) {
                item.action();
                onClose();
              }
            }
          }
          break;
        }
      }
    },
    [focusIndex, actionableIndices, items, onClose, openSubmenuId],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use a timeout to avoid catching the same right-click that opened the menu
    const id = setTimeout(() => {
      window.addEventListener('mousedown', handler);
    }, 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  const handleAction = useCallback(
    (item: MenuItemDef) => {
      if (item.action) item.action();
      onClose();
    },
    [onClose],
  );

  return createPortal(
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: pos.x, top: pos.y }}
      role="menu"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {items.map((item, index) => (
        <MenuItemRow
          key={item.id}
          item={item}
          onAction={handleAction}
          onClose={onClose}
          isActive={index === focusIndex}
          onHover={() => setFocusIndex(index)}
          forceSubOpen={openSubmenuId === item.id}
          onSubClose={() => setOpenSubmenuId(null)}
        />
      ))}
    </div>,
    document.body,
  );
}
