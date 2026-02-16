#include "PluginEditor.h"
#include "bridge/ResourceProvider.h"
#include "platform/KeyboardInterceptor.h"

PluginChainManagerEditor::PluginChainManagerEditor(PluginChainManagerProcessor& p)
    : AudioProcessorEditor(&p), processorRef(p)
{
    // Initialize WebView (creates webBrowser)
    initializeWebView();

    // Set the size — this triggers resized() which sets WebView to full bounds
    setResizable(true, true);
    setResizeLimits(500, 750, 3840, 2160);
    setSize(500, 750);
}

PluginChainManagerEditor::~PluginChainManagerEditor()
{
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
