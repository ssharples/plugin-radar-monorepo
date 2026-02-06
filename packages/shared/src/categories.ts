export const EFFECT_CATEGORIES = [
  'eq', 'compressor', 'limiter', 'reverb', 'delay', 'saturation',
  'modulation', 'stereo-imaging', 'gate-expander', 'de-esser',
  'filter', 'channel-strip', 'metering', 'noise-reduction',
  'multiband', 'utility'
] as const;

export type EffectCategory = typeof EFFECT_CATEGORIES[number];
