#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_extra/juce_gui_extra.h>
#include "PluginProcessor.h"
#include "bridge/WebViewBridge.h"
#include "core/ChainNode.h"

class PluginChainManagerEditor : public juce::AudioProcessorEditor,
                                  private juce::ComponentListener
{
public:
    explicit PluginChainManagerEditor(PluginChainManagerProcessor&);
    ~PluginChainManagerEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;
    void parentHierarchyChanged() override;

    // =============================================
    // Inline Editor Mode
    // =============================================

    enum class ViewMode { WebView, PluginEditor };

    /** Show a plugin's native editor inline, with the webview as sidebar + toolbar. Returns false if plugin has no GUI. */
    bool showInlineEditor(ChainNodeId nodeId);

    /** Return to webview mode, destroying the inline editor. */
    void hideInlineEditor();

    /** Switch inline editor to a different plugin without returning to webview. */
    bool switchInlineEditor(ChainNodeId nodeId);

    bool isInInlineEditorMode() const { return currentMode == ViewMode::PluginEditor; }
    ChainNodeId getInlineEditorNodeId() const { return inlineEditorNodeId; }

    /** Show search overlay: hide inline editor, expand WebView to full window */
    void showSearchOverlay();

    /** Hide search overlay: restore sidebar + inline editor layout */
    void hideSearchOverlay();

    bool isSearchOverlayActive() const { return searchOverlayActive; }

    /** Update panel layout — expands the window to make room for panels alongside the plugin editor. */
    void setPanelLayout(int rightWidth, int bottomHeight);

    static constexpr int sidebarWidth = 44;
    static constexpr int toolbarHeight = 44;

private:
    PluginChainManagerProcessor& processorRef;

    std::unique_ptr<WebViewBridge> webViewBridge;
    std::unique_ptr<juce::WebBrowserComponent> webBrowser;

    bool keyboardInterceptorInstalled = false;

    void initializeWebView();

    // =============================================
    // Inline Editor State
    // =============================================

    ViewMode currentMode = ViewMode::WebView;
    std::unique_ptr<juce::AudioProcessorEditor> inlineEditor;
    std::unique_ptr<juce::Viewport> editorViewport;  // For oversized editors
    ChainNodeId inlineEditorNodeId = -1;
    int savedWebViewWidth = 500;
    int savedWebViewHeight = 750;
    bool resizeGuard = false;
    bool searchOverlayActive = false;

    // Panel layout — extra space for WebView panels alongside the plugin editor
    int rightPanelWidth = 0;
    int bottomPanelHeight = 0;

    // ComponentListener — track plugin editor self-resize
    void componentMovedOrResized(juce::Component& component, bool wasMoved, bool wasResized) override;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginChainManagerEditor)
};
