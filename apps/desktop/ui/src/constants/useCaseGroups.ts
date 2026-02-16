export interface UseCaseOption {
  value: string;
  label: string;
}

export interface UseCaseGroup {
  value: string;
  label: string;
  useCases: UseCaseOption[];
}

export const USE_CASE_GROUPS: UseCaseGroup[] = [
  { value: 'vocals', label: 'Vocals', useCases: [
    { value: 'rap-vocals', label: 'Rap Vocals' },
    { value: 'female-vocals', label: 'Female Vocals' },
    { value: 'male-vocals', label: 'Male Vocals' },
    { value: 'backings', label: 'Backings' },
    { value: 'adlibs', label: 'Adlibs' },
    { value: 'harmonies', label: 'Harmonies' },
    { value: 'spoken-word', label: 'Spoken Word' },
  ]},
  { value: 'drums', label: 'Drums', useCases: [
    { value: 'kick', label: 'Kick' },
    { value: 'snare', label: 'Snare' },
    { value: 'hats', label: 'Hats' },
    { value: 'drum-bus', label: 'Drum Bus' },
    { value: 'overheads', label: 'Overheads' },
    { value: 'toms', label: 'Toms' },
    { value: 'percussion', label: 'Percussion' },
  ]},
  { value: 'bass', label: 'Bass', useCases: [
    { value: 'bass-guitar', label: 'Bass Guitar' },
    { value: 'sub-bass', label: 'Sub Bass' },
    { value: '808', label: '808' },
    { value: 'synth-bass', label: 'Synth Bass' },
  ]},
  { value: 'keys-synths', label: 'Keys & Synths', useCases: [
    { value: 'piano', label: 'Piano' },
    { value: 'pads', label: 'Pads' },
    { value: 'leads', label: 'Leads' },
    { value: 'organs', label: 'Organs' },
    { value: 'strings', label: 'Strings' },
  ]},
  { value: 'guitar', label: 'Guitar', useCases: [
    { value: 'electric-guitar', label: 'Electric Guitar' },
    { value: 'acoustic-guitar', label: 'Acoustic Guitar' },
    { value: 'guitar-bus', label: 'Guitar Bus' },
  ]},
  { value: 'fx-creative', label: 'FX & Creative', useCases: [
    { value: 'experimental', label: 'Experimental' },
    { value: 'sound-design', label: 'Sound Design' },
    { value: 'ambient', label: 'Ambient' },
    { value: 'risers-impacts', label: 'Risers & Impacts' },
  ]},
  { value: 'mixing-mastering', label: 'Mixing & Mastering', useCases: [
    { value: 'mix-bus', label: 'Mix Bus' },
    { value: 'master-chain', label: 'Master Chain' },
    { value: 'stem-mixing', label: 'Stem Mixing' },
    { value: 'live-performance', label: 'Live Performance' },
  ]},
];
