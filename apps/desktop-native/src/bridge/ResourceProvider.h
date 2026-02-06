#pragma once

#include <juce_gui_extra/juce_gui_extra.h>
#include <optional>

namespace ResourceProvider
{
    // Serves embedded UI resources from the ZIP file
    std::optional<juce::WebBrowserComponent::Resource> getResource(const juce::String& url);

    // Initialize resources from embedded binary data
    void initialize();

    // Check if running in development mode (serve from localhost)
    bool isDevMode();

    // Get the base URL for the UI
    juce::String getBaseUrl();
}
