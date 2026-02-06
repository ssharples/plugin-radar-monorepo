import { useState, useCallback } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { GripVertical, Power, X, ArrowLeftRight } from 'lucide-react';
import type { PluginNodeUI, ChainSlot as ChainSlotType } from '../../api/types';
import { PluginSwapMenu } from './PluginSwapMenu';

interface ChainSlotProps {
  // V2: node-based
  node?: PluginNodeUI;
  // V1 compat: slot-based
  slot?: ChainSlotType;
  isEditorOpen: boolean;
  isMultiSelected?: boolean;
  isSelected?: boolean;
  /** The matched PluginRadar catalog ID (from scannedPlugins matching) */
  matchedPluginId?: string;
  onRemove: () => void;
  onToggleBypass: () => void;
  onToggleEditor: () => void;
  /** Called when a plugin swap completes successfully */
  onSwapComplete?: (newPluginName: string, confidence: number) => void;
  /** Whether any drag is currently active (for dimming non-dragged items) */
  isDragActive?: boolean;
}

export function ChainSlot({
  node,
  slot,
  isEditorOpen,
  isMultiSelected = false,
  isSelected = false,
  matchedPluginId,
  onRemove,
  onToggleBypass,
  onToggleEditor,
  onSwapComplete,
  isDragActive: _isDragActive = false,
}: ChainSlotProps) {
  // Unified data access
  const id = node?.id ?? slot?.index ?? 0;
  const name = node?.name ?? slot?.name ?? '';
  const manufacturer = node?.manufacturer ?? slot?.manufacturer ?? '';
  const format = node?.format ?? slot?.format ?? '';
  const bypassed = node?.bypassed ?? slot?.bypassed ?? false;
  const uid = node?.uid ?? slot?.uid;

  const [showSwapMenu, setShowSwapMenu] = useState(false);
  const [swapToast, setSwapToast] = useState<string | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({
    id: `drag:${id}`,
    data: {
      type: 'plugin',
      nodeId: id,
      node: node,
    },
  });

  const handleSwapComplete = useCallback((newPluginName: string, confidence: number) => {
    setSwapToast(`Swapped ${name} → ${newPluginName} (${confidence}% match)`);
    setTimeout(() => setSwapToast(null), 3000);
    onSwapComplete?.(newPluginName, confidence);
  }, [name, onSwapComplete]);

  return (
    <div className="relative">
      <div
        ref={setNodeRef}
        onClick={(e) => { e.stopPropagation(); onToggleEditor(); }}
        className={`
          flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer
          ${isDragging ? 'opacity-30 scale-[0.98]' : ''}
          ${isMultiSelected
            ? 'bg-plugin-accent/10 border-plugin-accent ring-1 ring-plugin-accent/50'
            : isSelected
              ? 'bg-plugin-accent/8 border-plugin-accent/70 ring-1 ring-plugin-accent/30 shadow-glow-accent'
              : bypassed
                ? 'bg-plugin-bg/50 border-plugin-border/50'
                : isEditorOpen
                  ? 'bg-plugin-bg border-plugin-accent shadow-glow-accent'
                  : 'bg-plugin-bg border-plugin-border hover:border-plugin-accent/50'
          }
        `}
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
            {manufacturer} {format && `• ${format}`}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {/* Swap button */}
          {matchedPluginId && (
            <button
              onClick={() => setShowSwapMenu(!showSwapMenu)}
              className={`p-1.5 rounded transition-colors ${
                showSwapMenu
                  ? 'bg-plugin-accent/20 text-plugin-accent'
                  : 'hover:bg-plugin-border text-plugin-muted hover:text-plugin-text'
              }`}
              title="Swap plugin"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          )}

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

      {/* Swap Menu Dropdown */}
      {showSwapMenu && matchedPluginId && (
        <PluginSwapMenu
          nodeId={id}
          pluginName={name}
          matchedPluginId={matchedPluginId}
          pluginUid={uid}
          onSwapComplete={handleSwapComplete}
          onClose={() => setShowSwapMenu(false)}
        />
      )}

      {/* Swap Toast */}
      {swapToast && (
        <div className="absolute -bottom-8 left-0 right-0 z-50 flex justify-center">
          <div className="bg-plugin-accent/90 text-white text-xs px-3 py-1 rounded-full shadow-lg animate-fade-in-up">
            {swapToast}
          </div>
        </div>
      )}
    </div>
  );
}
