#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_extra/juce_gui_extra.h>
#include "PluginProcessor.h"
#include "bridge/WebViewBridge.h"

class PluginChainManagerEditor : public juce::AudioProcessorEditor
{
public:
    explicit PluginChainManagerEditor(PluginChainManagerProcessor&);
    ~PluginChainManagerEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    PluginChainManagerProcessor& processorRef;

    std::unique_ptr<WebViewBridge> webViewBridge;
    std::unique_ptr<juce::WebBrowserComponent> webBrowser;

    void initializeWebView();

    // Last window size, shared by all instances, so new ones open at the size you used last.
    static juce::File sizeSettingsFile();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginChainManagerEditor)
};
