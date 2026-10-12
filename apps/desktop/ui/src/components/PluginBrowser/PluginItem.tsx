import { Plus, Music, CornerDownLeft } from 'lucide-react';
import type { PluginDescription } from '../../api/types';
import { usePluginStore } from '../../stores/pluginStore';
import { CATEGORY_COLORS, CATEGORY_LABELS, CATEGORY_SWATCH } from '../../constants/categoryColors';

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

  const swatch = enriched ? (CATEGORY_SWATCH[enriched.category] ?? CATEGORY_SWATCH.utility) : 'bg-plugin-border-bright';

  return (
    <div
      className={`group relative flex items-center gap-2.5 pl-3 pr-1.5 py-1.5 rounded-md border transition-colors cursor-pointer ${
        isHighlighted
          ? 'bg-plugin-accent/10 border-plugin-accent/40'
          : 'bg-transparent border-transparent hover:bg-plugin-surface-alt'
      }`}
      onDoubleClick={onAdd}
      onClick={isHighlighted && onInsert ? onInsert : undefined}
      onMouseEnter={onMouseEnter}
      title="Double-click to add to the chain"
    >
      {/* Category stripe */}
      <span className={`absolute left-1 top-2 bottom-2 w-[3px] rounded-full ${swatch} ${enriched ? 'opacity-80' : 'opacity-40'}`} aria-hidden />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {plugin.isInstrument && <Music className="w-3 h-3 text-plugin-accent flex-shrink-0" aria-label="Instrument" />}
          <p className="text-[13px] text-plugin-text truncate leading-tight font-medium">{plugin.name}</p>
          {enriched?.isFree && (
            <span className="flex-shrink-0 px-1 text-[10px] leading-4 rounded bg-green-500/15 text-green-300 font-semibold">
              Free
            </span>
          )}
        </div>

        <p className="text-[11px] text-plugin-dim truncate leading-tight mt-0.5">
          {plugin.manufacturer}
          <span className="text-plugin-border-bright"> · </span>
          {effectSubtitle || plugin.format}
          {enriched && !enriched.isFree && enriched.currentPrice !== undefined && (
            <span className="num"> · {formatPrice(enriched.currentPrice, enriched.currency)}</span>
          )}
        </p>

        {isHighlighted && (enriched || tonalChars.length > 0) && (
          <div className="flex items-center gap-1 mt-1 min-w-0">
            {enriched && categoryLabel && (
              <span className={`flex-shrink-0 px-1 text-[10px] leading-4 rounded border font-medium ${categoryColor}`}>
                {categoryLabel}
              </span>
            )}
            {tonalChars.map((char) => (
              <span
                key={char}
                className="px-1 text-[10px] leading-4 rounded bg-plugin-bg text-plugin-muted border border-plugin-border capitalize truncate"
              >
                {char}
              </span>
            ))}
          </div>
        )}

        {enriched?.shortDescription && isHighlighted && (
          <p className="text-[11px] text-plugin-dim leading-tight mt-1 line-clamp-2">
            {enriched.shortDescription}
          </p>
        )}
      </div>

      {isHighlighted ? (
        <span className="flex-shrink-0 flex items-center gap-1 text-plugin-accent-bright text-[11px] font-semibold px-1.5 h-6 rounded bg-plugin-accent/15">
          <CornerDownLeft className="w-3 h-3" />
          Add
        </span>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          className="flex-shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100 bg-plugin-accent/15 hover:bg-plugin-accent text-plugin-accent-bright hover:text-plugin-on-accent transition-colors"
          title="Add to chain"
          aria-label={`Add ${plugin.name} to chain`}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
