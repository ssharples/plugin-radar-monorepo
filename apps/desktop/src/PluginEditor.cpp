#include "PluginEditor.h"
#include "bridge/ResourceProvider.h"
#include "platform/KeyboardInterceptor.h"
#include "audio/PluginWithMeterWrapper.h"
#include "utils/ProChainLogger.h"

//==============================================================================
// PluginChainManagerEditor
//==============================================================================

PluginChainManagerEditor::PluginChainManagerEditor(PluginChainManagerProcessor& p)
    : AudioProcessorEditor(&p), processorRef(p)
{
    // Initialize WebView (creates webBrowser)
    initializeWebView();

    // Wire editor pointer into bridge so JS can call inline editor functions
    webViewBridge->setEditor(this);

    // Set the size — this triggers resized() which sets WebView to full bounds
    setResizable(true, true);
    setResizeLimits(500, 750, 3840, 2160);
    setSize(500, 750);
}

PluginChainManagerEditor::~PluginChainManagerEditor()
{
    // Clean up inline editor first
    if (currentMode == ViewMode::PluginEditor)
    {
        if (inlineEditor)
            inlineEditor->removeComponentListener(this);
        inlineEditor.reset();
        editorViewport.reset();
    }

    KeyboardInterceptor::remove(webBrowser.get());
    webBrowser.reset();
    webViewBridge.reset();
}

void PluginChainManagerEditor::initializeWebView()
{
    // Create the WebView bridge
    webViewBridge = std::make_unique<WebViewBridge>(
        processorRef.getPluginManager(),
        processorRef.getChainProcessor(),
        processorRef.getPresetManager(),
        processorRef.getGroupTemplateManager()
    );

    // Pass waveform capture to the bridge for streaming
    webViewBridge->setWaveformCapture(&processorRef.getWaveformCapture());
    webViewBridge->setGainProcessor(&processorRef.getGainProcessor());
    webViewBridge->setInputMeter(&processorRef.getInputMeter());
    webViewBridge->setOutputMeter(&processorRef.getOutputMeter());
    webViewBridge->setMainProcessor(&processorRef);
    webViewBridge->setFFTProcessor(&processorRef.getFFTProcessor());
    webViewBridge->setInstanceRegistry(&processorRef.getInstanceRegistry(), processorRef.getInstanceId());
    webViewBridge->setMirrorManager(&processorRef.getMirrorManager());

    // Create WebBrowserComponent with native function bindings
    webBrowser = std::make_unique<juce::WebBrowserComponent>(webViewBridge->getOptions());
    webBrowser->setWantsKeyboardFocus(true);
    webViewBridge->setBrowserComponent(webBrowser.get());
    addAndMakeVisible(*webBrowser);

    // Use the resource provider root URL which enables native function integration
    auto url = webBrowser->getResourceProviderRoot();
    webBrowser->goToURL(url);
}

void PluginChainManagerEditor::paint(juce::Graphics& g)
{
    g.fillAll(juce::Colour(0xff121212));
}

void PluginChainManagerEditor::resized()
{
    if (currentMode == ViewMode::WebView)
    {
        if (webBrowser)
        {
            auto bounds = getLocalBounds();
            webBrowser->setBounds(bounds);

            // Ensure the corner resizer (if present) stays on top of the WebView
            for (int i = getNumChildComponents() - 1; i >= 0; --i)
            {
                auto* child = getChildComponent(i);
                if (child != webBrowser.get())
                    child->toFront(false);
            }
        }
    }
    else if (currentMode == ViewMode::PluginEditor)
    {
        auto bounds = getLocalBounds();

        // WebView spans the FULL window (L-shape: sidebar left + toolbar bottom + panels)
        if (webBrowser)
            webBrowser->setBounds(bounds);

        // Plugin editor overlaid: offset by sidebar on left, toolbar on bottom,
        // and any open panels on right/bottom
        auto editorArea = bounds;
        editorArea.removeFromLeft(sidebarWidth);
        editorArea.removeFromBottom(toolbarHeight);
        if (bottomPanelHeight > 0)
            editorArea.removeFromBottom(bottomPanelHeight);
        if (rightPanelWidth > 0)
            editorArea.removeFromRight(rightPanelWidth);

        if (editorViewport)
        {
            editorViewport->setBounds(editorArea);
            editorViewport->toFront(false);
        }
        else if (inlineEditor)
        {
            inlineEditor->setBounds(editorArea);
            inlineEditor->toFront(false);
        }
    }
}

void PluginChainManagerEditor::parentHierarchyChanged()
{
    AudioProcessorEditor::parentHierarchyChanged();

    // Install the native keyboard interceptor once we have a native peer.
    if (!keyboardInterceptorInstalled && webBrowser && getPeer())
    {
        KeyboardInterceptor::install(webBrowser.get(), this);
        keyboardInterceptorInstalled = true;
    }
}

