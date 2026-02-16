#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <atomic>

/**
 * BranchGainProcessor - Simple per-branch gain control for parallel routing.
 *
 * Stereo in, stereo out. Applies a gain value specified in dB.
 * Used both for per-branch level control and for parallel sum compensation.
 */
class BranchGainProcessor : public juce::AudioProcessor
{
public:
    BranchGainProcessor();
    ~BranchGainProcessor() override = default;

    void setGainDb(float dB);
    float getGainDb() const { return gainDb.load(std::memory_order_relaxed); }

    // AudioProcessor overrides
    const juce::String getName() const override { return "BranchGain"; }
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
    static float dbToLinear(float dB) noexcept;

    std::atomic<float> gainDb{0.0f};
    juce::SmoothedValue<float, juce::ValueSmoothingTypes::Multiplicative> smoothedGain;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(BranchGainProcessor)
};
