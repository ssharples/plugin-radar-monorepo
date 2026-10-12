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

// Per-node meter readings (from NodeMeterProcessor)
export interface NodeMeterReadings {
  peakL: number;
  peakR: number;
  peakHoldL: number;
  peakHoldR: number;
  inputPeakL: number;
  inputPeakR: number;
  inputPeakHoldL: number;
  inputPeakHoldR: number;
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
  suspended?: boolean;
  recallSafe?: boolean;      // chain and preset loads keep this slot
  ignoreLatency?: boolean;   // left out of delay compensation
  latencySamples?: number;   // latency the plugin reports
  polarityInverted?: boolean;
  persistentId?: string;
  missing?: boolean;
  loadError?: string;
}

export interface GroupNodeUI {
  id: number;
  type: 'group';
  name: string;
  mode: 'serial' | 'parallel';
  dryWet: number;
  collapsed: boolean;
  polarityInverted?: boolean;
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
  requestId?: number;
  status?: 'committed' | 'partial' | 'failed' | 'superseded';
  issues?: Array<{ name: string; reason: string }>;
}

export interface LoadProgress {
  requestId: number;
  path: string;
  status: 'loading' | 'validating' | 'committing' | 'committed' | 'partial' | 'failed' | 'superseded';
  completed: number;
  total: number;
  currentPlugin?: string;
  issues?: Array<{ name: string; reason: string }>;
}

export interface AutomationBinding {
  proxyId: string;
  pluginId: string;
  parameterIndex: number;
  parameterId: string;
  parameterName: string;
}

export interface AutomationBindingsResponse {
  success: boolean;
  capacity: 2048;
  used: number;
  bindings: AutomationBinding[];
  error?: string;
}

// =============================================
// Macro types
// =============================================

export interface MacroLinkUI {
  pluginId: string;
  parameterId: string;
  nodeId: number;          // -1 when the plugin is missing
  pluginName: string;
  parameterName: string;
  min: number;             // 0-1, parameter value with the macro at 0
  max: number;             // 0-1, parameter value with the macro at 1
  available: boolean;
}

export interface MacroUI {
  index: number;
  name: string;
  value: number;
  links: MacroLinkUI[];
}

export interface MacrosResponse {
  success: boolean;
  macros?: MacroUI[];
  error?: string;
}

// =============================================
// Chain browser types
// =============================================

export interface BrowseChainResult {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  category: string;
  tags: string[];
  useCase?: string;
  useCaseGroup?: string;
  pluginCount: number;
  downloads: number;
  likes: number;
  isPublic: boolean;
  pluginIds?: string[];
  slots: any[];
  author?: { name?: string; avatarUrl?: string };
  targetInputLufs?: number;
  createdAt: number;
}

export interface BrowseChainsPaginatedResult {
  chains: BrowseChainResult[];
  total: number;
  hasMore: boolean;
}

export interface CollectionItem {
  _id: string;
  chain: BrowseChainResult & { author?: { name?: string; avatarUrl?: string } };
  addedAt: number;
  source: string;
  notes?: string;
}

// Blacklisted plugin event (from scanner)
export interface BlacklistedPluginEvent {
  path: string
  name: string
  reason: string // 'crash' | 'scan-failure' | 'timeout'
}

// =============================================
// Cross-Instance Awareness types
// =============================================

export interface OtherInstanceInfo {
  id: number;
  trackName: string;
  pluginCount: number;
  pluginNames: string[];
}

export interface MirrorPartner {
  id: number;
  trackName: string;
}

export interface MirrorState {
  isMirrored: boolean;
  mirrorGroupId: number | null;
  partners: MirrorPartner[];
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
