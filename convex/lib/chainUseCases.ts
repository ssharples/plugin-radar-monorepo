// Chain use-case taxonomy — validation copy for Convex runtime
// (Convex cannot import from packages/shared)
// Keep in sync with packages/shared/src/chainUseCases.ts

export const CHAIN_USE_CASE_GROUPS = [
  {
    value: 'vocals',
    useCases: ['rap-vocals', 'female-vocals', 'male-vocals', 'backings', 'adlibs', 'harmonies', 'spoken-word'],
  },
  {
    value: 'drums',
    useCases: ['kick', 'snare', 'hats', 'drum-bus', 'overheads', 'toms', 'percussion'],
  },
  {
    value: 'bass',
    useCases: ['bass-guitar', 'sub-bass', '808', 'synth-bass'],
  },
  {
    value: 'keys-synths',
    useCases: ['piano', 'pads', 'leads', 'organs', 'strings'],
  },
  {
    value: 'guitar',
    useCases: ['electric-guitar', 'acoustic-guitar', 'guitar-bus'],
  },
  {
    value: 'fx-creative',
    useCases: ['experimental', 'sound-design', 'ambient', 'risers-impacts'],
  },
  {
    value: 'mixing-mastering',
    useCases: ['mix-bus', 'master-chain', 'stem-mixing', 'live-performance'],
  },
] as const;

/** All valid use-case values */
export const ALL_CHAIN_USE_CASES: string[] = CHAIN_USE_CASE_GROUPS.flatMap(
  (g) => [...g.useCases]
);

/** Reverse map: useCase → group */
export const USE_CASE_TO_GROUP: Record<string, string> = {};
for (const group of CHAIN_USE_CASE_GROUPS) {
  for (const uc of group.useCases) {
    USE_CASE_TO_GROUP[uc] = group.value;
  }
}

/** All valid group values */
export const ALL_CHAIN_USE_CASE_GROUPS: string[] = CHAIN_USE_CASE_GROUPS.map(
  (g) => g.value
);

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
