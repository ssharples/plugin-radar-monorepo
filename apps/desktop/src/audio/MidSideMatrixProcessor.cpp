#include "MidSideMatrixProcessor.h"

MidSideMatrixProcessor::MidSideMatrixProcessor()
    : AudioProcessor(BusesProperties()
          .withInput("Input", juce::AudioChannelSet::stereo(), true)
          .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
}

void MidSideMatrixProcessor::prepareToPlay(double /*sampleRate*/, int /*samplesPerBlock*/)
{
    // Nothing to prepare — stateless matrix operation
}

void MidSideMatrixProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& /*midi*/)
{
    if (buffer.getNumChannels() < 2)
        return;

    const int numSamples = buffer.getNumSamples();
    auto* left  = buffer.getWritePointer(0);
    auto* right = buffer.getWritePointer(1);

    for (int i = 0; i < numSamples; ++i)
    {
        const float l = left[i];
        const float r = right[i];
        left[i]  = (l + r) * kInvSqrt2;  // Mid (encode) or L (decode)
        right[i] = (l - r) * kInvSqrt2;  // Side (encode) or R (decode)
    }
}
