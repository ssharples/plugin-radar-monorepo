import type {
  PluginDescription,
  ChainStateV2,
  PresetInfo,
  ScanProgress,
  ApiResponse,
  WaveformData,
  MeterData,
  GainSettings,
  FFTData,
} from './types';

type EventHandler<T> = (data: T) => void;

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
        console.log('Received __juce__complete:', data);
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
    console.log('JuceBridge initialized, isNative:', this.isNative);

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
      'waveformData',
      'meterData',
      'fftData',
      'gainChanged',
      'matchLockWarning',
    ];

    events.forEach((eventName) => {
      window.__JUCE__?.backend.addEventListener(eventName, (data) => {
        console.log(`[JuceBridge] Event received: ${eventName}`, data);
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

    console.log(`callNative: ${name}`, actualArgs, `(timeout: ${timeoutMs}ms)`);

    if (!this.isNative) {
      console.warn(`Native function ${name} called in non-native environment`);
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
    console.log(`Emitting __juce__invoke for ${name} with promiseId ${promiseId}`);

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
          console.warn(`[JuceBridge] Native function '${name}' timed out after ${timeoutMs}ms (promiseId: ${promiseId})`);
          promiseHandler.cleanupPromise(promiseId);
        }
        reject(new NativeCallTimeoutError(name, timeoutMs));
      }, timeoutMs);
    });

    try {
      // Race between the actual promise and the timeout
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId!);
      console.log(`Native function ${name} returned:`, result);
      return result as T;
    } catch (error) {
      clearTimeout(timeoutId!);
      if (error instanceof NativeCallTimeoutError) {
        console.error(`[JuceBridge] Timeout error:`, error.message);
      } else {
        console.error(`Error calling native function ${name}:`, error);
      }
      throw error;
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

  async getCategories(): Promise<string[]> {
    return this.callNative<string[]>('getCategories');
  }

  onPresetListChanged(handler: EventHandler<PresetInfo[]>): () => void {
    return this.on('presetListChanged', handler);
  }

  onPresetLoaded(handler: EventHandler<PresetInfo | null>): () => void {
    return this.on('presetLoaded', handler);
  }

  // Waveform streaming
  async startWaveformStream(): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('startWaveformStream');
  }

  async stopWaveformStream(): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('stopWaveformStream');
  }

  onWaveformData(handler: EventHandler<WaveformData>): () => void {
    return this.on('waveformData', handler);
  }

  // FFT data streaming
  onFFTData(handler: EventHandler<FFTData>): () => void {
    return this.on('fftData', handler);
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

  // Meter data
  onMeterData(handler: EventHandler<MeterData>): () => void {
    return this.on('meterData', handler);
  }

  // Gain change events (from match lock auto-adjustment)
  onGainChanged(handler: EventHandler<{ outputGainDB: number }>): () => void {
    return this.on('gainChanged', handler);
  }

  // Match lock warning events (when auto-disabled due to gain limit)
  onMatchLockWarning(handler: EventHandler<{ warning: string; matchLockEnabled: boolean }>): () => void {
    return this.on('matchLockWarning', handler);
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
    return this.callNative('applyPluginParameters', JSON.stringify({ nodeId, params }));
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
    appliedParams?: number;
    chainState?: ChainStateV2;
    error?: string;
  }> {
    return this.callNative('swapPluginInChain', JSON.stringify({
      nodeId,
      newPluginUid,
      translatedParams,
    }));
  }

  // ============================================
  // Group Operations (V2 Tree API)
  // ============================================

  async createGroup(childIds: number[], mode: 'serial' | 'parallel', name: string): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('createGroup', JSON.stringify({ childIds, mode, name }));
  }

  async dissolveGroup(groupId: number): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('dissolveGroup', JSON.stringify({ groupId }));
  }

  async setGroupMode(groupId: number, mode: 'serial' | 'parallel'): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('setGroupMode', JSON.stringify({ groupId, mode }));
  }

  async setGroupDryWet(groupId: number, mix: number): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('setGroupDryWet', JSON.stringify({ groupId, mix }));
  }

  async setBranchGain(nodeId: number, gainDb: number): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('setBranchGain', JSON.stringify({ nodeId, gainDb }));
  }

  async setBranchSolo(nodeId: number, solo: boolean): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('setBranchSolo', JSON.stringify({ nodeId, solo }));
  }

  async setBranchMute(nodeId: number, mute: boolean): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('setBranchMute', JSON.stringify({ nodeId, mute }));
  }

  async moveNode(nodeId: number, newParentId: number, newIndex: number): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('moveNode', JSON.stringify({ nodeId, newParentId, newIndex }));
  }

  async removeNode(nodeId: number): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('removeNode', JSON.stringify({ nodeId }));
  }

  async addPluginToGroup(pluginId: string, parentId: number, insertIndex: number): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('addPluginToGroup', JSON.stringify({ pluginId, parentId, insertIndex }));
  }

  async setNodeBypassed(nodeId: number, bypassed: boolean): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('setNodeBypassed', JSON.stringify({ nodeId, bypassed }));
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
    chainState?: ChainStateV2;
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

  /**
   * Toggle all plugin windows: if any are open, close all. If none open, open all.
   */
  async toggleAllPluginWindows(): Promise<{
    success: boolean;
    openCount: number;
    totalCount: number;
  }> {
    return this.callNative('toggleAllPluginWindows');
  }

  /**
   * Get current plugin window state
   */
  async getPluginWindowState(): Promise<{
    openCount: number;
    totalCount: number;
  }> {
    return this.callNative('getPluginWindowState');
  }

  // ============================================
  // Cloud Sharing - Export/Import with Presets
  // ============================================

  /**
   * Export the current chain with full preset data for cloud sharing
   */
  async exportChain(): Promise<{
    version: number;
    numSlots: number;
    slots: Array<{
      index: number;
      name: string;
      manufacturer: string;
      format: string;
      uid: number;
      fileOrIdentifier: string;
      version: string;
      bypassed: boolean;
      presetData: string;  // Base64 encoded
      presetSizeBytes: number;
    }>;
  }> {
    return this.callNative('exportChain');
  }

  /**
   * Import a chain with preset data (from cloud)
   */
  async importChain(data: unknown): Promise<ApiResponse> {
    return this.callNative<ApiResponse>('importChain', data);
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
}

// Singleton instance
export const juceBridge = new JuceBridge();

// Export timeout-related utilities for consumers
export { NativeCallTimeoutError, DEFAULT_TIMEOUT_MS };
