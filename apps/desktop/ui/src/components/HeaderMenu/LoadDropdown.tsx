import { useState, useEffect, useMemo, useCallback } from 'react';
import { FolderOpen, Search, FileText, Clock, Upload, X } from 'lucide-react';
import { usePresetStore } from '../../stores/presetStore';
import { useChainStore } from '../../stores/chainStore';
import { juceBridge } from '../../api/juce-bridge';

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

interface LoadDropdownProps {
  onClose: () => void;
}

export function LoadDropdown({ onClose }: LoadDropdownProps) {
  const { presets, loading, fetchPresets, loadPreset } = usePresetStore();
  const { setChainName } = useChainStore();
  const [search, setSearch] = useState('');
  const recentPaths = getRecentPresets();

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  const filtered = useMemo(() => {
    if (!search.trim()) return presets;
    const q = search.toLowerCase();
    return presets.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [presets, search]);

  const recentPresets = useMemo(() => {
    return recentPaths
      .map((path) => presets.find((p) => p.path === path))
      .filter(Boolean) as typeof presets;
  }, [recentPaths, presets]);

  const handleLoad = useCallback(async (preset: { path: string; name: string; category: string }) => {
    addRecentPreset(preset.path);
    const success = await loadPreset(preset.path);
    if (success) {
      setChainName(preset.name);
      onClose();
    }
  }, [loadPreset, setChainName, onClose]);

  const handleImportFile = useCallback(async () => {
    // In JUCE WebView, we can't use file input directly. 
    // We'd call a native bridge function to open a file picker.
    // For now, show a hint.
    try {
      // Attempt to load from a file dialog via JUCE bridge
      const result = await (juceBridge as any).callNativeWithTimeout?.('openFileDialog', 30000);
      if (result?.success && result?.path) {
        await loadPreset(result.path);
        onClose();
      }
    } catch {
      // File dialog not available — gracefully ignore
    }
  }, [loadPreset, onClose]);

  return (
    <div className="w-80 bg-plugin-surface border border-plugin-border rounded-lg shadow-xl animate-slide-up max-h-[70vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-plugin-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-3.5 h-3.5 text-plugin-accent" />
          <span className="text-xs font-semibold text-plugin-text">Load Chain</span>
        </div>
        <button onClick={onClose} className="text-plugin-dim hover:text-plugin-text">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-2 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-plugin-dim" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search local presets..."
            className="w-full bg-black/40 border border-plugin-border rounded pl-7 pr-2.5 py-1.5 text-xs text-plugin-text placeholder:text-plugin-dim focus:outline-none focus:ring-1 focus:ring-plugin-accent"
            autoFocus
          />
        </div>
      </div>

      {/* Preset list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {loading ? (
          <div className="py-8 text-center text-xs text-plugin-muted">Loading...</div>
        ) : presets.length === 0 ? (
          <div className="py-8 text-center text-xs text-plugin-muted">
            <FileText className="w-6 h-6 mx-auto mb-2 opacity-20" />
            No local presets found
          </div>
        ) : (
          <>
            {/* Recent presets */}
            {!search && recentPresets.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Clock className="w-3 h-3 text-plugin-dim" />
                  <span className="text-[10px] text-plugin-dim uppercase tracking-wider font-medium">
                    Recent
                  </span>
                </div>
                <div className="space-y-0.5">
                  {recentPresets.map((preset) => (
                    <PresetRow
                      key={`recent-${preset.path}`}
                      preset={preset}
                      onLoad={handleLoad}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* All presets */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <FileText className="w-3 h-3 text-plugin-dim" />
                <span className="text-[10px] text-plugin-dim uppercase tracking-wider font-medium">
                  {search ? `Results (${filtered.length})` : 'All Local Presets'}
                </span>
              </div>
              {filtered.length === 0 ? (
                <div className="py-4 text-center text-xs text-plugin-muted">
                  No presets matching "{search}"
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filtered.map((preset) => (
                    <PresetRow
                      key={preset.path}
                      preset={preset}
                      onLoad={handleLoad}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Import from file */}
      <div className="px-3 py-2 border-t border-plugin-border flex-shrink-0">
        <button
          onClick={handleImportFile}
          className="w-full flex items-center justify-center gap-1.5 text-[11px] text-plugin-muted hover:text-plugin-text border border-dashed border-plugin-border hover:border-plugin-accent/40 rounded px-3 py-1.5 transition-colors"
        >
          <Upload className="w-3 h-3" />
          Import from File...
        </button>
      </div>
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
  return (
    <button
      onClick={() => onLoad(preset)}
      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left hover:bg-white/5 transition-colors group"
    >
      <span className="text-xs text-plugin-text truncate group-hover:text-plugin-accent transition-colors">
        {preset.name}
      </span>
      <span className="text-[10px] text-plugin-dim flex-shrink-0 ml-2">
        {preset.category}
      </span>
    </button>
  );
}
