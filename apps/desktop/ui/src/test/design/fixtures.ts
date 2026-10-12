// Made-up data for the design preview. No network, no real accounts.
/* eslint-disable @typescript-eslint/no-explicit-any */

type P = [name: string, maker: string, category: string, effectType: string, tags: string[], price?: number];

const RAW: P[] = [
  ['Pro-Q 3', 'FabFilter', 'eq', 'Dynamic', ['transparent', 'surgical'], 17900],
  ['Pro-C 2', 'FabFilter', 'compressor', 'VCA', ['clean', 'versatile'], 17900],
  ['Pro-L 2', 'FabFilter', 'limiter', 'Brickwall', ['loud', 'transparent'], 19900],
  ['Pro-R', 'FabFilter', 'reverb', 'Algorithmic', ['smooth', 'natural'], 19900],
  ['Saturn 2', 'FabFilter', 'saturation', 'Multiband', ['warm', 'gritty'], 15900],
  ['1176 Rev A', 'Universal Audio', 'compressor', 'FET', ['punchy', 'aggressive'], 14900],
  ['LA-2A Gray', 'Universal Audio', 'compressor', 'Optical', ['smooth', 'warm'], 14900],
  ['Pultec EQP-1A', 'Universal Audio', 'eq', 'Passive', ['warm', 'airy'], 14900],
  ['ValhallaRoom', 'Valhalla DSP', 'reverb', 'Algorithmic', ['lush', 'dense'], 5000],
  ['ValhallaDelay', 'Valhalla DSP', 'delay', 'Tape', ['vintage', 'wide'], 5000],
  ['Decapitator', 'Soundtoys', 'saturation', 'Analog', ['gritty', 'aggressive'], 19900],
  ['EchoBoy', 'Soundtoys', 'delay', 'Tape', ['vintage', 'warm'], 19900],
  ['MicroShift', 'Soundtoys', 'stereo-imaging', 'Pitch', ['wide'], 9900],
  ['TDR Nova', 'Tokyo Dawn Labs', 'eq', 'Dynamic', ['transparent'], undefined],
  ['Kotelnikov', 'Tokyo Dawn Labs', 'compressor', 'Bus', ['clean', 'glue'], undefined],
  ['OTT', 'Xfer Records', 'compressor', 'Multiband', ['aggressive', 'bright'], undefined],
  ['RC-20 Retro Color', 'XLN Audio', 'creative', 'Lo-fi', ['vintage', 'warm'], 9900],
  ['Ozone 11 Maximizer', 'iZotope', 'limiter', 'IRC', ['loud'], 24900],
  ['Nectar 4 De-esser', 'iZotope', 'de-esser', 'Spectral', ['clean'], 9900],
  ['Soothe2', 'oeksound', 'eq', 'Resonance', ['smooth', 'transparent'], 19900],
  ['Serum', 'Xfer Records', 'synth', 'Wavetable', ['bright'], 18900],
  ['H-Delay', 'Waves', 'delay', 'Hybrid', ['vintage'], 2999],
  ['CLA-76', 'Waves', 'compressor', 'FET', ['punchy'], 2999],
  ['Little AlterBoy', 'Soundtoys', 'pitch', 'Formant', ['creative'], 9900],
];

export const PLUGINS = RAW.map(([name, manufacturer, category], i) => ({
  id: `plugin-${i + 1}`,
  name,
  manufacturer,
  category: category === 'synth' ? 'Instrument' : 'Effect',
  format: i % 4 === 3 ? 'AudioUnit' : 'VST3',
  uid: 1000 + i,
  fileOrIdentifier: `/Library/Audio/Plug-Ins/VST3/${name}.vst3`,
  isInstrument: category === 'synth',
  numInputChannels: 2,
  numOutputChannels: 2,
  version: '1.0.0',
}));

export const ENRICHED = RAW.map(([name, maker, category, effectType, tags, price], i) => ({
  _id: `cat_${i + 1}`,
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  category,
  effectType,
  tonalCharacter: tags,
  tags,
  isFree: price === undefined,
  currentPrice: price,
  currency: 'USD',
  shortDescription: `${effectType} ${category} by ${maker}.`,
}));

