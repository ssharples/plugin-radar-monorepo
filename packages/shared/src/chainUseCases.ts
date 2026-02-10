// Chain use-case taxonomy — two-level hierarchy: group → useCases
// Used by both web app and desktop plugin UI

export interface ChainUseCase {
  value: string;
  label: string;
}

export interface ChainUseCaseGroup {
  value: string;
  label: string;
  emoji: string;
  useCases: ChainUseCase[];
}

export const CHAIN_USE_CASE_GROUPS: ChainUseCaseGroup[] = [
  {
    value: 'vocals',
    label: 'Vocals',
    emoji: '🎤',
    useCases: [
      { value: 'rap-vocals', label: 'Rap Vocals' },
      { value: 'female-vocals', label: 'Female Vocals' },
      { value: 'male-vocals', label: 'Male Vocals' },
      { value: 'backings', label: 'Backings' },
      { value: 'adlibs', label: 'Adlibs' },
      { value: 'harmonies', label: 'Harmonies' },
      { value: 'spoken-word', label: 'Spoken Word' },
    ],
  },
  {
    value: 'drums',
    label: 'Drums',
    emoji: '🥁',
    useCases: [
      { value: 'kick', label: 'Kick' },
      { value: 'snare', label: 'Snare' },
      { value: 'hats', label: 'Hats' },
      { value: 'drum-bus', label: 'Drum Bus' },
      { value: 'overheads', label: 'Overheads' },
      { value: 'toms', label: 'Toms' },
      { value: 'percussion', label: 'Percussion' },
    ],
  },
  {
    value: 'bass',
    label: 'Bass',
    emoji: '🎸',
    useCases: [
      { value: 'bass-guitar', label: 'Bass Guitar' },
      { value: 'sub-bass', label: 'Sub Bass' },
      { value: '808', label: '808' },
      { value: 'synth-bass', label: 'Synth Bass' },
    ],
  },
  {
    value: 'keys-synths',
    label: 'Keys & Synths',
    emoji: '🎹',
    useCases: [
      { value: 'piano', label: 'Piano' },
      { value: 'pads', label: 'Pads' },
      { value: 'leads', label: 'Leads' },
      { value: 'organs', label: 'Organs' },
      { value: 'strings', label: 'Strings' },
    ],
  },
  {
    value: 'guitar',
    label: 'Guitar',
    emoji: '🎸',
    useCases: [
      { value: 'electric-guitar', label: 'Electric Guitar' },
      { value: 'acoustic-guitar', label: 'Acoustic Guitar' },
      { value: 'guitar-bus', label: 'Guitar Bus' },
    ],
  },
  {
    value: 'fx-creative',
    label: 'FX & Creative',
    emoji: '✨',
    useCases: [
      { value: 'experimental', label: 'Experimental' },
      { value: 'sound-design', label: 'Sound Design' },
      { value: 'ambient', label: 'Ambient' },
      { value: 'risers-impacts', label: 'Risers & Impacts' },
    ],
  },
  {
    value: 'mixing-mastering',
    label: 'Mixing & Mastering',
    emoji: '🎚️',
    useCases: [
      { value: 'mix-bus', label: 'Mix Bus' },
      { value: 'master-chain', label: 'Master Chain' },
      { value: 'stem-mixing', label: 'Stem Mixing' },
      { value: 'live-performance', label: 'Live Performance' },
    ],
  },
];

/** Flat array of all use-case values */
export const ALL_CHAIN_USE_CASES: string[] = CHAIN_USE_CASE_GROUPS.flatMap(
  (g) => g.useCases.map((uc) => uc.value)
);

/** Reverse map: useCase value → group value */
export const USE_CASE_TO_GROUP: Record<string, string> = {};
for (const group of CHAIN_USE_CASE_GROUPS) {
  for (const uc of group.useCases) {
    USE_CASE_TO_GROUP[uc.value] = group.value;
  }
}

/** Legacy category values for backward compatibility */
export const LEGACY_CHAIN_CATEGORIES = [
  'vocal', 'drums', 'bass', 'guitar', 'keys',
  'mixing', 'mastering', 'creative', 'live',
] as const;

export type LegacyChainCategory = typeof LEGACY_CHAIN_CATEGORIES[number];

/** Map legacy categories to new groups */
export const LEGACY_TO_GROUP: Record<string, string> = {
  'vocal': 'vocals',
  'drums': 'drums',
  'bass': 'bass',
  'guitar': 'guitar',
  'keys': 'keys-synths',
  'mixing': 'mixing-mastering',
  'mastering': 'mixing-mastering',
  'creative': 'fx-creative',
  'live': 'mixing-mastering',
};
