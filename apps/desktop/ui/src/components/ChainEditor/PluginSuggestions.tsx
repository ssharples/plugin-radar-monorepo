import { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';
import { getPluginPairings } from '../../api/convex-client';
import { usePluginStore } from '../../stores/pluginStore';

interface PluginSuggestionsProps {
  currentPluginName: string;
  currentManufacturer: string;
  onSelect: (name: string, manufacturer: string) => void;
}

interface PairingResult {
  pluginName: string;
  manufacturer: string;
  count: number;
  avgRating?: number;
}

export function PluginSuggestions({
  currentPluginName,
  currentManufacturer,
  onSelect,
}: PluginSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<PairingResult[]>([]);
  const [loading, setLoading] = useState(true);
  const plugins = usePluginStore((s) => s.plugins);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getPluginPairings(currentPluginName, currentManufacturer).then((results) => {
      if (cancelled) return;

      // Filter to only plugins the user actually has installed
      const installedNames = new Set(plugins.map((p) => p.name.toLowerCase()));
      const filtered = results.filter((r) =>
        installedNames.has(r.pluginName.toLowerCase())
      );

      setSuggestions(filtered.slice(0, 5));
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [currentPluginName, currentManufacturer, plugins]);

  if (loading) {
    return (
      <div
        className="px-3 py-1.5 flex items-center gap-1.5"
        style={{
          borderBottom: '1px solid var(--color-border-default)',
          fontSize: 'var(--text-body)',
          color: 'var(--color-text-tertiary)',
        }}
      >
        <Zap className="w-3 h-3" />
        <span>Loading suggestions...</span>
      </div>
    );
  }

  if (suggestions.length === 0) return null;

  // Compute total count for percentage
  const totalCount = suggestions.reduce((sum, s) => sum + s.count, 0);

  return (
    <div style={{ borderBottom: '1px solid var(--color-border-default)' }}>
      <div
        className="px-3 py-1 flex items-center gap-1.5"
        style={{
          background: 'rgba(222, 255, 10, 0.03)',
          fontSize: 'var(--text-body)',
          letterSpacing: 'var(--tracking-wide)',
          color: 'var(--color-text-secondary)',
        }}
      >
        <Zap className="w-3 h-3" style={{ color: 'var(--color-accent-cyan)' }} />
        Commonly paired with {currentPluginName}
      </div>
      {suggestions.map((suggestion) => {
        const pct = totalCount > 0 ? Math.round((suggestion.count / totalCount) * 100) : 0;

        return (
          <button
            key={`${suggestion.pluginName}::${suggestion.manufacturer}`}
            onClick={() => onSelect(suggestion.pluginName, suggestion.manufacturer)}
            className="w-full text-left px-3 py-1.5 fast-snap flex items-center gap-2"
            style={{ borderLeft: '2px solid transparent' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderLeftColor = 'var(--color-accent-cyan)';
              e.currentTarget.style.background = 'rgba(222, 255, 10, 0.06)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderLeftColor = 'transparent';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <div className="flex-1 min-w-0">
              <span
                className="truncate"
                style={{
                  fontSize: 'var(--text-body)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                }}
              >
                {suggestion.pluginName}
              </span>
              <span
                className="ml-1.5"
                style={{
                  fontSize: 'var(--text-body)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                {suggestion.manufacturer}
              </span>
            </div>
            <span
              className="flex-shrink-0 px-1.5 py-0.5 rounded"
              style={{
                background: 'rgba(222, 255, 10, 0.12)',
                fontFamily: 'var(--font-system)',
                fontSize: 'var(--text-body)',
                color: 'var(--color-accent-cyan)',
              }}
            >
              {pct}%
            </span>
          </button>
        );
      })}
    </div>
  );
}
