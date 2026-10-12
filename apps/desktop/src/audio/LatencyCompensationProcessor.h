#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_dsp/juce_dsp.h>

/**
 * LatencyCompensationProcessor - Delays audio by a fixed number of samples.
 *
 * Used in parallel routing to align branches with different plugin latencies.
 * The shorter branches get padded with this delay so all branches arrive
 * at the sum point time-aligned.
 *
 * Stereo in, stereo out. Reports its delay as latency so the graph
 * accounts for it correctly.
 */
class LatencyCompensationProcessor : public juce::AudioProcessor
{
public:
    explicit LatencyCompensationProcessor(int delaySamples);
    ~LatencyCompensationProcessor() override = default;

    int getDelaySamples() const { return delaySamples; }

    // AudioProcessor overrides
    const juce::String getName() const override { return "LatencyCompensation"; }
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
    int delaySamples = 0;
    juce::dsp::DelayLine<float> delayLine;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(LatencyCompensationProcessor)
};
