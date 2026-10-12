#include "PluginEditorHost.h"
#include "../core/ChainProcessor.h"

//==============================================================================
PluginEditorHost::PluginEditorHost(ChainProcessor& cp)
    : chainProcessor(cp)
{
}

PluginEditorHost::~PluginEditorHost()
{
    clearCurrentEditor();
}

void PluginEditorHost::paint(juce::Graphics& g)
{
    g.fillAll(juce::Colour(0xff1a1a1a));

    if (!currentEditor)
    {
        // Draw placeholder when no plugin is selected
        g.setColour(juce::Colour(0xff404040));
        g.setFont(16.0f);

        auto bounds = getLocalBounds();
        g.drawText("Select a plugin to view its interface",
                   bounds, juce::Justification::centred);
    }
}

void PluginEditorHost::resized()
{
    if (currentEditor)
    {
        updateEditorBounds();
    }
}

void PluginEditorHost::updateEditorBounds()
{
    if (!currentEditor)
        return;

    auto hostBounds = getLocalBounds();

    if (currentEditor->isResizable())
    {
        // Resizable plugin: fill the available space
        // Respect the editor's size constraints if any
        auto* constrainer = currentEditor->getConstrainer();

        int newWidth = hostBounds.getWidth();
        int newHeight = hostBounds.getHeight();

        if (constrainer)
        {
            // Apply min/max constraints
            newWidth = juce::jlimit(constrainer->getMinimumWidth(),
                                     constrainer->getMaximumWidth() > 0 ? constrainer->getMaximumWidth() : newWidth,
                                     newWidth);
            newHeight = juce::jlimit(constrainer->getMinimumHeight(),
                                      constrainer->getMaximumHeight() > 0 ? constrainer->getMaximumHeight() : newHeight,
                                      newHeight);
        }

        // Set the editor size
        currentEditor->setSize(newWidth, newHeight);

        // Center if it doesn't fill the whole space
        int x = (hostBounds.getWidth() - newWidth) / 2;
        int y = (hostBounds.getHeight() - newHeight) / 2;
        currentEditor->setTopLeftPosition(x, y);
    }
    else
    {
        // Non-resizable plugin: center it in the available space
        int editorWidth = currentEditor->getWidth();
        int editorHeight = currentEditor->getHeight();

        int x = (hostBounds.getWidth() - editorWidth) / 2;
        int y = (hostBounds.getHeight() - editorHeight) / 2;

        // Ensure it's not positioned off-screen (negative)
        x = std::max(0, x);
        y = std::max(0, y);

        currentEditor->setTopLeftPosition(x, y);
    }
}

bool PluginEditorHost::showEditor(int slotIndex)
{
    // If same slot, just ensure visibility
    if (slotIndex == currentSlotIndex && currentEditor != nullptr)
        return true;

    clearCurrentEditor();

    if (slotIndex < 0)
        return false;

    // Get the processor from the chain
    auto* slot = chainProcessor.getSlot(slotIndex);
    if (!slot)
        return false;

    // Get the node from the graph
    if (auto* node = chainProcessor.getNodeForId(slot->nodeId))
    {
        if (auto* processor = node->getProcessor())
        {
            if (processor->hasEditor())
            {
                currentEditor.reset(processor->createEditor());
                if (currentEditor)
                {
                    currentSlotIndex = slotIndex;
                    addAndMakeVisible(currentEditor.get());

                    // For resizable editors, set initial size to fill the host
                    if (currentEditor->isResizable())
                    {
                        auto hostBounds = getLocalBounds();
                        auto* constrainer = currentEditor->getConstrainer();

                        int newWidth = hostBounds.getWidth();
                        int newHeight = hostBounds.getHeight();

                        if (constrainer)
                        {
                            newWidth = juce::jlimit(constrainer->getMinimumWidth(),
                                                     constrainer->getMaximumWidth() > 0 ? constrainer->getMaximumWidth() : newWidth,
                                                     newWidth);
                            newHeight = juce::jlimit(constrainer->getMinimumHeight(),
                                                      constrainer->getMaximumHeight() > 0 ? constrainer->getMaximumHeight() : newHeight,
                                                      newHeight);
                        }

                        currentEditor->setSize(newWidth, newHeight);
                    }

                    // Position the editor
                    updateEditorBounds();

                    repaint();
                    return true;
                }
            }
        }
    }

    return false;
}

void PluginEditorHost::hideEditor()
{
    clearCurrentEditor();
    repaint();
}

void PluginEditorHost::clearCurrentEditor()
{
    if (currentEditor)
    {
        removeChildComponent(currentEditor.get());
        currentEditor.reset();
    }
    currentSlotIndex = -1;
}
