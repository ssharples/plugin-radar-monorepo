import { create } from 'zustand';

/**
 * Priority levels for keyboard shortcut handlers
 * Higher priority handlers execute first and can prevent lower priority handlers from executing
 */
export enum ShortcutPriority {
  MODAL = 100,      // Highest - modals, overlays, dialogs
  DROPDOWN = 90,    // Dropdown menus within modals
  COMPONENT = 50,   // Component-specific shortcuts (ChainEditor, PluginBrowser)
  GLOBAL = 0        // Lowest - app-wide shortcuts (Cmd+B, Cmd+F)
}

/**
 * Keyboard modifiers for shortcuts
 */
export interface ShortcutModifiers {
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;  // Cmd on Mac, Win on Windows
  alt?: boolean;
}

/**
 * Keyboard shortcut handler definition
 */
export interface ShortcutHandler {
  id: string;
  key: string;  // KeyboardEvent.key value (case-sensitive for letters)
  modifiers?: ShortcutModifiers;
  priority: ShortcutPriority;
  allowInInputs?: boolean; // If true, handler fires even when text inputs are focused (default: false)
  handler: (e: KeyboardEvent) => void | boolean; // Return false to stop propagation to lower priority handlers
}

interface KeyboardStoreState {
  handlers: ShortcutHandler[];
  debugMode: boolean;
  registerShortcut: (handler: ShortcutHandler) => () => void;
  unregisterShortcut: (id: string) => void;
  setDebugMode: (enabled: boolean) => void;
}

/**
 * Check if the event target is a text input element
 */
function isInputElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;

  const tagName = target.tagName;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA') return true;
  if (target.isContentEditable) return true;

  return false;
}

/**
 * Check if the event matches the handler's key and modifiers
 */
function matchesShortcut(e: KeyboardEvent, handler: ShortcutHandler): boolean {
  // Key match (case-sensitive for letters)
  if (e.key !== handler.key) return false;

  // Modifier match (if specified, must match; if not specified, don't care)
  if (handler.modifiers) {
    if (handler.modifiers.ctrl !== undefined && e.ctrlKey !== handler.modifiers.ctrl) return false;
    if (handler.modifiers.shift !== undefined && e.shiftKey !== handler.modifiers.shift) return false;
    if (handler.modifiers.meta !== undefined && e.metaKey !== handler.modifiers.meta) return false;
    if (handler.modifiers.alt !== undefined && e.altKey !== handler.modifiers.alt) return false;
  }

  return true;
}

/**
 * Centralized keyboard shortcut manager
 *
 * Features:
 * - Single global keydown listener (capture phase)
 * - Priority-based handler execution (Modal > Component > Global)
 * - Automatic input focus detection
 * - Debug logging for troubleshooting
 * - Auto-cleanup on component unmount
 *
 * Usage:
 * ```tsx
 * useEffect(() => {
 *   const cleanup = keyboardStore.getState().registerShortcut({
 *     id: 'my-shortcut',
 *     key: 'z',
 *     modifiers: { meta: true },
 *     priority: ShortcutPriority.COMPONENT,
 *     allowInInputs: false,
 *     handler: (e) => {
 *       e.preventDefault();
 *       console.log('Cmd+Z pressed!');
 *     }
 *   });
 *   return cleanup;
 * }, []);
 * ```
 */
export const useKeyboardStore = create<KeyboardStoreState>((set, get) => {
  // Global keydown listener
  const globalKeydownHandler = (e: KeyboardEvent) => {
    const { handlers, debugMode } = get();
    const isInput = isInputElement(e.target);


    // Sort handlers by priority (highest first)
    const sortedHandlers = [...handlers].sort((a, b) => b.priority - a.priority);

    for (const handler of sortedHandlers) {
      // Skip if typing in input and handler doesn't allow it
      if (isInput && !handler.allowInInputs) {
        continue;
      }

      // Check if event matches this handler
      if (!matchesShortcut(e, handler)) {
        continue;
      }


      // Execute handler
      const result = handler.handler(e);

      // If handler returns false, stop propagation to lower priority handlers
      if (result === false) {
        break;
      }
    }
  };

  // Install global listener on store creation
  window.addEventListener('keydown', globalKeydownHandler, true); // Capture phase

  return {
    handlers: [],
    debugMode: false,

    registerShortcut: (handler: ShortcutHandler) => {

      // Add handler
      set((state) => ({
        handlers: [...state.handlers, handler]
      }));

      // Return cleanup function
      return () => {
        get().unregisterShortcut(handler.id);
      };
    },

    unregisterShortcut: (id: string) => {
      set((state) => ({
        handlers: state.handlers.filter(h => h.id !== id)
      }));
    },

    setDebugMode: (enabled: boolean) => {
      set({ debugMode: enabled });
    }
  };
});
