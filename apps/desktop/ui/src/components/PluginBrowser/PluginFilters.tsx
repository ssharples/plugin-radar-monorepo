import { X, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { usePluginStore } from '../../stores/pluginStore';

// Categories from shared package
const CATEGORIES = [
  { value: 'eq', label: 'EQ' },
  { value: 'compressor', label: 'Compressor' },
  { value: 'limiter', label: 'Limiter' },
  { value: 'reverb', label: 'Reverb' },
  { value: 'delay', label: 'Delay' },
  { value: 'saturation', label: 'Saturation' },
  { value: 'modulation', label: 'Modulation' },
  { value: 'stereo-imaging', label: 'Stereo Imaging' },
  { value: 'gate-expander', label: 'Gate / Expander' },
  { value: 'de-esser', label: 'De-esser' },
  { value: 'filter', label: 'Filter' },
  { value: 'channel-strip', label: 'Channel Strip' },
  { value: 'metering', label: 'Metering' },
  { value: 'noise-reduction', label: 'Noise Reduction' },
  { value: 'multiband', label: 'Multiband' },
  { value: 'utility', label: 'Utility' },
] as const;

// Effect types per category
const EFFECT_TYPES: Record<string, { value: string; label: string }[]> = {
  compressor: [
    { value: 'VCA', label: 'VCA' },
    { value: 'FET', label: 'FET' },
    { value: 'Opto', label: 'Optical' },
    { value: 'Variable-Mu', label: 'Variable-Mu' },
    { value: 'Digital', label: 'Digital' },
    { value: 'Multiband', label: 'Multiband' },
  ],
  eq: [
    { value: 'Parametric', label: 'Parametric' },
    { value: 'Graphic', label: 'Graphic' },
    { value: 'Dynamic', label: 'Dynamic EQ' },
    { value: 'Linear Phase', label: 'Linear Phase' },
    { value: 'Semi-parametric', label: 'Semi-parametric' },
    { value: 'Passive', label: 'Passive' },
  ],
  reverb: [
    { value: 'Algorithmic', label: 'Algorithmic' },
    { value: 'Convolution', label: 'Convolution' },
    { value: 'Plate', label: 'Plate' },
    { value: 'Spring', label: 'Spring' },
    { value: 'Room', label: 'Room' },
    { value: 'Hall', label: 'Hall' },
    { value: 'Chamber', label: 'Chamber' },
  ],
  delay: [
    { value: 'Digital', label: 'Digital' },
    { value: 'Tape', label: 'Tape' },
    { value: 'Analog', label: 'Analog' },
    { value: 'Ping-Pong', label: 'Ping-Pong' },
    { value: 'Multi-tap', label: 'Multi-tap' },
    { value: 'Granular', label: 'Granular' },
  ],
  saturation: [
    { value: 'Tape', label: 'Tape' },
    { value: 'Tube', label: 'Tube' },
    { value: 'Transformer', label: 'Transformer' },
    { value: 'Clipping', label: 'Clipping' },
    { value: 'Harmonic', label: 'Harmonic' },
  ],
  modulation: [
    { value: 'Chorus', label: 'Chorus' },
    { value: 'Flanger', label: 'Flanger' },
    { value: 'Phaser', label: 'Phaser' },
    { value: 'Tremolo', label: 'Tremolo' },
    { value: 'Vibrato', label: 'Vibrato' },
    { value: 'Rotary', label: 'Rotary' },
  ],
  limiter: [
    { value: 'Brickwall', label: 'Brickwall' },
    { value: 'Transparent', label: 'Transparent' },
    { value: 'Clipper', label: 'Clipper' },
    { value: 'Multiband', label: 'Multiband' },
  ],
};

const TONAL_CHARACTERS = [
  { value: 'warm', label: 'Warm' },
  { value: 'transparent', label: 'Transparent' },
  { value: 'aggressive', label: 'Aggressive' },
  { value: 'clean', label: 'Clean' },
  { value: 'colored', label: 'Colored' },
  { value: 'smooth', label: 'Smooth' },
  { value: 'punchy', label: 'Punchy' },
  { value: 'vintage', label: 'Vintage' },
  { value: 'modern', label: 'Modern' },
  { value: 'crisp', label: 'Crisp' },
];

export function PluginFilters() {
  const {
    typeFilter,
    sortBy,
    setTypeFilter,
    setSortBy,
    categoryFilter,
    effectTypeFilter,
    tonalCharacterFilter,
    priceFilter,
    setCategoryFilter,
    setEffectTypeFilter,
    toggleTonalCharacter,
    setPriceFilter,
    clearAllFilters,
    hasActiveFilters,
    enrichmentLoaded,
  } = usePluginStore();

  const [showAdvanced, setShowAdvanced] = useState(false);
  const advancedRef = useRef<HTMLDivElement>(null);

  // Close advanced panel when clicking outside
  useEffect(() => {
    if (!showAdvanced) return;
    const handler = (e: MouseEvent) => {
      if (advancedRef.current && !advancedRef.current.contains(e.target as Node)) {
        setShowAdvanced(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAdvanced]);

  const activeFilterCount = [
    categoryFilter !== null,
    effectTypeFilter !== null,
    tonalCharacterFilter.length > 0,
    priceFilter !== 'all',
  ].filter(Boolean).length;

  const typeOptions = [
    { value: 'all', label: 'All' },
    { value: 'effects', label: 'FX' },
    { value: 'instruments', label: 'Inst' },
  ] as const;

  const sortOptions = [
    { value: 'name', label: 'Name' },
    { value: 'manufacturer', label: 'Maker' },
    { value: 'most-used', label: 'Most Used' },
    { value: 'recent', label: 'Recent' },
  ] as const;

  const availableEffectTypes = categoryFilter ? (EFFECT_TYPES[categoryFilter] ?? []) : [];

  return (
    <div className="relative" ref={advancedRef}>
      <div className="flex items-center gap-2">
        {/* Type toggle */}
        <div className="flex rounded overflow-hidden border border-plugin-border">
          {typeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTypeFilter(opt.value)}
              className={`px-1.5 py-0.5 text-xxs transition-all ${
                typeFilter === opt.value
                  ? 'bg-plugin-accent text-black font-semibold'
                  : 'bg-plugin-bg text-plugin-muted hover:text-plugin-text'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="bg-plugin-bg text-xxs text-plugin-muted rounded px-1.5 py-0.5 border border-plugin-border focus:outline-none focus:border-plugin-accent/50 cursor-pointer"
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Advanced filters toggle (only show if enrichment data loaded) */}
        {enrichmentLoaded && (
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`flex items-center gap-0.5 px-1.5 py-0.5 text-xxs rounded border transition-all ${
              activeFilterCount > 0
                ? 'bg-plugin-accent/15 text-plugin-accent border-plugin-accent/40'
                : 'bg-plugin-bg text-plugin-muted border-plugin-border hover:text-plugin-text'
            }`}
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filters'}
          </button>
        )}
      </div>

      {/* Advanced filter panel */}
      {showAdvanced && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-plugin-surface border border-plugin-border rounded-lg shadow-xl p-2.5 space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-xxs font-semibold text-plugin-text uppercase tracking-wider">Filters</span>
            {hasActiveFilters() && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-0.5 text-[9px] text-plugin-accent hover:text-plugin-accent/80"
              >
                <X className="w-2.5 h-2.5" />
                Clear all
              </button>
            )}
          </div>

          {/* Category filter */}
          <div>
            <label className="text-[9px] text-plugin-dim uppercase tracking-wider mb-1 block">Category</label>
            <div className="flex flex-wrap gap-0.5">
              <button
                onClick={() => setCategoryFilter(null)}
                className={`px-1.5 py-0.5 text-[9px] rounded transition-all ${
                  categoryFilter === null
                    ? 'bg-plugin-accent text-black font-semibold'
                    : 'bg-plugin-bg text-plugin-muted border border-plugin-border hover:text-plugin-text'
                }`}
              >
                All
              </button>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setCategoryFilter(categoryFilter === cat.value ? null : cat.value)}
                  className={`px-1.5 py-0.5 text-[9px] rounded transition-all ${
                    categoryFilter === cat.value
                      ? 'bg-plugin-accent text-black font-semibold'
                      : 'bg-plugin-bg text-plugin-muted border border-plugin-border hover:text-plugin-text'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Effect type filter (contextual based on category) */}
          {availableEffectTypes.length > 0 && (
            <div>
              <label className="text-[9px] text-plugin-dim uppercase tracking-wider mb-1 block">Effect Type</label>
              <div className="flex flex-wrap gap-0.5">
                <button
                  onClick={() => setEffectTypeFilter(null)}
                  className={`px-1.5 py-0.5 text-[9px] rounded transition-all ${
                    effectTypeFilter === null
                      ? 'bg-plugin-accent text-black font-semibold'
                      : 'bg-plugin-bg text-plugin-muted border border-plugin-border hover:text-plugin-text'
                  }`}
                >
                  All
                </button>
                {availableEffectTypes.map((et) => (
                  <button
                    key={et.value}
                    onClick={() => setEffectTypeFilter(effectTypeFilter === et.value ? null : et.value)}
                    className={`px-1.5 py-0.5 text-[9px] rounded transition-all ${
                      effectTypeFilter === et.value
                        ? 'bg-plugin-accent text-black font-semibold'
                        : 'bg-plugin-bg text-plugin-muted border border-plugin-border hover:text-plugin-text'
                    }`}
                  >
                    {et.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tonal character filter */}
          <div>
            <label className="text-[9px] text-plugin-dim uppercase tracking-wider mb-1 block">Tonal Character</label>
            <div className="flex flex-wrap gap-0.5">
              {TONAL_CHARACTERS.map((tc) => (
                <button
                  key={tc.value}
                  onClick={() => toggleTonalCharacter(tc.value)}
                  className={`px-1.5 py-0.5 text-[9px] rounded transition-all ${
                    tonalCharacterFilter.includes(tc.value)
                      ? 'bg-plugin-accent text-black font-semibold'
                      : 'bg-plugin-bg text-plugin-muted border border-plugin-border hover:text-plugin-text'
                  }`}
                >
                  {tc.label}
                </button>
              ))}
            </div>
          </div>

          {/* Price filter */}
          <div>
            <label className="text-[9px] text-plugin-dim uppercase tracking-wider mb-1 block">Price</label>
            <div className="flex gap-0.5">
              {[
                { value: 'all' as const, label: 'All' },
                { value: 'free' as const, label: 'Free' },
                { value: 'paid' as const, label: 'Paid' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPriceFilter(opt.value)}
                  className={`px-2 py-0.5 text-[9px] rounded transition-all ${
                    priceFilter === opt.value
                      ? 'bg-plugin-accent text-black font-semibold'
                      : 'bg-plugin-bg text-plugin-muted border border-plugin-border hover:text-plugin-text'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
