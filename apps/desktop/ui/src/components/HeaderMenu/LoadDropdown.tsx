import { useState, useEffect, useMemo, useCallback } from 'react';
import { FolderOpen, Search, FileText, Clock, Upload, X, Share2, Layers, Trash2 } from 'lucide-react';
import { usePresetStore } from '../../stores/presetStore';
import { useGroupTemplateStore } from '../../stores/groupTemplateStore';
import { useChainStore } from '../../stores/chainStore';
import { juceBridge } from '../../api/juce-bridge';
import { CustomDropdown } from '../Dropdown';

// Persist recent presets in localStorage
const RECENT_KEY = 'pluginradar_recent_presets';
const MAX_RECENT = 5;

function getRecentPresets(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

function addRecentPreset(path: string) {
  const recent = getRecentPresets().filter((p) => p !== path);
  recent.unshift(path);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

const glassPanel: React.CSSProperties = {
  background: 'rgba(15, 15, 15, 0.9)',
  backdropFilter: 'blur(12px)',
  border: '1px solid var(--color-border-default)',
  boxShadow: 'var(--shadow-elevated)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--color-bg-input)',
  border: '1px solid var(--color-border-default)',
  borderRadius: 'var(--radius-base)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text-primary)',
  padding: '6px 10px',
  paddingLeft: '28px',
  outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
};

interface LoadDropdownProps {
  onClose: () => void;
}

type TabType = 'presets' | 'templates';

export function LoadDropdown({ onClose }: LoadDropdownProps) {
  const { presets, loading: presetsLoading, fetchPresets, loadPreset } = usePresetStore();
  const { templates, loading: templatesLoading, fetchTemplates, loadTemplate, deleteTemplate, categories: templateCategories } = useGroupTemplateStore();
  const { setChainName, selectedNodeId } = useChainStore();
  const [activeTab, setActiveTab] = useState<TabType>('presets');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const recentPaths = getRecentPresets();

  useEffect(() => {
    fetchPresets();
    fetchTemplates();
  }, [fetchPresets, fetchTemplates]);

  const filteredPresets = useMemo(() => {
    if (!search.trim()) return presets;
    const q = search.toLowerCase();
    return presets.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [presets, search]);

  const filteredTemplates = useMemo(() => {
    let result = templates;

    if (selectedCategory) {
      result = result.filter((t) => t.category === selectedCategory);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q)
      );
    }

    return result;
  }, [templates, search, selectedCategory]);

  const recentPresets = useMemo(() => {
    return recentPaths
      .map((path) => presets.find((p) => p.path === path))
      .filter(Boolean) as typeof presets;
  }, [recentPaths, presets]);

  const handleLoadPreset = useCallback(async (preset: { path: string; name: string; category: string }) => {
    addRecentPreset(preset.path);
    const success = await loadPreset(preset.path);
    if (success) {
      setChainName(preset.name);
      onClose();
    }
  }, [loadPreset, setChainName, onClose]);

  const handleLoadTemplate = useCallback(async (template: { path: string; name: string }) => {
    const parentId = selectedNodeId ?? 0;
    const insertIndex = -1;

    const groupId = await loadTemplate(template.path, parentId, insertIndex);
    if (groupId !== null) {
      onClose();
    }
  }, [loadTemplate, selectedNodeId, onClose]);

  const handleDeleteTemplate = useCallback(async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();

    if (confirm('Delete this template? This cannot be undone.')) {
      await deleteTemplate(path);
    }
  }, [deleteTemplate]);

  const handleImportFile = useCallback(async () => {
    try {
      const result = await (juceBridge as any).callNativeWithTimeout?.('openFileDialog', 30000);
      if (result?.success && result?.path) {
        await loadPreset(result.path);
        onClose();
      }
    } catch {
      // File dialog not available
    }
  }, [loadPreset, onClose]);

  const loading = activeTab === 'presets' ? presetsLoading : templatesLoading;
  const items = activeTab === 'presets' ? filteredPresets : filteredTemplates;

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '8px 16px',
    fontSize: 'var(--text-xs)',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 'var(--tracking-wide)',
    color: isActive ? 'var(--color-accent-cyan)' : 'var(--color-text-tertiary)',
    borderBottom: isActive ? '2px solid var(--color-accent-cyan)' : '2px solid transparent',
    background: 'transparent',
    border: 'none',
    borderBottomStyle: 'solid',
    borderBottomWidth: '2px',
    borderBottomColor: isActive ? 'var(--color-accent-cyan)' : 'transparent',
    cursor: 'pointer',
    transition: 'all 150ms',
  });

  return (
    <div className="w-80 rounded-md scale-in max-h-[70vh] flex flex-col" style={glassPanel}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
        <div className="flex items-center gap-2">
          <FolderOpen className="w-3.5 h-3.5" style={{ color: 'var(--color-accent-cyan)' }} />
          <span style={{
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-extended)',
            fontWeight: 900,
            color: 'var(--color-text-primary)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wider)',
          }}>
            Load
          </span>
        </div>
        <button
          onClick={onClose}
          className="transition-colors duration-150"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
        <button
          onClick={() => { setActiveTab('presets'); setSearch(''); setSelectedCategory(null); }}
          style={tabStyle(activeTab === 'presets')}
        >
          Presets
        </button>
        <button
          onClick={() => { setActiveTab('templates'); setSearch(''); setSelectedCategory(null); }}
          style={tabStyle(activeTab === 'templates')}
        >
          Group Templates
        </button>
      </div>

      {/* Search & Category Filter */}
      <div className="px-3 pt-3 pb-2 flex-shrink-0 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: 'var(--color-text-tertiary)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={activeTab === 'presets' ? 'Search presets...' : 'Search templates...'}
            style={inputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent-cyan)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--color-accent-cyan)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; e.currentTarget.style.boxShadow = 'none'; }}
            autoFocus
          />
        </div>

        {/* Category filter for templates */}
        {activeTab === 'templates' && templateCategories.length > 0 && (
          <CustomDropdown
            value={selectedCategory || ''}
            options={[
              { value: '', label: 'All Categories' },
              ...templateCategories.map((cat) => ({ value: cat, label: cat })),
            ]}
            onChange={(val) => setSelectedCategory(val || null)}
            size="sm"
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 scrollbar-cyber">
        {loading ? (
          <div className="py-8 text-center" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
            Loading...
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center">
            <FileText className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--color-text-tertiary)', opacity: 0.3 }} />
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {activeTab === 'presets'
                ? 'No local presets found'
                : 'No group templates found'
              }
            </p>
          </div>
        ) : (
          <>
            {/* Presets view */}
            {activeTab === 'presets' && (
              <>
                {/* Recent presets */}
                {!search && recentPresets.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Clock className="w-3 h-3" style={{ color: 'var(--color-text-tertiary)' }} />
                      <span style={{
                        fontSize: 'var(--text-xs)',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--color-text-tertiary)',
                        textTransform: 'uppercase',
                        letterSpacing: 'var(--tracking-wider)',
                        fontWeight: 700,
                      }}>
                        Recent
                      </span>
                    </div>
                    <div className="space-y-0.5 stagger-children">
                      {recentPresets.map((preset) => (
                        <PresetRow
                          key={`recent-${preset.path}`}
                          preset={preset}
                          onLoad={handleLoadPreset}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* All presets */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <FileText className="w-3 h-3" style={{ color: 'var(--color-text-tertiary)' }} />
                    <span style={{
                      fontSize: 'var(--text-xs)',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--color-text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--tracking-wider)',
                      fontWeight: 700,
                    }}>
                      {search ? `Results (${filteredPresets.length})` : 'All Local Presets'}
                    </span>
                  </div>
                  {filteredPresets.length === 0 ? (
                    <div className="py-4 text-center" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      No presets matching "{search}"
                    </div>
                  ) : (
                    <div className="space-y-0.5 stagger-children">
                      {filteredPresets.map((preset) => (
                        <PresetRow
                          key={preset.path}
                          preset={preset}
                          onLoad={handleLoadPreset}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Templates view */}
            {activeTab === 'templates' && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Layers className="w-3 h-3" style={{ color: 'var(--color-text-tertiary)' }} />
                  <span style={{
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-text-tertiary)',
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--tracking-wider)',
                    fontWeight: 700,
                  }}>
                    {search || selectedCategory ? `Results (${filteredTemplates.length})` : 'All Templates'}
                  </span>
                </div>
                {filteredTemplates.length === 0 ? (
                  <div className="py-4 text-center" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {search ? `No templates matching "${search}"` : 'No templates in this category'}
                  </div>
                ) : (
                  <div className="space-y-0.5 stagger-children">
                    {filteredTemplates.map((template) => (
                      <TemplateRow
                        key={template.path}
                        template={template}
                        onLoad={handleLoadTemplate}
                        onDelete={handleDeleteTemplate}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Import from file (presets only) */}
      {activeTab === 'presets' && (
        <div className="px-3 py-2 flex-shrink-0" style={{ borderTop: '1px solid var(--color-border-default)' }}>
          <button
            onClick={handleImportFile}
            className="w-full flex items-center justify-center gap-1.5 rounded transition-all duration-150"
            style={{
              padding: '6px 12px',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-secondary)',
              border: '1px dashed var(--color-border-default)',
              background: 'transparent',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wide)',
            }}
          >
            <Upload className="w-3 h-3" />
            Import from File...
          </button>
        </div>
      )}
    </div>
  );
}

function PresetRow({
  preset,
  onLoad,
}: {
  preset: { path: string; name: string; category: string };
  onLoad: (preset: { path: string; name: string; category: string }) => void;
}) {
  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('sharePreset', {
      detail: { name: preset.name, path: preset.path, category: preset.category }
    }));
  };

  return (
    <button
      onClick={() => onLoad(preset)}
      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-all duration-150 group"
      style={{ background: 'transparent' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(222, 255, 10, 0.05)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span className="truncate" style={{
        fontSize: 'var(--text-sm)',
        fontFamily: 'var(--font-mono)',
        color: 'var(--color-text-primary)',
      }}>
        {preset.name}
      </span>
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          {preset.category}
        </span>
        <span
          onClick={handleShare}
          className="opacity-0 group-hover:opacity-100 p-0.5 cursor-pointer transition-all duration-150"
          style={{ color: 'var(--color-text-tertiary)' }}
          title="Share"
        >
          <Share2 className="w-3 h-3" />
        </span>
      </div>
    </button>
  );
}

function TemplateRow({
  template,
  onLoad,
  onDelete,
}: {
  template: { path: string; name: string; category: string; mode: 'serial' | 'parallel'; pluginCount: number };
  onLoad: (template: { path: string; name: string }) => void;
  onDelete: (e: React.MouseEvent, path: string) => void;
}) {
  return (
    <button
      onClick={() => onLoad(template)}
      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-all duration-150 group"
      style={{ background: 'transparent' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(222, 255, 10, 0.05)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <div
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{
            background: template.mode === 'parallel' ? 'var(--color-accent-lime)' : 'var(--color-accent-cyan)',
          }}
        />
        <span className="truncate" style={{
          fontSize: 'var(--text-sm)',
          fontFamily: 'var(--font-mono)',
          color: 'var(--color-text-primary)',
        }}>
          {template.name}
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          {template.pluginCount} plugin{template.pluginCount !== 1 ? 's' : ''}
        </span>
        <span
          onClick={(e) => onDelete(e, template.path)}
          className="opacity-0 group-hover:opacity-100 p-0.5 cursor-pointer transition-all duration-150"
          style={{ color: 'var(--color-text-tertiary)' }}
          title="Delete template"
        >
          <Trash2 className="w-3 h-3" />
        </span>
      </div>
    </button>
  );
}
