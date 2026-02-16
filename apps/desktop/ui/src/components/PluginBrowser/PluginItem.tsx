import { Plus, Music, Sliders, Ban, RotateCcw, Trash2, ShieldBan } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { PluginDescription } from '../../api/types';
import { usePluginStore } from '../../stores/pluginStore';

interface PluginItemProps {
  plugin: PluginDescription & { isDeactivated?: boolean };
  isHighlighted?: boolean;
  onAdd: () => void;
  /** Insert via keyboard (Enter) — uses smart insert position */
  onInsert?: () => void;
  onMouseEnter?: () => void;
}

// Category -> color mapping for badges (SEMANTIC — do NOT replace with design system colors)
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

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
}

export function PluginItem({ plugin, isHighlighted = false, onAdd, onInsert, onMouseEnter }: PluginItemProps) {
  const enriched = usePluginStore((s) => s.getEnrichedDataForPlugin(plugin.uid));
  const deactivatePlugin = usePluginStore((s) => s.deactivatePlugin);
  const reactivatePlugin = usePluginStore((s) => s.reactivatePlugin);
  const removePlugin = usePluginStore((s) => s.removePlugin);
  const [logoError, setLogoError] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0 });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const isDeactivated = (plugin as any).isDeactivated === true;

  const categoryColor = enriched ? (CATEGORY_COLORS[enriched.category] ?? CATEGORY_COLORS.utility) : '';
  const categoryLabel = enriched ? (CATEGORY_LABELS[enriched.category] ?? enriched.category) : '';

  const effectSubtitle = enriched?.effectType
    ? `${enriched.effectType}${categoryLabel ? ` ${categoryLabel}` : ''}`
    : '';

  const tonalChars = [
    ...(enriched?.tonalCharacter ?? []),
    ...(enriched?.sonicCharacter ?? []),
  ].slice(0, 3);

  const manufacturerLogoUrl = enriched?.manufacturerData?.resolvedLogoUrl ?? enriched?.manufacturerData?.logoUrl;
  const shouldShowLogo = manufacturerLogoUrl && !logoError;

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmRemove(false);
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0 });
    setConfirmRemove(false);
  }, []);

  // Close context menu on click outside or Escape
  useEffect(() => {
    if (!contextMenu.visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu.visible, closeContextMenu]);

  const handleDeactivate = useCallback(async () => {
    await deactivatePlugin(plugin.fileOrIdentifier);
    closeContextMenu();
  }, [deactivatePlugin, plugin.fileOrIdentifier, closeContextMenu]);

  const handleReactivate = useCallback(async () => {
    await reactivatePlugin(plugin.fileOrIdentifier);
    closeContextMenu();
  }, [reactivatePlugin, plugin.fileOrIdentifier, closeContextMenu]);

  const handleRemove = useCallback(async () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    await removePlugin(plugin.fileOrIdentifier);
    closeContextMenu();
  }, [confirmRemove, removePlugin, plugin.fileOrIdentifier, closeContextMenu]);

  return (
    <div
      className="group flex items-start gap-2 px-2 py-1.5 rounded fast-snap cursor-pointer relative"
      style={{
        border: '1px solid',
        borderRadius: 'var(--radius-base)',
        opacity: isDeactivated ? 0.45 : 1,
        ...(isHighlighted ? {
          background: 'rgba(222, 255, 10, 0.08)',
          borderColor: 'rgba(222, 255, 10, 0.4)',
          boxShadow: '0 0 8px rgba(222, 255, 10, 0.15)',
        } : {
          background: 'transparent',
          borderColor: 'transparent',
        }),
      }}
      onDoubleClick={isDeactivated ? undefined : onAdd}
      onClick={isHighlighted && onInsert && !isDeactivated ? onInsert : undefined}
      onMouseEnter={onMouseEnter}
      onContextMenu={handleContextMenu}
    >
      {/* Icon / Manufacturer Logo */}
      <div
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded mt-0.5 overflow-hidden"
        style={{
          ...(shouldShowLogo ? {
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-default)',
          } : plugin.isInstrument ? {
            background: 'rgba(222, 255, 10, 0.1)',
            color: 'var(--color-accent-cyan)',
          } : {
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-tertiary)',
          }),
        }}
      >
        {shouldShowLogo ? (
          <img
            src={manufacturerLogoUrl}
            alt={enriched?.manufacturerData?.name ?? plugin.manufacturer}
            className="w-full h-full object-contain p-0.5"
            onError={() => setLogoError(true)}
          />
        ) : plugin.isInstrument ? (
          <Music className="w-3 h-3" />
        ) : (
          <Sliders className="w-3 h-3" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {/* Plugin name — Extended Bold, uppercase */}
          <p
            className="truncate leading-tight"
            style={{
              fontFamily: 'var(--font-extended)',
              fontSize: 'var(--text-sm)',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wide)',
              color: isDeactivated
                ? 'var(--color-text-tertiary)'
                : isHighlighted
                  ? 'var(--color-accent-cyan)'
                  : 'var(--color-text-primary)',
            }}
          >
            {plugin.name}
          </p>
          {/* Deactivated badge */}
          {isDeactivated && (
            <span
              className="flex-shrink-0 px-1 py-px text-[9px] leading-tight rounded border font-medium"
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'rgba(255, 59, 48, 0.15)',
                color: 'rgb(255, 100, 80)',
                borderColor: 'rgba(255, 59, 48, 0.3)',
              }}
            >
              Deactivated
            </span>
          )}
          {/* Category badge (SEMANTIC colors preserved) */}
          {enriched && categoryLabel && !isDeactivated && (
            <span className={`flex-shrink-0 px-1 py-px text-[9px] leading-tight rounded border font-medium ${categoryColor}`}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {categoryLabel}
            </span>
          )}
          {/* Price badge */}
          {enriched?.isFree && !isDeactivated && (
            <span
              className="flex-shrink-0 px-1 py-px text-[9px] leading-tight rounded bg-green-500/20 text-green-300 border border-green-500/30 font-semibold"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              Free
            </span>
          )}
          {enriched && !enriched.isFree && enriched.currentPrice !== undefined && !isDeactivated && (
            <span
              className="flex-shrink-0"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {formatPrice(enriched.currentPrice, enriched.currency)}
            </span>
          )}
        </div>

        {/* Manufacturer + format / effect type — monospace */}
        <p
          className="truncate leading-tight"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-tertiary)',
          }}
        >
          {plugin.manufacturer}
          <span style={{ color: 'var(--color-border-strong)', margin: '0 4px' }}>/</span>
          {effectSubtitle || plugin.format}
        </p>

        {/* Tonal character tags */}
        {tonalChars.length > 0 && !isDeactivated && (
          <div className="flex items-center gap-0.5 mt-0.5">
            {tonalChars.map((char) => (
              <span
                key={char}
                style={{
                  padding: '0 4px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  lineHeight: '14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-bg-input)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border-default)',
                  textTransform: 'capitalize',
                }}
              >
                {char}
              </span>
            ))}
          </div>
        )}

        {/* Short description (only shown when highlighted) */}
        {enriched?.shortDescription && isHighlighted && !isDeactivated && (
          <p
            className="line-clamp-1"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: 'var(--color-text-tertiary)',
              lineHeight: '1.3',
              marginTop: '2px',
            }}
          >
            {enriched.shortDescription}
          </p>
        )}
      </div>

      {/* Add button / Enter hint */}
      {!isDeactivated && (
        isHighlighted ? (
          <span
            className="flex-shrink-0 flex items-center gap-1 mt-0.5"
            style={{
              padding: '2px 6px',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: 'var(--color-accent-cyan)',
              background: 'rgba(222, 255, 10, 0.1)',
              borderRadius: 'var(--radius-base)',
              border: '1px solid rgba(222, 255, 10, 0.3)',
            }}
          >
            <Plus className="w-3 h-3" />
            Enter
          </span>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            className="flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 fast-snap mt-0.5"
            style={{
              background: 'rgba(222, 255, 10, 0.1)',
              color: 'var(--color-accent-cyan)',
              border: '1px solid transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-accent-cyan)';
              e.currentTarget.style.color = 'var(--color-bg-primary)';
              e.currentTarget.style.borderColor = 'var(--color-accent-cyan)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(222, 255, 10, 0.1)';
              e.currentTarget.style.color = 'var(--color-accent-cyan)';
              e.currentTarget.style.borderColor = 'transparent';
            }}
            title="Add to chain"
          >
            <Plus className="w-3 h-3" />
          </button>
        )
      )}

      {/* Context menu */}
      {contextMenu.visible && (
        <div
          ref={contextMenuRef}
          className="fixed z-[300]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            minWidth: '160px',
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-strong)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-elevated), 0 0 20px rgba(0, 0, 0, 0.6)',
            overflow: 'hidden',
          }}
        >
          {/* Deactivate / Reactivate */}
          {isDeactivated ? (
            <ContextMenuItem
              icon={<RotateCcw className="w-3 h-3" />}
              label="Reactivate"
              onClick={handleReactivate}
            />
          ) : (
            <ContextMenuItem
              icon={<Ban className="w-3 h-3" />}
              label="Deactivate"
              onClick={handleDeactivate}
            />
          )}

          {/* Remove permanently */}
          <ContextMenuItem
            icon={<Trash2 className="w-3 h-3" />}
            label={confirmRemove ? "Confirm removal" : "Remove from library"}
            onClick={handleRemove}
            danger={true}
          />

          {/* Blacklist (existing feature) */}
          {!isDeactivated && (
            <ContextMenuItem
              icon={<ShieldBan className="w-3 h-3" />}
              label="Blacklist"
              onClick={() => {
                // Use existing blacklist functionality from juceBridge
                import('../../api/juce-bridge').then(({ juceBridge }) => {
                  juceBridge.addToBlacklist(plugin.fileOrIdentifier);
                });
                closeContextMenu();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ContextMenuItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="w-full flex items-center gap-2 px-3 py-1.5 fast-snap text-left"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        color: danger ? 'var(--color-accent-magenta)' : 'var(--color-text-secondary)',
        background: 'transparent',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger
          ? 'rgba(255, 59, 48, 0.1)'
          : 'var(--color-bg-input)';
        e.currentTarget.style.color = danger
          ? 'var(--color-accent-magenta)'
          : 'var(--color-text-primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = danger ? 'var(--color-accent-magenta)' : 'var(--color-text-secondary)';
      }}
    >
      {icon}
      {label}
    </button>
  );
}
