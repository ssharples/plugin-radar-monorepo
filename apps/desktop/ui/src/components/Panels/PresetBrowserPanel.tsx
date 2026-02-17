import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, ChevronRight, Star } from 'lucide-react';
import { juceBridge } from '../../api/juce-bridge';
import type { PresetInfo } from '../../api/types';

export function PresetBrowserPanel() {
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [currentPreset, setCurrentPreset] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('panel_preset_favorites');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Fetch presets
  useEffect(() => {
    setLoading(true);
    juceBridge.getPresetList()
      .then(list => setPresets(list ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));

    const cleanup = juceBridge.onPresetListChanged((list) => {
      setPresets(list ?? []);
    });
    return cleanup;
  }, []);

  // Track current preset
  useEffect(() => {
    const cleanup = juceBridge.onPresetLoaded((info) => {
      setCurrentPreset(info?.name ?? null);
    });
    return cleanup;
  }, []);

  // Categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    presets.forEach(p => { if (p.category) cats.add(p.category); });
    return Array.from(cats).sort();
  }, [presets]);

  // Filtered presets
  const filtered = useMemo(() => {
    let list = presets;
    if (selectedCategory) {
      list = list.filter(p => p.category === selectedCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [presets, selectedCategory, search]);

  // Favorites at top
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aFav = favorites.has(a.path);
      const bFav = favorites.has(b.path);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [filtered, favorites]);

  const handleLoad = useCallback(async (preset: PresetInfo) => {
    try {
      await juceBridge.loadPreset(preset.path);
      setCurrentPreset(preset.name);
    } catch {
      // Ignore
    }
  }, []);

  const toggleFavorite = useCallback((path: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      try {
        localStorage.setItem('panel_preset_favorites', JSON.stringify(Array.from(next)));
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-white/5 shrink-0">
        <Search size={10} className="text-white" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search presets..."
          className="
            flex-1 bg-transparent text-[10px] font-sans text-white
            placeholder:text-white/20 outline-none
          "
        />
      </div>

      {/* Category filter */}
      {categories.length > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 border-b border-white/5 overflow-x-auto shrink-0">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`
              px-1.5 py-0.5 rounded text-[8px] font-sans shrink-0 transition-colors
              ${!selectedCategory ? 'bg-plugin-accent/20 text-plugin-accent' : 'text-white hover:text-plugin-accent'}
            `}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
              className={`
                px-1.5 py-0.5 rounded text-[8px] font-sans shrink-0 transition-colors
                ${selectedCategory === cat ? 'bg-plugin-accent/20 text-plugin-accent' : 'text-white hover:text-plugin-accent'}
              `}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Count */}
      <div className="px-2 py-0.5 text-[8px] font-sans text-white border-b border-white/5 shrink-0">
        {sorted.length} presets
      </div>

      {/* Preset list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-4 text-[10px] font-sans text-white">
            Loading...
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-[10px] font-sans text-white">
            {search ? 'No matches' : 'No presets'}
          </div>
        ) : (
          sorted.map(preset => {
            const isActive = currentPreset === preset.name;
            const isFav = favorites.has(preset.path);
            return (
              <div
                key={preset.path}
                className={`
                  flex items-center gap-1 px-2 py-[3px] border-b border-white/[0.03]
                  cursor-pointer transition-colors
                  ${isActive ? 'bg-plugin-accent/10 text-plugin-accent' : 'hover:bg-white/[0.03] text-white'}
                `}
                onClick={() => handleLoad(preset)}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(preset.path); }}
                  className={`shrink-0 ${isFav ? 'text-plugin-accent' : 'text-white/10 hover:text-white'}`}
                >
                  <Star size={9} fill={isFav ? '#deff0a' : 'none'} />
                </button>
                <span className="text-[9px] font-sans truncate flex-1 min-w-0">
                  {preset.name}
                </span>
                {preset.category && (
                  <span className="text-[7px] font-sans text-white shrink-0">
                    {preset.category}
                  </span>
                )}
                {isActive && (
                  <ChevronRight size={9} className="text-plugin-accent shrink-0" />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
