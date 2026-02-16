import { X, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { usePluginStore } from '../../stores/pluginStore';
import { CustomDropdown } from '../Dropdown';

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

/** Shared style for filter chip buttons */
function chipStyle(isActive: boolean): React.CSSProperties {
  return {
    padding: '2px 6px',
    fontFamily: 'var(--font-mono)',
    fontSize: '9px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 'var(--tracking-wide)',
    borderRadius: 'var(--radius-base)',
    border: '1px solid',
    cursor: 'pointer',
    transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    ...(isActive ? {
      background: 'var(--color-accent-cyan)',
      color: 'var(--color-bg-primary)',
      borderColor: 'var(--color-accent-cyan)',
      boxShadow: '0 0 8px rgba(222, 255, 10, 0.3)',
    } : {
      background: 'var(--color-bg-input)',
      color: 'var(--color-text-secondary)',
      borderColor: 'var(--color-border-default)',
    }),
  };
}

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
        <div
          className="flex overflow-hidden"
          style={{
            borderRadius: 'var(--radius-base)',
            border: '1px solid var(--color-border-default)',
          }}
        >
          {typeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTypeFilter(opt.value)}
              className="fast-snap"
              style={{
                padding: '2px 6px',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wide)',
                ...(typeFilter === opt.value ? {
                  background: 'var(--color-accent-cyan)',
                  color: 'var(--color-bg-primary)',
                } : {
                  background: 'var(--color-bg-input)',
                  color: 'var(--color-text-secondary)',
                }),
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <div style={{ width: '100px' }}>
          <CustomDropdown
            value={sortBy}
            options={sortOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
            onChange={(val) => setSortBy(val as typeof sortBy)}
            size="sm"
          />
        </div>

        {/* Advanced filters toggle */}
        {enrichmentLoaded && (
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-0.5 fast-snap"
            style={{
              padding: '2px 6px',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wide)',
              borderRadius: 'var(--radius-base)',
              border: '1px solid',
              ...(activeFilterCount > 0 ? {
                background: 'rgba(222, 255, 10, 0.1)',
                color: 'var(--color-accent-cyan)',
                borderColor: 'rgba(222, 255, 10, 0.4)',
              } : {
                background: 'var(--color-bg-input)',
                color: 'var(--color-text-secondary)',
                borderColor: 'var(--color-border-default)',
              }),
            }}
          >
            <ChevronDown
              className={`w-3 h-3 fast-snap ${showAdvanced ? 'rotate-180' : ''}`}
              style={{ transition: 'transform 150ms' }}
            />
            {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filters'}
          </button>
        )}
      </div>

      {/* Advanced filter panel */}
      {showAdvanced && (
        <div
          className="absolute right-0 top-full mt-1 z-50 w-72 p-2.5 space-y-2 slide-in"
          style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-strong)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-elevated), 0 0 20px rgba(0, 0, 0, 0.6)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wider)',
                color: 'var(--color-accent-cyan)',
              }}
            >
              Filters
            </span>
            {hasActiveFilters() && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-0.5 fast-snap"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  color: 'var(--color-accent-magenta)',
                }}
              >
                <X className="w-2.5 h-2.5" />
                Clear all
              </button>
            )}
          </div>

          {/* Category filter */}
          <div>
            <label
              style={{
                display: 'block',
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wider)',
                color: 'var(--color-text-tertiary)',
                marginBottom: '4px',
              }}
            >
              Category
            </label>
            <div className="flex flex-wrap gap-0.5">
              <button onClick={() => setCategoryFilter(null)} style={chipStyle(categoryFilter === null)}>
                All
              </button>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setCategoryFilter(categoryFilter === cat.value ? null : cat.value)}
                  style={chipStyle(categoryFilter === cat.value)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Effect type filter (contextual based on category) */}
          {availableEffectTypes.length > 0 && (
            <div>
              <label
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--tracking-wider)',
                  color: 'var(--color-text-tertiary)',
                  marginBottom: '4px',
                }}
              >
                Effect Type
              </label>
              <div className="flex flex-wrap gap-0.5">
                <button onClick={() => setEffectTypeFilter(null)} style={chipStyle(effectTypeFilter === null)}>
                  All
                </button>
                {availableEffectTypes.map((et) => (
                  <button
                    key={et.value}
                    onClick={() => setEffectTypeFilter(effectTypeFilter === et.value ? null : et.value)}
                    style={chipStyle(effectTypeFilter === et.value)}
                  >
                    {et.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tonal character filter */}
          <div>
            <label
              style={{
                display: 'block',
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wider)',
                color: 'var(--color-text-tertiary)',
                marginBottom: '4px',
              }}
            >
              Tonal Character
            </label>
            <div className="flex flex-wrap gap-0.5">
              {TONAL_CHARACTERS.map((tc) => (
                <button
                  key={tc.value}
                  onClick={() => toggleTonalCharacter(tc.value)}
                  style={chipStyle(tonalCharacterFilter.includes(tc.value))}
                >
                  {tc.label}
                </button>
              ))}
            </div>
          </div>

          {/* Price filter */}
          <div>
            <label
              style={{
                display: 'block',
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wider)',
                color: 'var(--color-text-tertiary)',
                marginBottom: '4px',
              }}
            >
              Price
            </label>
            <div className="flex gap-0.5">
              {[
                { value: 'all' as const, label: 'All' },
                { value: 'free' as const, label: 'Free' },
                { value: 'paid' as const, label: 'Paid' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPriceFilter(opt.value)}
                  style={chipStyle(priceFilter === opt.value)}
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
