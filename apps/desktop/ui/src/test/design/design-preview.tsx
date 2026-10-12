// Design preview: the real App with a fake bridge and fake cloud data.
// Run: npx vite --config vite.design.config.ts --port 5199, open /design-preview.html
// Query: ?screen=onboarding | ?screen=library | ?loggedOut
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createRoot } from 'react-dom/client';
import '../../index.css';
import { juceBridge } from '../../api/juce-bridge';
import { PLUGINS, CHAIN_NODES, MACROS } from './fixtures';

const params = new URLSearchParams(location.search);
const screen = params.get('screen') ?? 'chain';

try {
  if (screen === 'onboarding') localStorage.removeItem('pluginradar_onboarding_complete');
  else localStorage.setItem('pluginradar_onboarding_complete', 'true');
  localStorage.removeItem('prochain.browserOpen');
  localStorage.removeItem('prochain.analyzerOpen');
} catch { /* ignore */ }

let nodes: any[] = JSON.parse(JSON.stringify(CHAIN_NODES));
const bridge = juceBridge as any;

function findNode(list: any[], id: number): any {
  for (const n of list) {
    if (n.id === id) return n;
    if (n.type === 'group') {
      const f = findNode(n.children, id);
      if (f) return f;
    }
  }
  return null;
}
const state = () => ({ nodes: JSON.parse(JSON.stringify(nodes)) });
const changed = () => {
  const s = state();
  bridge.emitLocalEvent('chainChanged', s);
  return { success: true, chainState: s };
};
let nextId = 100;

const handlers: Record<string, (...a: any[]) => any> = {
  getPluginList: () => PLUGINS,
  getChainState: () => state(),
  getPresetList: () => [
    { name: 'Vocal Lead', category: 'Vocals', path: '/p/1', lastModified: '' },
    { name: 'Drum Bus', category: 'Drums', path: '/p/2', lastModified: '' },
  ],
  getCategories: () => ['Vocals', 'Drums'],
  getGainSettings: () => ({ inputGainDB: -2.5, outputGainDB: 0 }),
  getMatchLockState: () => ({ matchLockEnabled: false }),
  getAllBypassState: () => ({ allBypassed: false, anyBypassed: true }),
  getPluginWindowState: () => ({ openCount: 1, totalCount: 7 }),
  getOtherInstances: () => [],
  getMirrorState: () => ({ isMirrored: false, mirrorGroupId: null, partners: [] }),
  getMacros: () => ({ success: true, macros: MACROS }),
  getAutomationBindings: (json: string) => {
    const { nodeId } = JSON.parse(json);
    const bindings = nodeId === 2
      ? [{ proxyId: 'p1', pluginId: 'pid-2', parameterIndex: 0, parameterId: 'input', parameterName: 'Input' }, { proxyId: 'p2', pluginId: 'pid-2', parameterIndex: 1, parameterId: 'output', parameterName: 'Output' }]
      : [];
    return { success: true, capacity: 2048, used: 2, bindings };
  },
  getPluginParameters: () => ({ success: true, parameters: [{ index: 0, name: 'Input', value: 0.5 }, { index: 1, name: 'Output', value: 0.4 }, { index: 2, name: 'Attack', value: 0.2 }] }),
  setNodeBypassed: (id: number, b: boolean) => { const n = findNode(nodes, id); if (n) n.bypassed = b; return changed(); },
  setNodeRecallSafe: (json: any) => { const a = typeof json === 'string' ? JSON.parse(json) : json; const n = findNode(nodes, a.nodeId); if (n) n.recallSafe = a.recallSafe ?? a.enabled; return changed(); },
  setNodeIgnoreLatency: (json: any) => { const a = typeof json === 'string' ? JSON.parse(json) : json; const n = findNode(nodes, a.nodeId); if (n) n.ignoreLatency = a.ignoreLatency ?? a.enabled; return changed(); },
  addPlugin: (pluginId: string) => {
    const p = PLUGINS.find((x) => x.id === pluginId) ?? PLUGINS[0];
    nodes.push({ id: nextId++, type: 'plugin', name: p.name, format: p.format, uid: p.uid, fileOrIdentifier: p.fileOrIdentifier, bypassed: false, manufacturer: p.manufacturer, branchGainDb: 0, solo: false, mute: false, persistentId: `pid-${nextId}` });
    return changed();
  },
  importChain: () => ({ success: true }),
  toggleAllPluginWindows: () => ({ success: true, openCount: 0, totalCount: 7 }),
};

