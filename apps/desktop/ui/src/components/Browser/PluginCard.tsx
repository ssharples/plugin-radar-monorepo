import { Zap } from 'lucide-react';
import type { PluginDescription } from '../../api/types';

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

interface PluginCardProps {
  plugin: PluginDescription;
  enrichedData: any;
  usageCount: number;
  isHighlighted: boolean;
  onAdd: () => void;
  onMouseEnter: () => void;
}

export function PluginCard({ plugin, enrichedData, usageCount, isHighlighted, onAdd, onMouseEnter }: PluginCardProps) {
  const manufacturerLogo = enrichedData?.manufacturerLogoUrl;
  const category = enrichedData?.category || plugin.category || '';
  const categoryColor = category ? (CATEGORY_COLORS[category.toLowerCase()] ?? CATEGORY_COLORS.utility) : '';

  return (
    <button
      data-browser-item
      onClick={onAdd}
      onMouseEnter={onMouseEnter}
      className={`
        group relative w-full text-left transition-all duration-150
        backdrop-blur-md border rounded-xl p-3
        ${isHighlighted
          ? 'bg-white/10 border-plugin-accent/40 shadow-[0_0_16px_rgba(222,255,10,0.15)]'
          : 'bg-black/50 border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.15]'
        }
      `}
    >
      <div className="flex items-center gap-3">
        {/* Icon / Logo */}
        <div className={`
          flex-shrink-0 w-10 h-10 rounded-lg bg-black/40 border flex items-center justify-center overflow-hidden
          ${isHighlighted ? 'border-plugin-accent/40' : 'border-white/10'}
        `}>
          {manufacturerLogo ? (
            <img src={manufacturerLogo} alt={plugin.manufacturer} className="w-full h-full object-contain p-1" />
          ) : (
            <span className="text-sm font-bold text-plugin-accent/40 font-mono">
              {plugin.manufacturer.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-sm font-semibold text-white truncate">{plugin.name}</h3>
            {usageCount > 0 && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-plugin-accent/15 border border-plugin-accent/30 rounded text-[9px] text-plugin-accent font-mono shrink-0">
                <Zap className="w-2.5 h-2.5" />
                {usageCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="text-white truncate">{plugin.manufacturer}</span>
            {category && (
              <>
                <span className="text-white">|</span>
                <span className={`px-1.5 py-px rounded border text-[9px] font-medium ${categoryColor}`}>
                  {category}
                </span>
              </>
            )}
            <span className="text-white">|</span>
            <span className="text-white uppercase">{plugin.format}</span>
          </div>
        </div>

        {/* Add button */}
        <div className={`
          flex-shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold uppercase tracking-wider transition-all
          ${isHighlighted
            ? 'bg-plugin-accent text-black'
            : 'bg-white/5 text-white group-hover:bg-plugin-accent/20 group-hover:text-plugin-accent'
          }
        `}>
          Add
        </div>
      </div>
    </button>
  );
}
