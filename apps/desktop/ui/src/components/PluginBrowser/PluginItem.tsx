import { Plus, Music, Sliders } from 'lucide-react';
import type { PluginDescription } from '../../api/types';
import { usePluginStore } from '../../stores/pluginStore';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../../constants/categoryColors';

interface PluginItemProps {
  plugin: PluginDescription;
  isHighlighted?: boolean;
  onAdd: () => void;
  /** Insert via keyboard (Enter) — uses smart insert position */
  onInsert?: () => void;
  onMouseEnter?: () => void;
}

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
          <p className="text-xs  text-plugin-text truncate leading-tight font-medium">{plugin.name}</p>
          {/* Category badge */}
          {enriched && categoryLabel && (
            <span className={`flex-shrink-0 px-1 py-px text-[10px] leading-tight rounded border font-medium ${categoryColor}`}>
              {categoryLabel}
            </span>
          )}
          {/* Price badge */}
          {enriched?.isFree && (
            <span className="flex-shrink-0 px-1 py-px text-[10px] leading-tight rounded bg-green-500/20 text-green-300 border border-green-500/30 font-semibold">
              Free
            </span>
          )}
          {enriched && !enriched.isFree && enriched.currentPrice !== undefined && (
            <span className="flex-shrink-0 text-[10px] text-plugin-dim ">
              {formatPrice(enriched.currentPrice, enriched.currency)}
            </span>
          )}
        </div>

        {/* Manufacturer + format / effect type */}
        <p className="text-xxs  text-plugin-dim truncate leading-tight">
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
                className="px-1 py-px text-[10px] leading-tight rounded bg-plugin-bg text-plugin-muted border border-plugin-border capitalize"
              >
                {char}
              </span>
            ))}
          </div>
        )}

        {/* Short description (only shown when highlighted or enriched data exists and there's space) */}
        {enriched?.shortDescription && isHighlighted && (
          <p className="text-[10px] text-plugin-dim leading-tight mt-0.5 line-clamp-1">
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
          className="flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 bg-plugin-accent/15 hover:bg-plugin-accent text-plugin-accent hover:text-plugin-on-accent transition-all mt-0.5"
          title="Add to chain"
        >
          <Plus className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
