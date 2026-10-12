import { Component, ErrorInfo, ReactNode, useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { PluginBrowser } from './components/PluginBrowser';
import { ChainEditor } from './components/ChainEditor';
import { WaveformDisplay } from './components/WaveformDisplay';
import { SpectrumAnalyzer } from './components/SpectrumAnalyzer';
import { PresetModal } from './components/PresetBrowser';
import { Footer } from './components/Footer';
import { HeaderMenu } from './components/HeaderMenu';
import type { AppView } from './components/HeaderMenu';
import { ChainBrowser } from './components/ChainBrowser';
import { OnboardingFlow } from './components/Onboarding/OnboardingFlow';
import { useOnboardingStore } from './stores/onboardingStore';
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
        <div className="p-4 m-3 rounded-lg border border-red-500/40 bg-red-500/10 text-plugin-text">
          <h2 className="text-base font-semibold text-red-300">Something went wrong</h2>
          <pre className="mt-2 text-xs overflow-auto text-plugin-muted">
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

/** Small per-viewer UI memory. Storage can be missing inside a plugin WebView. */
function readPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(`prochain.${key}`) as T) || fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(`prochain.${key}`, value);
  } catch {
    /* ignore */
  }
}

const HEADER_HEIGHT = 44;
const FOOTER_HEIGHT = 56;

