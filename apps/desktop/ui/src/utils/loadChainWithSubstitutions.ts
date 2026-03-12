import { recordChainLoadResult } from '../api/convex-client';
import { juceBridge } from '../api/juce-bridge';
import type { BrowseChainSlot, ChainImportResult } from '../api/types';
import { useChainStore } from '../stores/chainStore';

export interface SubstitutionEntry {
  originalName: string;
  altName: string;
  altManufacturer: string;
  matchedPluginId?: string;
  originalMatchedPluginId?: string;
}

interface Params {
  chainId: string;
  treeData?: string;
  slots: BrowseChainSlot[];
  substitutions: Map<number, SubstitutionEntry>;
}

export async function loadChainWithSubstitutions({
  chainId,
  slots,
  substitutions,
}: Params): Promise<ChainImportResult> {
  if (!slots || slots.length === 0) {
    return {
      success: false,
      totalSlots: 0,
      loadedSlots: 0,
      failedSlots: 0,
      error: 'Chain has no plugin slots',
    };
  }

  const chainData = {
    version: 1,
    numSlots: slots.length,
    slots: slots.map((slot, idx) => {
      const position = slot.position ?? idx;
      const sub = substitutions.get(position);
      return {
        type: 'plugin',
        id: idx + 1,
        index: position,
        name: sub ? sub.altName : slot.pluginName,
        manufacturer: sub ? sub.altManufacturer : slot.manufacturer,
        format: slot.format || 'VST3',
        uid: sub ? 0 : (slot.uid || 0),
        fileOrIdentifier: sub ? '' : (slot.fileOrIdentifier || ''),
        version: slot.version || '',
        bypassed: slot.bypassed ?? false,
        presetData: sub ? '' : (slot.presetData || ''),
        presetSizeBytes: sub ? 0 : (slot.presetSizeBytes || 0),
        parameters: (!sub && slot.parameters)
          ? slot.parameters.map((parameter) => ({
              name: parameter.name || '',
              semantic: parameter.semantic || '',
              unit: parameter.unit || '',
              value: String(parameter.value ?? ''),
              normalizedValue: parameter.normalizedValue ?? 0,
            }))
          : [],
      };
    }),
  };

  const loadStart = performance.now();
  const importResult = await juceBridge.importChain(chainData) as ChainImportResult;
  const loadTimeMs = Math.round(performance.now() - loadStart);

  useChainStore.getState().setFormatSubstitutions(importResult.formatSubstitutions ?? []);

  recordChainLoadResult({
    chainId,
    totalSlots: importResult.totalSlots ?? slots.length,
    loadedSlots: importResult.loadedSlots ?? slots.length,
    failedSlots: importResult.failedSlots ?? 0,
    substitutedSlots: substitutions.size,
    failures: importResult.failures,
    loadTimeMs,
  });

  return importResult;
}
