import { useEffect, useState } from 'react';
import { Folder, Save, Trash2, FileText, ChevronDown, X } from 'lucide-react';
import { usePresetStore } from '../../stores/presetStore';
import { SavePresetModal } from './SavePresetModal';

interface PresetModalProps {
  onClose: () => void;
}

export function PresetModal({ onClose }: PresetModalProps) {
  const {
    presets,
    categories,
    currentPreset,
    selectedCategory,
    loading,
    fetchPresets,
    fetchCategories,
    loadPreset,
    deletePreset,
    setSelectedCategory,
  } = usePresetStore();

  const [showSaveModal, setShowSaveModal] = useState(false);

  useEffect(() => {
    fetchPresets();
    fetchCategories();
  }, [fetchPresets, fetchCategories]);

  const filteredPresets = selectedCategory
    ? presets.filter((p) => p.category === selectedCategory)
    : presets;

  const handleLoadPreset = async (path: string) => {
    await loadPreset(path);
    onClose();
  };

  const handleDeletePreset = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this preset?')) {
      await deletePreset(path);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col bg-plugin-surface rounded-lg shadow-xl border border-plugin-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-plugin-border">
          <div className="flex items-center gap-2">
            <Folder className="w-5 h-5 text-plugin-accent" />
            <h2 className="text-lg font-semibold text-plugin-text">Presets</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSaveModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-plugin-accent hover:bg-plugin-accent/80 text-white transition-colors"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-plugin-border transition-colors"
            >
              <X className="w-5 h-5 text-plugin-muted" />
            </button>
          </div>
        </div>

        {/* Current preset */}
        {currentPreset && (
          <div className="px-4 py-3 bg-plugin-accent/10 border-b border-plugin-border">
            <p className="text-xs text-plugin-muted">Current preset:</p>
            <p className="text-sm text-plugin-text font-medium truncate">
              {currentPreset.name}
            </p>
          </div>
        )}

        {/* Category filter */}
        <div className="p-4 border-b border-plugin-border">
          <div className="relative">
            <select
              value={selectedCategory || ''}
              onChange={(e) => setSelectedCategory(e.target.value || null)}
              className="w-full appearance-none px-3 py-2 pr-10 bg-plugin-bg rounded text-sm text-plugin-text focus:outline-none focus:ring-1 focus:ring-plugin-accent"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-plugin-muted pointer-events-none" />
          </div>
        </div>

        {/* Preset list */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-plugin-muted">
              Loading...
            </div>
          ) : filteredPresets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-plugin-muted text-sm">
              <FileText className="w-10 h-10 mb-3 opacity-20" />
              <p>No presets found</p>
              <p className="text-xs mt-1">Save your current chain as a preset</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {filteredPresets.map((preset) => (
                <div
                  key={preset.path}
                  onClick={() => handleLoadPreset(preset.path)}
                  className={`group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    currentPreset?.path === preset.path
                      ? 'bg-plugin-accent/20 border border-plugin-accent/50'
                      : 'bg-plugin-bg hover:bg-plugin-border border border-transparent'
                  }`}
                >
                  <FileText className="flex-shrink-0 w-5 h-5 text-plugin-muted" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-plugin-text font-medium truncate">
                      {preset.name}
                    </p>
                    <p className="text-xs text-plugin-muted truncate">
                      {preset.category}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDeletePreset(preset.path, e)}
                    className="flex-shrink-0 p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-plugin-muted hover:text-red-500 transition-all"
                    title="Delete preset"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-plugin-border text-sm text-plugin-muted">
          {filteredPresets.length} preset{filteredPresets.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Save modal */}
      {showSaveModal && (
        <SavePresetModal onClose={() => setShowSaveModal(false)} />
      )}
    </div>
  );
}
