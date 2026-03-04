import type {
  PluginDescription,
  PluginDescriptionWithStatus,
  ChainStateV2,
  PresetInfo,
  GroupTemplateInfo,
  ScanProgress,
  ApiResponse,
  NodeMeterReadings,
  GainSettings,
  BlacklistedPluginEvent,
  OtherInstanceInfo,
  MirrorState,
  CustomScanPath,
  DeactivatedPlugin,
  AutoScanState,
  NewPluginsDetectedEvent,
  InlineEditorState,
  AutomationSlotWarning,
  LatencyWarning,
  BackupInfo,
  ExportedChainData,
} from './types';

type EventHandler<T> = (data: T) => void;

// Gate verbose logging behind DEV mode — in production JUCE WebView contexts,
// console.log serializes through the bridge and is extremely expensive at 30fps.
const DEBUG_BRIDGE = import.meta.env.DEV;

// Default timeout for native calls (10 seconds)
const DEFAULT_TIMEOUT_MS = 10000;

// Custom error class for timeout errors
class NativeCallTimeoutError extends Error {
  constructor(functionName: string, timeoutMs: number) {
    super(`Native function '${functionName}' timed out after ${timeoutMs}ms`);
    this.name = 'NativeCallTimeoutError';
  }
}

// Promise handler for native function calls (mirrors JUCE's index.js)
class PromiseHandler {
  private lastPromiseId = 0;
  private promises = new Map<number, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>();

  constructor() {
    // Listen for completion events from JUCE backend
    const juce = (window as any).__JUCE__;
    if (juce?.backend?.addEventListener) {
      juce.backend.addEventListener("__juce__complete", (data: { promiseId: number; result: unknown }) => {
        if (DEBUG_BRIDGE) console.log('Received __juce__complete:', data);
        if (this.promises.has(data.promiseId)) {
          this.promises.get(data.promiseId)!.resolve(data.result);
          this.promises.delete(data.promiseId);
        }
      });
    }
  }

  createPromise(): [number, Promise<unknown>] {
    const promiseId = this.lastPromiseId++;
    const promise = new Promise<unknown>((resolve, reject) => {
      this.promises.set(promiseId, { resolve, reject });
    });
    return [promiseId, promise];
  }

  /**
   * Clean up a pending promise handler (e.g., on timeout)
   * Prevents memory leaks by removing the promise from the map
   */
  cleanupPromise(promiseId: number): void {
    this.promises.delete(promiseId);
  }

  /**
   * Check if a promise is still pending
   */
  hasPendingPromise(promiseId: number): boolean {
    return this.promises.has(promiseId);
  }
}

let promiseHandler: PromiseHandler | null = null;

class JuceBridge {
  private isNative: boolean;
  private eventHandlers: Map<string, Set<EventHandler<unknown>>> = new Map();

  constructor() {
    this.isNative = typeof (window as any).__JUCE__ !== 'undefined';
    if (DEBUG_BRIDGE) console.log('JuceBridge initialized, isNative:', this.isNative);

    if (this.isNative && !promiseHandler) {
      promiseHandler = new PromiseHandler();
    }

    this.setupEventListeners();
  }

  private setupEventListeners() {
    if (!this.isNative) return;

    const events = [
      'pluginListChanged',
      'chainChanged',
      'scanProgress',
      'presetListChanged',
      'presetLoaded',
      'gainChanged',
      'matchLockWarning',
      'nodeMeterData',
      'pluginBlacklisted',
      'blacklistChanged',
      'instancesChanged',
      'mirrorStateChanged',
      'mirrorUpdateApplied',
      'sendChainComplete',
      'pluginParameterChangeSettled',
      'templateListChanged',
      'deactivationChanged',
      'newPluginsDetected',
      'autoScanStateChanged',
      'inlineEditorChanged',
      'searchOverlayOpened',
      'searchOverlayClosed',
      'masterDryWetChanged',
      'automationSlotWarning',
      'latencyWarning',
    ];

    events.forEach((eventName) => {
      window.__JUCE__?.backend.addEventListener(eventName, (data) => {
        if (DEBUG_BRIDGE) console.log(`[JuceBridge] Event received: ${eventName}`, data);
        this.emitLocalEvent(eventName, data);
      });
    });
  }

