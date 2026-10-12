#include "PluginCanvas.h"
#include "../core/ChainProcessor.h"

//==============================================================================
// PluginCard Implementation
//==============================================================================

PluginCard::PluginCard(int slot, const juce::String& name,
                       std::unique_ptr<juce::AudioProcessorEditor> ed,
                       std::function<void(int)> onClose,
                       std::function<void(int)> onBypass)
    : slotIndex(slot)
    , pluginName(name)
    , editor(std::move(ed))
    , onCloseCallback(onClose)
    , onBypassCallback(onBypass)
{
    if (editor)
    {
        addAndMakeVisible(editor.get());

        // For resizable editors, start at minimum size
        if (editor->isResizable())
        {
            auto* constrainer = editor->getConstrainer();
            if (constrainer && constrainer->getMinimumWidth() > 0 && constrainer->getMinimumHeight() > 0)
            {
                editor->setSize(constrainer->getMinimumWidth(), constrainer->getMinimumHeight());
            }
        }

        // Set card size based on editor size
        int width = editor->getWidth() + padding * 2;
        int height = editor->getHeight() + titleBarHeight + padding + resizeHandleSize;
        setSize(width, height);

        // Check if the editor is resizable
        isEditorResizable = editor->isResizable();
    }
    else
    {
        setSize(300, 200);
    }
}

PluginCard::~PluginCard() = default;

void PluginCard::paint(juce::Graphics& g)
{
    auto bounds = getLocalBounds();

    // Card background
    g.setColour(juce::Colour(0xff2a2a2a));
    g.fillRoundedRectangle(bounds.toFloat(), 6.0f);

    // Border
    g.setColour(bypassed ? juce::Colour(0xff666600) : juce::Colour(0xff444444));
    g.drawRoundedRectangle(bounds.toFloat().reduced(0.5f), 6.0f, 1.0f);

    // Title bar background
    auto titleBar = bounds.removeFromTop(titleBarHeight);
    g.setColour(bypassed ? juce::Colour(0xff3a3a00) : juce::Colour(0xff353535));
    g.fillRoundedRectangle(titleBar.toFloat(), 6.0f);
    // Fill bottom corners of title bar
    g.fillRect(titleBar.withTop(titleBar.getBottom() - 6));

    // Slot number badge
    auto badge = juce::Rectangle<int>(8, 4, 20, 20);
    g.setColour(bypassed ? juce::Colour(0xff888800) : juce::Colour(0xff007acc));
    g.fillRoundedRectangle(badge.toFloat(), 4.0f);
    g.setColour(juce::Colours::white);
    g.setFont(12.0f);
    g.drawText(juce::String(slotIndex + 1), badge, juce::Justification::centred);

    // Plugin name
    g.setColour(bypassed ? juce::Colour(0xff999966) : juce::Colours::white);
    g.setFont(13.0f);
    auto textBounds = juce::Rectangle<int>(32, 4, getWidth() - 80, 20);
    g.drawText(pluginName, textBounds, juce::Justification::centredLeft, true);

    // Close button (X)
    closeButtonBounds = juce::Rectangle<int>(getWidth() - 26, 4, 20, 20);
    g.setColour(juce::Colour(0xff555555));
    g.fillRoundedRectangle(closeButtonBounds.toFloat(), 4.0f);
    g.setColour(juce::Colours::white);
    g.setFont(14.0f);
    g.drawText(juce::String::charToString(0x00D7), closeButtonBounds, juce::Justification::centred);

    // Bypass button (power icon)
    bypassButtonBounds = juce::Rectangle<int>(getWidth() - 50, 4, 20, 20);
    g.setColour(bypassed ? juce::Colour(0xffaaaa00) : juce::Colour(0xff555555));
    g.fillRoundedRectangle(bypassButtonBounds.toFloat(), 4.0f);
    g.setColour(bypassed ? juce::Colour(0xffffff00) : juce::Colours::white);
    g.drawEllipse(bypassButtonBounds.reduced(5).toFloat(), 1.5f);
    g.drawLine((float)bypassButtonBounds.getCentreX(), (float)bypassButtonBounds.getY() + 5,
               (float)bypassButtonBounds.getCentreX(), (float)bypassButtonBounds.getCentreY(), 1.5f);

    // Draw resize handle for resizable editors
    if (isEditorResizable)
    {
        auto resizeArea = getResizeHandleBounds();
        g.setColour(juce::Colour(0xff666666));

        // Draw grip lines
        for (int i = 0; i < 3; ++i)
        {
            int offset = i * 4;
            g.drawLine((float)(resizeArea.getRight() - 4 - offset), (float)(resizeArea.getBottom() - 2),
                       (float)(resizeArea.getRight() - 2), (float)(resizeArea.getBottom() - 4 - offset), 1.5f);
        }
    }
}

