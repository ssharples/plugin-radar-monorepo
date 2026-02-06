import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { usePresetStore } from '../../stores/presetStore';

interface SavePresetModalProps {
  onClose: () => void;
}

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !saving) {
      handleSave();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="w-full max-w-md bg-plugin-surface rounded-lg shadow-xl border border-plugin-border"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-plugin-border">
          <h3 className="text-lg font-semibold text-plugin-text">Save Preset</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-plugin-border transition-colors"
          >
            <X className="w-5 h-5 text-plugin-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Name input */}
          <div>
            <label className="block text-sm text-plugin-muted mb-1">
              Preset Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Preset"
              autoFocus
              className="w-full px-3 py-2 bg-plugin-bg rounded text-plugin-text placeholder:text-plugin-muted focus:outline-none focus:ring-1 focus:ring-plugin-accent"
            />
          </div>

          {/* Category selection */}
          <div>
            <label className="block text-sm text-plugin-muted mb-1">
              Category
            </label>

            {/* Existing categories */}
            {categories.length > 0 && !useNewCategory && (
              <div className="space-y-2">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-plugin-bg rounded text-plugin-text focus:outline-none focus:ring-1 focus:ring-plugin-accent"
                >
                  <option value="">Select a category...</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setUseNewCategory(true)}
                  className="text-xs text-plugin-accent hover:underline"
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
                  className="w-full px-3 py-2 bg-plugin-bg rounded text-plugin-text placeholder:text-plugin-muted focus:outline-none focus:ring-1 focus:ring-plugin-accent"
                />
                {categories.length > 0 && (
                  <button
                    onClick={() => setUseNewCategory(false)}
                    className="text-xs text-plugin-accent hover:underline"
                  >
                    Use existing category
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-plugin-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-sm text-plugin-muted hover:text-plugin-text hover:bg-plugin-border transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={
              saving ||
              !name.trim() ||
              (!useNewCategory && !category) ||
              (useNewCategory && !newCategory.trim())
            }
            className="flex items-center gap-1.5 px-4 py-2 rounded text-sm bg-plugin-accent hover:bg-plugin-accent/80 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Preset'}
          </button>
        </div>
      </div>
    </div>
  );
}
