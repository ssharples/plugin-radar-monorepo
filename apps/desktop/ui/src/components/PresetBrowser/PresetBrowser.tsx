import { useEffect, useState } from 'react';
import { Folder, Save, Trash2, FileText } from 'lucide-react';
import { usePresetStore } from '../../stores/presetStore';
import { SavePresetModal } from './SavePresetModal';
import { CustomDropdown } from '../Dropdown';

export function PresetBrowser() {
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
  };

  const handleDeletePreset = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this preset?')) {
      await deletePreset(path);
    }
  };

  return (
    <div className="flex flex-col h-full bg-plugin-surface rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-plugin-border">
        <div className="flex items-center gap-2">
          <Folder className="w-4 h-4 text-plugin-accent" />
          <h2 className="text-sm font-semibold text-plugin-text">Presets</h2>
        </div>
        <button
          onClick={() => setShowSaveModal(true)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-plugin-accent hover:bg-plugin-accent/80 text-white transition-colors"
        >
          <Save className="w-3 h-3" />
          Save
        </button>
      </div>

      {/* Current preset */}
      {currentPreset && (
        <div className="px-3 py-2 bg-plugin-accent/10 border-b border-plugin-border">
          <p className="text-xs text-plugin-muted">Current preset:</p>
          <p className="text-sm text-plugin-text font-medium truncate">
            {currentPreset.name}
          </p>
        </div>
      )}

      {/* Category filter */}
      <div className="p-3 border-b border-plugin-border">
        <CustomDropdown
          value={selectedCategory || ''}
          options={[
            { value: '', label: 'All Categories' },
            ...categories.map((cat) => ({ value: cat, label: cat })),
          ]}
          onChange={(val) => setSelectedCategory(val || null)}
          size="sm"
        />
      </div>

      {/* Preset list */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-plugin-muted">
            Loading...
          </div>
        ) : filteredPresets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-plugin-muted text-sm">
            <FileText className="w-8 h-8 mb-2 opacity-20" />
            <p>No presets found</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredPresets.map((preset) => (
              <div
                key={preset.path}
                onClick={() => handleLoadPreset(preset.path)}
                className={`group flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                  currentPreset?.path === preset.path
                    ? 'bg-plugin-accent/20 border border-plugin-accent/50'
                    : 'hover:bg-plugin-bg border border-transparent'
                }`}
              >
                <FileText className="flex-shrink-0 w-4 h-4 text-plugin-muted" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-plugin-text truncate">
                    {preset.name}
                  </p>
                  <p className="text-xs text-plugin-muted truncate">
                    {preset.category}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDeletePreset(preset.path, e)}
                  className="flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-plugin-muted hover:text-red-500 transition-all"
                  title="Delete preset"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-plugin-border text-xs text-plugin-muted">
        {filteredPresets.length} preset{filteredPresets.length !== 1 ? 's' : ''}
      </div>

      {/* Save modal */}
      {showSaveModal && (
        <SavePresetModal onClose={() => setShowSaveModal(false)} />
      )}
    </div>
  );
}
