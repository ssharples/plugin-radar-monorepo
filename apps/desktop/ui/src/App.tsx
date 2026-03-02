import { Component, ErrorInfo, ReactNode, useEffect, useCallback, useRef, useState } from 'react';
import { ChainBrowser } from './components/ChainBrowser';
import { ChainEditor } from './components/ChainEditor';
import { OnboardingFlow } from './components/Onboarding/OnboardingFlow';
import { KeyboardShortcutOverlay } from './components/KeyboardShortcutOverlay';
import { AiChatView } from './components/AiAssistant/AiChatView';
import { useOnboardingStore } from './stores/onboardingStore';
import { usePresetStore } from './stores/presetStore';
import { useSyncStore } from './stores/syncStore';
import { useOfflineStore, startRetryLoop } from './stores/offlineStore';
import { usePluginStore } from './stores/pluginStore';
import { useKeyboardStore, ShortcutPriority } from './stores/keyboardStore';
import { executeQueuedWrite } from './api/convex-client';
import { GrainientBackground } from './components/GrainientBackground';
import { InlineEditorSidebar } from './components/InlineEditorSidebar';
import { InlineToolbar } from './components/InlineToolbar';
import { InlineSearchOverlay } from './components/InlineSearchOverlay';
import { PanelContainer } from './components/Panels';
import { useChainStore, useChainActions } from './stores/chainStore';
import { collectPlugins } from './utils/chainHelpers';
import { UndoToast } from './components/UndoToast'
import { NewPluginsToast } from './components/NewPluginsToast';

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

function InlineEditorLayout() {
  const aiChatActive = useChainStore(s => s.aiChatActive);
  const inlineEditorNodeId = useChainStore(s => s.inlineEditorNodeId);
  const { closeAiChat, openAiChat } = useChainActions();

  // AI-chat-only mode: no plugin is open, just AI chat
  const aiChatOnly = aiChatActive && inlineEditorNodeId === null;

  return (
    <div
      className="flex flex-col w-full h-full select-none overflow-hidden"
      style={{ background: '#0a0a0a' }}
    >
      {/* Top area: sidebar (left) + plugin overlay or AI chat (right) */}
      <div className="flex flex-1 min-h-0">
        <InlineEditorSidebar
          aiChatActive={aiChatActive}
          onToggleAiChat={() => aiChatActive ? closeAiChat() : openAiChat()}
        />
        <PanelContainer>
          {aiChatActive ? (
            <div className="flex-1 min-h-0 overflow-hidden h-full">
              <AiChatView />
            </div>
          ) : (
            /* Plugin editor is rendered natively by C++ in this space — leave transparent */
            <div className="flex-1 h-full" />
          )}
        </PanelContainer>
      </div>
      {/* Bottom toolbar — full width (hide when AI-chat-only, no plugin open) */}
      {!aiChatOnly && (
        <InlineToolbar
          aiChatActive={aiChatActive}
          onToggleAiChat={() => aiChatActive ? closeAiChat() : openAiChat()}
        />
      )}
      <InlineSearchOverlay />
    </div>
  );
}

