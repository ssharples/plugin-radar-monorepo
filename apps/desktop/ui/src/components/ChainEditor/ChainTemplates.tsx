import { Mic, Drum, Disc3, Sparkles, Plus, Library, ArrowRight } from 'lucide-react';
import { OtherInstancesList } from './OtherInstancesList';

const STARTERS = [
  { name: 'Vocals', search: 'vocal', description: 'EQ → Comp → De-esser → Reverb', icon: Mic },
  { name: 'Drum bus', search: 'drum', description: 'EQ → Comp → Saturation → Limiter', icon: Drum },
  { name: 'Mastering', search: 'master', description: 'EQ → Multiband → Limiter', icon: Disc3 },
  { name: 'Creative FX', search: 'creative', description: 'Filter → Mod → Delay → Reverb', icon: Sparkles },
];

/** Ask the app shell to switch to the chain library, optionally with a search. */
export function openChainLibrary(search?: string) {
  window.dispatchEvent(new CustomEvent('openChainLibrary', { detail: { search } }));
}

/**
 * Empty state for the chain canvas.
 * Two clear ways in: start from scratch (add a plugin) or start from a
 * community chain in the library. Other running instances sit on top so a
 * chain can be copied from another track.
 */
export function ChainTemplates() {
  const openBrowser = () => {
    window.dispatchEvent(new Event('openPluginBrowser'));
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-full py-6">
      <div className="w-full max-w-[520px]">
        <OtherInstancesList />
      </div>

      <div className="w-full max-w-[520px] text-center mb-4">
        <h2 className="text-lg font-semibold text-plugin-text">Start a chain</h2>
        <p className="text-[13px] text-plugin-muted mt-0.5">
          Add plugins from any brand, or load a chain someone else built.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 w-full max-w-[520px]">
        <button
          onClick={openBrowser}
          className="flex flex-col items-start gap-2 p-3 rounded-lg border border-plugin-border bg-plugin-surface hover:border-plugin-accent/50 hover:bg-plugin-surface-alt transition-colors text-left"
        >
          <span className="w-8 h-8 rounded-md bg-plugin-accent/15 text-plugin-accent inline-flex items-center justify-center">
            <Plus className="w-4 h-4" />
          </span>
          <span>
            <span className="block text-[13px] font-semibold text-plugin-text">Add a plugin</span>
            <span className="block text-xs text-plugin-muted">Pick from your scanned plugins (⌘B)</span>
          </span>
        </button>
        <button
          onClick={() => openChainLibrary()}
          className="flex flex-col items-start gap-2 p-3 rounded-lg border border-plugin-border bg-plugin-surface hover:border-plugin-accent/50 hover:bg-plugin-surface-alt transition-colors text-left"
        >
          <span className="w-8 h-8 rounded-md bg-plugin-accent/15 text-plugin-accent inline-flex items-center justify-center">
            <Library className="w-4 h-4" />
          </span>
          <span>
            <span className="block text-[13px] font-semibold text-plugin-text">Browse the library</span>
            <span className="block text-xs text-plugin-muted">See what you can load with what you own</span>
          </span>
        </button>
      </div>

      <div className="w-full max-w-[520px] mt-5">
        <p className="section-label mb-2">Popular starting points</p>
        <div className="grid grid-cols-2 gap-1.5">
          {STARTERS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.name}
                onClick={() => openChainLibrary(t.search)}
                className="group flex items-center gap-2.5 px-2.5 py-2 rounded-md border border-plugin-border/70 bg-plugin-surface/60 hover:border-plugin-border-bright hover:bg-plugin-surface transition-colors text-left"
              >
                <Icon className="w-4 h-4 text-plugin-muted group-hover:text-plugin-accent flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-medium text-plugin-text">{t.name}</span>
                  <span className="block text-[11px] text-plugin-dim truncate">{t.description}</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-plugin-dim opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
