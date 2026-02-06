import { Plus, Music, Sliders } from 'lucide-react';
import type { PluginDescription } from '../../api/types';

interface PluginItemProps {
  plugin: PluginDescription;
  onAdd: () => void;
}

export function PluginItem({ plugin, onAdd }: PluginItemProps) {
  return (
    <div
      className="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-plugin-surface-alt border border-transparent hover:border-plugin-border transition-all cursor-pointer"
      onDoubleClick={onAdd}
    >
      {/* Icon */}
      <div className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded ${
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
        <p className="text-xs text-plugin-text truncate leading-tight">{plugin.name}</p>
        <p className="text-xxs text-plugin-dim truncate leading-tight">
          {plugin.manufacturer} <span className="text-plugin-border-bright">/</span> {plugin.format}
        </p>
      </div>

      {/* Add button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAdd();
        }}
        className="flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 bg-plugin-accent/15 hover:bg-plugin-accent text-plugin-accent hover:text-black transition-all"
        title="Add to chain"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}
