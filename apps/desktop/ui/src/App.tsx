import { Component, ErrorInfo, ReactNode, useState, useEffect, useCallback } from 'react';
import { PluginBrowser } from './components/PluginBrowser';
import { ChainEditor } from './components/ChainEditor';
import { WaveformDisplay } from './components/WaveformDisplay';
import { SpectrumAnalyzer } from './components/SpectrumAnalyzer';
import { PresetModal } from './components/PresetBrowser';
import { Footer } from './components/Footer';
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

const ANALYZER_MIN = 48;
const ANALYZER_MAX = 300;
const ANALYZER_DEFAULT = 96;

function App() {
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [analyzerView, setAnalyzerView] = useState<AnalyzerView>('waveform');
  const [browserCollapsed, setBrowserCollapsed] = useState(true);
  const [analyzerHeight, setAnalyzerHeight] = useState(() => {
    const saved = localStorage.getItem('analyzerHeight');
    return saved ? Math.max(ANALYZER_MIN, Math.min(ANALYZER_MAX, parseInt(saved, 10))) : ANALYZER_DEFAULT;
  });
  const [isResizingAnalyzer, setIsResizingAnalyzer] = useState(false);

  const { currentPreset, fetchPresets } = usePresetStore();
  const { initialize: initSync } = useSyncStore();
  const { initialize: initOffline } = useOfflineStore();

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  useEffect(() => {
    initSync().catch(console.error);
  }, [initSync]);

  useEffect(() => {
    initOffline();
    startRetryLoop(executeQueuedWrite);
  }, [initOffline]);

  useEffect(() => {
    juceBridge.startWaveformStream();
    return () => {
      juceBridge.stopWaveformStream();
    };
  }, []);

  // Cmd+B to toggle browser
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setBrowserCollapsed(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Listen for openPluginBrowser events from child components
  useEffect(() => {
    const handler = () => setBrowserCollapsed(false);
    window.addEventListener('openPluginBrowser', handler);
    return () => window.removeEventListener('openPluginBrowser', handler);
  }, []);

  // Analyzer resize drag
  const handleAnalyzerResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingAnalyzer(true);
    const startY = e.clientY;
    const startHeight = analyzerHeight;

    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      const newHeight = Math.max(ANALYZER_MIN, Math.min(ANALYZER_MAX, startHeight + delta));
      setAnalyzerHeight(newHeight);
    };

    const onUp = () => {
      setIsResizingAnalyzer(false);
      setAnalyzerHeight(h => {
        localStorage.setItem('analyzerHeight', String(h));
        return h;
      });
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [analyzerHeight]);

  // Double-click resize handle to toggle between min and comfortable height
  const handleAnalyzerResizeDoubleClick = useCallback(() => {
    setAnalyzerHeight(prev => {
      const next = prev <= ANALYZER_MIN + 10 ? 200 : ANALYZER_MIN;
      localStorage.setItem('analyzerHeight', String(next));
      return next;
    });
  }, []);

  const toggleBrowser = useCallback(() => {
    setBrowserCollapsed(prev => !prev);
  }, []);

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-full bg-plugin-bg select-none overflow-hidden">
        {/* Main content */}
        <div className="flex-1 flex min-h-0 min-w-0">
          {/* Plugin Browser — collapsible sidebar */}
          <div
            className={`flex-shrink-0 transition-all duration-200 ease-out border-r border-plugin-border ${
              browserCollapsed ? 'w-7' : 'w-60'
            }`}
          >
            <ErrorBoundary>
              <PluginBrowser collapsed={browserCollapsed} onToggle={toggleBrowser} />
            </ErrorBoundary>
          </div>

          {/* Chain Editor + Analyzer column */}
          <div className="flex-1 min-h-0 min-w-0 flex flex-col">
            <div className="flex-1 min-h-0">
              <ErrorBoundary>
                <ChainEditor />
              </ErrorBoundary>
            </div>

            {/* Resize handle */}
            <div
              className={`flex-shrink-0 h-1.5 cursor-ns-resize group flex items-center justify-center ${
                isResizingAnalyzer ? 'bg-plugin-accent/20' : 'hover:bg-plugin-border/50'
              }`}
              onMouseDown={handleAnalyzerResizeStart}
              onDoubleClick={handleAnalyzerResizeDoubleClick}
            >
              <div className={`w-8 h-0.5 rounded-full transition-colors ${
                isResizingAnalyzer ? 'bg-plugin-accent' : 'bg-plugin-border group-hover:bg-plugin-muted'
              }`} />
            </div>

            {/* Analyzer section — integrated below chain */}
            <div
              className="flex-shrink-0 bg-plugin-surface px-2.5 pb-2 pt-1"
              style={{ height: analyzerHeight }}
            >
              <div className="flex items-center gap-2 mb-1">
                <button
                  onClick={() => setAnalyzerView('waveform')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                    analyzerView === 'waveform'
                      ? 'bg-plugin-accent/12 text-plugin-accent border border-plugin-accent/30'
                      : 'text-plugin-dim border border-plugin-border hover:border-plugin-muted hover:text-plugin-text'
                  }`}
                >
                  Waveform
                </button>
                <button
                  onClick={() => setAnalyzerView('spectrum')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                    analyzerView === 'spectrum'
                      ? 'bg-plugin-accent/12 text-plugin-accent border border-plugin-accent/30'
                      : 'text-plugin-dim border border-plugin-border hover:border-plugin-muted hover:text-plugin-text'
                  }`}
                >
                  Spectrum
                </button>
              </div>
              {analyzerView === 'waveform' ? (
                <WaveformDisplay height={analyzerHeight - 32} />
              ) : (
                <SpectrumAnalyzer height={analyzerHeight - 32} />
              )}
            </div>
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
