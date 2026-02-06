import { useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Link2, Power, X, ExternalLink, ChevronDown, ChevronUp,
  Music, Sliders, Cpu, GraduationCap, Tag, Globe, Zap, Heart,
} from 'lucide-react';
import { useChainStore } from '../../stores/chainStore';
import { usePluginStore } from '../../stores/pluginStore';
import { juceBridge } from '../../api/juce-bridge';
import type { ChainSlot } from '../../api/types';
import type { EnrichedPluginData } from '../../api/convex-client';

// Category color mapping
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

function formatPrice(cents: number | undefined, currency: string = 'USD'): string {
  if (cents === undefined || cents === null) return '';
  const dollars = cents / 100;
  if (currency === 'USD') return `$${dollars.toFixed(2)}`;
  if (currency === 'EUR') return `€${dollars.toFixed(2)}`;
  if (currency === 'GBP') return `£${dollars.toFixed(2)}`;
  return `${dollars.toFixed(2)} ${currency}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// =======================================
// Enrichment Detail Panel
// =======================================

function EnrichmentDetail({ enriched }: { enriched: EnrichedPluginData }) {
  const [expanded, setExpanded] = useState(false);

  const tonalChars = [...(enriched.tonalCharacter ?? []), ...(enriched.sonicCharacter ?? [])];
  const categoryColor = CATEGORY_COLORS[enriched.category] ?? CATEGORY_COLORS.utility;

  return (
    <div className="mt-1.5 border-t border-plugin-border/50 pt-1.5 space-y-1.5">
      {/* Category + Effect Type + Circuit */}
      <div className="flex flex-wrap items-center gap-1">
        <span className={`px-1.5 py-0.5 text-[9px] rounded border font-medium ${categoryColor}`}>
          {capitalize(enriched.category)}
        </span>
        {enriched.effectType && (
          <span className="px-1.5 py-0.5 text-[9px] rounded bg-plugin-bg text-plugin-text border border-plugin-border">
            {enriched.effectType}
          </span>
        )}
        {enriched.circuitEmulation && (
          <span className="px-1.5 py-0.5 text-[9px] rounded bg-plugin-bg text-plugin-dim border border-plugin-border italic">
            {enriched.circuitEmulation}
          </span>
        )}
        {enriched.isFree && (
          <span className="px-1.5 py-0.5 text-[9px] rounded bg-green-500/20 text-green-300 border border-green-500/30 font-semibold">
            Free
          </span>
        )}
        {!enriched.isFree && enriched.currentPrice !== undefined && (
          <span className="px-1.5 py-0.5 text-[9px] rounded bg-plugin-bg text-plugin-text border border-plugin-border font-mono">
            {formatPrice(enriched.currentPrice, enriched.currency)}
            {enriched.msrp && enriched.currentPrice !== enriched.msrp && (
              <span className="line-through text-plugin-dim ml-1">
                {formatPrice(enriched.msrp, enriched.currency)}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Tonal character */}
      {tonalChars.length > 0 && (
        <div className="flex flex-wrap items-center gap-0.5">
          <Zap className="w-2.5 h-2.5 text-plugin-dim flex-shrink-0" />
          {tonalChars.map((char) => (
            <span
              key={char}
              className="px-1 py-px text-[8px] rounded bg-plugin-accent/10 text-plugin-accent border border-plugin-accent/20 capitalize"
            >
              {char}
            </span>
          ))}
        </div>
      )}

      {/* Short description */}
      {enriched.shortDescription && (
        <p className="text-[10px] text-plugin-muted leading-snug">
          {enriched.shortDescription}
        </p>
      )}

      {/* Expand/collapse for full details */}
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        className="flex items-center gap-0.5 text-[9px] text-plugin-accent hover:text-plugin-accent/80 transition-colors"
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? 'Less' : 'More details'}
      </button>

      {expanded && (
        <div className="space-y-2 pt-1">
          {/* Full description */}
          {enriched.description && (
            <div>
              <p className="text-[10px] text-plugin-text leading-snug">{enriched.description}</p>
            </div>
          )}

          {/* Works Well On */}
          {enriched.worksWellOn && enriched.worksWellOn.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <Music className="w-2.5 h-2.5 text-plugin-dim" />
                <span className="text-[9px] text-plugin-dim uppercase tracking-wider font-medium">Works Well On</span>
              </div>
              <div className="flex flex-wrap gap-0.5">
                {enriched.worksWellOn.map((w) => (
                  <span key={w} className="px-1.5 py-0.5 text-[8px] rounded bg-plugin-bg text-plugin-muted border border-plugin-border capitalize">
                    {w.replace('-', ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Use Cases */}
          {enriched.useCases && enriched.useCases.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <Sliders className="w-2.5 h-2.5 text-plugin-dim" />
                <span className="text-[9px] text-plugin-dim uppercase tracking-wider font-medium">Use Cases</span>
              </div>
              <div className="flex flex-wrap gap-0.5">
                {enriched.useCases.map((u) => (
                  <span key={u} className="px-1.5 py-0.5 text-[8px] rounded bg-plugin-bg text-plugin-muted border border-plugin-border capitalize">
                    {u.replace('-', ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Genre Suitability */}
          {enriched.genreSuitability && enriched.genreSuitability.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <Globe className="w-2.5 h-2.5 text-plugin-dim" />
                <span className="text-[9px] text-plugin-dim uppercase tracking-wider font-medium">Genre</span>
              </div>
              <div className="flex flex-wrap gap-0.5">
                {enriched.genreSuitability.map((g) => (
                  <span key={g} className="px-1.5 py-0.5 text-[8px] rounded bg-plugin-bg text-plugin-muted border border-plugin-border capitalize">
                    {g.replace('-', ' ').replace('&', '&')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Comparable To */}
          {enriched.comparableTo && enriched.comparableTo.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <Heart className="w-2.5 h-2.5 text-plugin-dim" />
                <span className="text-[9px] text-plugin-dim uppercase tracking-wider font-medium">Comparable To</span>
              </div>
              <div className="flex flex-wrap gap-0.5">
                {enriched.comparableTo.map((c) => (
                  <span key={c} className="px-1.5 py-0.5 text-[8px] rounded bg-plugin-bg text-plugin-muted border border-plugin-border">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Key Features */}
          {enriched.keyFeatures && enriched.keyFeatures.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <Tag className="w-2.5 h-2.5 text-plugin-dim" />
                <span className="text-[9px] text-plugin-dim uppercase tracking-wider font-medium">Key Features</span>
              </div>
              <div className="flex flex-wrap gap-0.5">
                {enriched.keyFeatures.map((f) => (
                  <span key={f} className="px-1.5 py-0.5 text-[8px] rounded bg-plugin-bg text-plugin-muted border border-plugin-border capitalize">
                    {f.replace('-', ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Skill Level + CPU Usage */}
          <div className="flex items-center gap-3">
            {enriched.skillLevel && (
              <div className="flex items-center gap-1">
                <GraduationCap className="w-2.5 h-2.5 text-plugin-dim" />
                <span className="text-[9px] text-plugin-muted capitalize">{enriched.skillLevel}</span>
              </div>
            )}
            {enriched.cpuUsage && (
              <div className="flex items-center gap-1">
                <Cpu className="w-2.5 h-2.5 text-plugin-dim" />
                <span className="text-[9px] text-plugin-muted capitalize">{enriched.cpuUsage} CPU</span>
              </div>
            )}
            {enriched.isIndustryStandard && (
              <span className="text-[9px] text-yellow-400 font-medium">⭐ Industry Standard</span>
            )}
          </div>

          {/* Price info */}
          {!enriched.isFree && (
            <div className="flex items-center gap-2 text-[9px]">
              {enriched.currentPrice !== undefined && (
                <span className="text-plugin-text font-medium">
                  {formatPrice(enriched.currentPrice, enriched.currency)}
                </span>
              )}
              {enriched.msrp !== undefined && enriched.currentPrice !== enriched.msrp && (
                <span className="text-plugin-dim line-through">
                  MSRP {formatPrice(enriched.msrp, enriched.currency)}
                </span>
              )}
              {enriched.licenseType && (
                <span className="text-plugin-dim capitalize">({enriched.licenseType})</span>
              )}
              {enriched.hasDemo && (
                <span className="text-green-400">Demo available</span>
              )}
              {enriched.hasTrial && (
                <span className="text-green-400">Trial available</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =======================================
// Slot Item (sortable chain slot)
// =======================================

function SlotItem({ slot, isSelected, onSelect, onRemove, onToggleBypass, onOpenUI }: {
  slot: ChainSlot;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onToggleBypass: () => void;
  onOpenUI: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slot.index });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Get enriched data for this slot's plugin
  const enriched = usePluginStore((s) => s.getEnrichedDataForPlugin(slot.uid));

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative ${isDragging ? 'z-10' : ''}`}
    >
      <div
        onClick={onSelect}
        onDoubleClick={onOpenUI}
        {...attributes}
        {...listeners}
        className={`flex items-start gap-2 px-2.5 py-2 rounded cursor-grab active:cursor-grabbing transition-all border ${
          isSelected
            ? 'bg-plugin-accent/10 border-plugin-accent/60 shadow-glow-accent'
            : slot.bypassed
            ? 'bg-plugin-bg/40 border-plugin-border/50 text-plugin-muted'
            : 'bg-plugin-surface-alt border-plugin-border hover:border-plugin-border-bright'
        }`}
      >
        {/* Number badge */}
        <span className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded text-xxs font-bold mt-0.5 ${
          isSelected ? 'bg-plugin-accent text-black' : slot.bypassed ? 'bg-plugin-border/50 text-plugin-dim' : 'bg-plugin-border text-plugin-muted'
        }`}>
          {slot.index + 1}
        </span>

        {/* Plugin name + enrichment */}
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-medium truncate ${
            slot.bypassed ? 'line-through text-plugin-dim' : isSelected ? 'text-plugin-text' : 'text-plugin-text'
          }`}>
            {slot.name}
          </div>
          <div className="text-xxs text-plugin-dim truncate leading-tight">
            {slot.manufacturer}
          </div>

          {/* Enrichment detail (shown when selected) */}
          {isSelected && enriched && (
            <EnrichmentDetail enriched={enriched} />
          )}

          {/* Minimal enrichment info when not selected */}
          {!isSelected && enriched && (
            <div className="flex items-center gap-1 mt-0.5">
              <span className={`px-1 py-px text-[8px] rounded border font-medium ${CATEGORY_COLORS[enriched.category] ?? CATEGORY_COLORS.utility}`}>
                {capitalize(enriched.category)}
              </span>
              {enriched.effectType && (
                <span className="text-[8px] text-plugin-dim">{enriched.effectType}</span>
              )}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className={`flex items-center gap-0.5 transition-opacity mt-0.5 ${
          isDragging ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
        }`}>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenUI(); }}
            className="p-1 rounded hover:bg-plugin-accent/15 text-plugin-muted hover:text-plugin-accent transition-colors"
            title="Open UI"
          >
            <ExternalLink className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleBypass(); }}
            className={`p-1 rounded transition-colors ${
              slot.bypassed
                ? 'bg-plugin-accent/15 text-plugin-accent'
                : 'hover:bg-plugin-border text-plugin-muted hover:text-plugin-text'
            }`}
            title={slot.bypassed ? 'Enable' : 'Bypass'}
          >
            <Power className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-1 rounded hover:bg-red-500/15 text-plugin-muted hover:text-red-400 transition-colors"
            title="Remove"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Connector line */}
      <div className="flex justify-center py-0.5">
        <div className="w-px h-2 bg-plugin-border-bright" />
      </div>
    </div>
  );
}

