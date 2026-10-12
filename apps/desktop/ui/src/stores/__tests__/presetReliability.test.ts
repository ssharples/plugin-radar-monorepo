import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  getPresetList: vi.fn(),
  getCategories: vi.fn(),
  savePreset: vi.fn(),
  loadPreset: vi.fn(),
  deletePreset: vi.fn(),
  onPresetListChanged: vi.fn(() => () => undefined),
  onPresetLoaded: vi.fn(() => () => undefined),
  onLoadProgress: vi.fn(() => () => undefined),
}));

vi.mock('../../api/juce-bridge', () => ({ juceBridge: bridge }));

import { usePresetStore } from '../presetStore';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
};

describe('preset reliability state', () => {
  beforeEach(() => {
    bridge.loadPreset.mockReset();
    usePresetStore.setState({
      presets: [], categories: [], currentPreset: null, selectedCategory: null,
      loading: false, listLoading: false, pendingLoad: null, loadProgress: null,
      loadIssues: [], loadStatus: null, saving: false, error: null,
    });
  });

  it('ignores stale completion and progress from an older request', async () => {
    const first = deferred<any>();
    const second = deferred<any>();
    bridge.loadPreset.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const older = usePresetStore.getState().loadPreset('/older');
    const latest = usePresetStore.getState().loadPreset('/latest');
    const progress = bridge.onLoadProgress.mock.calls[0][0];
    progress({ requestId: 1, path: '/older', status: 'loading', completed: 1, total: 3 });
    expect(usePresetStore.getState().loadProgress?.path).toBe('/latest');

    second.resolve({ success: true, status: 'committed', requestId: 2, preset: { name: 'Latest', path: '/latest' } });
    await latest;
    first.resolve({ success: true, status: 'committed', requestId: 1, preset: { name: 'Older', path: '/older' } });
    await older;

    expect(usePresetStore.getState().currentPreset?.path).toBe('/latest');
  });

  it('keeps the audible current preset after a failed load', async () => {
    usePresetStore.setState({ currentPreset: { name: 'Current', path: '/current', category: 'mix', lastModified: '' } });
    bridge.loadPreset.mockResolvedValue({ success: false, status: 'failed', error: 'missing plugin' });

    await usePresetStore.getState().loadPreset('/broken');

    expect(usePresetStore.getState().currentPreset?.path).toBe('/current');
    expect(usePresetStore.getState().loadStatus).toBe('failed');
    expect(usePresetStore.getState().error).toBe('missing plugin');
  });

  it('retries a partial load with allowPartial on the same path', async () => {
    bridge.loadPreset
      .mockResolvedValueOnce({ success: true, status: 'partial', issues: [{ name: 'Delay', reason: 'not installed' }] })
      .mockResolvedValueOnce({ success: true, status: 'committed', preset: { name: 'Recovered', path: '/partial' } });

    await usePresetStore.getState().loadPreset('/partial');
    await usePresetStore.getState().loadAvailableEffects();

    expect(bridge.loadPreset).toHaveBeenNthCalledWith(1, '/partial', false, expect.any(Number));
    expect(bridge.loadPreset).toHaveBeenNthCalledWith(2, '/partial', true, expect.any(Number));
    expect(bridge.loadPreset.mock.calls[1][2]).toBeGreaterThan(bridge.loadPreset.mock.calls[0][2]);
    expect(usePresetStore.getState().currentPreset?.name).toBe('Recovered');
  });
});
