import { Plus, Music, Sliders } from 'lucide-react';
import type { PluginDescription } from '../../api/types';
import { usePluginStore } from '../../stores/pluginStore';

interface PluginItemProps {
  plugin: PluginDescription;
  isHighlighted?: boolean;
  onAdd: () => void;
  /** Insert via keyboard (Enter) — uses smart insert position */
  onInsert?: () => void;
  onMouseEnter?: () => void;
}

// Category → color mapping for badges
const CATEGORY_COLORS: Record<string, string> = {
  eq: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  compressor: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  limiter: 'bg-red-500/20 text-red-300 border-red-500/30',
  reverb: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  delay: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  saturation: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  modulation: 'bg-green-500/20 text-green-300 border-green-500/30',
  'stereo-imaging': 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  'gate-expander': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  'de-esser': 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  filter: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  'channel-strip': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  metering: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  'noise-reduction': 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  multiband: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
  utility: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
};

const CATEGORY_LABELS: Record<string, string> = {
  eq: 'EQ',
  compressor: 'Compressor',
  limiter: 'Limiter',
  reverb: 'Reverb',
  delay: 'Delay',
  saturation: 'Saturation',
  modulation: 'Modulation',
  'stereo-imaging': 'Stereo',
  'gate-expander': 'Gate',
  'de-esser': 'De-esser',
  filter: 'Filter',
  'channel-strip': 'Strip',
  metering: 'Meter',
  'noise-reduction': 'Denoise',
  multiband: 'Multiband',
  utility: 'Utility',
};

function formatPrice(cents: number | undefined, currency: string = 'USD'): string {
  if (cents === undefined || cents === null) return '';
  const dollars = cents / 100;
  if (currency === 'USD') return `$${dollars.toFixed(0)}`;
  if (currency === 'EUR') return `€${dollars.toFixed(0)}`;
  if (currency === 'GBP') return `£${dollars.toFixed(0)}`;
  return `${dollars.toFixed(0)} ${currency}`;
}

export function PluginItem({ plugin, isHighlighted = false, onAdd, onInsert, onMouseEnter }: PluginItemProps) {
  const enriched = usePluginStore((s) => s.getEnrichedDataForPlugin(plugin.uid));

  const categoryColor = enriched ? (CATEGORY_COLORS[enriched.category] ?? CATEGORY_COLORS.utility) : '';
  const categoryLabel = enriched ? (CATEGORY_LABELS[enriched.category] ?? enriched.category) : '';

  // Build effect type subtitle
  const effectSubtitle = enriched?.effectType
    ? `${enriched.effectType}${categoryLabel ? ` ${categoryLabel}` : ''}`
    : '';

  // Tonal character tags (max 3 shown)
  const tonalChars = [
    ...(enriched?.tonalCharacter ?? []),
    ...(enriched?.sonicCharacter ?? []),
  ].slice(0, 3);

  return (
    <div
      className={`group flex items-start gap-2 px-2 py-1.5 rounded border transition-all cursor-pointer ${
        isHighlighted
          ? 'bg-plugin-accent/10 border-plugin-accent/40'
          : 'bg-transparent border-transparent hover:bg-plugin-surface-alt hover:border-plugin-border'
      }`}
      onDoubleClick={onAdd}
      onClick={isHighlighted && onInsert ? onInsert : undefined}
      onMouseEnter={onMouseEnter}
    >
      {/* Icon */}
      <div className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded mt-0.5 ${
        plugin.isInstrument ? 'bg-plugin-accent/15 text-plugin-accent' : 'bg-plugin-border text-plugin-muted'
      }`}>
        {plugin.isInstrument ? (
          <Music className="w-3 h-3" />
        ) : (
          <Sliders className="w-3 h-3" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs text-plugin-text truncate leading-tight font-medium">{plugin.name}</p>
          {/* Category badge */}
          {enriched && categoryLabel && (
            <span className={`flex-shrink-0 px-1 py-px text-[9px] leading-tight rounded border font-medium ${categoryColor}`}>
              {categoryLabel}
            </span>
          )}
          {/* Price badge */}
          {enriched?.isFree && (
            <span className="flex-shrink-0 px-1 py-px text-[9px] leading-tight rounded bg-green-500/20 text-green-300 border border-green-500/30 font-semibold">
              Free
            </span>
          )}
          {enriched && !enriched.isFree && enriched.currentPrice !== undefined && (
            <span className="flex-shrink-0 text-[9px] text-plugin-dim font-mono">
              {formatPrice(enriched.currentPrice, enriched.currency)}
            </span>
          )}
        </div>

        {/* Manufacturer + format / effect type */}
        <p className="text-xxs text-plugin-dim truncate leading-tight">
          {plugin.manufacturer}
          <span className="text-plugin-border-bright"> / </span>
          {effectSubtitle || plugin.format}
        </p>

        {/* Tonal character tags */}
        {tonalChars.length > 0 && (
          <div className="flex items-center gap-0.5 mt-0.5">
            {tonalChars.map((char) => (
              <span
                key={char}
                className="px-1 py-px text-[9px] leading-tight rounded bg-plugin-bg text-plugin-muted border border-plugin-border capitalize"
              >
                {char}
              </span>
            ))}
          </div>
        )}

        {/* Short description (only shown when highlighted or enriched data exists and there's space) */}
        {enriched?.shortDescription && isHighlighted && (
          <p className="text-[9px] text-plugin-dim leading-tight mt-0.5 line-clamp-1">
            {enriched.shortDescription}
          </p>
        )}

      </div>

      {/* Add button / Enter hint */}
      {isHighlighted ? (
        <span className="flex-shrink-0 flex items-center gap-1 text-plugin-accent text-xxs font-medium px-1.5 py-0.5 rounded bg-plugin-accent/10 mt-0.5">
          <Plus className="w-3 h-3" />
          Enter
        </span>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          className="flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 bg-plugin-accent/15 hover:bg-plugin-accent text-plugin-accent hover:text-black transition-all mt-0.5"
          title="Add to chain"
        >
          <Plus className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
