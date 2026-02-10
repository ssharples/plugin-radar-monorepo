import { Mic, Volume2, Headphones, Zap, Plus } from 'lucide-react';

const TEMPLATES = [
  {
    name: 'Vocal Chain',
    description: 'EQ \u2192 Comp \u2192 De-esser \u2192 Reverb',
    icon: Mic,
    classes: 'bg-plugin-card border-plugin-accent/25 hover:border-plugin-accent/40',
  },
  {
    name: 'Drum Bus',
    description: 'EQ \u2192 Comp \u2192 Saturation \u2192 Limiter',
    icon: Volume2,
    classes: 'bg-plugin-card border-plugin-accent/25 hover:border-plugin-accent/40',
  },
  {
    name: 'Master Chain',
    description: 'EQ \u2192 Multiband \u2192 Limiter \u2192 Meter',
    icon: Headphones,
    classes: 'bg-plugin-card border-plugin-accent/25 hover:border-plugin-accent/40',
  },
  {
    name: 'Creative FX',
    description: 'Filter \u2192 Modulation \u2192 Delay \u2192 Reverb',
    icon: Zap,
    classes: 'bg-plugin-card border-plugin-accent/25 hover:border-plugin-accent/40',
  },
];

/**
 * Empty-state component shown when no plugins are in the chain.
 * Displays inspirational template cards and a browse button.
 */
export function ChainTemplates() {
  const openBrowser = () => {
    window.dispatchEvent(new Event('openPluginBrowser'));
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-6">
      <div className="w-12 h-12 rounded-xl bg-plugin-accent/10 border border-plugin-accent/20 flex items-center justify-center mb-3">
        <Plus className="w-6 h-6 text-plugin-accent" />
      </div>
      <h2 className="text-sm font-semibold font-mono uppercase text-plugin-text mb-1">Build your chain</h2>
      <p className="text-xs font-mono uppercase text-plugin-muted mb-5 text-center">
        Double-click a plugin from the browser, or get inspired
      </p>

      <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
        {TEMPLATES.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.name}
              onClick={openBrowser}
              className={`
                group flex flex-col gap-1 p-2.5 rounded-lg border
                ${t.classes}
                hover:scale-[1.02] active:scale-[0.98]
                transition-all duration-150 text-left
              `}
            >
              <div className="flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5 text-plugin-text" />
                <span className="text-[11px] font-medium font-mono uppercase text-plugin-text">{t.name}</span>
              </div>
              <span className="text-[10px] font-mono uppercase text-plugin-muted leading-tight">
                {t.description}
              </span>
            </button>
          );
        })}
      </div>

      <button
        onClick={openBrowser}
        className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-plugin-accent hover:bg-plugin-accent/10 transition-colors"
      >
        <span className="font-mono uppercase">Browse All Plugins</span>
      </button>
    </div>
  );
}
