import { Download, Heart, Bookmark, BookmarkCheck, Star, GitFork } from 'lucide-react';

interface ChainBrowserCardProps {
  chain: any;
  /** null when logged out or unknown */
  compatPercent: number | null;
  isInCollection: boolean;
  selected?: boolean;
  onPreview: () => void;
  onLoad: () => void;
  onToggleCollection?: () => void;
  /** Extra line under the title, e.g. "Private" or "from web" */
  note?: string;
}

function compatTone(percent: number | null) {
  if (percent === null) return { bar: 'bg-plugin-dim', text: 'text-plugin-dim' };
  if (percent === 100) return { bar: 'bg-green-500', text: 'text-green-400' };
  if (percent >= 60) return { bar: 'bg-yellow-500', text: 'text-yellow-400' };
  return { bar: 'bg-red-500', text: 'text-red-400' };
}

export function ChainBrowserCard({
  chain,
  compatPercent,
  isInCollection,
  selected,
  onPreview,
  onLoad,
  onToggleCollection,
  note,
}: ChainBrowserCardProps) {
  const slots: any[] = chain.slots ?? [];
  const pluginCount: number = slots.length || chain.pluginCount || 0;
  const shown = slots.slice(0, 4);
  const tone = compatTone(compatPercent);
  const rating: number | undefined = chain.averageRating ?? chain.rating;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onPreview}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPreview();
        }
      }}
      className={`group flex flex-col rounded-lg border bg-plugin-surface p-3 cursor-pointer transition-colors ${
        selected
          ? 'border-plugin-accent/70 shadow-glow-accent'
          : 'border-plugin-border hover:border-plugin-border-bright hover:bg-plugin-surface-alt'
      }`}
    >
      {/* Title row */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-plugin-text truncate leading-tight">{chain.name}</h4>
          <p className="text-xs text-plugin-dim truncate mt-0.5">
            {chain.author?.name ? <>by <span className="text-plugin-muted">{chain.author.name}</span></> : note ?? ' '}
            {chain.author?.name && note ? <span> · {note}</span> : null}
          </p>
        </div>
        {chain.forkedFrom && <GitFork className="w-3.5 h-3.5 text-plugin-dim mt-0.5 flex-shrink-0" aria-label="Fork" />}
        {onToggleCollection && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollection();
            }}
            className={`-mr-1 -mt-0.5 w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors flex-shrink-0 ${
              isInCollection ? 'text-plugin-accent' : 'text-plugin-dim hover:text-plugin-text hover:bg-plugin-raised'
            }`}
            title={isInCollection ? 'Remove from saved' : 'Save to your collection'}
            aria-label={isInCollection ? 'Remove from saved' : 'Save to collection'}
          >
            {isInCollection ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Signal flow preview */}
      <ol className="flex flex-wrap items-center gap-1 mt-2.5 min-h-[22px]">
        {shown.map((s: any, i: number) => (
          <li key={i} className="inline-flex items-center gap-1 max-w-full">
            {i > 0 && <span className="text-plugin-dim text-[10px]" aria-hidden>›</span>}
            <span className="px-1.5 h-[22px] inline-flex items-center rounded bg-plugin-bg border border-plugin-border text-[11px] text-plugin-muted truncate max-w-[120px]">
              {s.pluginName}
            </span>
          </li>
        ))}
        {pluginCount > shown.length && (
          <li className="text-[11px] text-plugin-dim">+{pluginCount - shown.length}</li>
        )}
        {shown.length === 0 && pluginCount > 0 && (
          <li className="text-[11px] text-plugin-dim">{pluginCount} plugins</li>
        )}
      </ol>

      {/* Ownership */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full bg-plugin-raised overflow-hidden" aria-hidden>
          <div className={`h-full ${tone.bar}`} style={{ width: compatPercent === null ? '0%' : `${compatPercent}%` }} />
        </div>
        <span className={`num text-[11px] ${tone.text}`} title="Share of these plugins you own">
          {compatPercent === null ? '—' : compatPercent === 100 ? 'All owned' : `${compatPercent}% owned`}
        </span>
      </div>

      {/* Footer */}
      <div className="mt-2.5 flex items-center gap-3 text-[11px] text-plugin-dim">
        {rating ? (
          <span className="inline-flex items-center gap-0.5"><Star className="w-3 h-3" /> <span className="num">{Number(rating).toFixed(1)}</span></span>
        ) : null}
        <span className="inline-flex items-center gap-0.5"><Heart className="w-3 h-3" /> <span className="num">{chain.likes ?? 0}</span></span>
        <span className="inline-flex items-center gap-0.5"><Download className="w-3 h-3" /> <span className="num">{chain.downloads ?? 0}</span></span>
        <span className="flex-1" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onLoad();
          }}
          className="h-7 px-2.5 rounded-md text-xs font-semibold bg-plugin-raised text-plugin-text border border-plugin-border-bright hover:bg-plugin-accent hover:text-plugin-on-accent hover:border-plugin-accent transition-colors"
          title={compatPercent === 100 ? 'Load into your chain' : 'Open to pick swaps, then load'}
        >
          Load
        </button>
      </div>
    </div>
  );
}
