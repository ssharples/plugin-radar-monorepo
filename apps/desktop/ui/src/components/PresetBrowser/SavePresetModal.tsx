import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { usePresetStore } from '../../stores/presetStore';
import { useKeyboardStore, ShortcutPriority } from '../../stores/keyboardStore';
import { CustomDropdown } from '../Dropdown';

interface SavePresetModalProps {
  onClose: () => void;
}

const modalOverlayStyle: React.CSSProperties = {
  background: 'rgba(0, 0, 0, 0.75)',
  backdropFilter: 'blur(4px)',
};

const modalPanelStyle: React.CSSProperties = {
  maxWidth: '28rem',
  width: '100%',
  margin: '0 1rem',
  borderRadius: 'var(--radius-xl)',
  border: '1px solid rgba(222, 255, 10, 0.15)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-tertiary)',
  fontFamily: 'var(--font-mono)',
  textTransform: 'uppercase',
  letterSpacing: 'var(--tracking-wide)',
  marginBottom: '4px',
};

export function SavePresetModal({ onClose }: SavePresetModalProps) {
  const { categories, saving, savePreset } = usePresetStore();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [useNewCategory, setUseNewCategory] = useState(false);

  const handleSave = async () => {
    const finalCategory = useNewCategory ? newCategory : category;
    if (!name.trim() || !finalCategory.trim()) return;

    const success = await savePreset(name.trim(), finalCategory.trim());
    if (success) {
      onClose();
    }
  };

  // Escape closes (modal priority)
  useEffect(() => {
    const registerShortcut = useKeyboardStore.getState().registerShortcut;
    return registerShortcut({
      id: 'save-preset-modal-escape',
      key: 'Escape',
      priority: ShortcutPriority.MODAL,
      allowInInputs: true,
      handler: (e) => {
        e.preventDefault();
        onClose();
      }
    });
  }, [onClose]);

  // Enter saves (modal priority)
  useEffect(() => {
    const registerShortcut = useKeyboardStore.getState().registerShortcut;
    return registerShortcut({
      id: 'save-preset-modal-enter',
      key: 'Enter',
      priority: ShortcutPriority.MODAL,
      allowInInputs: true,
      handler: (e) => {
        if (!saving) {
          e.preventDefault();
          handleSave();
        }
      }
    });
  }, [saving, handleSave]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center fade-in" style={modalOverlayStyle}>
      <div className="glass scale-in" style={modalPanelStyle}>
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border-default)' }}>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', fontWeight: 700, color: '#deff0a', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)' }}>Save Preset</h3>
          <button
            onClick={onClose}
            style={{ padding: '4px', borderRadius: 'var(--radius-base)', color: 'var(--color-text-disabled)', background: 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-disabled)')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4" style={{ padding: 'var(--space-4)' }}>
          {/* Name input */}
          <div>
            <label style={labelStyle}>Preset Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Preset"
              autoFocus
              className="input w-full"
            />
          </div>

          {/* Category selection */}
          <div>
            <label style={labelStyle}>Category</label>

            {/* Existing categories */}
            {categories.length > 0 && !useNewCategory && (
              <div className="space-y-2">
                <CustomDropdown
                  value={category}
                  options={[
                    { value: '', label: 'Select a category...' },
                    ...categories.map((cat) => ({ value: cat, label: cat })),
                  ]}
                  onChange={setCategory}
                  size="sm"
                />
                <button
                  onClick={() => setUseNewCategory(true)}
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent-cyan)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                  onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                >
                  Create new category
                </button>
              </div>
            )}

            {/* New category input */}
            {(categories.length === 0 || useNewCategory) && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="New category name"
                  className="input w-full"
                />
                {categories.length > 0 && (
                  <button
                    onClick={() => setUseNewCategory(false)}
                    style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent-cyan)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                  >
                    Use existing category
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3" style={{ padding: 'var(--space-4)', borderTop: '1px solid var(--color-border-default)' }}>
          <button onClick={onClose} className="btn">Cancel</button>
          <button
            onClick={handleSave}
            disabled={
              saving ||
              !name.trim() ||
              (!useNewCategory && !category) ||
              (useNewCategory && !newCategory.trim())
            }
            className={`btn flex items-center gap-1.5 ${
              saving || !name.trim() || (!useNewCategory && !category) || (useNewCategory && !newCategory.trim())
                ? ''
                : 'btn-primary'
            }`}
            style={
              saving || !name.trim() || (!useNewCategory && !category) || (useNewCategory && !newCategory.trim())
                ? { opacity: 0.5, cursor: 'not-allowed' }
                : undefined
            }
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Preset'}
          </button>
        </div>
      </div>
    </div>
  );
}
