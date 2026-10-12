import { beforeEach, describe, expect, it, vi } from 'vitest';
import { juceBridge } from '../juce-bridge';

describe('reliability bridge wire shapes', () => {
  const callNative = vi.fn();

  beforeEach(() => {
    callNative.mockReset().mockResolvedValue({ success: true, capacity: 2048, used: 0, bindings: [] });
    (juceBridge as any).callNative = callNative;
  });

  it('sends suspension as the agreed JSON payload', async () => {
    await juceBridge.setNodeSuspended(17, true);
    expect(callNative).toHaveBeenCalledWith('setNodeSuspended', JSON.stringify({ nodeId: 17, suspended: true }));
  });

  it('sends automation discovery and mutation payloads', async () => {
    await juceBridge.getAutomationBindings(17);
    expect(callNative).toHaveBeenLastCalledWith('getAutomationBindings', JSON.stringify({ nodeId: 17 }));
    await juceBridge.assignAutomation(17, 4);
    expect(callNative).toHaveBeenLastCalledWith('assignAutomation', JSON.stringify({ nodeId: 17, parameterIndex: 4 }));
    await juceBridge.unassignAutomation('proxy-4');
    expect(callNative).toHaveBeenLastCalledWith('unassignAutomation', JSON.stringify({ proxyId: 'proxy-4' }));
  });

  it('passes allowPartial to preset loading and requests index/name/value parameters', async () => {
    await juceBridge.loadPreset('/preset.json', true);
    expect(callNative).toHaveBeenLastCalledWith('loadPreset', '/preset.json', true);
    await juceBridge.getPluginParameters(17);
    expect(callNative).toHaveBeenLastCalledWith('getPluginParameters', 17);
  });
});
