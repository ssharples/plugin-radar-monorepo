import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface OverflowItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

interface ToolbarOverflowProps {
  items: OverflowItem[];
}

export function ToolbarOverflow({ items }: ToolbarOverflowProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });

  // Position the dropdown below the button when opening
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, updatePosition]);

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className="w-6 h-6 flex items-center justify-center text-white hover:text-plugin-accent rounded hover:bg-white/5 transition-colors"
        title="More options"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="2" cy="6" r="1" fill="currentColor" />
          <circle cx="6" cy="6" r="1" fill="currentColor" />
          <circle cx="10" cy="6" r="1" fill="currentColor" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed py-1 min-w-[140px] rounded bg-black/90 backdrop-blur-md border border-white/10 z-[9999] animate-fade-in"
          style={{
            top: menuPos.top,
            right: menuPos.right,
            boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          }}
        >
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                if (!item.disabled) {
                  item.onClick();
                  setOpen(false);
                }
              }}
              disabled={item.disabled}
              className={`
                w-full flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono text-left transition-colors
                ${item.disabled
                  ? 'text-white/20 cursor-not-allowed'
                  : item.active
                    ? 'text-[#deff0a] bg-[#deff0a]/5'
                    : 'text-white hover:text-plugin-accent hover:bg-white/5'
                }
              `}
            >
              {item.icon && <span className="w-3 h-3 flex-shrink-0">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