bridge.callNative = async (name: string, ...args: any[]) => {
  const h = handlers[name];
  if (h) return h(...args);
  return { success: true, chainState: state() };
};

// Live meter, waveform and spectrum data
let t = 0;
const wavePre: number[] = [];
const wavePost: number[] = [];
for (let k = 0; k < 300; k++) {
  const b = Math.abs(Math.sin(k / 3)) ** 3;
  wavePre.push(0.25 + 0.45 * b + Math.random() * 0.1);
  wavePost.push(0.35 + 0.5 * b + Math.random() * 0.08);
}
setInterval(() => {
  t += 1;
  const env = 0.55 + 0.25 * Math.sin(t / 7) + 0.15 * Math.sin(t / 2.3);
  const lvl = (base: number) => Math.max(0, Math.min(1, base + (Math.random() - 0.5) * 0.08));
  bridge.emitLocalEvent('meterData', {
    inputPeakL: lvl(env * 0.8), inputPeakR: lvl(env * 0.78), inputPeakHoldL: 0.82, inputPeakHoldR: 0.8,
    inputRmsL: lvl(env * 0.5), inputRmsR: lvl(env * 0.5), inputLufs: -17.8 + Math.sin(t / 9),
    outputPeakL: lvl(env * 0.9), outputPeakR: lvl(env * 0.88), outputPeakHoldL: 0.92, outputPeakHoldR: 0.9,
    outputRmsL: lvl(env * 0.6), outputRmsR: lvl(env * 0.6), outputLufs: -13.9 + Math.sin(t / 9),
  });
  const nm: Record<string, any> = {};
  [1, 2, 3, 4, 5, 6, 7].forEach((id, i) => {
    const v = lvl(env * (0.6 + i * 0.04));
    nm[String(id)] = { peakL: v, peakR: v * 0.97, peakHoldL: v, peakHoldR: v, inputPeakL: v * 0.9, inputPeakR: v * 0.88, inputPeakHoldL: v, inputPeakHoldR: v };
  });
  bridge.emitLocalEvent('nodeMeterData', nm);

  const beat = (k: number) => Math.abs(Math.sin(k / 3)) ** 3;
  wavePre.push(0.25 + 0.45 * beat(t) + Math.random() * 0.1);
  wavePost.push(0.35 + 0.5 * beat(t) + Math.random() * 0.08);
  if (wavePre.length > 300) { wavePre.shift(); wavePost.shift(); }
  bridge.emitLocalEvent('waveformData', { pre: wavePre.slice(), post: wavePost.slice() });

  const mags = Array.from({ length: 1024 }, (_, i) => {
    const f = (i + 1) / 1024;
    const tilt = 0.08 / Math.pow(f * 40 + 1, 0.9);
    const bumps = 0.02 * Math.exp(-((f - 0.006) ** 2) / 0.00002) + 0.004 * Math.exp(-((f - 0.12) ** 2) / 0.002);
    return (tilt + bumps) * (0.8 + Math.random() * 0.4) * env;
  });
  bridge.emitLocalEvent('fftData', { magnitudes: mags, sampleRate: 48000, fftSize: 2048 });
  bridge.emitLocalEvent('macroValues', MACROS.map((m) => m.value));
}, 50);

(async () => {
  const { default: App } = await import('../../App');
  const { usePluginStore } = await import('../../stores/pluginStore');

  createRoot(document.getElementById('root')!).render(<App />);

  // Catalogue data normally arrives after login sync
  setTimeout(() => {
    usePluginStore.getState().loadEnrichmentData();
  }, 300);

  if (screen === 'library') {
    setTimeout(() => window.dispatchEvent(new CustomEvent('openChainLibrary', { detail: {} })), 400);
  }
})();