export const SCANNED = PLUGINS.map((p, i) => ({ uid: p.uid, name: p.name, manufacturer: p.manufacturer, matchedPlugin: `cat_${i + 1}` }));

const leaf = (id: number, idx: number, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'plugin',
  name: PLUGINS[idx].name,
  format: PLUGINS[idx].format,
  uid: PLUGINS[idx].uid,
  fileOrIdentifier: PLUGINS[idx].fileOrIdentifier,
  bypassed: false,
  manufacturer: PLUGINS[idx].manufacturer,
  branchGainDb: 0,
  solo: false,
  mute: false,
  persistentId: `pid-${id}`,
  latencySamples: 0,
  ...extra,
});

export const CHAIN_NODES: any[] = [
  leaf(1, 0),
  leaf(2, 5, { recallSafe: true }),
  {
    id: 10,
    type: 'group',
    name: 'Parallel crush',
    mode: 'parallel',
    dryWet: 1,
    collapsed: false,
    children: [
      leaf(3, 10, { branchGainDb: -6 }),
      leaf(4, 15, { branchGainDb: -9.5, polarityInverted: false }),
    ],
  },
  {
    id: 11,
    type: 'group',
    name: 'Space',
    mode: 'serial',
    dryWet: 0.35,
    collapsed: false,
    children: [leaf(5, 9), leaf(6, 8, { bypassed: true })],
  },
  leaf(7, 2, { latencySamples: 512, ignoreLatency: true }),
];

export const MACROS = [
  { index: 0, name: 'Drive', value: 0.42, links: [
    { pluginId: 'pid-3', parameterId: 'drive', nodeId: 3, pluginName: 'Decapitator', parameterName: 'Drive', min: 0.1, max: 0.8, available: true },
    { pluginId: 'pid-4', parameterId: 'depth', nodeId: 4, pluginName: 'OTT', parameterName: 'Depth', min: 0, max: 0.6, available: true },
  ] },
  { index: 1, name: 'Space', value: 0.3, links: [
    { pluginId: 'pid-6', parameterId: 'mix', nodeId: 6, pluginName: 'ValhallaRoom', parameterName: 'Mix', min: 0, max: 0.5, available: true },
  ] },
  { index: 2, name: 'Air', value: 0.6, links: [] },
  { index: 3, name: 'Punch', value: 0.5, links: [] },
  { index: 4, name: 'Macro 5', value: 0, links: [] },
  { index: 5, name: 'Macro 6', value: 0, links: [] },
  { index: 6, name: 'Macro 7', value: 0, links: [] },
  { index: 7, name: 'Macro 8', value: 0, links: [] },
];

const slot = (name: string, manufacturer: string, position: number) => ({ pluginName: name, manufacturer, position, format: 'VST3' });

