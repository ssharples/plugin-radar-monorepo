import { createRoot } from 'react-dom/client';
import '../index.css';
import { ChainSlot } from '../components/ChainEditor/ChainSlot';
import { PresetBrowser } from '../components/PresetBrowser/PresetBrowser';
import { juceBridge } from '../api/juce-bridge';
import { usePresetStore } from '../stores/presetStore';
import { useChainStore } from '../stores/chainStore';

const preset = { name: 'Current Audible Chain', category: 'Synthetic', path: '/synthetic/current', lastModified: '' };

// In-memory bridge fixture: no native calls, credentials, network, or cloud state.
Object.assign(juceBridge, {
  getPresetList: async () => [preset, { ...preset, name: 'Partial Candidate', path: '/synthetic/partial' }],
  getCategories: async () => ['Synthetic'],
  loadPreset: async (path: string, allowPartial = false) => allowPartial
    ? { success: true, status: 'committed', preset: { ...preset, name: 'Recovered Available Effects', path } }
    : { success: false, status: 'failed', error: 'Missing Compressor', issues: [{ name: 'Compressor', reason: 'Plugin unavailable' }] },
  getPluginParameters: async () => ({ success: true, parameters: [{ index: 0, name: 'Threshold', value: 0.5 }, { index: 1, name: 'Attack', value: 0.2 }] }),
  getAutomationBindings: async () => ({ success: true, capacity: 2048 as const, used: 1, bindings: [{ proxyId: 'proxy-1', pluginId: 'synthetic-plugin', parameterIndex: 0, parameterId: 'threshold', parameterName: 'Threshold' }] }),
  assignAutomation: async () => ({ success: true, proxyId: 'proxy-2' }),
  unassignAutomation: async () => ({ success: true }),
  setNodeSuspended: async (nodeId: number, suspended: boolean) => ({ success: true, chainState: { nodes: useChainStore.getState().nodes.map(node => node.id === nodeId ? { ...node, suspended } : node) } }),
});

const activeNode = { id: 1, type: 'plugin' as const, name: 'Clean Compressor', format: 'VST3', uid: 1, fileOrIdentifier: 'synthetic', bypassed: false, manufacturer: 'Synthetic Audio', branchGainDb: 0, solo: false, mute: false, persistentId: 'synthetic-plugin' };
const suspendedNode = { ...activeNode, id: 2, name: 'Suspended Tape', suspended: true };
const missingNode = { ...activeNode, id: 3, name: 'Unavailable Reverb', missing: true, loadError: 'Plugin unavailable' };

usePresetStore.setState({ presets: [preset, { ...preset, name: 'Partial Candidate', path: '/synthetic/partial' }], categories: ['Synthetic'], currentPreset: preset, loading: false, listLoading: false, pendingLoad: null, loadProgress: null, loadIssues: [{ name: 'Example FX', reason: 'Plugin unavailable' }], loadStatus: 'partial', selectedCategory: null, saving: false, error: null });
useChainStore.setState({ nodes: [activeNode, suspendedNode, missingNode], automationByNode: { '1': [{ proxyId: 'proxy-1', pluginId: 'synthetic-plugin', parameterIndex: 0, parameterId: 'threshold', parameterName: 'Threshold' }] } });

function Preview() {
  const noop = () => undefined;
  const nodes = useChainStore(state => state.nodes);
  return <main className="min-h-screen bg-plugin-bg p-6 text-plugin-text">
    <h1 className="mb-1 font-mono text-lg uppercase text-plugin-accent">Synthetic UI verification</h1>
    <p className="mb-6 text-xs text-plugin-muted">Developer fixture — local in-memory bridge only. Current, suspended, missing, failed and partial states.</p>
    <div className="grid max-w-5xl gap-8 lg:grid-cols-[1fr_360px]">
      <section><h2 className="mb-3 font-mono text-xs uppercase text-plugin-muted">Chain reliability states</h2><div className="space-y-3 rounded-lg bg-plugin-surface p-4">
        {nodes.filter(node => node.type === 'plugin').map((node) => <ChainSlot key={node.id} node={node} slotNumber={node.id} isEditorOpen={false} isSelected={false} isMultiSelected={false} onRemove={noop} onToggleBypass={noop} onToggleEditor={noop} />)}
      </div></section>
      <section className="h-[520px]"><PresetBrowser /></section>
    </div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Preview />);
