import { Component, ErrorInfo, ReactNode, useState, useEffect, useCallback } from 'react';
import { PluginBrowser } from './components/PluginBrowser';
import { ChainEditor } from './components/ChainEditor';
import { WaveformDisplay } from './components/WaveformDisplay';
import { SpectrumAnalyzer } from './components/SpectrumAnalyzer';
import { PresetModal } from './components/PresetBrowser';
import { Footer } from './components/Footer';
import { OnboardingFlow } from './components/Onboarding/OnboardingFlow';
import { useOnboardingStore } from './stores/onboardingStore';
import { usePresetStore } from './stores/presetStore';
import { useSyncStore } from './stores/syncStore';
import { useOfflineStore, startRetryLoop } from './stores/offlineStore';
import { executeQueuedWrite } from './api/convex-client';
import { juceBridge } from './api/juce-bridge';
import uiBg from './assets/ui-bg.png';
import headerBg from './assets/header.png';
import analyzerContainer from './assets/analyzer-container.png';
import analyzerDisplay from './assets/analyzer-display.png';
import inputButtonBg from './assets/input-button-bg.png';

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
  const [browserOpen, setBrowserOpen] = useState(false);

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

  // Initialize onboarding check
  useEffect(() => {
    initOnboarding().catch(console.error);
  }, [initOnboarding]);

  // Show onboarding flow if not complete
  if (!isOnboardingComplete) {
    return (
      <ErrorBoundary>
        <OnboardingFlow />
      </ErrorBoundary>
    );
  }

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
        setBrowserOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Listen for openPluginBrowser events from child components
  useEffect(() => {
    const handler = () => setBrowserOpen(true);
    window.addEventListener('openPluginBrowser', handler);
    return () => window.removeEventListener('openPluginBrowser', handler);
  }, []);

  const toggleBrowser = useCallback(() => {
    setBrowserOpen(prev => !prev);
  }, []);

  const ANALYZER_HEIGHT = 134;
  const FOOTER_HEIGHT = 66;

  return (
    <ErrorBoundary>
      {/* Full-page background */}
      <div
        className="relative flex flex-col w-full h-full select-none overflow-hidden"
        style={{
          backgroundImage: `url(${uiBg})`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Header — 33px, PNG background */}
        <div
          className="relative flex-shrink-0"
          style={{
            height: 33,
            backgroundImage: `url(${headerBg})`,
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
          }}
        />

        {/* Chain area — fills remaining space, scrollable */}
        <div
          className="flex-1 min-h-0 overflow-hidden"
          style={{ padding: '0 23px' }}
        >
          <ErrorBoundary>
            <ChainEditor />
          </ErrorBoundary>
        </div>

        {/* Analyzer — two-layer: container frame + display background */}
        <div
          className="flex-shrink-0 relative mx-3"
          style={{
            height: ANALYZER_HEIGHT,
            backgroundImage: `url(${analyzerContainer})`,
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
          }}
        >
          {/* Controls bar — in the container bezel above the display */}
          <div className="absolute top-2 left-3 right-3 flex items-center gap-1.5 z-10">
            {/* View toggle */}
            <button
              onClick={() => setAnalyzerView('waveform')}
              className="relative"
              style={{
                width: 62, height: 18,
                backgroundImage: `url(${inputButtonBg})`,
                backgroundSize: '100% 100%',
              }}
            >
              <span className={`absolute inset-0 flex items-center justify-center text-[9px] font-mono uppercase transition-colors ${
                analyzerView === 'waveform' ? 'text-white' : 'text-white/40'
              }`}>
                Waveform
              </span>
            </button>
            <button
              onClick={() => setAnalyzerView('spectrum')}
              className="relative"
              style={{
                width: 62, height: 18,
                backgroundImage: `url(${inputButtonBg})`,
                backgroundSize: '100% 100%',
              }}
            >
              <span className={`absolute inset-0 flex items-center justify-center text-[9px] font-mono uppercase transition-colors ${
                analyzerView === 'spectrum' ? 'text-white' : 'text-white/40'
              }`}>
                Spectrum
              </span>
            </button>

            {/* Sub-controls — right-aligned */}
            <div className="ml-auto flex items-center gap-1">
              {analyzerView === 'waveform' ? (
                <>
                  <button
                    onClick={() => setShowInput(v => !v)}
                    className="relative"
                    style={{
                      width: 50, height: 18,
                      backgroundImage: `url(${inputButtonBg})`,
                      backgroundSize: '100% 100%',
                    }}
                  >
                    <span className={`absolute inset-0 flex items-center justify-center text-[9px] font-mono uppercase transition-colors ${
                      showInput ? 'text-white' : 'text-white/30'
                    }`}>
                      Input
                    </span>
                  </button>
                  <button
                    onClick={() => setShowOutput(v => !v)}
                    className="relative"
                    style={{
                      width: 50, height: 18,
                      backgroundImage: `url(${inputButtonBg})`,
                      backgroundSize: '100% 100%',
                    }}
                  >
                    <span className={`absolute inset-0 flex items-center justify-center text-[9px] font-mono uppercase transition-colors ${
                      showOutput ? 'text-plugin-accent' : 'text-white/30'
                    }`}>
                      Output
                    </span>
                  </button>
                </>
              ) : (
                <>
                  {(['bars', 'line', 'octave'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setSpecMode(m)}
                      className="relative"
                      style={{
                        width: 46, height: 18,
                        backgroundImage: `url(${inputButtonBg})`,
                        backgroundSize: '100% 100%',
                      }}
                    >
                      <span className={`absolute inset-0 flex items-center justify-center text-[9px] font-mono uppercase transition-colors ${
                        specMode === m ? 'text-plugin-accent' : 'text-white/30'
                      }`}>
                        {m}
                      </span>
                    </button>
                  ))}
                  {specMode === 'octave' && (
                    <button
                      onClick={() => setOctaveMode(v => v === 'third' ? 'full' : 'third')}
                      className="relative"
                      style={{
                        width: 50, height: 18,
                        backgroundImage: `url(${inputButtonBg})`,
                        backgroundSize: '100% 100%',
                      }}
                    >
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono text-white/60">
                        {octaveMode === 'third' ? '1/3' : '1/1'}
                      </span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Display area — inner screen with display PNG background */}
          <div
            className="absolute overflow-hidden"
            style={{
              top: 32,
              left: 8,
              right: 8,
              height: 94,
              backgroundImage: `url(${analyzerDisplay})`,
              backgroundSize: '100% 100%',
              backgroundRepeat: 'no-repeat',
            }}
          >
            {analyzerView === 'waveform' ? (
              <WaveformDisplay showInput={showInput} showOutput={showOutput} />
            ) : (
              <SpectrumAnalyzer mode={specMode} octaveMode={octaveMode} />
            )}
          </div>
        </div>

        {/* Footer — fixed height */}
        <div className="flex-shrink-0" style={{ height: FOOTER_HEIGHT }}>
          <Footer
            currentPresetName={currentPreset?.name}
            onPresetClick={() => setShowPresetModal(true)}
          />
        </div>

        {/* Plugin browser overlay */}
        {browserOpen && (
          <div className="fixed inset-0 z-50" style={{ top: 33 }}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40" onClick={toggleBrowser} />
            {/* Panel */}
            <div className="absolute left-0 top-0 bottom-0 w-[300px] bg-plugin-surface border-r border-plugin-border shadow-2xl">
              <ErrorBoundary>
                <PluginBrowser onClose={toggleBrowser} />
              </ErrorBoundary>
            </div>
          </div>
        )}

        {showPresetModal && (
          <PresetModal onClose={() => setShowPresetModal(false)} />
        )}
      </div>
    </ErrorBoundary>
  );
}

export default App;
