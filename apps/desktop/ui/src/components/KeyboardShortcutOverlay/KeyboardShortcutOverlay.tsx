import { useEffect, useState, useCallback } from 'react';
import { X, Command, Keyboard } from 'lucide-react';
import { useKeyboardStore, ShortcutPriority } from '../../stores/keyboardStore';

interface ShortcutHint {
  id: string;
  keys: string;
  description: string;
  category: 'editing' | 'groups' | 'snapshots' | 'navigation' | 'global';
}

/**
 * All available keyboard shortcuts in the app
 */
const ALL_SHORTCUTS: ShortcutHint[] = [
  // Editing
  { id: 'undo', keys: '\u2318Z', description: 'Undo', category: 'editing' },
  { id: 'redo', keys: '\u2318\u21e7Z', description: 'Redo', category: 'editing' },
  { id: 'redo-alt', keys: '\u2318Y', description: 'Redo (alternate)', category: 'editing' },
  { id: 'delete', keys: '\u232b / Del', description: 'Remove selected plugin', category: 'editing' },

  // Groups
  { id: 'serial-group', keys: '\u2318G', description: 'Create serial group', category: 'groups' },
  { id: 'parallel-group', keys: '\u2318\u21e7G', description: 'Create parallel group', category: 'groups' },

  // Snapshots
  { id: 'snapshot-1', keys: '\u23181', description: 'Recall snapshot A', category: 'snapshots' },
  { id: 'snapshot-2', keys: '\u23182', description: 'Recall snapshot B', category: 'snapshots' },
  { id: 'snapshot-3', keys: '\u23183', description: 'Recall snapshot C', category: 'snapshots' },
  { id: 'save-snapshot-1', keys: '\u2318\u21e71', description: 'Save snapshot A', category: 'snapshots' },
  { id: 'save-snapshot-2', keys: '\u2318\u21e72', description: 'Save snapshot B', category: 'snapshots' },
  { id: 'save-snapshot-3', keys: '\u2318\u21e73', description: 'Save snapshot C', category: 'snapshots' },

  // Navigation
  { id: 'focus-search', keys: '\u2318F', description: 'Focus plugin search', category: 'navigation' },
  { id: 'plugin-browser', keys: '\u2318B', description: 'Open plugin browser', category: 'navigation' },

  // Global
  { id: 'shortcuts-help', keys: '?', description: 'Show keyboard shortcuts', category: 'global' },
];

const CATEGORY_LABELS: Record<string, string> = {
  editing: 'Editing',
  groups: 'Groups',
  snapshots: 'Snapshots',
  navigation: 'Navigation',
  global: 'Global',
};

const modalOverlayStyle: React.CSSProperties = {
  background: 'rgba(0, 0, 0, 0.75)',
  backdropFilter: 'blur(4px)',
};

