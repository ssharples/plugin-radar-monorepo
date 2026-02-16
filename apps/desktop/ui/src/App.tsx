import { Component, ErrorInfo, ReactNode, useState, useEffect, useCallback, useRef } from 'react';
import { PluginBrowser } from './components/PluginBrowser';
import { ChainEditor } from './components/ChainEditor';
import { PresetModal } from './components/PresetBrowser';
import { Footer } from './components/Footer';
import { OnboardingFlow } from './components/Onboarding/OnboardingFlow';
import { KeyboardShortcutOverlay } from './components/KeyboardShortcutOverlay';
import { LeftToolbar } from './components/LeftToolbar';
import { GalaxyVisualizer } from './components/GalaxyVisualizer/GalaxyVisualizer';
import { useOnboardingStore } from './stores/onboardingStore';
import { usePresetStore } from './stores/presetStore';
import { useSyncStore } from './stores/syncStore';
import { useOfflineStore, startRetryLoop } from './stores/offlineStore';
import { usePluginStore } from './stores/pluginStore';
import { useKeyboardStore, ShortcutPriority } from './stores/keyboardStore';
import { executeQueuedWrite } from './api/convex-client';
import { juceBridge } from './api/juce-bridge';
import { GrainientBackground } from './components/GrainientBackground';
import { InlineEditorSidebar } from './components/InlineEditorSidebar';
import { InlineEditorToolbar } from './components/InlineEditorToolbar';
import { InlineSearchOverlay } from './components/InlineSearchOverlay';
import { useChainStore } from './stores/chainStore';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // Error already captured in state via getDerivedStateFromError
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

function App() {
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [galaxyActive, setGalaxyActive] = useState(false);

  const { isOnboardingComplete, isInitializing, initialize: initOnboarding } = useOnboardingStore();
  const { currentPreset, fetchPresets } = usePresetStore();
  const { initialize: initSync, isLoggedIn, autoSync } = useSyncStore();
  const { initialize: initOffline } = useOfflineStore();
  const { fetchPlugins, plugins } = usePluginStore();
  const inlineEditorNodeId = useChainStore(s => s.inlineEditorNodeId);
  const autoSyncFired = useRef(false);

  // Initialize onboarding check
  useEffect(() => {
    initOnboarding().catch(() => {});
  }, [initOnboarding]);

  // All hooks must be called unconditionally (React Rules of Hooks)
  useEffect(() => {
    if (!isOnboardingComplete) return;
    fetchPresets();
    fetchPlugins();
  }, [fetchPresets, fetchPlugins, isOnboardingComplete]);

  useEffect(() => {
    if (!isOnboardingComplete) return;
    initSync().catch(() => {});
  }, [initSync, isOnboardingComplete]);

  // Auto-sync plugins to Convex once per session
  useEffect(() => {
    if (!isOnboardingComplete || !isLoggedIn || plugins.length === 0) return;
    if (autoSyncFired.current) return;
    autoSyncFired.current = true;
    autoSync().catch(() => {});
  }, [isOnboardingComplete, isLoggedIn, plugins.length, autoSync]);

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

  // Cmd+B to toggle browser
  useEffect(() => {
    if (!isOnboardingComplete) return;

    const registerShortcut = useKeyboardStore.getState().registerShortcut;
    return registerShortcut({
      id: 'toggle-plugin-browser',
      key: 'b',
      priority: ShortcutPriority.GLOBAL,
      allowInInputs: false,
      handler: (e) => {
        if (!e.metaKey && !e.ctrlKey) return;
        e.preventDefault();
        setBrowserOpen(prev => !prev);
      }
    });
  }, [isOnboardingComplete]);

  // Listen for openPluginBrowser events from child components
  useEffect(() => {
    if (!isOnboardingComplete) return;
    const handler = () => setBrowserOpen(true);
    window.addEventListener('openPluginBrowser', handler);
    return () => window.removeEventListener('openPluginBrowser', handler);
  }, [isOnboardingComplete]);

  const toggleBrowser = useCallback(() => {
    setBrowserOpen(prev => !prev);
  }, []);

  // Wait for initialization to complete before rendering anything
  if (isInitializing) {
    return <div style={{ width: '100%', height: '100%', backgroundColor: '#000000' }} />;
  }

  // Show onboarding flow if not complete
  if (!isOnboardingComplete) {
    return (
      <ErrorBoundary>
        <OnboardingFlow />
      </ErrorBoundary>
    );
  }

  const FOOTER_HEIGHT = 66;
  const isInlineMode = inlineEditorNodeId !== null;

  // In inline editor mode: L-shaped layout — sidebar on left (full height), toolbar on bottom
  // The WebView spans the full window, plugin editor overlaid on top with offsets
  if (isInlineMode) {
    return (
      <ErrorBoundary>
        <div
          className="flex flex-col w-full h-full select-none overflow-hidden"
          style={{ background: '#0a0a0a' }}
        >
          {/* Top area: sidebar (left) + transparent plugin overlay space (right) */}
          <div className="flex flex-1 min-h-0">
            <InlineEditorSidebar />
            {/* Plugin editor is rendered natively by C++ in this space — leave transparent */}
            <div className="flex-1" />
          </div>
          {/* Bottom toolbar — full width */}
          <InlineEditorToolbar />
          <InlineSearchOverlay />
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div
        className="relative flex flex-col w-full h-full select-none overflow-hidden"
        style={{ background: '#0a0a0a' }}
      >
        {/* Animated gradient background */}
        <GrainientBackground
          color1="#383838"
          color2="#000000"
          color3="#787878"
        />

        {/* Main content area: left toolbar + chain/galaxy */}
        <div className="flex-1 min-h-0 overflow-hidden relative z-[1] flex">
          <LeftToolbar
            galaxyActive={galaxyActive}
            onToggleGalaxy={() => setGalaxyActive(prev => !prev)}
          />
          <div className="flex-1 min-h-0 overflow-hidden">
            {galaxyActive ? (
              <ErrorBoundary>
                <GalaxyVisualizer />
              </ErrorBoundary>
            ) : (
              <ErrorBoundary>
                <ChainEditor />
              </ErrorBoundary>
            )}
          </div>
        </div>

        {/* Footer — fixed height */}
        <div className="flex-shrink-0 relative z-[1]" style={{ height: FOOTER_HEIGHT }}>
          <Footer
            currentPresetName={currentPreset?.name}
            onPresetClick={() => setShowPresetModal(true)}
          />
        </div>

        {/* Plugin browser overlay - full screen */}
        {browserOpen && (
          <ErrorBoundary>
            <PluginBrowser onClose={toggleBrowser} />
          </ErrorBoundary>
        )}

        {showPresetModal && (
          <PresetModal onClose={() => setShowPresetModal(false)} />
        )}

        {/* Keyboard shortcut overlay */}
        <KeyboardShortcutOverlay />
      </div>
    </ErrorBoundary>
  );
}

export default App;
