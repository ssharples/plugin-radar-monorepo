import { memo } from 'react';
import { Layers, GitBranch } from 'lucide-react';
import type { GroupTemplateInfo } from '../../api/types';

interface GroupPresetCardProps {
  template: GroupTemplateInfo;
  isHighlighted: boolean;
  onInsert: () => void;
  onMouseEnter: () => void;
}

export const GroupPresetCard = memo(function GroupPresetCard({ template, isHighlighted, onInsert, onMouseEnter }: GroupPresetCardProps) {
  const isParallel = template.mode === 'parallel';
  const ModeIcon = isParallel ? GitBranch : Layers;

  return (
    <button
      data-browser-item
      onClick={onInsert}
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
        {/* Mode icon */}
        <div className={`
          flex-shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center
          ${isParallel
            ? 'bg-plugin-parallel/10 border-plugin-parallel/30'
            : 'bg-plugin-serial/10 border-plugin-serial/30'
          }
        `}>
          <ModeIcon className={`w-4 h-4 ${isParallel ? 'text-plugin-parallel' : 'text-plugin-serial'}`} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-plugin-accent truncate mb-0.5">{template.name}</h3>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className={`px-1.5 py-px rounded border text-[9px] font-medium uppercase ${
              isParallel
                ? 'bg-plugin-parallel/15 text-plugin-parallel border-plugin-parallel/30'
                : 'bg-plugin-serial/15 text-plugin-serial border-plugin-serial/30'
            }`}>
              {template.mode}
            </span>
            <span className="text-white">
              {template.pluginCount} plugin{template.pluginCount !== 1 ? 's' : ''}
            </span>
            {template.category && (
              <>
                <span className="text-white">|</span>
                <span className="text-white capitalize">{template.category}</span>
              </>
            )}
          </div>
        </div>

        {/* Insert button */}
        <div className={`
          flex-shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold uppercase tracking-wider transition-all
          ${isHighlighted
            ? 'bg-plugin-accent text-black'
            : 'bg-white/5 text-white group-hover:bg-plugin-accent/20 group-hover:text-plugin-accent'
          }
        `}>
          Insert
        </div>
      </div>
    </button>
  );
});
