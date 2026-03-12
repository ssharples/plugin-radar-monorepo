import { useEffect } from 'react';
import { useKeyboardStore, ShortcutPriority } from '../stores/keyboardStore';

export function useModalEscape(id: string, onClose: () => void) {
  useEffect(() => {
    const registerShortcut = useKeyboardStore.getState().registerShortcut;
    return registerShortcut({
      id,
      key: 'Escape',
      priority: ShortcutPriority.MODAL,
      allowInInputs: true,
      handler: (event) => {
        event.preventDefault();
        onClose();
      },
    });
  }, [id, onClose]);
}