  private emitLocalEvent(event: string, data: unknown) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(data));
    }
  }

  /**
   * Call a native JUCE function with optional timeout
   * @param name - The native function name
   * @param args - Arguments to pass. Last argument can be an options object with { timeout?: number }
   * @returns Promise that resolves with the result or rejects on timeout/error
   */
  private async callNative<T>(name: string, ...args: unknown[]): Promise<T> {
    // Check if last argument is an options object with timeout
    let timeoutMs = DEFAULT_TIMEOUT_MS;
    let actualArgs = args;

    if (args.length > 0) {
      const lastArg = args[args.length - 1];
      if (lastArg && typeof lastArg === 'object' && '__callOptions' in (lastArg as object)) {
        const options = lastArg as { __callOptions: true; timeout?: number };
        timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
        actualArgs = args.slice(0, -1);
      }
    }

    if (DEBUG_BRIDGE) console.log(`callNative: ${name}`, actualArgs, `(timeout: ${timeoutMs}ms)`);

    if (!this.isNative) {
      if (DEBUG_BRIDGE) console.warn(`Native function ${name} called in non-native environment`);
      return {} as T;
    }

    if (!promiseHandler) {
      console.error('PromiseHandler not initialized');
      throw new Error('PromiseHandler not initialized');
    }

    const backend = (window as any).__JUCE__?.backend;
    if (!backend) {
      console.error('JUCE backend not found');
      throw new Error('JUCE backend not found');
    }

    // Use JUCE 8's event-based mechanism for native function calls
    const [promiseId, promise] = promiseHandler.createPromise();
    if (DEBUG_BRIDGE) console.log(`Emitting __juce__invoke for ${name} with promiseId ${promiseId}`);

    backend.emitEvent("__juce__invoke", {
      name: name,
      params: actualArgs,
      resultId: promiseId,
    });

    // Create timeout promise
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        // Clean up the pending promise handler to prevent memory leaks
        if (promiseHandler?.hasPendingPromise(promiseId)) {
          if (DEBUG_BRIDGE) console.warn(`[JuceBridge] Native function '${name}' timed out after ${timeoutMs}ms (promiseId: ${promiseId})`);
          promiseHandler.cleanupPromise(promiseId);
        }
        reject(new NativeCallTimeoutError(name, timeoutMs));
      }, timeoutMs);
    });

    try {
      // Race between the actual promise and the timeout
      const result = await Promise.race([promise, timeoutPromise]);
      if (DEBUG_BRIDGE) console.log(`Native function ${name} returned:`, result);
      return result as T;
    } catch (error) {
      if (error instanceof NativeCallTimeoutError) {
        console.error(`[JuceBridge] Timeout error:`, error.message);
      } else {
        console.error(`Error calling native function ${name}:`, error);
      }
      throw error;
    } finally {
      // Always clean up: clear the timeout timer and remove any orphaned promise entry.
      // - If native resolved first: clearTimeout prevents the timeout from firing;
      //   __juce__complete already deleted from map, so cleanupPromise is a no-op.
      // - If timeout fired first: timer already ran, cleanupPromise already called
      //   in the timeout handler, but we ensure the timer ref is cleared here too.
      clearTimeout(timeoutId!);
      promiseHandler!.cleanupPromise(promiseId);
    }
  }

  /**
   * Call a native JUCE function with a custom timeout
   * Use this for operations that may take longer than the default 10 seconds
   * @param name - The native function name
   * @param timeoutMs - Custom timeout in milliseconds
   * @param args - Arguments to pass to the native function
   */
  async callNativeWithTimeout<T>(name: string, timeoutMs: number, ...args: unknown[]): Promise<T> {
    return this.callNative<T>(name, ...args, { __callOptions: true, timeout: timeoutMs });
  }

  /**
   * Call a native JUCE function with a JSON-stringified object argument.
   * Shorthand for `this.callNative(name, JSON.stringify(data))`.
   */
  private callNativeJson<T = void>(name: string, data: Record<string, unknown>): Promise<T> {
    return this.callNative<T>(name, JSON.stringify(data));
  }

  // Event subscription
  on<T>(event: string, handler: EventHandler<T>): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler as EventHandler<unknown>);

    return () => {
      this.eventHandlers.get(event)?.delete(handler as EventHandler<unknown>);
    };
  }

  // Plugin list
  async getPluginList(): Promise<PluginDescription[]> {
    return this.callNative<PluginDescription[]>('getPluginList');
  }

  // Scanning
  async startScan(rescanAll = false): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('startScan', rescanAll);
  }

  async getScanProgress(): Promise<ScanProgress> {
    return this.callNative<ScanProgress>('getScanProgress');
  }

  onScanProgress(handler: EventHandler<ScanProgress>): () => void {
    return this.on('scanProgress', handler);
  }

  onPluginListChanged(handler: EventHandler<PluginDescription[]>): () => void {
    return this.on('pluginListChanged', handler);
  }

  // Chain management
  async getChainState(): Promise<ChainStateV2> {
    return this.callNative<ChainStateV2>('getChainState');
  }

  async getTotalLatencySamples(): Promise<number> {
    return this.callNative<number>('getTotalLatencySamples');
  }

  async addPlugin(pluginId: string, insertIndex = -1): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('addPlugin', pluginId, insertIndex);
  }

  async removePlugin(slotIndex: number): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('removePlugin', slotIndex);
  }

  async movePlugin(fromIndex: number, toIndex: number): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('movePlugin', fromIndex, toIndex);
  }

  async setSlotBypassed(slotIndex: number, bypassed: boolean): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('setSlotBypassed', slotIndex, bypassed);
  }

  async openPluginUI(slotIndex: number): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('openPluginUI', slotIndex);
  }

  async closePluginUI(slotIndex: number): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('closePluginUI', slotIndex);
  }

  onChainChanged(handler: EventHandler<ChainStateV2>): () => void {
    return this.on('chainChanged', handler);
  }

  // Presets
  async getPresetList(): Promise<PresetInfo[]> {
    return this.callNative<PresetInfo[]>('getPresetList');
  }

  async savePreset(name: string, category: string): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('savePreset', name, category);
  }

  async loadPreset(path: string): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('loadPreset', path);
  }

  async deletePreset(path: string): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('deletePreset', path);
  }

  async renamePreset(path: string, newName: string): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('renamePreset', path, newName);
  }

  async getCategories(): Promise<string[]> {
    return this.callNative<string[]>('getCategories');
  }

  // Backups
  async getBackupList(): Promise<BackupInfo[]> {
    return this.callNative<BackupInfo[]>('getBackupList');
  }

  async restoreBackup(path: string): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('restoreBackup', path);
  }

  // Group Templates
  async getGroupTemplateList(): Promise<GroupTemplateInfo[]> {
    return this.callNative<GroupTemplateInfo[]>('getGroupTemplateList');
  }

  async saveGroupTemplate(groupId: number, name: string, category: string): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('saveGroupTemplate', { groupId, name, category });
  }

  async loadGroupTemplate(path: string, parentId: number, insertIndex: number): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('loadGroupTemplate', { path, parentId, insertIndex });
  }

  async renameGroupTemplate(path: string, newName: string): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('renameGroupTemplate', path, newName);
  }

  async deleteGroupTemplate(path: string): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('deleteGroupTemplate', path);
  }

  async getGroupTemplateCategories(): Promise<string[]> {
    return this.callNative<string[]>('getGroupTemplateCategories');
  }

  onTemplateListChanged(handler: EventHandler<GroupTemplateInfo[]>): () => void {
    return this.on('templateListChanged', handler);
  }

  onPresetListChanged(handler: EventHandler<PresetInfo[]>): () => void {
    return this.on('presetListChanged', handler);
  }

  onPresetLoaded(handler: EventHandler<PresetInfo | null>): () => void {
    return this.on('presetLoaded', handler);
  }

  // Gain control
  async setInputGain(dB: number): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('setInputGain', dB);
  }

  async setOutputGain(dB: number): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('setOutputGain', dB);
  }

  async getGainSettings(): Promise<GainSettings> {
    return this.callNative<GainSettings>('getGainSettings');
  }

  async calculateGainMatch(): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('calculateGainMatch');
  }

  async setMatchLock(enabled: boolean): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('setMatchLock', enabled);
  }

  async getMatchLockState(): Promise<{ matchLockEnabled: boolean }> {
    return this.callNative<{ matchLockEnabled: boolean }>('getMatchLockState');
  }

  async setMasterDryWet(value: number): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('setMasterDryWet', value);
  }

  async getMasterDryWet(): Promise<number> {
    return this.callNative<number>('getMasterDryWet');
  }

  async getSampleRate(): Promise<number> {
    return this.callNative<number>('getSampleRate');
  }

  async getBufferSize(): Promise<number> {
    return this.callNative<number>('getBufferSize');
  }

  async resetAllNodePeaks(): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('resetAllNodePeaks');
  }

  async setNodeMute(nodeId: number, muted: boolean): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('setNodeMute', { nodeId, muted });
  }

  // PHASE 2: Conditional metering - set global meter mode
  async setMeterMode(mode: 'peak' | 'full'): Promise<boolean> {
    return this.callNative<boolean>('setMeterMode', mode);
  }

  // Enable/disable per-node meters (reduces CPU when meters panel is hidden)
  async setNodeMetersEnabled(enabled: boolean): Promise<void> {
    return this.callNative<void>('setNodeMetersEnabled', enabled);
  }

  // Per-node meter data (inline plugin meters)
  // C++ sends packed string format for performance; handler parses it in JS.
  onNodeMeterData(handler: EventHandler<string | Record<string, NodeMeterReadings>>): () => void {
    return this.on('nodeMeterData', handler);
  }

  // Gain change events (from match lock auto-adjustment or autoCalibrate)
  onGainChanged(handler: EventHandler<{ inputGainDB?: number; outputGainDB?: number }>): () => void {
    return this.on('gainChanged', handler);
  }

  // Master dry/wet change event (from snapshot restore)
  onMasterDryWetChanged(handler: EventHandler<{ mix: number }>): () => void {
    return this.on('masterDryWetChanged', handler);
  }

  // Auto-calibrate input gain to match a target peak level
  async autoCalibrate(targetMidpointDb: number): Promise<{
    success: boolean;
    inputGainDB?: number;
    avgPeakDb?: number;
    adjustment?: number;
    error?: string;
  }> {
    return this.callNative('autoCalibrate', targetMidpointDb);
  }

  // Match lock warning events (when auto-disabled due to gain limit)
  onMatchLockWarning(handler: EventHandler<{ warning: string; matchLockEnabled: boolean }>): () => void {
    return this.on('matchLockWarning', handler);
  }

  onAutomationSlotWarning(handler: EventHandler<AutomationSlotWarning>): () => void {
    return this.on('automationSlotWarning', handler);
  }

  // Latency warning events (when chain latency exceeds thresholds)
  onLatencyWarning(handler: EventHandler<LatencyWarning | null>): () => void {
    return this.on('latencyWarning', handler);
  }

  // Plugin blacklist events (from scanner)
  onPluginBlacklisted(handler: EventHandler<BlacklistedPluginEvent>): () => void {
    return this.on('pluginBlacklisted', handler);
  }

  onBlacklistChanged(handler: EventHandler<unknown>): () => void {
    return this.on('blacklistChanged', handler);
  }

  // ============================================
  // Blacklist Management
  // ============================================

  async getBlacklist(): Promise<string[]> {
    return this.callNative<string[]>('getBlacklist');
  }

  async addToBlacklist(pluginId: string): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('addToBlacklist', pluginId);
  }

  async removeFromBlacklist(pluginId: string): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('removeFromBlacklist', pluginId);
  }

  async clearBlacklist(): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('clearBlacklist');
  }

  // ============================================
  // Latency Management
  // ============================================

  async refreshLatency(): Promise<boolean> {
    return this.callNative<boolean>('refreshLatency');
  }

  // ============================================
  // Parameter Discovery / Auto-Mapping
  // ============================================

  /**
   * Discover and semantically classify all parameters of a loaded plugin.
   * Returns a parameter map with semantic IDs, units, curves, and a confidence score.
   * Used for auto-generating parameter maps that can be uploaded to Convex.
   */
  async discoverPluginParameters(nodeId: number): Promise<{
    success: boolean;
    map?: {
      pluginName: string;
      manufacturer: string;
      category: string;
      confidence: number;
      matchedCount: number;
      totalCount: number;
      eqBandCount: number;
      eqBandParameterPattern: string;
      compHasParallelMix: boolean;
      compHasAutoMakeup: boolean;
      compHasLookahead: boolean;
      source: string;
      parameters: Array<{
        juceParamId: string;
        juceParamIndex: number;
        semantic: string;
        physicalUnit: string;
        mappingCurve: string;
        minValue: number;
        maxValue: number;
        defaultValue: number;
        numSteps: number;
        label: string;
        matched: boolean;
      }>;
    };
    error?: string;
  }> {
    return this.callNative('discoverPluginParameters', nodeId);
  }

  /**
   * Discover plugin parameters offline — creates a temporary instance without
   * adding the plugin to the chain. Used for batch scanning.
   * 30-second timeout since some plugins are slow to instantiate.
   */
  async discoverPluginParametersOffline(fileOrIdentifier: string): Promise<{
    success: boolean;
    map?: {
      pluginName: string;
      manufacturer: string;
      category: string;
      confidence: number;
      matchedCount: number;
      totalCount: number;
      eqBandCount: number;
      eqBandParameterPattern: string;
      compHasParallelMix: boolean;
      compHasAutoMakeup: boolean;
      compHasLookahead: boolean;
      source: string;
      parameters: Array<{
        juceParamId: string;
        juceParamIndex: number;
        semantic: string;
        physicalUnit: string;
        mappingCurve: string;
        minValue: number;
        maxValue: number;
        defaultValue: number;
        numSteps: number;
        label: string;
        matched: boolean;
      }>;
    };
    error?: string;
  }> {
    return this.callNativeWithTimeout('discoverPluginParametersOffline', 30000, fileOrIdentifier);
  }

  // ============================================
  // Parameter Translation / Plugin Swap
  // ============================================

  /**
   * Read all parameters from a loaded plugin instance by node ID.
   * Returns parameter names, indices, and current normalized values.
   */
  async readPluginParameters(nodeId: number): Promise<{
    success: boolean;
    parameters?: Array<{
      name: string;
      index: number;
      normalizedValue: number;
      label: string;
      text: string;
      numSteps: number;
    }>;
    paramCount?: number;
    error?: string;
  }> {
    return this.callNative('readPluginParameters', nodeId);
  }

  /**
   * Apply translated parameters to a plugin instance.
   * @param nodeId - The chain node ID of the plugin
   * @param params - Array of {paramIndex, value} to apply
   */
  async applyPluginParameters(nodeId: number, params: Array<{ paramIndex: number; value: number }>): Promise<{
    success: boolean;
    appliedCount?: number;
    error?: string;
  }> {
    return this.callNativeJson('applyPluginParameters', { nodeId, params });
  }

  /**
   * Swap a plugin in the chain with a new one and apply translated parameters.
   * Removes the old plugin, inserts the new one at the same position, then applies params.
   * @param nodeId - The chain node ID of the plugin to replace
   * @param newPluginUid - The JUCE unique identifier string of the new plugin
   * @param translatedParams - Parameters to apply after swap
   */
  async swapPluginInChain(
    nodeId: number,
    newPluginUid: string,
    translatedParams: Array<{ paramIndex: number; value: number }>
  ): Promise<{
    success: boolean;
    newNodeId?: number;
    appliedParams?: number;
    error?: string;
  }> {
    return this.callNativeJson('swapPluginInChain', {
      nodeId,
      newPluginUid,
      translatedParams,
    });
  }

  // ============================================
  // Group Operations (V2 Tree API)
  // ============================================

  async createGroup(childIds: number[], mode: 'serial' | 'parallel', name: string): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('createGroup', { childIds, mode, name });
  }

  async dissolveGroup(groupId: number): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('dissolveGroup', { groupId });
  }

  async setGroupMode(groupId: number, mode: 'serial' | 'parallel' | 'midside' | 'fxselector'): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('setGroupMode', { groupId, mode });
  }

  async setActiveBranch(groupId: number, branchIndex: number): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('setActiveBranch', { groupId, branchIndex });
  }

  async setGroupDryWet(groupId: number, mix: number): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('setGroupDryWet', { groupId, mix });
  }

  async setGroupWetGain(groupId: number, gainDb: number): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('setGroupWetGain', { groupId, gainDb });
  }

  async setNodeDucking(nodeId: number, enabled: boolean, thresholdDb: number, attackMs: number, releaseMs: number): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('setNodeDucking', { nodeId, enabled, thresholdDb, attackMs, releaseMs });
  }

  async setBranchGain(nodeId: number, gainDb: number): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('setBranchGain', { nodeId, gainDb });
  }

  async setBranchMute(nodeId: number, mute: boolean): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('setBranchMute', { nodeId, mute });
  }

  async setBranchSolo(nodeId: number, solo: boolean): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('setBranchSolo', { nodeId, solo });
  }

  async moveNode(nodeId: number, newParentId: number, newIndex: number): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('moveNode', { nodeId, newParentId, newIndex });
  }

  async removeNode(nodeId: number): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('removeNode', { nodeId });
  }

  async addPluginToGroup(pluginId: string, parentId: number, insertIndex: number): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('addPluginToGroup', { pluginId, parentId, insertIndex });
  }

  async addDryPath(parentId: number, insertIndex = -1): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('addDryPath', { parentId, insertIndex });
  }

  async setNodeBypassed(nodeId: number, bypassed: boolean): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('setNodeBypassed', { nodeId, bypassed });
  }

  // Per-plugin controls
  async setNodeInputGain(nodeId: number, gainDb: number): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('setNodeInputGain', { nodeId, gainDb });
  }

  async setNodeOutputGain(nodeId: number, gainDb: number): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('setNodeOutputGain', { nodeId, gainDb });
  }

  async setNodeDryWet(nodeId: number, mix: number): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('setNodeDryWet', { nodeId, mix });
  }

  async setNodeMidSideMode(nodeId: number, mode: number): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('setNodeMidSideMode', { nodeId, mode });
  }

  // Per-plugin auto-gain compensation
  async setNodeAutoGain(nodeId: number, enabled: boolean): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('setNodeAutoGain', { nodeId, enabled });
  }

  async getNodeAutoGain(nodeId: number): Promise<{ enabled: boolean }> {
    return this.callNative<{ enabled: boolean }>('getNodeAutoGain', nodeId);
  }

  async duplicateNode(nodeId: number): Promise<ApiResponse> {
    return this.callNativeJson<ApiResponse>('duplicateNode', { nodeId });
  }

  // ============================================
  // Chain-level Toggle Controls
  // ============================================

  /**
   * Toggle all plugins bypass: if ANY are active, bypass all. If ALL are bypassed, enable all.
   */
  async toggleAllBypass(): Promise<{
    success: boolean;
    allBypassed: boolean;
    anyBypassed: boolean;
  }> {
    return this.callNative('toggleAllBypass');
  }

  /**
   * Get current bypass state for all plugins
   */
  async getAllBypassState(): Promise<{
    allBypassed: boolean;
    anyBypassed: boolean;
  }> {
    return this.callNative('getAllBypassState');
  }



  // ============================================
  // Signal Analysis
  // ============================================

  /**
   * Get a snapshot of the current input signal analysis from the C++ SignalAnalyzer.
   * Returns null if not available (e.g., no audio flowing or C++ not ready).
   */
  async getSignalSnapshot(): Promise<{
    inputPeakDb: number;
    inputRmsDb: number;
    inputLufs: number;
    spectralCentroid: number;
    crestFactor: number;
    dynamicRangeDb: number;
    sampleRate: number;
  } | null> {
    try {
      return await this.callNative('getSignalSnapshot');
    } catch {
      return null;
    }
  }

  // ============================================
  // Cloud Sharing - Export/Import with Presets
  // ============================================

  /**
   * Export the current chain with full preset data for cloud sharing.
   * C++ exportChainWithPresets() returns both nodes[] (full tree) and slots[] (flat).
   */
  async exportChain(): Promise<ExportedChainData> {
    return this.callNative<ExportedChainData>('exportChain');
  }

  /**
   * Import a chain with preset data (from cloud)
   */
  async importChain(data: unknown): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('importChain', data);
  }

  /**
   * Capture binary snapshot (fast A/B/C/D recall, 2-5x faster than exportChain)
   * Returns Base64-encoded snapshot data
   */
  async captureSnapshot(): Promise<string> {
    return this.callNative<string>('captureSnapshot');
  }

  /**
   * Restore binary snapshot (fast A/B/C/D recall)
   * @param snapshotData Base64-encoded snapshot data from captureSnapshot
   */
  async restoreSnapshot(snapshotData: string): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('restoreSnapshot', snapshotData);
  }

  /**
   * Get preset data for a single slot (Base64)
   */
  async getSlotPreset(slotIndex: number): Promise<{
    success: boolean;
    presetData?: string;
    sizeBytes?: number;
  }> {
    return this.callNative('getSlotPreset', slotIndex);
  }

  /**
   * Set preset data for a single slot (Base64)
   */
  async setSlotPreset(slotIndex: number, presetData: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    return this.callNative('setSlotPreset', slotIndex, presetData);
  }

  // ============================================
  // Cross-Instance Awareness
  // ============================================

  /**
   * Get all other running PluginChainManager instances in the DAW session.
   */
  async getOtherInstances(): Promise<OtherInstanceInfo[]> {
    return this.callNative<OtherInstanceInfo[]>('getOtherInstances');
  }

  /**
   * Copy the full chain (with presets) from another instance to this one.
   */
  async copyChainFromInstance(instanceId: number): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('copyChainFromInstance', instanceId);
  }

  /**
   * Subscribe to instance list changes (other instances added/removed/updated).
   */
  onInstancesChanged(handler: EventHandler<OtherInstanceInfo[]>): () => void {
    return this.on('instancesChanged', handler);
  }

  /**
   * Copy plugin state (preset data) from one node to another of the same plugin type.
   * NOTE: No C++ handler exists yet — returns failure immediately to avoid timeout.
   */
  async copyNodeState(_sourceNodeId: number, _targetNodeId: number): Promise<ApiResponse> {
    return { success: false, error: 'copyNodeState not implemented in C++ backend' };
  }

  /**
   * Send the current chain to another ProChain instance (push operation).
   */
  async sendChainToInstance(targetInstanceId: number): Promise<ApiResponse> {
    try {
      return await this.callNative<ApiResponse>('sendChainToInstance', targetInstanceId);
    } catch {
      return { success: false, error: 'sendChainToInstance not available in this build' };
    }
  }

  // ============================================
  // Chain Mirroring
  // ============================================

  /**
   * Start mirroring this instance's chain with another instance.
   * Both instances will stay in sync bidirectionally.
   */
  async startMirror(targetInstanceId: number): Promise<{ success: boolean; mirrorGroupId?: number; error?: string }> {
    return this.callNative('startMirror', targetInstanceId);
  }

  /**
   * Stop mirroring (leave the mirror group).
   */
  async stopMirror(): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('stopMirror');
  }

  /**
   * Get the current mirror state (whether mirrored, group ID, partners).
   */
  async getMirrorState(): Promise<MirrorState> {
    return this.callNative<MirrorState>('getMirrorState');
  }

  /**
   * Subscribe to send chain completion events (async result from sendChainToInstance).
   */
  onSendChainComplete(handler: EventHandler<{ success: boolean; error?: string }>): () => void {
    return this.on('sendChainComplete', handler);
  }

  /**
   * Subscribe to mirror state changes (started, stopped, partner changes).
   */
  onMirrorStateChanged(handler: EventHandler<MirrorState>): () => void {
    return this.on('mirrorStateChanged', handler);
  }

  /**
   * Subscribe to mirror update events (when a remote change is applied).
   */
  onMirrorUpdateApplied(handler: EventHandler<void>): () => void {
    return this.on('mirrorUpdateApplied', handler);
  }

  // ============================================
  // Oversampling Control
  // ============================================

  /**
   * Get the current oversampling factor (0=off, 1=2x, 2=4x).
   */
  async getOversamplingFactor(): Promise<number> {
    return this.callNative<number>('getOversamplingFactor');
  }

  /**
   * Set the oversampling factor. Triggers a full chain re-prepare.
   * @param factor 0=off, 1=2x, 2=4x
   */
  async setOversamplingFactor(factor: number): Promise<{
    success: boolean;
    factor?: number;
    latencyMs?: number;
    error?: string;
  }> {
    return this.callNative('setOversamplingFactor', factor);
  }

  /**
   * Get the current oversampling filter latency in milliseconds.
   */
  async getOversamplingLatencyMs(): Promise<number> {
    return this.callNative<number>('getOversamplingLatencyMs');
  }

  // ============================================
  // Custom Scan Paths
  // ============================================

  async getCustomScanPaths(): Promise<{ paths: CustomScanPath[] }> {
    return this.callNative<{ paths: CustomScanPath[] }>('getCustomScanPaths');
  }

  async addCustomScanPath(path: string, format: string): Promise<{ success: boolean; error?: string }> {
    return this.callNativeJson<{ success: boolean; error?: string }>('addCustomScanPath', { path, format });
  }

  async removeCustomScanPath(path: string, format: string): Promise<{ success: boolean }> {
    return this.callNativeJson<{ success: boolean }>('removeCustomScanPath', { path, format });
  }

  // ============================================
  // Plugin Deactivation / Removal
  // ============================================

  async deactivatePlugin(identifier: string): Promise<{ success: boolean }> {
    return this.callNative<{ success: boolean }>('deactivatePlugin', identifier);
  }

  async reactivatePlugin(identifier: string): Promise<{ success: boolean }> {
    return this.callNative<{ success: boolean }>('reactivatePlugin', identifier);
  }

  async getDeactivatedPlugins(): Promise<DeactivatedPlugin[]> {
    return this.callNative<DeactivatedPlugin[]>('getDeactivatedPlugins');
  }

  async removeKnownPlugin(identifier: string): Promise<{ success: boolean }> {
    return this.callNative<{ success: boolean }>('removeKnownPlugin', identifier);
  }

  async getPluginListIncludingDeactivated(): Promise<PluginDescriptionWithStatus[]> {
    return this.callNative<PluginDescriptionWithStatus[]>('getPluginListIncludingDeactivated');
  }

  // ============================================
  // Auto-Scan
  // ============================================

  async enableAutoScan(intervalMs: number): Promise<{ success: boolean }> {
    return this.callNative<{ success: boolean }>('enableAutoScan', intervalMs);
  }

  async disableAutoScan(): Promise<{ success: boolean }> {
    return this.callNative<{ success: boolean }>('disableAutoScan');
  }

  async getAutoScanState(): Promise<AutoScanState> {
    return this.callNative<AutoScanState>('getAutoScanState');
  }

  async checkForNewPlugins(): Promise<{ newCount: number; newPlugins: Array<{ path: string; format: string }> }> {
    return this.callNative<{ newCount: number; newPlugins: Array<{ path: string; format: string }> }>('checkForNewPlugins');
  }

  // ============================================
  // Scanner Event Subscriptions
  // ============================================

  onDeactivationChanged(handler: EventHandler<DeactivatedPlugin[]>): () => void {
    return this.on('deactivationChanged', handler);
  }

  onNewPluginsDetected(handler: EventHandler<NewPluginsDetectedEvent>): () => void {
    return this.on('newPluginsDetected', handler);
  }

  onAutoScanStateChanged(handler: EventHandler<AutoScanState>): () => void {
    return this.on('autoScanStateChanged', handler);
  }

  // ============================================
  // Inline Editor Mode
  // ============================================

  /**
   * Open a plugin's native editor inline, hiding the webview.
   * The host window resizes to fit the plugin editor + navigation sidebar.
   */
  async openPluginInline(nodeId: number): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('openPluginInline', nodeId);
  }

  /**
   * Close the inline plugin editor and return to webview mode.
   */
  async closePluginInline(): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('closePluginInline');
  }

  /**
   * Get the current inline editor state (webview or plugin mode).
   */
  async getInlineEditorState(): Promise<InlineEditorState> {
    return this.callNative<InlineEditorState>('getInlineEditorState');
  }

  /**
   * Subscribe to inline editor mode changes.
   */
  onInlineEditorChanged(handler: EventHandler<InlineEditorState>): () => void {
    return this.on('inlineEditorChanged', handler);
  }

  // ============================================
  // Panel Layout — expand window for side/bottom panels
  // ============================================

  /**
   * Tell C++ to resize the window to accommodate panels alongside the plugin editor.
   * rightWidth: total width of right-side panels (0 = none)
   * bottomHeight: total height of bottom panels (0 = none)
   */
  async setPanelLayout(rightWidth: number, bottomHeight: number): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('setPanelLayout', rightWidth, bottomHeight);
  }

  // ============================================
  // Search Overlay
  // ============================================

  /**
   * Show search overlay: hide inline editor, expand WebView to full window.
   */
  async showSearchOverlay(): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('showSearchOverlay');
  }

  /**
   * Hide search overlay: restore sidebar + inline editor layout.
   */
  async hideSearchOverlay(): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('hideSearchOverlay');
  }

  /**
   * Subscribe to search overlay opened events.
   */
  onSearchOverlayOpened(handler: EventHandler<void>): () => void {
    return this.on('searchOverlayOpened', handler);
  }

  /**
   * Subscribe to search overlay closed events.
   */
  onSearchOverlayClosed(handler: EventHandler<void>): () => void {
    return this.on('searchOverlayClosed', handler);
  }

  /**
   * Temporarily hide or show the native plugin editor window so that a
   * WebView context menu can appear in front of it.
   * Call with false before showing a context menu, then true when it closes.
   */
  async setNativeWindowVisible(visible: boolean): Promise<void> {
    await this.callNative('setNativeWindowVisible', visible);
  }

  // ============================================
  // Persistent Credentials (auth.json on disk)
  // ============================================

  async saveCredentials(data: {
    sessionToken: string;
    userId: string;
    email: string;
    name?: string;
    hasPurchased?: boolean;
    trialEndsAt?: number;
    onboardingComplete?: boolean;
  }): Promise<{ success: boolean }> {
    return this.callNative<{ success: boolean }>('saveCredentials', JSON.stringify(data));
  }

  async loadCredentials(): Promise<{
    sessionToken?: string;
    userId?: string;
    email?: string;
    name?: string;
    hasPurchased?: boolean;
    trialEndsAt?: number;
    onboardingComplete?: boolean;
  }> {
    return this.callNative('loadCredentials');
  }

  async clearCredentials(): Promise<{ success: boolean }> {
    return this.callNative<{ success: boolean }>('clearCredentials');
  }

  // ============================================
  // Persistent Settings (settings.json on disk)
  // ============================================

  async saveSettings(settings: Record<string, unknown>): Promise<{ success: boolean }> {
    return this.callNative<{ success: boolean }>('saveSettings', JSON.stringify(settings));
  }

  async loadSettings(): Promise<Record<string, unknown>> {
    return this.callNative<Record<string, unknown>>('loadSettings');
  }

  // ============================================
  // Per-Plugin Preset Loading
  // ============================================

  async loadPluginPreset(nodeId: number, presetData: string): Promise<{ success: boolean; error?: string }> {
    return this.callNativeJson<{ success: boolean; error?: string }>('loadPluginPreset', { nodeId, presetData });
  }

  async getPluginState(nodeId: number): Promise<{ success: boolean; presetData?: string; error?: string }> {
    return this.callNativeJson<{ success: boolean; presetData?: string; error?: string }>('getPluginState', { nodeId });
  }

  // ============================================
  // Cross-Format Alias Groups
  // ============================================

  /**
   * Push cross-format alias groups to C++ for improved AU↔VST3 matching.
   */
  async setCrossFormatAliases(groups: import('./types').CrossFormatAliasGroup[]): Promise<void> {
    return this.callNative<void>('setCrossFormatAliases', JSON.stringify(groups));
  }
}

// Singleton instance
export const juceBridge = new JuceBridge();

// Export timeout-related utilities for consumers
export { NativeCallTimeoutError, DEFAULT_TIMEOUT_MS };