//==============================================================================
// Inline Editor Mode
//==============================================================================

bool PluginChainManagerEditor::showInlineEditor(ChainNodeId nodeId)
{
    auto& chainProc = processorRef.getChainProcessor();

    // Find the node in the tree
    auto* node = ChainNodeHelpers::findById(chainProc.getRootNode(), nodeId);
    if (!node || !node->isPlugin())
        return false;

    // Close any existing external window for this node
    chainProc.hidePluginWindow(nodeId);

    // Save current webview dimensions
    savedWebViewWidth = getWidth();
    savedWebViewHeight = getHeight();

    // Get the raw plugin processor (unwrap PluginWithMeterWrapper)
    auto graphNodeId = node->getPlugin().graphNodeId;
    auto gNode = chainProc.getNodeForId(graphNodeId);
    if (!gNode)
        return false;

    juce::AudioProcessor* processor = nullptr;
    if (auto* wrapper = dynamic_cast<PluginWithMeterWrapper*>(gNode->getProcessor()))
        processor = wrapper->getWrappedPlugin();
    else
        processor = gNode->getProcessor();

    if (!processor || !processor->hasEditor())
        return false;

    auto* editor = processor->createEditor();
    if (!editor)
        return false;

    // Store the editor
    inlineEditor.reset(editor);
    inlineEditorNodeId = nodeId;

    // Check if editor needs viewport (oversized)
    int edW = editor->getWidth();
    int edH = editor->getHeight();
    bool needsViewport = (edW > 2000 || edH > 2000);

    if (needsViewport)
    {
        editorViewport = std::make_unique<juce::Viewport>();
        editorViewport->setViewedComponent(inlineEditor.get(), false);
        editorViewport->setScrollBarsShown(true, true);
        addAndMakeVisible(*editorViewport);
    }
    else
    {
        editorViewport.reset();
        addAndMakeVisible(*inlineEditor);
    }

    // Listen for plugin self-resize
    inlineEditor->addComponentListener(this);

    // Switch mode BEFORE setSize so resized() uses the correct layout
    currentMode = ViewMode::PluginEditor;

    // Disable manual resize in inline mode
    setResizable(false, false);

    // Resize host window: sidebar + editor width + right panel, editor height + toolbar + bottom panel
    int newW = edW + sidebarWidth + rightPanelWidth;
    int newH = edH + toolbarHeight + bottomPanelHeight;
    setSize(newW, newH);

    // Give keyboard focus to the plugin editor
    inlineEditor->grabKeyboardFocus();

    // Notify JS about mode change
    webViewBridge->emitEvent("inlineEditorChanged", [&]() {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("mode", "plugin");
        obj->setProperty("nodeId", nodeId);
        return juce::var(obj);
    }());

    return true;
}

void PluginChainManagerEditor::hideInlineEditor()
{
    if (currentMode != ViewMode::PluginEditor)
        return;

    // Remove listener and destroy editor
    if (inlineEditor)
    {
        inlineEditor->removeComponentListener(this);
        if (editorViewport)
        {
            editorViewport->setViewedComponent(nullptr, false);
            removeChildComponent(editorViewport.get());
            editorViewport.reset();
        }
        else
        {
            removeChildComponent(inlineEditor.get());
        }
        inlineEditor.reset();
    }

    inlineEditorNodeId = -1;

    // Reset panel dimensions when leaving inline mode
    rightPanelWidth = 0;
    bottomPanelHeight = 0;

    // Switch mode BEFORE setSize so resized() uses the correct layout
    currentMode = ViewMode::WebView;

    // Re-enable manual resize
    setResizable(true, true);
    setResizeLimits(500, 750, 3840, 2160);

    // Restore default webview size
    setSize(500, 750);

    // Notify JS about mode change
    webViewBridge->emitEvent("inlineEditorChanged", [&]() {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("mode", "webview");
        return juce::var(obj);
    }());
}