function App() {
  const [browserOpen, setBrowserOpen] = useState(false);

  const { isOnboardingComplete, isInitializing, initialize: initOnboarding } = useOnboardingStore();
  const { fetchPresets, loadDefaultPresetOnStartup } = usePresetStore();
  const { initialize: initSync, isLoggedIn, autoSync } = useSyncStore();
  const { initialize: initOffline } = useOfflineStore();
  const { fetchPlugins, plugins, checkForNewPlugins } = usePluginStore();
  const inlineEditorNodeId = useChainStore(s => s.inlineEditorNodeId);
  const aiChatActive = useChainStore(s => s.aiChatActive);
  const autoSyncFired = useRef(false);

  // Initialize onboarding check
  useEffect(() => {
    initOnboarding().catch(() => { });
  }, [initOnboarding]);

  // All hooks must be called unconditionally (React Rules of Hooks)
  const defaultPresetLoaded = useRef(false);
  useEffect(() => {
    if (!isOnboardingComplete) return;
    fetchPresets().then(() => {
      if (!defaultPresetLoaded.current) {
        defaultPresetLoaded.current = true;
        loadDefaultPresetOnStartup();
      }
    });
    fetchPlugins();
  }, [fetchPresets, fetchPlugins, isOnboardingComplete, loadDefaultPresetOnStartup]);

  useEffect(() => {
    if (!isOnboardingComplete) return;
    initSync().catch(() => { });
  }, [initSync, isOnboardingComplete]);

  // Auto-check for new plugins once per session (after plugin list is loaded)
  const newPluginsCheckFired = useRef(false)
  useEffect(() => {
    if (!isOnboardingComplete || plugins.length === 0) return
    if (newPluginsCheckFired.current) return
    newPluginsCheckFired.current = true
    checkForNewPlugins().catch(() => { })
  }, [isOnboardingComplete, plugins.length, checkForNewPlugins])

  // Auto-sync plugins to Convex once per session
  useEffect(() => {
    if (!isOnboardingComplete || !isLoggedIn || plugins.length === 0) return;
    if (autoSyncFired.current) return;
    autoSyncFired.current = true;
    autoSync().catch(() => { });
  }, [isOnboardingComplete, isLoggedIn, plugins.length, autoSync]);

  useEffect(() => {
    if (!isOnboardingComplete) return;
    initOffline();
    startRetryLoop(executeQueuedWrite);
  }, [initOffline, isOnboardingComplete]);

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

  // Cmd+1..9 to jump to Nth plugin (works from both chain view and inline editor)
  useEffect(() => {
    if (!isOnboardingComplete) return;

    const registerShortcut = useKeyboardStore.getState().registerShortcut;
    const cleanups: (() => void)[] = [];

    for (let n = 1; n <= 9; n++) {
      cleanups.push(registerShortcut({
        id: `app-plugin-jump-${n}`,
        key: String(n),
        priority: ShortcutPriority.GLOBAL,
        allowInInputs: false,
        handler: (e) => {
          if (!e.metaKey && !e.ctrlKey) return;
          if (e.altKey) return; // Let Cmd+Option+N pass through for snapshots
          e.preventDefault();
          const nodes = useChainStore.getState().nodes;
          const allPlugins = collectPlugins(nodes);
          const target = allPlugins[n - 1];
          if (target) {
            useChainStore.getState().openInlineEditor(target.id);
          }
        },
      }));
    }

    // Cmd+0 → back to chain view
    cleanups.push(registerShortcut({
      id: 'app-back-to-chain',
      key: '0',
      priority: ShortcutPriority.GLOBAL,
      allowInInputs: false,
      handler: (e) => {
        if (!e.metaKey && !e.ctrlKey) return;
        e.preventDefault();
        const state = useChainStore.getState();
        if (state.aiChatActive) state.closeAiChat();
        if (state.inlineEditorNodeId !== null) state.closeInlineEditor();
      },
    }));

    return () => cleanups.forEach(fn => fn());
  }, [isOnboardingComplete]);

  // Listen for openPluginBrowser events from child components
  useEffect(() => {
    if (!isOnboardingComplete) return;
    const handler = () => setBrowserOpen(true);
    window.addEventListener('openPluginBrowser', handler);
    return () => window.removeEventListener('openPluginBrowser', handler);
  }, [isOnboardingComplete]);

  const toggleBrowser = useCallback(() => {
    setBrowserOpen(prev => {
      const next = !prev;
      // Notify ChainEditor's mini browser to collapse/expand
      window.dispatchEvent(new Event(next ? 'openPluginBrowser' : 'closePluginBrowser'));
      return next;
    });
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

  const isInlineMode = inlineEditorNodeId !== null || aiChatActive;

  const viewTransition = 'opacity 180ms ease, transform 180ms ease';

  return (
    <ErrorBoundary>
      <div className="relative w-full h-full" style={{ background: '#0a0a0a' }}>
        {/* Inline editor view */}
        <div
          className="absolute inset-0"
          style={{
            opacity: isInlineMode ? 1 : 0,
            transform: isInlineMode ? 'translateY(0)' : 'translateY(4px)',
            transition: viewTransition,
            pointerEvents: isInlineMode ? 'auto' : 'none',
            zIndex: isInlineMode ? 1 : 0,
          }}
        >
          <InlineEditorLayout />
        </div>

        {/* Chain editor view */}
        <div
          className="absolute inset-0"
          style={{
            opacity: isInlineMode ? 0 : 1,
            transform: isInlineMode ? 'translateY(4px)' : 'translateY(0)',
            transition: viewTransition,
            pointerEvents: isInlineMode ? 'none' : 'auto',
            zIndex: isInlineMode ? 0 : 1,
          }}
        >
          <div
            className="relative flex flex-col w-full h-full select-none overflow-hidden"
          >
            {/* Animated gradient background */}
            {!isInlineMode && (
              <GrainientBackground
                color1="#383838"
                color2="#000000"
                color3="#787878"
              />
            )}

            {/* Chain area — fills remaining space */}
            <div className="flex-1 min-h-0 overflow-hidden relative z-[1]">
              <ErrorBoundary>
                <ChainEditor />
              </ErrorBoundary>
            </div>

            {/* Plugin browser overlay - full screen */}
            {browserOpen && (
              <ErrorBoundary>
                <ChainBrowser onClose={toggleBrowser} initialTab="plugins" />
              </ErrorBoundary>
            )}

            {/* Keyboard shortcut overlay */}
            <KeyboardShortcutOverlay />
          </div>
        </div>

        {/* Undo toast — visible in both modes */}
        <UndoToast />
        {/* New plugins detected toast — global, bottom-right */}
        <NewPluginsToast />
      </div>
    </ErrorBoundary>
  );
}

export default App;