const modalPanelStyle: React.CSSProperties = {
  maxWidth: '42rem',
  width: '100%',
  margin: '0 1rem',
  maxHeight: '80vh',
  borderRadius: 'var(--radius-xl)',
  border: '1px solid rgba(222, 255, 10, 0.15)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

/**
 * Keyboard shortcut overlay system
 *
 * Features:
 * - Show hints when Cmd/Ctrl is held down
 * - Reference panel accessible via ? key
 * - Non-intrusive design with clear typography
 */
export function KeyboardShortcutOverlay() {
  const [cmdHeld, setCmdHeld] = useState(false);
  const [showReferencePanel, setShowReferencePanel] = useState(false);
  const registerShortcut = useKeyboardStore((state) => state.registerShortcut);

  // Listen for showKeyboardShortcuts event from other components (like HeaderMenu)
  useEffect(() => {
    const handleShowShortcuts = () => {
      setShowReferencePanel(true);
    };
    window.addEventListener('showKeyboardShortcuts', handleShowShortcuts);
    return () => window.removeEventListener('showKeyboardShortcuts', handleShowShortcuts);
  }, []);

  // Track Cmd/Ctrl key state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        setCmdHeld(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) {
        setCmdHeld(false);
      }
    };

    const handleBlur = () => {
      setCmdHeld(false);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Register ? key to show reference panel
  useEffect(() => {
    return registerShortcut({
      id: 'keyboard-shortcuts-help',
      key: '?',
      priority: ShortcutPriority.GLOBAL,
      allowInInputs: false,
      handler: (e) => {
        e.preventDefault();
        setShowReferencePanel(true);
      }
    });
  }, [registerShortcut]);

  const handleClosePanel = useCallback(() => {
    setShowReferencePanel(false);
  }, []);

  // Close panel with Escape key
  useEffect(() => {
    if (!showReferencePanel) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowReferencePanel(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showReferencePanel]);

  // Group shortcuts by category
  const shortcutsByCategory = ALL_SHORTCUTS.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = [];
    }
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, ShortcutHint[]>);

  return (
    <>
      {/* Floating hint when Cmd is held */}
      {cmdHeld && !showReferencePanel && (
        <div className="fixed bottom-4 right-4 z-50 animate-fade-in-up pointer-events-none">
          <div
            className="glass flex items-center gap-2"
            style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(222, 255, 10, 0.15)' }}
          >
            <Command className="w-3.5 h-3.5" style={{ color: 'var(--color-accent-cyan)' }} />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
              Keyboard shortcuts active
            </span>
            <span style={{ fontSize: '10px', color: 'var(--color-text-disabled)' }}>
              Press ? for help
            </span>
          </div>
        </div>
      )}

      {/* Reference panel modal */}
      {showReferencePanel && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center fade-in"
          style={modalOverlayStyle}
          onClick={handleClosePanel}
        >
          <div
            className="glass scale-in"
            style={modalPanelStyle}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between" style={{ padding: 'var(--space-4) var(--space-6)', borderBottom: '1px solid var(--color-border-default)' }}>
              <div className="flex items-center gap-3">
                <Keyboard className="w-5 h-5" style={{ color: 'var(--color-accent-cyan)' }} />
                <h2 className="crt-text" style={{ fontSize: 'var(--text-lg)', fontFamily: 'var(--font-mono)', color: '#deff0a', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', fontWeight: 700 }}>
                  Keyboard Shortcuts
                </h2>
              </div>
              <button
                onClick={handleClosePanel}
                style={{ padding: '6px', borderRadius: 'var(--radius-base)', color: 'var(--color-text-disabled)', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-disabled)')}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Shortcuts list */}
            <div className="overflow-y-auto scrollbar-cyber space-y-6" style={{ maxHeight: 'calc(80vh - 80px)', padding: 'var(--space-6)' }}>
              {Object.entries(shortcutsByCategory).map(([category, shortcuts]) => (
                <div key={category}>
                  <h3 style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: '#deff0a', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', marginBottom: '12px' }}>
                    {CATEGORY_LABELS[category]}
                  </h3>
                  <div className="space-y-2">
                    {shortcuts.map((shortcut) => (
                      <div
                        key={shortcut.id}
                        className="flex items-center justify-between fast-snap"
                        style={{ padding: '8px 12px', borderRadius: 'var(--radius-base)', transition: 'background var(--duration-fast)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                          {shortcut.description}
                        </span>
                        <kbd style={{
                          padding: '4px 8px',
                          borderRadius: 'var(--radius-base)',
                          background: 'var(--color-bg-input)',
                          border: '1px solid var(--color-border-default)',
                          fontSize: 'var(--text-xs)',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--color-text-primary)',
                        }}>
                          {shortcut.keys}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ padding: 'var(--space-3) var(--space-6)', borderTop: '1px solid var(--color-border-default)', background: 'var(--color-bg-secondary)' }}>
              <p className="text-center" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-disabled)' }}>
                Hold <kbd style={{ padding: '2px 6px', borderRadius: 'var(--radius-base)', background: 'var(--color-bg-input)', border: '1px solid var(--color-border-default)', fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{'\u2318'}</kbd> to see active shortcuts
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
