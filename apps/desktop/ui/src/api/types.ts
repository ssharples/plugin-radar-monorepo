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

// Backup information
export interface BackupInfo {
  name: string;
  path: string;
  timestamp: number;
}

// Group template information
export interface GroupTemplateInfo {
  name: string;
  category: string;
  path: string;
  lastModified: string;
  mode: 'serial' | 'parallel' | 'midside' | 'fxselector';
  pluginCount: number;
}

// Scan progress
export interface ScanProgress {
  scanning: boolean;
  progress: number;
  currentPlugin: string;
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
  inputLufs?: number;
  outputLufs?: number;
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
  isDryPath?: boolean;
  manufacturer: string;
  branchGainDb: number;
  mute: boolean;
  solo: boolean;
  // Per-plugin controls
  inputGainDb: number;
  outputGainDb: number;
  pluginDryWet: number;
  midSideMode: number;  // 0=off, 1=mid, 2=side, 3=midside
  latency?: number;
  autoGainEnabled?: boolean;
  duckEnabled: boolean;
  duckThresholdDb: number;
  duckAttackMs: number;
  duckReleaseMs: number;
}

export interface GroupNodeUI {
  id: number;
  type: 'group';
  name: string;
  mode: 'serial' | 'parallel' | 'midside' | 'fxselector';
  dryWet: number;
  wetGainDb: number;
  bypassed: boolean;
  collapsed: boolean;
  activeChildIndex?: number;  // FXSelector only
  children: ChainNodeUI[];
}

// V2 chain state with tree structure
// Latency warning from C++ when chain latency exceeds thresholds
export interface LatencyWarning {
  level: 'high' | 'extreme';
  latencyMs: number;
  latencySamples: number;
  message: string;
}

export interface ChainStateV2 {
  nodes: ChainNodeUI[];
  slots?: ChainSlot[];    // backward compat
  numSlots?: number;
  totalLatencySamples?: number;
  sampleRate?: number;
}

// =============================================
// Exported chain data (from exportChainWithPresets)
// =============================================

export interface ExportedChainData {
  version: number;
  numSlots: number;
  nodes: ChainNodeUI[];
  slots: ExportedSlot[];
}

export interface ExportedSlot {
  index: number;
  name: string;
  manufacturer: string;
  format: string;
  uid: number;
  fileOrIdentifier: string;
  version: string;
  bypassed: boolean;
  isInstrument: boolean;
  numInputChannels: number;
  numOutputChannels: number;
  presetData?: string;
  presetSizeBytes?: number;
}

// API response types
export interface ApiResponse<T = void> {
  success: boolean;
  error?: string;
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
  treeData?: string;
  signalSnapshot?: {
    inputPeakDb: number;
    inputRmsDb: number;
    inputLufs?: number;
    spectralCentroid?: number;
    crestFactor?: number;
    dynamicRangeDb?: number;
    sampleRate: number;
    capturedAt: number;
  };
  educatorAnnotation?: {
    narrative: string;
    difficulty?: string;
    prerequisites?: string[];
    listenFor?: string;
  };
  sourceInstrument?: string;
  signalType?: string;
  bpm?: number;
  subGenre?: string;
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

// Cross-format substitution (AU→VST3 or vice versa)
export interface FormatSubstitution {
  pluginName: string;
  savedFormat: string;
  loadedFormat: string;
  hasPresetData?: boolean;   // true when preset data was present (settings may differ)
}

// Catalog-mediated cross-format alias group (AU↔VST3 variants of the same plugin)
export interface CrossFormatAliasGroup {
  catalogId: string;
  variants: Array<{ name: string; manufacturer: string; format: string }>;
}

// Chain import result with slot-level detail
export interface ChainImportResult {
  success: boolean;
  totalSlots: number;
  loadedSlots: number;
  failedSlots: number;
  failures?: Array<{ position: number; pluginName: string; reason: string }>;
  formatSubstitutions?: FormatSubstitution[];
  error?: string;
}

// AI parameter translation result
export interface AiParameterMapping {
  params: Array<{ index: number; name: string; value: number; confidence: number }>;
  confidence: number;
}

// AI cross-format alias suggestion result
export interface AiFormatAliasResult {
  matched: boolean;
  name?: string;
  manufacturer?: string;
  confidence?: number;
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

export interface AutomationSlotWarning {
  totalPlugins: number;
  maxSlots: number;
  unautomatablePlugins: string[];
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
