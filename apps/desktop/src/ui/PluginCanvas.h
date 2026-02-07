#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <vector>
#include <memory>

class ChainProcessor;

/**
 * A draggable card that contains a single plugin editor.
 * Can be moved around the canvas and shows the plugin name in a title bar.
 * Resizable plugins have a resize handle in the bottom-right corner.
 */
class PluginCard : public juce::Component
{
public:
    PluginCard(int slotIndex, const juce::String& pluginName,
               std::unique_ptr<juce::AudioProcessorEditor> editor,
               std::function<void(int)> onClose,
               std::function<void(int)> onBypass);
    ~PluginCard() override;

    void paint(juce::Graphics& g) override;
    void resized() override;
    void mouseDown(const juce::MouseEvent& e) override;
    void mouseDrag(const juce::MouseEvent& e) override;
    void mouseUp(const juce::MouseEvent& e) override;
    void mouseMove(const juce::MouseEvent& e) override;
    void mouseExit(const juce::MouseEvent& e) override;

    int getSlotIndex() const { return slotIndex; }
    juce::AudioProcessorEditor* getEditor() { return editor.get(); }

    void setBypassed(bool bypassed);
    bool isBypassed() const { return bypassed; }

private:
    int slotIndex;
    juce::String pluginName;
    std::unique_ptr<juce::AudioProcessorEditor> editor;
    std::function<void(int)> onCloseCallback;
    std::function<void(int)> onBypassCallback;
    bool bypassed = false;
    bool isEditorResizable = false;

    // Dragging state
    bool isDragging = false;
    juce::Point<int> dragStartPos;
    juce::Point<int> componentStartPos;

    // Resizing state
    bool isResizing = false;
    juce::Rectangle<int> resizeStartBounds;

    static constexpr int titleBarHeight = 28;
    static constexpr int padding = 2;
    static constexpr int resizeHandleSize = 16;

    // Title bar buttons
    juce::Rectangle<int> closeButtonBounds;
    juce::Rectangle<int> bypassButtonBounds;

    juce::Rectangle<int> getResizeHandleBounds() const;
    bool isOverResizeHandle(const juce::Point<int>& pos) const;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginCard)
};

/**
 * A canvas that displays all plugin editors in the chain simultaneously.
 * Users can drag plugins around to arrange them as they like.
 * The canvas is scrollable/pannable to accommodate many plugins.
 * Plugins can overlap freely.
 */
class PluginCanvas : public juce::Component,
                     public juce::ComponentListener
{
public:
    explicit PluginCanvas(ChainProcessor& chainProcessor);
    ~PluginCanvas() override;

    void paint(juce::Graphics& g) override;
    void resized() override;

    /** Refreshes all plugin cards based on current chain state */
    void refreshPlugins();

    /** Called when a plugin is added to the chain */
    void onPluginAdded(int slotIndex);

    /** Called when a plugin is removed from the chain */
    void onPluginRemoved(int slotIndex);

    /** Called when chain order changes */
    void onChainReordered();

    // ComponentListener
    void componentMovedOrResized(juce::Component& component, bool wasMoved, bool wasResized) override;

private:
    ChainProcessor& chainProcessor;
    std::vector<std::unique_ptr<PluginCard>> pluginCards;

    // Canvas panning
    juce::Point<int> canvasOffset{0, 0};
    juce::Point<int> lastMouseDownPosition;
    bool isPanning = false;

    // Grid layout settings
    static constexpr int cardSpacing = 20;
    static constexpr int initialX = 20;
    static constexpr int initialY = 20;

    void createCardForSlot(int slotIndex);
    void arrangeCardsInFlow();
    void updateCanvasSize();
    juce::Point<int> getNextCardPosition();

    void mouseDown(const juce::MouseEvent& e) override;
    void mouseDrag(const juce::MouseEvent& e) override;
    void mouseUp(const juce::MouseEvent& e) override;
    void mouseWheelMove(const juce::MouseEvent& e, const juce::MouseWheelDetails& wheel) override;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginCanvas)
};
