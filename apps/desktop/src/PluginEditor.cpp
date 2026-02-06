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
    setResizeLimits(500, 500, 3840, 2160);
    setSize(675, 700);
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
    webBrowser->setWantsKeyboardFocus(false);  // Don't capture keyboard from DAW
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
    // WebView takes full bounds
    if (webBrowser)
        webBrowser->setBounds(getLocalBounds());
}
