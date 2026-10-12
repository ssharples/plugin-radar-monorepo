import { juceBridge } from '../api/juce-bridge';
import { useChainStore } from '../stores/chainStore';
import type { ChainNodeUI } from '../api/types';

interface CapturedParam {
  name: string;
  value: string;
  normalizedValue: number;
  semantic?: string;
  unit?: string;
}

/**
 * Capture semantically-filtered parameters for each plugin slot in an exported chain.
 * Matches exported slots to live plugin nodes by name, then calls readPluginParameters
 * + discoverPluginParameters to get only the meaningful (matched) params.
 */
export async function captureSlotParameters(
  exportedSlots: Array<{ index: number; name: string }>
): Promise<Map<number, CapturedParam[]>> {
  const { nodes } = useChainStore.getState();
  const paramsByPosition = new Map<number, CapturedParam[]>();

  // Collect all plugin nodes from the tree
  const collectPluginNodes = (nodeList: ChainNodeUI[]): { id: number; name: string }[] => {
    const result: { id: number; name: string }[] = [];
    for (const node of nodeList) {
      if (node.type === 'plugin') result.push({ id: node.id, name: node.name });
      if ('children' in node && node.children) result.push(...collectPluginNodes(node.children));
    }
    return result;
  };

  const pluginNodes = collectPluginNodes(nodes);

  for (let i = 0; i < exportedSlots.length; i++) {
    const slot = exportedSlots[i];
    const matchingNode = pluginNodes.find(n => n.name === slot.name);
    if (!matchingNode) continue;

    try {
      const [rawParams, discovery] = await Promise.all([
        juceBridge.readPluginParameters(matchingNode.id),
        juceBridge.discoverPluginParameters(matchingNode.id),
      ]);

      if (rawParams.success && rawParams.parameters && discovery.success && discovery.map) {
        // Build lookup from discovery: juceParamIndex → semantic info
        const semanticLookup = new Map<number, { semantic: string; unit: string; matched: boolean }>();
        for (const dp of discovery.map.parameters) {
          semanticLookup.set(dp.juceParamIndex, {
            semantic: dp.semantic,
            unit: dp.physicalUnit,
            matched: dp.matched,
          });
        }

        // Filter to only semantically matched params
        const keyParams: CapturedParam[] = rawParams.parameters
          .filter(p => {
            const sem = semanticLookup.get(p.index);
            return sem?.matched === true;
          })
          .map(p => {
            const sem = semanticLookup.get(p.index)!;
            return {
              name: p.name,
              value: p.text || String(p.normalizedValue),
              normalizedValue: p.normalizedValue,
              ...(sem.semantic ? { semantic: sem.semantic } : {}),
              ...(sem.unit ? { unit: sem.unit } : {}),
            };
          });

        if (keyParams.length > 0) {
          paramsByPosition.set(i, keyParams);
        }
      }
    } catch (err) {
      console.warn(`Failed to capture params for slot ${i}:`, err);
    }
  }

  return paramsByPosition;
}