void PluginCard::resized()
{
    if (editor)
    {
        auto contentBounds = getLocalBounds();
        contentBounds.removeFromTop(titleBarHeight);
        contentBounds.reduce(padding, padding);
        contentBounds.removeFromBottom(resizeHandleSize);

        if (isEditorResizable)
        {
            // Resize the editor to fit the card content area
            editor->setSize(contentBounds.getWidth(), contentBounds.getHeight());
        }

        editor->setTopLeftPosition(contentBounds.getX(), contentBounds.getY());
    }
}

juce::Rectangle<int> PluginCard::getResizeHandleBounds() const
{
    return juce::Rectangle<int>(getWidth() - resizeHandleSize, getHeight() - resizeHandleSize,
                                 resizeHandleSize, resizeHandleSize);
}

bool PluginCard::isOverResizeHandle(const juce::Point<int>& pos) const
{
    if (!isEditorResizable)
        return false;
    return getResizeHandleBounds().contains(pos);
}

void PluginCard::mouseDown(const juce::MouseEvent& e)
{
    auto pos = e.getPosition();

    // Check for button clicks
    if (closeButtonBounds.contains(pos))
    {
        if (onCloseCallback)
            onCloseCallback(slotIndex);
        return;
    }

    if (bypassButtonBounds.contains(pos))
    {
        if (onBypassCallback)
            onBypassCallback(slotIndex);
        return;
    }

    // Check for resize handle
    if (isOverResizeHandle(pos))
    {
        isResizing = true;
        resizeStartBounds = getBounds();
        toFront(true);
        return;
    }

    // Only allow dragging from title bar
    if (pos.getY() < titleBarHeight)
    {
        isDragging = true;
        dragStartPos = e.getEventRelativeTo(getParentComponent()).getPosition();
        componentStartPos = getPosition();
        toFront(true);
    }
}

void PluginCard::mouseDrag(const juce::MouseEvent& e)
{
    if (isResizing && editor)
    {
        auto parentEvent = e.getEventRelativeTo(getParentComponent());
        int newWidth = parentEvent.getPosition().getX() - getX() + resizeHandleSize / 2;
        int newHeight = parentEvent.getPosition().getY() - getY() + resizeHandleSize / 2;

        // Get editor constraints
        int minWidth = 200, minHeight = 150;
        int maxWidth = 4000, maxHeight = 3000;

        if (auto* constrainer = editor->getConstrainer())
        {
            if (constrainer->getMinimumWidth() > 0)
                minWidth = constrainer->getMinimumWidth() + padding * 2;
            if (constrainer->getMinimumHeight() > 0)
                minHeight = constrainer->getMinimumHeight() + titleBarHeight + padding + resizeHandleSize;
            if (constrainer->getMaximumWidth() > 0)
                maxWidth = constrainer->getMaximumWidth() + padding * 2;
            if (constrainer->getMaximumHeight() > 0)
                maxHeight = constrainer->getMaximumHeight() + titleBarHeight + padding + resizeHandleSize;
        }

        newWidth = juce::jlimit(minWidth, maxWidth, newWidth);
        newHeight = juce::jlimit(minHeight, maxHeight, newHeight);

        setSize(newWidth, newHeight);
    }
    else if (isDragging)
    {
        auto parentEvent = e.getEventRelativeTo(getParentComponent());
        auto delta = parentEvent.getPosition() - dragStartPos;
        setTopLeftPosition(componentStartPos + delta);
    }
}

void PluginCard::mouseUp(const juce::MouseEvent& e)
{
    isResizing = false;
    isDragging = false;
}

void PluginCard::mouseMove(const juce::MouseEvent& e)
{
    // Update cursor based on position
    if (isOverResizeHandle(e.getPosition()))
    {
        setMouseCursor(juce::MouseCursor::BottomRightCornerResizeCursor);
    }
    else if (e.getPosition().getY() < titleBarHeight)
    {
        setMouseCursor(juce::MouseCursor::DraggingHandCursor);
    }
    else
    {
        setMouseCursor(juce::MouseCursor::NormalCursor);
    }
}

void PluginCard::mouseExit(const juce::MouseEvent& e)
{
    setMouseCursor(juce::MouseCursor::NormalCursor);
}

void PluginCard::setBypassed(bool bp)
{
    bypassed = bp;
    repaint();
}

//==============================================================================
// PluginCanvas Implementation
//==============================================================================

PluginCanvas::PluginCanvas(ChainProcessor& cp)
    : chainProcessor(cp)
{
    setSize(2000, 2000);  // Large canvas size
}

PluginCanvas::~PluginCanvas()
{
    for (auto& card : pluginCards)
    {
        card->removeComponentListener(this);
    }
}

void PluginCanvas::paint(juce::Graphics& g)
{
    // Solid black background
    g.fillAll(juce::Colours::black);

    // Draw "empty" message if no plugins
    if (pluginCards.empty())
    {
        g.setColour(juce::Colour(0xff404040));
        g.setFont(18.0f);
        g.drawText("Add plugins from the browser on the left",
                   getLocalBounds(), juce::Justification::centred);
    }
}

