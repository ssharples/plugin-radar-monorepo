#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <vector>

class ProxyParameter;
class ChainProcessor;

class ParameterProxyPool
{
public:
    static constexpr int kMaxSlots = 16;
    static constexpr int kMaxParamsPerSlot = 128;

    ParameterProxyPool() = default;

    void createAndRegister(juce::AudioProcessor& processor);

    void bindSlot(int slotIndex, juce::AudioProcessor* childProcessor);
    void unbindSlot(int slotIndex);
    void rebindAll(ChainProcessor& chain);

private:
    std::vector<ProxyParameter*> proxies; // raw ptrs, owned by AudioProcessor

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ParameterProxyPool)
};
