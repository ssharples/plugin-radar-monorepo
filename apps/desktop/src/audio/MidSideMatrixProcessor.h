#pragma once

#include "SimpleAudioProcessor.h"

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
class MidSideMatrixProcessor : public SimpleAudioProcessor
{
public:
    MidSideMatrixProcessor();
    ~MidSideMatrixProcessor() override = default;

    // AudioProcessor overrides
    const juce::String getName() const override { return "MidSideMatrix"; }
    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override;

private:
    static constexpr float kInvSqrt2 = 0.7071067811865476f;
    bool insufficientChannelsLogged_ = false;
    juce::AudioBuffer<float> tempBuffer;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MidSideMatrixProcessor)
};
