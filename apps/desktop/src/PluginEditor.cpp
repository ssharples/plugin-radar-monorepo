#include "PluginEditor.h"
#include "bridge/ResourceProvider.h"
#include <iostream>

PluginChainManagerEditor::PluginChainManagerEditor(PluginChainManagerProcessor& p)
    : AudioProcessorEditor(&p), processorRef(p)
{
    // Initialize WebView (creates webBrowser)
    initializeWebView();

    // Set the size - this triggers resized() which sets WebView to full bounds
    setResizable(true, true);
    setResizeLimits(500, 800, 3840, 2160);
    setSize(500, 1000);
}

PluginChainManagerEditor::~PluginChainManagerEditor()
{
    webBrowser.reset();
    webViewBridge.reset();
}

void PluginChainManagerEditor::initializeWebView()
{
    // Create the WebView bridge
    webViewBridge = std::make_unique<WebViewBridge>(
        processorRef.getPluginManager(),
        processorRef.getChainProcessor(),
        processorRef.getPresetManager()
    );

    // Pass waveform capture to the bridge for streaming
    webViewBridge->setWaveformCapture(&processorRef.getWaveformCapture());

    // Pass gain processor and meters to the bridge
    webViewBridge->setGainProcessor(&processorRef.getGainProcessor());
    webViewBridge->setInputMeter(&processorRef.getInputMeter());
    webViewBridge->setOutputMeter(&processorRef.getOutputMeter());

    // Pass FFT processor to the bridge for spectrum analysis
    webViewBridge->setFFTProcessor(&processorRef.getFFTProcessor());

    // Create WebBrowserComponent with native function bindings
    webBrowser = std::make_unique<juce::WebBrowserComponent>(webViewBridge->getOptions());
    webBrowser->setWantsKeyboardFocus(true);  // Allow WebView to receive keyboard events when focused
    webViewBridge->setBrowserComponent(webBrowser.get());
    addAndMakeVisible(*webBrowser);

    // Use the resource provider root URL which enables native function integration
    auto url = webBrowser->getResourceProviderRoot();
    #if JUCE_DEBUG
    std::cerr << "PluginEditor: Loading URL: " << url << std::endl;
    #endif
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

        // Give the WebBrowser the full bounds. The React UI handles its own
        // layout within 100vw/100vh. A small edge margin is no longer needed
        // since the JUCE corner resizer is brought to front below.
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
