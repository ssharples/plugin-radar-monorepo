import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { useGroupTemplateStore } from '../../stores/groupTemplateStore';
import { useKeyboardStore, ShortcutPriority } from '../../stores/keyboardStore';
import { CustomDropdown } from '../Dropdown';

interface SaveGroupTemplateModalProps {
  groupId: number;
  groupName: string;
  onClose: () => void;
}

export function SaveGroupTemplateModal({ groupId, groupName, onClose }: SaveGroupTemplateModalProps) {
  const { categories, saving, saveTemplate } = useGroupTemplateStore();
  const [name, setName] = useState(groupName || 'Group Template');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [useNewCategory, setUseNewCategory] = useState(false);

  const handleSave = async () => {
    const finalCategory = useNewCategory ? newCategory : category;
    if (!name.trim() || !finalCategory.trim()) return;

    const success = await saveTemplate(groupId, name.trim(), finalCategory.trim());
    if (success) {
      onClose();
    }
  };

  // Escape closes (modal priority)
  useEffect(() => {
    const registerShortcut = useKeyboardStore.getState().registerShortcut;
    return registerShortcut({
      id: 'save-template-modal-escape',
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
      id: 'save-template-modal-enter',
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

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-tertiary)',
    fontFamily: 'var(--font-mono)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--tracking-wide)',
    marginBottom: '4px',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center fade-in"
      style={{ background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="glass slide-in"
        style={{ maxWidth: '28rem', width: '100%', margin: '0 1rem', borderRadius: 'var(--radius-xl)', border: '1px solid rgba(222, 255, 10, 0.15)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border-default)' }}>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', fontWeight: 700, color: '#deff0a', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)' }}>
            Save Group Template
          </h3>
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
            <label style={labelStyle}>Template Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Group Template"
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
                    { value: '', label: 'Select category...' },
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
                  + Create new category
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
                  placeholder="Category name"
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
            disabled={saving || !name.trim() || (!category && !newCategory.trim())}
            className={`btn flex items-center gap-1.5 ${
              saving || !name.trim() || (!category && !newCategory.trim()) ? '' : 'btn-primary'
            }`}
            style={
              saving || !name.trim() || (!category && !newCategory.trim())
                ? { opacity: 0.5, cursor: 'not-allowed' }
                : undefined
            }
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  );
}
