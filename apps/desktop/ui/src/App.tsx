import { Component, ErrorInfo, ReactNode, useState, useEffect } from 'react';
import { PluginBrowser } from './components/PluginBrowser';
import { ChainEditor } from './components/ChainEditor';
import { WaveformDisplay } from './components/WaveformDisplay';
import { SpectrumAnalyzer } from './components/SpectrumAnalyzer';
import { PresetModal } from './components/PresetBrowser';
import { Footer } from './components/Footer';
import { CloudSync } from './components/CloudSync';
import { usePresetStore } from './stores/presetStore';
import { useSyncStore } from './stores/syncStore';
import { useOfflineStore, startRetryLoop } from './stores/offlineStore';
import { executeQueuedWrite } from './api/convex-client';
import { juceBridge } from './api/juce-bridge';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('React Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-900 text-white">
          <h2 className="text-lg font-bold">Something went wrong</h2>
          <pre className="mt-2 text-sm overflow-auto">
            {this.state.error?.message}
            {'\n'}
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

type AnalyzerView = 'waveform' | 'spectrum';

function App() {
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [analyzerView, setAnalyzerView] = useState<AnalyzerView>('waveform');
  const { currentPreset, fetchPresets } = usePresetStore();
  const { initialize: initSync } = useSyncStore();
  const { initialize: initOffline } = useOfflineStore();

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  useEffect(() => {
    initSync().catch(console.error);
  }, [initSync]);

  // Initialize offline store and start retry loop
  useEffect(() => {
    initOffline();
    startRetryLoop(executeQueuedWrite);
  }, [initOffline]);

  // Start waveform/meter stream at app level so meters always receive data
  useEffect(() => {
    juceBridge.startWaveformStream();
    return () => {
      juceBridge.stopWaveformStream();
    };
  }, []);

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen bg-plugin-bg select-none">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-1.5 border-b border-plugin-border bg-plugin-surface">
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded bg-gradient-to-br from-plugin-accent to-plugin-accent-dim flex items-center justify-center">
                <span className="text-[9px] font-black text-black leading-none">P</span>
              </div>
              <span className="text-xs font-semibold text-plugin-text tracking-wide uppercase">
                Chain<span className="text-plugin-accent">Mgr</span>
              </span>
            </div>
            <div className="w-px h-4 bg-plugin-border" />
            <span className="text-xxs text-plugin-muted font-mono">v1.0</span>
          </div>
          <CloudSync />
        </header>

        {/* Main content - horizontal split */}
        <div className="flex-1 flex flex-col gap-px min-h-0 bg-plugin-border">
          {/* Top half - Plugin Browser + Chain side by side */}
          <div className="flex-1 flex gap-px min-h-0">
            {/* Plugin Browser - left panel */}
            <div className="w-[55%] flex-shrink-0 min-h-0">
              <ErrorBoundary>
                <PluginBrowser />
              </ErrorBoundary>
            </div>

            {/* Chain Editor - right panel */}
            <div className="flex-1 min-h-0">
              <ErrorBoundary>
                <ChainEditor />
              </ErrorBoundary>
            </div>
          </div>

          {/* Analyzer section - bottom strip */}
          <div className="flex-shrink-0 bg-plugin-surface p-2.5">
            <div className="flex items-center gap-2 mb-1.5">
              <button
                onClick={() => setAnalyzerView('waveform')}
                className={`px-2 py-0.5 rounded text-xxs font-medium transition-all ${
                  analyzerView === 'waveform'
                    ? 'bg-white/8 text-plugin-text border border-white/20'
                    : 'text-plugin-dim border border-plugin-border hover:border-plugin-muted'
                }`}
              >
                Waveform
              </button>
              <button
                onClick={() => setAnalyzerView('spectrum')}
                className={`px-2 py-0.5 rounded text-xxs font-medium transition-all ${
                  analyzerView === 'spectrum'
                    ? 'bg-white/8 text-plugin-text border border-white/20'
                    : 'text-plugin-dim border border-plugin-border hover:border-plugin-muted'
                }`}
              >
                Spectrum
              </button>
            </div>
            {analyzerView === 'waveform' ? (
              <WaveformDisplay height={72} />
            ) : (
              <SpectrumAnalyzer height={72} />
            )}
          </div>
        </div>

        {/* Footer bar */}
        <Footer
          currentPresetName={currentPreset?.name}
          onPresetClick={() => setShowPresetModal(true)}
        />

        {showPresetModal && (
          <PresetModal onClose={() => setShowPresetModal(false)} />
        )}
      </div>
    </ErrorBoundary>
  );
}

export default App;
