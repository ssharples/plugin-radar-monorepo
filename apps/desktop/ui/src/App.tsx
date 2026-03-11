import { Component, ErrorInfo, ReactNode, useEffect, useCallback, useRef, useState } from 'react';
import { PluginBrowser } from './components/PluginBrowser';
import { ChainEditor } from './components/ChainEditor';
import { KeyboardShortcutOverlay } from './components/KeyboardShortcutOverlay';
// import { AiChatView } from './components/AiAssistant/AiChatView';
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
          galaxyActive={aiChatActive}
          onToggleGalaxy={() => aiChatActive ? closeAiChat() : openAiChat()}
        />
        <PanelContainer>
          {aiChatActive ? (
            <div className="flex-1 min-h-0 overflow-hidden h-full text-white flex items-center justify-center">
              <div>AI Chat Not Installed</div>
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
  console.log('[App] Rendering...')
  const [browserOpen, setBrowserOpen] = useState(false);

  const { isInitializing, initialize: initOnboarding } = useOnboardingStore();
  const { fetchPresets } = usePresetStore();
  const { initialize: initSync, isLoggedIn, autoSync } = useSyncStore();
  const { initialize: initOffline } = useOfflineStore();
  const { fetchPlugins, plugins, checkForNewPlugins } = usePluginStore();
  const inlineEditorNodeId = useChainStore(s => s.inlineEditorNodeId);
  const aiChatActive = useChainStore(s => s.aiChatActive);
  const nodeCount = useChainStore(s => s.nodes.length);
  const autoSyncFired = useRef(false);

  console.log('[App] isInitializing:', isInitializing)
  console.log('[App] isLoggedIn:', isLoggedIn)
  console.log('[App] plugins.length:', plugins.length)
  console.log('[App] inlineEditorNodeId:', inlineEditorNodeId)
  console.log('[App] aiChatActive:', aiChatActive)
  console.log('[App] nodeCount:', nodeCount)

  // Initialize onboarding check
  useEffect(() => {
    console.log('[App] Starting onboarding initialization...')
    initOnboarding().then(() => {
      console.log('[App] Onboarding initialization complete')
    }).catch((err) => {
      console.error('[App] Onboarding initialization error:', err)
    })
  }, [initOnboarding]);

  useEffect(() => {
    fetchPresets();
    fetchPlugins();
  }, [fetchPresets, fetchPlugins]);

  useEffect(() => {
    initSync().catch(() => { });
  }, [initSync]);

  // Auto-check for new plugins once per session (after plugin list is loaded)
  const newPluginsCheckFired = useRef(false)
  useEffect(() => {
    if (plugins.length === 0) return
    if (newPluginsCheckFired.current) return
    newPluginsCheckFired.current = true
    checkForNewPlugins().catch(() => { })
  }, [plugins.length, checkForNewPlugins])

  // Auto-sync plugins to Convex once per session
  useEffect(() => {
    if (!isLoggedIn || plugins.length === 0) return;
    if (autoSyncFired.current) return;
    autoSyncFired.current = true;
    autoSync().catch(() => { });
  }, [isLoggedIn, plugins.length, autoSync]);

  useEffect(() => {
    initOffline();
    startRetryLoop(executeQueuedWrite);
  }, [initOffline]);

  // Cmd+B to toggle browser
  useEffect(() => {
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
  }, []);

  // Cmd+1..9 to jump to Nth plugin (works from both chain view and inline editor)
  useEffect(() => {
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
  }, []);

  // Listen for openPluginBrowser events from child components
  useEffect(() => {
    const handler = () => setBrowserOpen(true);
    window.addEventListener('openPluginBrowser', handler);
    return () => window.removeEventListener('openPluginBrowser', handler);
  }, []);



  // Listen for openBrowser event from HeaderMenu
  useEffect(() => {
    const handler = () => {
      setBrowserOpen(true);
    };
    window.addEventListener('openBrowser', handler);
    return () => window.removeEventListener('openBrowser', handler);
  }, []);

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
                <PluginBrowser onClose={toggleBrowser} />
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
