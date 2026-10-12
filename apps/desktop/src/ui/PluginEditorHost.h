#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_basics/juce_gui_basics.h>

class ChainProcessor;

/**
 * A component that hosts embedded plugin editors within the main UI.
 * This allows plugin UIs to be displayed inline rather than in popup windows.
 *
 * Behavior:
 * - Resizable plugins: Fill the available space (respecting min/max constraints)
 * - Non-resizable plugins: Centered in the available space
 */
class PluginEditorHost : public juce::Component
{
public:
    explicit PluginEditorHost(ChainProcessor& chainProcessor);
    ~PluginEditorHost() override;

    void paint(juce::Graphics& g) override;
    void resized() override;

    /** Shows the plugin editor for the given slot index. Returns true if successful. */
    bool showEditor(int slotIndex);

    /** Hides the current plugin editor. */
    void hideEditor();

    /** Gets the currently displayed slot index, or -1 if none. */
    int getCurrentSlotIndex() const { return currentSlotIndex; }

    /** Check if an editor is currently visible */
    bool hasVisibleEditor() const { return currentEditor != nullptr; }

private:
    ChainProcessor& chainProcessor;
    std::unique_ptr<juce::AudioProcessorEditor> currentEditor;
    int currentSlotIndex = -1;

    /** Updates the editor position/size based on whether it's resizable */
    void updateEditorBounds();

    void clearCurrentEditor();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginEditorHost)
};
