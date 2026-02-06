// Plugin description from the native side
export interface PluginDescription {
  id: string;
  name: string;
  manufacturer: string;
  category: string;
  format: 'VST3' | 'AudioUnit' | string;
  uid: number;
  fileOrIdentifier: string;
  isInstrument: boolean;
  numInputChannels: number;
  numOutputChannels: number;
  version: string;
}

// A slot in the plugin chain
export interface ChainSlot {
  index: number;
  name: string;
  format: string;
  uid: number;
  fileOrIdentifier: string;
  bypassed: boolean;
  manufacturer: string;
}

// Current chain state
export interface ChainState {
  slots: ChainSlot[];
  numSlots: number;
}

// Preset information
export interface PresetInfo {
  name: string;
  category: string;
  path: string;
  lastModified: string;
}

// Scan progress
export interface ScanProgress {
  scanning: boolean;
  progress: number;
  currentPlugin: string;
}

// Waveform data
export interface WaveformData {
  pre: number[];
  post: number[];
}

// FFT data from spectrum analyzer
export interface FFTData {
  magnitudes: number[];
  sampleRate: number;
  fftSize: number;
}

// Meter data
export interface MeterData {
  inputPeakL: number;
  inputPeakR: number;
  inputPeakHoldL: number;
  inputPeakHoldR: number;
  inputRmsL: number;
  inputRmsR: number;
  inputLufs: number;
  outputPeakL: number;
  outputPeakR: number;
  outputPeakHoldL: number;
  outputPeakHoldR: number;
  outputRmsL: number;
  outputRmsR: number;
  outputLufs: number;
}

// Gain settings
export interface GainSettings {
  inputGainDB: number;
  outputGainDB: number;
}

// =============================================
// Tree-based chain node types (V2)
// =============================================

export type ChainNodeUI = PluginNodeUI | GroupNodeUI;

export interface PluginNodeUI {
  id: number;
  type: 'plugin';
  name: string;
  format: string;
  uid: number;
  fileOrIdentifier: string;
  bypassed: boolean;
  manufacturer: string;
  branchGainDb: number;
  solo: boolean;
  mute: boolean;
}

export interface GroupNodeUI {
  id: number;
  type: 'group';
  name: string;
  mode: 'serial' | 'parallel';
  dryWet: number;
  collapsed: boolean;
  children: ChainNodeUI[];
}

// V2 chain state with tree structure
export interface ChainStateV2 {
  nodes: ChainNodeUI[];
  slots?: ChainSlot[];    // backward compat
  numSlots?: number;
}

// API response types
export interface ApiResponse<T = void> {
  success: boolean;
  error?: string;
  chainState?: ChainStateV2;
  presetList?: PresetInfo[];
  preset?: PresetInfo;
  message?: string;
  data?: T;
}

// Native function types for JUCE bridge
export type NativeFunction = (...args: unknown[]) => Promise<unknown>;

// JUCE WebView interface
declare global {
  interface Window {
    __JUCE__?: {
      backend: {
        addEventListener: (event: string, handler: (data: unknown) => void) => void;
        removeEventListener: (event: string, handler: (data: unknown) => void) => void;
      };
      getNativeFunction: (name: string) => NativeFunction;
    };
  }
}