// =======================================
// Plugin Viewer (Chain View)
// =======================================

export function PluginViewer() {
  const {
    slots,
    selectedSlotIndex,
    fetchChainState,
    movePlugin,
    removePlugin,
    toggleBypass,
    selectSlot,
  } = useChainStore();

  useEffect(() => {
    fetchChainState();
  }, [fetchChainState]);

  useEffect(() => {
    if (selectedSlotIndex === null && slots.length > 0) {
      selectSlot(0);
    }
  }, [slots, selectedSlotIndex, selectSlot]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = slots.findIndex((s) => s.index === active.id);
      const newIndex = slots.findIndex((s) => s.index === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        movePlugin(oldIndex, newIndex);
      }
    }
  };

  const handleOpenUI = (slotIndex: number) => {
    juceBridge.openPluginUI(slotIndex);
  };

  return (
    <div className="flex flex-col h-full bg-plugin-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-plugin-border">
        <div className="flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 text-plugin-accent" />
          <h2 className="text-xs font-semibold text-plugin-text uppercase tracking-wider">Chain</h2>
        </div>
        <span className="text-xxs text-plugin-dim font-mono bg-plugin-bg px-1.5 py-0.5 rounded border border-plugin-border">
          {slots.length}
        </span>
      </div>

      {/* Chain list */}
      <div className="flex-1 overflow-y-auto p-2">
        {slots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <Link2 className="w-6 h-6 mb-2 text-plugin-border-bright" />
            <p className="text-xs text-plugin-muted">Empty chain</p>
            <p className="text-xxs text-plugin-dim mt-1">
              Double-click a plugin to add
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={slots.map((s) => s.index)}
              strategy={verticalListSortingStrategy}
            >
              {/* Input indicator */}
              <div className="flex items-center justify-center gap-1.5 py-1">
                <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.3)]" />
                <span className="text-xxs text-plugin-dim uppercase tracking-widest font-medium">In</span>
              </div>
              <div className="flex justify-center">
                <div className="w-px h-2 bg-plugin-border-bright" />
              </div>

              {/* Plugin slots */}
              {slots.map((slot) => (
                <SlotItem
                  key={slot.index}
                  slot={slot}
                  isSelected={selectedSlotIndex === slot.index}
                  onSelect={() => selectSlot(slot.index)}
                  onRemove={() => removePlugin(slot.index)}
                  onToggleBypass={() => toggleBypass(slot.index)}
                  onOpenUI={() => handleOpenUI(slot.index)}
                />
              ))}

              {/* Output indicator */}
              <div className="flex items-center justify-center gap-1.5 pt-0.5">
                <div className="w-2 h-2 rounded-full bg-plugin-accent shadow-[0_0_6px_rgba(255,107,0,0.4)]" />
                <span className="text-xxs text-plugin-dim uppercase tracking-widest font-medium">Out</span>
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
