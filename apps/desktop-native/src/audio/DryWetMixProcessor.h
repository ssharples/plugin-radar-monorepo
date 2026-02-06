#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <atomic>

/**
 * DryWetMixProcessor - Crossfades between dry and wet stereo signals.
 *
 * 4 input channels: ch0-1 = dry (L/R), ch2-3 = wet (L/R)
 * 2 output channels: mixed result (L/R)
 *
 * mix = 0.0 → 100% dry
 * mix = 1.0 → 100% wet
 */
class DryWetMixProcessor : public juce::AudioProcessor
{
public:
    DryWetMixProcessor();
    ~DryWetMixProcessor() override = default;

    void setMix(float newMix);
    float getMix() const { return mix.load(std::memory_order_relaxed); }

    // AudioProcessor overrides
    const juce::String getName() const override { return "DryWetMix"; }
    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override;

    double getTailLengthSeconds() const override { return 0.0; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }

    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock&) override {}
    void setStateInformation(const void*, int) override {}

private:
    std::atomic<float> mix{1.0f};
    juce::SmoothedValue<float> smoothedMix;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(DryWetMixProcessor)
};
