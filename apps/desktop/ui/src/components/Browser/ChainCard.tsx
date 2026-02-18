import { memo } from 'react';
import { Download, Star, GitFork, Eye } from 'lucide-react';
import { AuthorAvatar } from './AuthorAvatar';
import type { BrowseChainResult } from '../../api/types';

interface ChainCardProps {
  chain: BrowseChainResult;
  isHighlighted: boolean;
  onLoad: () => void;
  onMouseEnter: () => void;
  onAuthorClick?: (authorName: string) => void;
}

export const ChainCard = memo(function ChainCard({ chain, isHighlighted, onLoad, onMouseEnter, onAuthorClick }: ChainCardProps) {
  const rating = chain.averageRating ?? 0;
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;

  return (
    <div
      data-browser-item
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
      {/* Chain name */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-plugin-accent truncate">{chain.name}</h3>
        <button
          onClick={(e) => { e.stopPropagation(); onLoad(); }}
          className={`
            flex-shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold uppercase tracking-wider transition-all
            ${isHighlighted
              ? 'bg-plugin-accent text-black'
              : 'bg-white/5 text-white group-hover:bg-plugin-accent/20 group-hover:text-plugin-accent'
            }
          `}
        >
          Load
        </button>
      </div>

      {/* Author row */}
      <div className="flex items-center gap-2 mb-2">
        <AuthorAvatar
          name={chain.author?.name}
          avatarUrl={chain.author?.avatarUrl}
          size={20}
          onClick={chain.author?.name ? () => onAuthorClick?.(chain.author!.name!) : undefined}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (chain.author?.name) onAuthorClick?.(chain.author.name);
          }}
          className="text-[10px] font-mono text-white hover:text-plugin-accent transition-colors truncate"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          @{chain.author?.name || 'unknown'}
        </button>
        <span className="text-[10px] text-white font-mono">|</span>
        <span className="text-[10px] font-mono text-white">
          {chain.pluginCount} plugin{chain.pluginCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[9px] font-mono text-white">
        {/* Rating stars */}
        {rating > 0 && (
          <span className="flex items-center gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                className="w-2.5 h-2.5"
                fill={i < fullStars ? '#deff0a' : (i === fullStars && hasHalf ? '#deff0a' : 'none')}
                stroke={i < fullStars || (i === fullStars && hasHalf) ? '#deff0a' : 'currentColor'}
                strokeWidth={1.5}
                style={i === fullStars && hasHalf ? { clipPath: 'inset(0 50% 0 0)' } : undefined}
              />
            ))}
            <span className="ml-0.5 text-white">{rating.toFixed(1)}</span>
          </span>
        )}
        <span className="flex items-center gap-0.5">
          <Download className="w-2.5 h-2.5" /> {chain.downloads}
        </span>
        {chain.forks != null && chain.forks > 0 && (
          <span className="flex items-center gap-0.5">
            <GitFork className="w-2.5 h-2.5" /> {chain.forks}
          </span>
        )}
        {chain.views != null && chain.views > 0 && (
          <span className="flex items-center gap-0.5">
            <Eye className="w-2.5 h-2.5" /> {chain.views}
          </span>
        )}
      </div>

      {/* Slot previews */}
      {chain.slots && chain.slots.length > 0 && (
        <div className="flex items-center gap-1 mt-2 overflow-hidden">
          {chain.slots.slice(0, 5).map((slot, i) => (
            <span
              key={i}
              className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[8px] font-mono text-white truncate max-w-[80px]"
              title={`${slot.pluginName} (${slot.manufacturer})`}
            >
              {slot.pluginName}
            </span>
          ))}
          {chain.slots.length > 5 && (
            <span className="text-[8px] font-mono text-white">
              +{chain.slots.length - 5}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