export const CLOUD_CHAINS: any[] = [
  { name: 'Radio-ready lead vocal', author: 'mara.mixes', likes: 412, downloads: 3810, tags: ['vocals', 'pop'], lufs: -18, slots: [slot('Pro-Q 3', 'FabFilter', 0), slot('1176 Rev A', 'Universal Audio', 1), slot('LA-2A Gray', 'Universal Audio', 2), slot('Nectar 4 De-esser', 'iZotope', 3), slot('EchoBoy', 'Soundtoys', 4), slot('ValhallaRoom', 'Valhalla DSP', 5)] },
  { name: 'Parallel drum smash', author: 'kicksnare', likes: 288, downloads: 2154, tags: ['drums', 'bus'], slots: [slot('Kotelnikov', 'Tokyo Dawn Labs', 0), slot('Decapitator', 'Soundtoys', 1), slot('OTT', 'Xfer Records', 2), slot('Pro-L 2', 'FabFilter', 3)] },
  { name: 'Lo-fi keys', author: 'tape.hiss', likes: 196, downloads: 1420, tags: ['keys', 'lofi'], slots: [slot('RC-20 Retro Color', 'XLN Audio', 0), slot('Pultec EQP-1A', 'Universal Audio', 1), slot('ValhallaDelay', 'Valhalla DSP', 2)] },
  { name: 'Clean master bus', author: 'northroom', likes: 540, downloads: 5102, tags: ['mastering'], lufs: -14, slots: [slot('Soothe2', 'oeksound', 0), slot('Pro-Q 3', 'FabFilter', 1), slot('Pro-C 2', 'FabFilter', 2), slot('Ozone 11 Maximizer', 'iZotope', 3)] },
  { name: 'Wide synth pad', author: 'aurora', likes: 133, downloads: 870, tags: ['synths', 'ambient'], slots: [slot('MicroShift', 'Soundtoys', 0), slot('Pro-R', 'FabFilter', 1), slot('ValhallaDelay', 'Valhalla DSP', 2)] },
  { name: 'Gritty bass DI', author: 'lowend.lab', likes: 221, downloads: 1675, tags: ['bass'], slots: [slot('Pro-Q 3', 'FabFilter', 0), slot('Neve 1073', 'Universal Audio', 1), slot('Saturn 2', 'FabFilter', 2), slot('CLA-76', 'Waves', 3)] },
  { name: 'Podcast voice', author: 'onair', likes: 98, downloads: 990, tags: ['podcast', 'voice'], slots: [slot('TDR Nova', 'Tokyo Dawn Labs', 0), slot('Pro-C 2', 'FabFilter', 1), slot('Pro-L 2', 'FabFilter', 2)] },
  { name: 'Shoegaze guitar wall', author: 'fuzzface', likes: 175, downloads: 1210, tags: ['guitar'], slots: [slot('Decapitator', 'Soundtoys', 0), slot('Little AlterBoy', 'Soundtoys', 1), slot('Bigsky', 'Strymon', 2), slot('ValhallaRoom', 'Valhalla DSP', 3)] },
].map((c, i) => {
  const owned = new Set(PLUGINS.map((p) => p.name));
  const pluginIds = c.slots.map((s: any) => {
    const idx = PLUGINS.findIndex((p) => p.name === s.pluginName);
    return idx >= 0 ? `cat_${idx + 1}` : `cat_x_${s.pluginName}`;
  });
  return {
    _id: `chain_${i + 1}`,
    slug: c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    shareCode: `SC${i + 1}`,
    name: c.name,
    description: i === 0 ? 'Tight, bright and upfront. Built for pop vocals sitting over a dense mix. Swap the de-esser for whatever you have.' : undefined,
    author: { name: c.author },
    authorId: `user_${i + 10}`,
    likes: c.likes,
    downloads: c.downloads,
    tags: c.tags,
    targetInputLufs: c.lufs,
    pluginCount: c.slots.length,
    pluginIds,
    slots: c.slots,
    isPublic: true,
    _owned: c.slots.map((s: any) => owned.has(s.pluginName)),
  };
});

// Make chain 1 miss one plugin so the swap flow shows
CLOUD_CHAINS[0].slots[3] = slot('DeEsser Pro', 'Sonnox', 3);
CLOUD_CHAINS[0].pluginIds[3] = 'cat_x_deesser';
CLOUD_CHAINS[0]._owned[3] = false;

export const ALTERNATIVES: Record<string, any[]> = {
  'DeEsser Pro': [
    { id: 'cat_19', name: 'Nectar 4 De-esser', manufacturer: 'iZotope', slug: 'nectar-4-de-esser', similarityScore: 0.86, similarityReasons: 'Same job (de-esser), similar tone' },
    { id: 'cat_20', name: 'Soothe2', manufacturer: 'oeksound', slug: 'soothe2', similarityScore: 0.71 },
  ],
  'Neve 1073': [
    { id: 'cat_8', name: 'Pultec EQP-1A', manufacturer: 'Universal Audio', slug: 'pultec-eqp-1a', similarityScore: 0.74, similarityReasons: 'Vintage console-style EQ, warm' },
  ],
  Bigsky: [
    { id: 'cat_9', name: 'ValhallaRoom', manufacturer: 'Valhalla DSP', slug: 'valhallaroom', similarityScore: 0.8, similarityReasons: 'Lush algorithmic reverb' },
    { id: 'cat_4', name: 'Pro-R', manufacturer: 'FabFilter', slug: 'pro-r', similarityScore: 0.7 },
  ],
};