bool PluginChainManagerEditor::switchInlineEditor(ChainNodeId nodeId)
{
    if (nodeId == inlineEditorNodeId)
        return true;  // Already showing this one

    auto& chainProc = processorRef.getChainProcessor();

    // Find the new node
    auto* node = ChainNodeHelpers::findById(chainProc.getRootNode(), nodeId);
    if (!node || !node->isPlugin())
        return false;

    // Close any existing external window for the new node
    chainProc.hidePluginWindow(nodeId);

    // Get the raw plugin processor
    auto graphNodeId = node->getPlugin().graphNodeId;
    auto gNode = chainProc.getNodeForId(graphNodeId);
    if (!gNode)
        return false;

    juce::AudioProcessor* processor = nullptr;
    if (auto* wrapper = dynamic_cast<PluginWithMeterWrapper*>(gNode->getProcessor()))
        processor = wrapper->getWrappedPlugin();
    else
        processor = gNode->getProcessor();

    if (!processor || !processor->hasEditor())
        return false;

    auto* newEditor = processor->createEditor();
    if (!newEditor)
        return false;

    // Remove old editor
    if (inlineEditor)
    {
        inlineEditor->removeComponentListener(this);
        if (editorViewport)
        {
            editorViewport->setViewedComponent(nullptr, false);
            removeChildComponent(editorViewport.get());
            editorViewport.reset();
        }
        else
        {
            removeChildComponent(inlineEditor.get());
        }
        inlineEditor.reset();
    }

    // Set up new editor
    inlineEditor.reset(newEditor);
    inlineEditorNodeId = nodeId;

    int edW = newEditor->getWidth();
    int edH = newEditor->getHeight();
    bool needsViewport = (edW > 2000 || edH > 2000);

    if (needsViewport)
    {
        editorViewport = std::make_unique<juce::Viewport>();
        editorViewport->setViewedComponent(inlineEditor.get(), false);
        editorViewport->setScrollBarsShown(true, true);
        addAndMakeVisible(*editorViewport);
    }
    else
    {
        editorViewport.reset();
        addAndMakeVisible(*inlineEditor);
    }

    inlineEditor->addComponentListener(this);

    // Resize to fit new editor (sidebar + editor width + right panel, editor + toolbar + bottom panel)
    int newW = edW + sidebarWidth + rightPanelWidth;
    int newH = edH + toolbarHeight + bottomPanelHeight;
    setSize(newW, newH);

    inlineEditor->grabKeyboardFocus();

    // Notify JS
    webViewBridge->emitEvent("inlineEditorChanged", [&]() {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("mode", "plugin");
        obj->setProperty("nodeId", nodeId);
        return juce::var(obj);
    }());

    return true;
}

void PluginChainManagerEditor::componentMovedOrResized(juce::Component& component,
                                                        bool /*wasMoved*/,
                                                        bool wasResized)
{
    if (!wasResized || resizeGuard)
        return;

    if (&component == inlineEditor.get() && currentMode == ViewMode::PluginEditor)
    {
        resizeGuard = true;

        int edW = inlineEditor->getWidth();
        int edH = inlineEditor->getHeight();

        // Check if we need to add/remove viewport
        bool needsViewport = (edW > 2000 || edH > 2000);
        if (needsViewport && !editorViewport)
        {
            removeChildComponent(inlineEditor.get());
            editorViewport = std::make_unique<juce::Viewport>();
            editorViewport->setViewedComponent(inlineEditor.get(), false);
            editorViewport->setScrollBarsShown(true, true);
            addAndMakeVisible(*editorViewport);
        }
        else if (!needsViewport && editorViewport)
        {
            editorViewport->setViewedComponent(nullptr, false);
            removeChildComponent(editorViewport.get());
            editorViewport.reset();
            addAndMakeVisible(*inlineEditor);
        }

        setSize(edW + sidebarWidth + rightPanelWidth, edH + toolbarHeight + bottomPanelHeight);

        resizeGuard = false;
    }
}

//==============================================================================
// Panel Layout — expand/contract window for WebView panels
//==============================================================================

void PluginChainManagerEditor::setPanelLayout(int rightWidth, int bottomHeight)
{
    rightPanelWidth = juce::jmax(0, rightWidth);
    bottomPanelHeight = juce::jmax(0, bottomHeight);

    if (currentMode == ViewMode::PluginEditor && inlineEditor)
    {
        // Recalculate window size: plugin editor dimensions + sidebar + toolbar + panels
        int edW = inlineEditor->getWidth();
        int edH = inlineEditor->getHeight();
        int newW = edW + sidebarWidth + rightPanelWidth;
        int newH = edH + toolbarHeight + bottomPanelHeight;
        setSize(newW, newH);
    }
}

//==============================================================================
// Search Overlay Mode
//==============================================================================

void PluginChainManagerEditor::showSearchOverlay()
{
    if (currentMode != ViewMode::PluginEditor || !inlineEditor || searchOverlayActive)
        return;

    searchOverlayActive = true;

    // Hide the inline editor
    if (editorViewport)
        editorViewport->setVisible(false);
    else
        inlineEditor->setVisible(false);

    // WebView already spans full window — just need to notify JS
    webViewBridge->emitEvent("searchOverlayOpened", juce::var());
}

void PluginChainManagerEditor::hideSearchOverlay()
{
    if (!searchOverlayActive)
        return;

    searchOverlayActive = false;

    // Restore inline editor visibility
    if (editorViewport)
        editorViewport->setVisible(true);
    else if (inlineEditor)
        inlineEditor->setVisible(true);

    // Restore layout via resized()
    resized();

    // Notify JS
    webViewBridge->emitEvent("searchOverlayClosed", juce::var());
}