function App() {
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [view, setView] = useState<AppView>('chain');
  const [libraryVisited, setLibraryVisited] = useState(false);
  const [librarySearch, setLibrarySearch] = useState<{ q?: string; n: number }>({ n: 0 });

  const [analyzerView, setAnalyzerView] = useState<AnalyzerView>(() => readPref('analyzer', 'waveform'));
  const [analyzerOpen, setAnalyzerOpen] = useState(() => readPref('analyzerOpen', '1') === '1');
  const [browserOpen, setBrowserOpen] = useState(() => readPref('browserOpen', '1') === '1');

  // Waveform sub-controls
  const [showInput, setShowInput] = useState(true);
  const [showOutput, setShowOutput] = useState(true);

  // Spectrum sub-controls
  const [specMode, setSpecMode] = useState<'bars' | 'line' | 'octave'>('bars');
  const [octaveMode, setOctaveMode] = useState<'third' | 'full'>('third');

  const { isOnboardingComplete, initialize: initOnboarding } = useOnboardingStore();
  const { currentPreset, fetchPresets } = usePresetStore();
  const { initialize: initSync } = useSyncStore();
  const { initialize: initOffline } = useOfflineStore();

  useEffect(() => {
    initOnboarding().catch(console.error);
  }, [initOnboarding]);

  // All hooks must be called unconditionally (React Rules of Hooks)
  useEffect(() => {
    if (!isOnboardingComplete) return;
    fetchPresets();
  }, [fetchPresets, isOnboardingComplete]);

  useEffect(() => {
    if (!isOnboardingComplete) return;
    initSync().catch(console.error);
  }, [initSync, isOnboardingComplete]);

  useEffect(() => {
    if (!isOnboardingComplete) return;
    initOffline();
    startRetryLoop(executeQueuedWrite);
  }, [initOffline, isOnboardingComplete]);

  useEffect(() => {
    if (!isOnboardingComplete) return;
    juceBridge.startWaveformStream();
    return () => {
      juceBridge.stopWaveformStream();
    };
  }, [isOnboardingComplete]);

  // Only ask C++ for analysis data the visible analyzer needs
  const analyzerVisible = analyzerOpen && view === 'chain';
  useEffect(() => {
    if (!isOnboardingComplete) return;
    juceBridge.setAnalysisSubscriptions(
      analyzerVisible && analyzerView === 'waveform',
      analyzerVisible && analyzerView === 'spectrum'
    );
    return () => { juceBridge.setAnalysisSubscriptions(false, false); };
  }, [analyzerView, analyzerVisible, isOnboardingComplete]);

  useEffect(() => writePref('analyzer', analyzerView), [analyzerView]);
  useEffect(() => writePref('analyzerOpen', analyzerOpen ? '1' : '0'), [analyzerOpen]);
  useEffect(() => writePref('browserOpen', browserOpen ? '1' : '0'), [browserOpen]);

  const changeView = useCallback((next: AppView) => {
    setView(next);
    if (next === 'library') setLibraryVisited(true);
  }, []);

  // Cmd+B toggles the plugin list, Cmd+L the library
  useEffect(() => {
    if (!isOnboardingComplete) return;
    const handleKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'b') {
        e.preventDefault();
        setView('chain');
        setBrowserOpen((prev) => !prev);
      } else if (e.key === 'l') {
        e.preventDefault();
        setView((v) => {
          const next = v === 'library' ? 'chain' : 'library';
          if (next === 'library') setLibraryVisited(true);
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOnboardingComplete]);

  // "Add plugin" buttons open the docked plugin list (PluginBrowser focuses its search)
  useEffect(() => {
    if (!isOnboardingComplete) return;
    const handler = () => {
      setView('chain');
      setBrowserOpen(true);
    };
    window.addEventListener('openPluginBrowser', handler);
    return () => window.removeEventListener('openPluginBrowser', handler);
  }, [isOnboardingComplete]);

  // "Browse the library" buttons, optionally with a search
  useEffect(() => {
    if (!isOnboardingComplete) return;
    const handler = (e: Event) => {
      const search = (e as CustomEvent<{ search?: string }>).detail?.search;
      setLibrarySearch((prev) => ({ q: search ?? '', n: prev.n + 1 }));
      changeView('library');
    };
    window.addEventListener('openChainLibrary', handler);
    return () => window.removeEventListener('openChainLibrary', handler);
  }, [isOnboardingComplete, changeView]);

  const toggleBrowser = useCallback(() => {
    setBrowserOpen((prev) => !prev);
  }, []);

  if (!isOnboardingComplete) {
    return (
      <ErrorBoundary>
        <OnboardingFlow />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="relative flex flex-col w-full h-full select-none overflow-hidden bg-plugin-bg text-plugin-text">
        {/* Top bar */}
        <div className="relative z-30 flex-shrink-0 border-b border-plugin-border" style={{ height: HEADER_HEIGHT }}>
          <HeaderMenu view={view} onViewChange={changeView} />
        </div>

        {/* Workspace */}
        <div className="flex flex-1 min-h-0">
          {/* Chain view */}
          <div className={view === 'chain' ? 'flex flex-1 min-w-0 min-h-0' : 'hidden'}>
            <aside
              className={`flex-shrink-0 border-r border-plugin-border bg-plugin-surface transition-[width] duration-150 ${
                browserOpen ? 'w-[236px] lg:w-[272px]' : 'w-11'
              }`}
              aria-label="Plugins"
            >
              <ErrorBoundary>
                <PluginBrowser collapsed={!browserOpen} onToggle={toggleBrowser} />
              </ErrorBoundary>
            </aside>

            <div className="flex flex-col flex-1 min-w-0 min-h-0">
              <div className="flex-1 min-h-0 overflow-hidden">
                <ErrorBoundary>
                  <ChainEditor />
                </ErrorBoundary>
              </div>

              {/* Analyzer strip */}
              <section className="flex-shrink-0 border-t border-plugin-border bg-plugin-surface" aria-label="Analyzer">
                <div className="flex items-center gap-2 h-8 px-2">
                  <button
                    onClick={() => setAnalyzerOpen((v) => !v)}
                    className="w-6 h-6 inline-flex items-center justify-center rounded text-plugin-dim hover:text-plugin-text hover:bg-plugin-raised"
                    aria-expanded={analyzerOpen}
                    aria-label={analyzerOpen ? 'Hide analyzer' : 'Show analyzer'}
                    title={analyzerOpen ? 'Hide analyzer' : 'Show analyzer'}
                  >
                    {analyzerOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                  </button>
                  <Segmented
                    label="Analyzer view"
                    value={analyzerView}
                    onChange={(v) => {
                      setAnalyzerView(v as AnalyzerView);
                      setAnalyzerOpen(true);
                    }}
                    options={[
                      { value: 'waveform', label: 'Waveform' },
                      { value: 'spectrum', label: 'Spectrum' },
                    ]}
                  />
                  <div className="flex-1" />
                  {analyzerOpen && (analyzerView === 'waveform' ? (
                    <div className="flex items-center gap-1">
                      <Toggle on={showInput} onClick={() => setShowInput((v) => !v)} label="Input" dot="bg-plugin-muted" />
                      <Toggle on={showOutput} onClick={() => setShowOutput((v) => !v)} label="Output" dot="bg-plugin-accent" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Segmented
                        label="Spectrum style"
                        value={specMode}
                        onChange={(v) => setSpecMode(v as typeof specMode)}
                        options={[
                          { value: 'bars', label: 'Bars' },
                          { value: 'line', label: 'Line' },
                          { value: 'octave', label: 'Octave' },
                        ]}
                      />
                      {specMode === 'octave' && (
                        <button
                          onClick={() => setOctaveMode((v) => (v === 'third' ? 'full' : 'third'))}
                          className="num h-6 px-2 rounded-md border border-plugin-border text-[11px] text-plugin-muted hover:text-plugin-text"
                          title="Octave band width"
                        >
                          {octaveMode === 'third' ? '1/3' : '1/1'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {analyzerOpen && (
                  <div className="relative mx-2 mb-2 h-[84px] lg:h-[104px] [@media(max-height:680px)]:h-[60px] rounded-md overflow-hidden bg-plugin-bg border border-plugin-border">
                    {analyzerView === 'waveform' ? (
                      <WaveformDisplay showInput={showInput} showOutput={showOutput} />
                    ) : (
                      <SpectrumAnalyzer mode={specMode} octaveMode={octaveMode} />
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>

          {/* Library view (kept mounted after first visit so filters survive) */}
          {libraryVisited && (
            <div className={view === 'library' ? 'flex flex-1 min-w-0 min-h-0' : 'hidden'}>
              <ErrorBoundary>
                <ChainBrowser
                  initialSearch={librarySearch.q}
                  searchNonce={librarySearch.n}
                  onLoaded={() => setView('chain')}
                />
              </ErrorBoundary>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="relative z-20 flex-shrink-0" style={{ height: FOOTER_HEIGHT }}>
          <Footer
            currentPresetName={currentPreset?.name}
            onPresetClick={() => setShowPresetModal(true)}
          />
        </div>

        {showPresetModal && (
          <PresetModal onClose={() => setShowPresetModal(false)} />
        )}
      </div>
    </ErrorBoundary>
  );
}

function Segmented({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div className="flex items-center rounded-md bg-plugin-bg border border-plugin-border p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`h-5 px-2 rounded text-[11px] font-semibold transition-colors ${
            value === o.value ? 'bg-plugin-raised text-plugin-text' : 'text-plugin-dim hover:text-plugin-text'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onClick, label, dot }: { on: boolean; onClick: () => void; label: string; dot: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`h-6 inline-flex items-center gap-1.5 px-2 rounded-md border text-[11px] font-semibold transition-colors ${
        on ? 'border-plugin-border-bright text-plugin-text' : 'border-plugin-border text-plugin-dim'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${on ? dot : 'bg-plugin-border-bright'}`} />
      {label}
    </button>
  );
}

export default App;
