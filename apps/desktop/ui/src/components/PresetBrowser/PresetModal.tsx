import { useEffect, useState } from 'react';
import { Folder, Save, Trash2, FileText, X } from 'lucide-react';
import { usePresetStore } from '../../stores/presetStore';
import { useKeyboardStore, ShortcutPriority } from '../../stores/keyboardStore';
import { SavePresetModal } from './SavePresetModal';
import { CustomDropdown } from '../Dropdown';

interface PresetModalProps {
  onClose: () => void;
}

const modalOverlayStyle: React.CSSProperties = {
  background: 'rgba(0, 0, 0, 0.75)',
  backdropFilter: 'blur(4px)',
};

const modalPanelStyle: React.CSSProperties = {
  maxWidth: '32rem',
  width: '100%',
  margin: '0 1rem',
  borderRadius: 'var(--radius-xl)',
  border: '1px solid rgba(222, 255, 10, 0.15)',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '80vh',
};

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

  // Escape closes (modal priority)
  useEffect(() => {
    const registerShortcut = useKeyboardStore.getState().registerShortcut;
    return registerShortcut({
      id: 'preset-modal-escape',
      key: 'Escape',
      priority: ShortcutPriority.MODAL,
      allowInInputs: true,
      handler: (e) => {
        e.preventDefault();
        onClose();
      }
    });
  }, [onClose]);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center fade-in"
      style={modalOverlayStyle}
      onClick={onClose}
    >
      <div
        className="glass scale-in"
        style={modalPanelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border-default)' }}>
          <div className="flex items-center gap-2">
            <Folder className="w-5 h-5" style={{ color: 'var(--color-accent-cyan)' }} />
            <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', fontWeight: 700, color: '#deff0a', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)' }}>Presets</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSaveModal(true)}
              className="btn btn-primary flex items-center gap-1.5"
              style={{ fontSize: 'var(--text-sm)' }}
            >
              <Save className="w-4 h-4" />
              Save
            </button>
            <button
              onClick={onClose}
              style={{ padding: '6px', borderRadius: 'var(--radius-base)', color: 'var(--color-text-disabled)', background: 'none', border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-disabled)')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Current preset */}
        {currentPreset && (
          <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'rgba(222, 255, 10, 0.06)', borderBottom: '1px solid var(--color-border-default)' }}>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>Current preset:</p>
            <p className="truncate" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
              {currentPreset.name}
            </p>
          </div>
        )}

        {/* Category filter */}
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border-default)' }}>
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
        <div className="flex-1 overflow-y-auto scrollbar-cyber min-h-0" style={{ padding: 'var(--space-4)' }}>
          {loading ? (
            <div className="flex items-center justify-center" style={{ height: '8rem', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              Loading...
            </div>
          ) : filteredPresets.length === 0 ? (
            <div className="flex flex-col items-center justify-center" style={{ height: '8rem', color: 'var(--color-text-disabled)', fontSize: 'var(--text-sm)' }}>
              <FileText className="w-10 h-10 mb-3" style={{ opacity: 0.2 }} />
              <p>No presets found</p>
              <p style={{ fontSize: 'var(--text-xs)', marginTop: '4px' }}>Save your current chain as a preset</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {filteredPresets.map((preset) => {
                const isActive = currentPreset?.path === preset.path;
                return (
                  <div
                    key={preset.path}
                    onClick={() => handleLoadPreset(preset.path)}
                    className="group flex items-center gap-3 fast-snap"
                    style={{
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      background: isActive ? 'rgba(222, 255, 10, 0.1)' : 'var(--color-bg-input)',
                      border: isActive ? '1px solid rgba(222, 255, 10, 0.4)' : '1px solid var(--color-border-subtle)',
                      transition: 'all var(--duration-fast)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = 'rgba(222, 255, 10, 0.3)';
                        e.currentTarget.style.boxShadow = '0 0 8px rgba(222, 255, 10, 0.1)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    <FileText className="flex-shrink-0 w-5 h-5" style={{ color: 'var(--color-text-disabled)' }} />
                    <div className="flex-1 min-w-0">
                      <p className="truncate" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                        {preset.name}
                      </p>
                      <p className="truncate" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-disabled)' }}>
                        {preset.category}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDeletePreset(preset.path, e)}
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100"
                      style={{ padding: '6px', borderRadius: 'var(--radius-base)', color: 'var(--color-text-disabled)', background: 'none', border: 'none', cursor: 'pointer', transition: 'all var(--duration-fast)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--color-status-error)';
                        e.currentTarget.style.background = 'rgba(255, 0, 51, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--color-text-disabled)';
                        e.currentTarget.style.background = 'none';
                      }}
                      title="Delete preset"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--color-border-default)', fontSize: 'var(--text-sm)', color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>
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
