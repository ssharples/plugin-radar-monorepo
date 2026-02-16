#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <atomic>

/**
 * DuckingProcessor - Sidechain-style ducking for parallel groups.
 *
 * 4 inputs (2 audio + 2 sidechain), 2 outputs.
 * Channels 0-1: group audio signal (to be ducked)
 * Channels 2-3: sidechain reference (pre-group main chain signal)
 *
 * An envelope follower tracks the sidechain level and attenuates the output:
 *   outputGain = 1.0 - (envelopeLevel * duckAmount)
 *
 * When dry signal is present, the group output ducks.
 * When dry signal stops, the group output swells back to full level.
 */
class DuckingProcessor : public juce::AudioProcessor
{
public:
    DuckingProcessor();
    ~DuckingProcessor() override = default;

    void setDuckAmount(float amount);
    float getDuckAmount() const { return duckAmount.load(std::memory_order_relaxed); }

    void setReleaseMs(float ms);
    float getReleaseMs() const { return releaseMs.load(std::memory_order_relaxed); }

    // AudioProcessor overrides
    const juce::String getName() const override { return "Ducking"; }
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
    std::atomic<float> duckAmount{0.0f};   // 0.0 = no ducking, 1.0 = full ducking
    std::atomic<float> releaseMs{200.0f};  // Envelope release time in ms

    // Envelope follower state (audio thread only)
    float envelopeLevel = 0.0f;
    float attackCoeff = 0.0f;
    float releaseCoeff = 0.0f;
    double currentSampleRate = 44100.0;

    // Smoothed gain to avoid clicks
    juce::SmoothedValue<float, juce::ValueSmoothingTypes::Multiplicative> smoothedGain;

    void updateCoefficients();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(DuckingProcessor)
};
