const FALLBACK_COLOR = 'rgba(255,255,255,0.15)';

export const CATEGORY_COLORS: Record<string, string> = {
  eq: '#3b82f6',
  compressor: '#f97316',
  dynamics: '#f97316',
  reverb: '#a855f7',
  delay: '#06b6d4',
  distortion: '#ef4444',
  saturation: '#ef4444',
  modulation: '#10b981',
  'channel strip': '#eab308',
  'channel-strip': '#eab308',
  mastering: '#ec4899',
  'de-esser': '#f472b6',
  filter: '#8b5cf6',
  'gate-expander': '#14b8a6',
  gate: '#14b8a6',
  'stereo-imaging': '#6366f1',
  limiter: '#e11d48',
  metering: '#64748b',
  utility: '#64748b',
  'noise-reduction': '#22d3ee',
  multiband: '#d946ef',
};

const CATEGORY_LABELS: Record<string, string> = {
  eq: 'EQ',
  compressor: 'Compressor',
  dynamics: 'Dynamics',
  limiter: 'Limiter',
  reverb: 'Reverb',
  delay: 'Delay',
  saturation: 'Saturation',
  modulation: 'Modulation',
  'stereo-imaging': 'Stereo',
  'gate-expander': 'Gate',
  gate: 'Gate',
  'de-esser': 'De-esser',
  filter: 'Filter',
  'channel-strip': 'Strip',
  'channel strip': 'Strip',
  metering: 'Meter',
  'noise-reduction': 'Denoise',
  multiband: 'Multiband',
  utility: 'Utility',
  mastering: 'Mastering',
};

export function getCategoryColor(category?: string | null): string {
  if (!category) return FALLBACK_COLOR;
  return CATEGORY_COLORS[category.toLowerCase()] ?? FALLBACK_COLOR;
}

export function getCategoryLabel(category?: string | null): string | null {
  if (!category) return null;
  const key = category.toLowerCase();
  return CATEGORY_LABELS[key] ?? category;
}

export function getCompatColor(percent: number | null): string {
  if (percent === null) return 'var(--color-text-disabled)';
  if (percent === 100) return 'var(--color-status-active)';
  if (percent >= 80) return 'var(--color-status-warning)';
  if (percent >= 50) return '#f97316';
  return 'var(--color-status-error)';
}
