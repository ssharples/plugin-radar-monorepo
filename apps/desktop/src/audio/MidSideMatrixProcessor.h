#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

/**
 * MidSideMatrixProcessor - Encodes L/R to Mid/Side or decodes Mid/Side to L/R.
 *
 * The matrix is self-inverse (same formula for encode and decode):
 *   out[0] = (in[0] + in[1]) * 0.7071  // Mid (encode) or L (decode)
 *   out[1] = (in[0] - in[1]) * 0.7071  // Side (encode) or R (decode)
 *
 * The 0.7071 factor (1/sqrt(2)) ensures unity gain through an encode->decode round-trip.
 *
 * Stereo in, stereo out. Zero latency, no parameters, no state.
 */
class MidSideMatrixProcessor : public juce::AudioProcessor
{
public:
    MidSideMatrixProcessor();
    ~MidSideMatrixProcessor() override = default;

    // AudioProcessor overrides
    const juce::String getName() const override { return "MidSideMatrix"; }
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
    static constexpr float kInvSqrt2 = 0.7071067811865476f;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MidSideMatrixProcessor)
};
