// Category color utilities for plugin badges
// Semantic colors that must NOT be changed (per CLAUDE.md)

export const CATEGORY_COLORS: Record<string, string> = {
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

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.utility;
}

export function getCategoryBadgeClasses(category: string): string {
  return getCategoryColor(category);
}