void PluginCanvas::resized()
{
    updateCanvasSize();
}

void PluginCanvas::refreshPlugins()
{
    // Clear existing cards
    for (auto& card : pluginCards)
    {
        card->removeComponentListener(this);
        removeChildComponent(card.get());
    }
    pluginCards.clear();

    // Create cards for all slots
    int numSlots = chainProcessor.getNumSlots();
    for (int i = 0; i < numSlots; ++i)
    {
        createCardForSlot(i);
    }

    // Arrange them in a flow layout
    arrangeCardsInFlow();
    updateCanvasSize();
    repaint();
}

void PluginCanvas::createCardForSlot(int slotIndex)
{
    auto* slot = chainProcessor.getSlot(slotIndex);
    if (!slot)
        return;

    auto* node = chainProcessor.getNodeForId(slot->nodeId);
    if (!node)
        return;

    auto* processor = node->getProcessor();
    if (!processor || !processor->hasEditor())
        return;

    std::unique_ptr<juce::AudioProcessorEditor> editor(processor->createEditor());
    if (!editor)
        return;

    auto card = std::make_unique<PluginCard>(
        slotIndex,
        slot->description.name,
        std::move(editor),
        [this](int idx) {
            // Remove plugin callback
            chainProcessor.removePlugin(idx);
        },
        [this](int idx) {
            // Toggle bypass callback
            auto* s = chainProcessor.getSlot(idx);
            if (s)
                chainProcessor.setSlotBypassed(idx, !s->bypassed);
        }
    );

    card->setBypassed(slot->bypassed);
    card->addComponentListener(this);
    addAndMakeVisible(card.get());
    pluginCards.push_back(std::move(card));
}

void PluginCanvas::arrangeCardsInFlow()
{
    int x = initialX;
    int y = initialY;
    int rowHeight = 0;
    int maxWidth = std::max(800, getParentWidth() - initialX * 2);

    for (auto& card : pluginCards)
    {
        int cardWidth = card->getWidth();
        int cardHeight = card->getHeight();

        // Check if we need to wrap to next row
        if (x + cardWidth > maxWidth && x > initialX)
        {
            x = initialX;
            y += rowHeight + cardSpacing;
            rowHeight = 0;
        }

        card->setTopLeftPosition(x, y);
        x += cardWidth + cardSpacing;
        rowHeight = std::max(rowHeight, cardHeight);
    }
}

void PluginCanvas::updateCanvasSize()
{
    int maxX = 800;
    int maxY = 600;

    for (const auto& card : pluginCards)
    {
        maxX = std::max(maxX, card->getRight() + cardSpacing);
        maxY = std::max(maxY, card->getBottom() + cardSpacing);
    }

    setSize(maxX, maxY);
}

juce::Point<int> PluginCanvas::getNextCardPosition()
{
    if (pluginCards.empty())
        return {initialX, initialY};

    auto& lastCard = pluginCards.back();
    int x = lastCard->getRight() + cardSpacing;
    int y = lastCard->getY();

    if (x > getWidth() - 300)
    {
        x = initialX;
        y = lastCard->getBottom() + cardSpacing;
    }

    return {x, y};
}

void PluginCanvas::onPluginAdded(int slotIndex)
{
    refreshPlugins();
}

void PluginCanvas::onPluginRemoved(int slotIndex)
{
    refreshPlugins();
}

void PluginCanvas::onChainReordered()
{
    refreshPlugins();
}

void PluginCanvas::componentMovedOrResized(juce::Component& component, bool wasMoved, bool wasResized)
{
    if (wasMoved || wasResized)
    {
        updateCanvasSize();
    }
}

void PluginCanvas::mouseDown(const juce::MouseEvent& e)
{
    // Middle mouse button for panning
    if (e.mods.isMiddleButtonDown())
    {
        isPanning = true;
        lastMouseDownPosition = e.getPosition();
        setMouseCursor(juce::MouseCursor::DraggingHandCursor);
    }
}

void PluginCanvas::mouseDrag(const juce::MouseEvent& e)
{
    if (isPanning)
    {
        auto delta = e.getPosition() - lastMouseDownPosition;
        lastMouseDownPosition = e.getPosition();

        for (auto& card : pluginCards)
        {
            card->setTopLeftPosition(card->getX() + delta.getX(),
                                     card->getY() + delta.getY());
        }
    }
}

void PluginCanvas::mouseUp(const juce::MouseEvent& e)
{
    isPanning = false;
    setMouseCursor(juce::MouseCursor::NormalCursor);
}

void PluginCanvas::mouseWheelMove(const juce::MouseEvent& e, const juce::MouseWheelDetails& wheel)
{
    int deltaX = static_cast<int>(wheel.deltaX * 50);
    int deltaY = static_cast<int>(wheel.deltaY * 50);

    for (auto& card : pluginCards)
    {
        card->setTopLeftPosition(card->getX() + deltaX,
                                 card->getY() + deltaY);
    }
}
