import { useEffect } from 'react';
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
import { Link2, Power, X, ExternalLink } from 'lucide-react';
import { useChainStore } from '../../stores/chainStore';
import { juceBridge } from '../../api/juce-bridge';
import type { ChainSlot } from '../../api/types';

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
        className={`flex items-center gap-2 px-2.5 py-2 rounded cursor-grab active:cursor-grabbing transition-all border ${
          isSelected
            ? 'bg-plugin-accent/10 border-plugin-accent/60 shadow-glow-accent'
            : slot.bypassed
            ? 'bg-plugin-bg/40 border-plugin-border/50 text-plugin-muted'
            : 'bg-plugin-surface-alt border-plugin-border hover:border-plugin-border-bright'
        }`}
      >
        {/* Number badge */}
        <span className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded text-xxs font-bold ${
          isSelected ? 'bg-plugin-accent text-black' : slot.bypassed ? 'bg-plugin-border/50 text-plugin-dim' : 'bg-plugin-border text-plugin-muted'
        }`}>
          {slot.index + 1}
        </span>

        {/* Plugin name */}
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-medium truncate ${
            slot.bypassed ? 'line-through text-plugin-dim' : isSelected ? 'text-plugin-text' : 'text-plugin-text'
          }`}>
            {slot.name}
          </div>
          <div className="text-xxs text-plugin-dim truncate leading-tight">
            {slot.manufacturer}
          </div>
        </div>

        {/* Quick actions */}
        <div className={`flex items-center gap-0.5 transition-opacity ${
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
