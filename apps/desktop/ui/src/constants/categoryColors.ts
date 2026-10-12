// Effect category colours. These are semantic (eq = blue, compressor = orange,
// reverb = purple, ...) and must stay the same across ProChain. Do not swap
// them for the accent colour.

/** Badge classes: tinted background, light text, faint border. */
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

/** Solid swatch classes for small dots and edge stripes. */
export const CATEGORY_SWATCH: Record<string, string> = {
  eq: 'bg-blue-400',
  compressor: 'bg-orange-400',
  limiter: 'bg-red-400',
  reverb: 'bg-purple-400',
  delay: 'bg-cyan-400',
  saturation: 'bg-amber-400',
  modulation: 'bg-green-400',
  'stereo-imaging': 'bg-indigo-400',
  'gate-expander': 'bg-yellow-400',
  'de-esser': 'bg-rose-400',
  filter: 'bg-violet-400',
  'channel-strip': 'bg-emerald-400',
  metering: 'bg-slate-400',
  'noise-reduction': 'bg-teal-400',
  multiband: 'bg-fuchsia-400',
  utility: 'bg-gray-400',
};

export const CATEGORY_LABELS: Record<string, string> = {
  eq: 'EQ',
  compressor: 'Compressor',
  limiter: 'Limiter',
  reverb: 'Reverb',
  delay: 'Delay',
  saturation: 'Saturation',
  modulation: 'Modulation',
  'stereo-imaging': 'Stereo',
  'gate-expander': 'Gate',
  'de-esser': 'De-esser',
  filter: 'Filter',
  'channel-strip': 'Strip',
  metering: 'Meter',
  'noise-reduction': 'Denoise',
  multiband: 'Multiband',
  utility: 'Utility',
};

/** Best-effort category guess from a free-text label (e.g. "Compression"). */
export function normalizeCategory(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (CATEGORY_COLORS[s]) return s;
  if (s.includes('eq')) return 'eq';
  if (s.includes('compress')) return 'compressor';
  if (s.includes('limit')) return 'limiter';
  if (s.includes('reverb')) return 'reverb';
  if (s.includes('delay') || s.includes('echo')) return 'delay';
  if (s.includes('satur') || s.includes('distort') || s.includes('tape')) return 'saturation';
  if (s.includes('chorus') || s.includes('flang') || s.includes('phas') || s.includes('modul')) return 'modulation';
  if (s.includes('stereo') || s.includes('imag')) return 'stereo-imaging';
  if (s.includes('gate') || s.includes('expand')) return 'gate-expander';
  if (s.includes('de-ess') || s.includes('deess')) return 'de-esser';
  if (s.includes('filter')) return 'filter';
  if (s.includes('strip')) return 'channel-strip';
  if (s.includes('meter')) return 'metering';
  if (s.includes('noise')) return 'noise-reduction';
  if (s.includes('multiband')) return 'multiband';
  return 'utility';
}
