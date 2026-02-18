#include "ParameterProxyPool.h"
#include "ProxyParameter.h"
#include "../core/ChainProcessor.h"
#include "../audio/PluginWithMeterWrapper.h"
#include "../utils/ProChainLogger.h"

void ParameterProxyPool::createAndRegister(juce::AudioProcessor& processor)
{
    proxies.reserve(static_cast<size_t>(kMaxSlots * kMaxParamsPerSlot));

    for (int slot = 0; slot < kMaxSlots; ++slot)
    {
        for (int param = 0; param < kMaxParamsPerSlot; ++param)
        {
            auto proxy = std::make_unique<ProxyParameter>(slot, param);
            proxies.push_back(proxy.get());
            processor.addParameter(proxy.release()); // processor takes ownership
        }
    }
}

void ParameterProxyPool::bindSlot(int slotIndex, juce::AudioProcessor* childProcessor)
{
    if (slotIndex < 0 || slotIndex >= kMaxSlots)
        return;

    int baseIndex = slotIndex * kMaxParamsPerSlot;

    // Unbind all proxies for this slot first
    for (int i = 0; i < kMaxParamsPerSlot; ++i)
        proxies[static_cast<size_t>(baseIndex + i)]->unbind();

    if (childProcessor == nullptr)
        return;

    auto& childParams = childProcessor->getParameters();
    int numChildParams = juce::jmin(childParams.size(), kMaxParamsPerSlot);

    for (int i = 0; i < numChildParams; ++i)
        proxies[static_cast<size_t>(baseIndex + i)]->bind(childParams[i]);
}

void ParameterProxyPool::unbindSlot(int slotIndex)
{
    bindSlot(slotIndex, nullptr);
}

void ParameterProxyPool::rebindAll(ChainProcessor& chain)
{
    PCLOG("rebindAll — starting");

    // Use DFS-flattened plugin list from tree model
    auto plugins = chain.getFlatPluginList();
    int numPlugins = static_cast<int>(plugins.size());

    if (numPlugins > kMaxSlots)
    {
        PCLOG("WARNING: chain has " + juce::String(numPlugins)
              + " plugins but only " + juce::String(kMaxSlots)
              + " automation slots — plugins beyond slot "
              + juce::String(kMaxSlots - 1) + " will not be automatable");
    }

    int previousMax = maxBoundSlot;
    int newMax = 0;

    for (int i = 0; i < juce::jmin(numPlugins, kMaxSlots); ++i)
    {
        auto& leaf = *plugins[static_cast<size_t>(i)];
        if (auto node = chain.getNodeForId(leaf.graphNodeId))
        {
            juce::AudioProcessor* processor = nullptr;
            if (auto* wrapper = dynamic_cast<PluginWithMeterWrapper*>(node->getProcessor()))
            {
                processor = wrapper->getWrappedPlugin();
            }
            else
            {
                processor = node->getProcessor();
            }

            if (processor == nullptr)
            {
                PCLOG("WARNING: rebindAll slot " + juce::String(i)
                      + " — processor is null for " + leaf.description.name);
            }

            bindSlot(i, processor);
            newMax = i + 1;
        }
        else
        {
            PCLOG("WARNING: rebindAll slot " + juce::String(i)
                  + " — graph node not found for nodeId=" + juce::String(leaf.graphNodeId.uid));
            unbindSlot(i);
        }
    }

    // Only unbind slots that were previously bound but are no longer needed
    int unbindLimit = juce::jmax(previousMax, kMaxSlots);
    for (int i = juce::jmin(numPlugins, kMaxSlots); i < unbindLimit; ++i)
    {
        unbindSlot(i);
    }

    maxBoundSlot = newMax;

    PCLOG("rebindAll — done (" + juce::String(numPlugins) + " plugins)");
}
