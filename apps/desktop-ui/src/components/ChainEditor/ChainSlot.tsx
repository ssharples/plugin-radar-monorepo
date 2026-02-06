import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Power, X } from 'lucide-react';
import type { PluginNodeUI, ChainSlot as ChainSlotType } from '../../api/types';

interface ChainSlotProps {
  // V2: node-based
  node?: PluginNodeUI;
  // V1 compat: slot-based
  slot?: ChainSlotType;
  isEditorOpen: boolean;
  isMultiSelected?: boolean;
  onRemove: () => void;
  onToggleBypass: () => void;
  onToggleEditor: () => void;
}

export function ChainSlot({
  node,
  slot,
  isEditorOpen,
  isMultiSelected = false,
  onRemove,
  onToggleBypass,
  onToggleEditor,
}: ChainSlotProps) {
  // Unified data access
  const id = node?.id ?? slot?.index ?? 0;
  const name = node?.name ?? slot?.name ?? '';
  const manufacturer = node?.manufacturer ?? slot?.manufacturer ?? '';
  const format = node?.format ?? slot?.format ?? '';
  const bypassed = node?.bypassed ?? slot?.bypassed ?? false;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => { e.stopPropagation(); onToggleEditor(); }}
      className={`flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer ${
        isMultiSelected
          ? 'bg-plugin-accent/10 border-plugin-accent ring-1 ring-plugin-accent/50'
          : bypassed
            ? 'bg-plugin-bg/50 border-plugin-border/50'
            : isEditorOpen
              ? 'bg-plugin-bg border-plugin-accent shadow-glow-accent'
              : 'bg-plugin-bg border-plugin-border hover:border-plugin-accent/50'
      } ${isDragging ? 'shadow-lg shadow-plugin-accent/20' : ''}`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="flex-shrink-0 p-1 rounded hover:bg-plugin-border cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-4 h-4 text-plugin-muted" />
      </button>

      {/* Plugin info */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm truncate ${
            bypassed ? 'text-plugin-muted line-through' : 'text-plugin-text'
          }`}
        >
          {name}
        </p>
        <p className="text-xs text-plugin-muted truncate">
          {manufacturer} {format && `\u2022 ${format}`}
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {/* Bypass toggle */}
        <button
          onClick={onToggleBypass}
          className={`p-1.5 rounded transition-colors ${
            bypassed
              ? 'bg-yellow-500/20 text-yellow-500'
              : 'hover:bg-plugin-border text-plugin-muted hover:text-plugin-text'
          }`}
          title={bypassed ? 'Enable' : 'Bypass'}
        >
          <Power className="w-4 h-4" />
        </button>

        {/* Remove */}
        <button
          onClick={onRemove}
          className="p-1.5 rounded hover:bg-red-500/20 text-plugin-muted hover:text-red-500 transition-colors"
          title="Remove from chain"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
