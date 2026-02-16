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

// Group template information
export interface GroupTemplateInfo {
  name: string;
  category: string;
  path: string;
  lastModified: string;
  mode: 'serial' | 'parallel';
  pluginCount: number;
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

// FFT data from spectrum analyzer (stereo)
export interface FFTData {
  magnitudes: number[];      // Mono average (backward compat)
  magnitudesL?: number[];    // Left channel magnitudes
  magnitudesR?: number[];    // Right channel magnitudes
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
  inputAvgPeakDbL: number;
  inputAvgPeakDbR: number;
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
  rmsL: number;
  rmsR: number;
  inputPeakL: number;
  inputPeakR: number;
  inputPeakHoldL: number;
  inputPeakHoldR: number;
  inputRmsL: number;
  inputRmsR: number;
  latencyMs?: number;
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
  // Per-plugin controls
  inputGainDb: number;
  outputGainDb: number;
  pluginDryWet: number;
  sidechainSource: number;
  midSideMode: number;  // 0=off, 1=mid, 2=side, 3=midside
  hasSidechain: boolean;
  latency?: number;
}

export interface GroupNodeUI {
  id: number;
  type: 'group';
  name: string;
  mode: 'serial' | 'parallel';
  dryWet: number;
  duckAmount: number;
  duckReleaseMs: number;
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
  templateList?: GroupTemplateInfo[];
  groupId?: number;
  message?: string;
  data?: T;
}

// =============================================
// Chain browser types
// =============================================

export interface BrowseChainSlot {
  pluginName: string;
  manufacturer: string;
  format?: string;
  uid?: number;
  fileOrIdentifier?: string;
  version?: string;
  bypassed?: boolean;
  presetData?: string;
  presetSizeBytes?: number;
  presetName?: string;
  position?: number;
  matchedPlugin?: string;
  notes?: string;
  parameters?: Array<{
    name: string;
    value: string;
    normalizedValue?: number;
    semantic?: string;
    unit?: string;
  }>;
  pluginData?: {
    name: string;
    slug: string;
    imageUrl?: string;
  };
}

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
  slots: BrowseChainSlot[];
  author?: { name?: string; avatarUrl?: string };
  targetInputLufs?: number;
  targetInputPeakMin?: number;
  targetInputPeakMax?: number;
  createdAt: number;
  forks?: number;
  views?: number;
  genre?: string;
  averageRating?: number;
  updatedAt?: number;
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

// Chain import result with slot-level detail
export interface ChainImportResult {
  success: boolean;
  totalSlots: number;
  loadedSlots: number;
  failedSlots: number;
  failures?: Array<{ position: number; pluginName: string; reason: string }>;
  chainState?: ChainStateV2;
  error?: string;
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
  mirrorGroupId: number;   // -1 if not mirrored
  isLeader: boolean;
  isFollower: boolean;
}

export interface MirrorPartner {
  id: number;
  trackName: string;
}

export interface MirrorState {
  isMirrored: boolean;
  isLeader: boolean;
  mirrorGroupId: number | null;
  partners: MirrorPartner[];
}

// =============================================
// Scanner management types
// =============================================

export interface CustomScanPath {
  path: string;
  format: string;
  isDefault: boolean;
}

export interface DeactivatedPlugin {
  identifier: string;
  name: string;
  manufacturer: string;
  format: string;
}

export interface AutoScanState {
  enabled: boolean;
  intervalMs: number;
  lastCheckTime: number;
}

export interface NewPluginsDetectedEvent {
  count: number;
  plugins: Array<{ path: string; format: string }>;
}

export interface PluginDescriptionWithStatus extends PluginDescription {
  isDeactivated?: boolean;
}

// Inline editor mode state (plugin editor embedded in host window)
export interface InlineEditorState {
  mode: 'webview' | 'plugin';
  nodeId?: number;
}

// Unified chain item for merged local + cloud view
export type UnifiedChainItem =
  | { source: 'local'; data: PresetInfo }
  | { source: 'cloud'; data: BrowseChainResult }
  | { source: 'both'; localData: PresetInfo; cloudData: BrowseChainResult };

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
