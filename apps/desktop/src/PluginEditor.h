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
    void parentHierarchyChanged() override;

private:
    PluginChainManagerProcessor& processorRef;

    std::unique_ptr<WebViewBridge> webViewBridge;
    std::unique_ptr<juce::WebBrowserComponent> webBrowser;

    bool keyboardInterceptorInstalled = false;

    void initializeWebView();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginChainManagerEditor)
};
