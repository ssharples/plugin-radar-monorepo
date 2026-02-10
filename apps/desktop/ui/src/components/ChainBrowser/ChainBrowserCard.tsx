import { Download, Heart, Bookmark, BookmarkCheck } from 'lucide-react';

interface ChainBrowserCardProps {
  chain: any;
  compatPercent: number | null; // null if not logged in
  isInCollection: boolean;
  onPreview: () => void;
  onLoad: () => void;
  onToggleCollection: () => void;
}

function getCompatColor(percent: number | null): string {
  if (percent === null) return 'bg-plugin-dim'; // not logged in
  if (percent === 100) return 'bg-green-500';
  if (percent >= 80) return 'bg-yellow-500';
  if (percent >= 50) return 'bg-orange-500';
  return 'bg-red-500';
}

function getCompatLabel(percent: number | null): string {
  if (percent === null) return '—';
  return `${percent}%`;
}

export function ChainBrowserCard({
  chain,
  compatPercent,
  isInCollection,
  onPreview,
  onLoad,
  onToggleCollection,
}: ChainBrowserCardProps) {
  const pluginPreview = chain.slots
    ?.slice(0, 3)
    .map((s: any) => s.pluginName)
    .join(' → ');
  const pluginCount = chain.slots?.length ?? chain.pluginCount;

  return (
    <div
      className="group bg-black/20 border border-plugin-border/50 rounded-propane p-3 hover:border-plugin-accent/30 hover:bg-black/30 transition-all cursor-pointer"
      onClick={onPreview}
    >
      {/* Top row: name + compat badge */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4 className="text-xs font-medium text-plugin-text truncate flex-1">
          {chain.name}
        </h4>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Compatibility dot */}
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${getCompatColor(compatPercent)}`} />
            <span className="text-[9px] font-mono text-plugin-dim">
              {getCompatLabel(compatPercent)}
            </span>
          </div>
        </div>
      </div>

      {/* Author */}
      {chain.author?.name && (
        <p className="text-[10px] text-plugin-dim mb-1">
          by @{chain.author.name}
        </p>
      )}

      {/* Plugin preview */}
      <p className="text-[10px] text-plugin-muted truncate mb-2">
        {pluginPreview}
        {pluginCount > 3 ? ` +${pluginCount - 3} more` : ''}
      </p>

      {/* Bottom row: stats + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-[9px] text-plugin-dim">
          <span className="flex items-center gap-0.5">
            <Download className="w-2.5 h-2.5" /> {chain.downloads}
          </span>
          <span className="flex items-center gap-0.5">
            <Heart className="w-2.5 h-2.5" /> {chain.likes}
          </span>
          {chain.pluginCount > 0 && (
            <span className="font-mono">{chain.pluginCount}p</span>
          )}
        </div>

        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onToggleCollection}
            className={`p-1 rounded transition-colors ${
              isInCollection
                ? 'text-plugin-accent'
                : 'text-plugin-dim hover:text-plugin-muted'
            }`}
            title={isInCollection ? 'Remove from collection' : 'Add to collection'}
          >
            {isInCollection ? (
              <BookmarkCheck className="w-3 h-3" />
            ) : (
              <Bookmark className="w-3 h-3" />
            )}
          </button>
          <button
            onClick={onLoad}
            className="px-2 py-0.5 bg-plugin-accent hover:bg-plugin-accent-dim text-black rounded text-[9px] font-mono uppercase font-bold transition-colors"
          >
            Load
          </button>
        </div>
      </div>
    </div>
  );
}
