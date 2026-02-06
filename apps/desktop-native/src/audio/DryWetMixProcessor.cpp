#include "DryWetMixProcessor.h"

DryWetMixProcessor::DryWetMixProcessor()
    : AudioProcessor(BusesProperties()
          .withInput("Dry", juce::AudioChannelSet::stereo(), true)
          .withInput("Wet", juce::AudioChannelSet::stereo(), true)
          .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
    smoothedMix.setCurrentAndTargetValue(1.0f);
}

void DryWetMixProcessor::setMix(float newMix)
{
    mix.store(juce::jlimit(0.0f, 1.0f, newMix), std::memory_order_relaxed);
}

void DryWetMixProcessor::prepareToPlay(double sampleRate, int /*samplesPerBlock*/)
{
    smoothedMix.reset(sampleRate, 0.02); // 20ms crossfade smoothing
    smoothedMix.setCurrentAndTargetValue(mix.load(std::memory_order_relaxed));
}

void DryWetMixProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& /*midi*/)
{
    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();

    // We expect 4 input channels (dry L, dry R, wet L, wet R)
    // and 2 output channels. AudioProcessorGraph maps inputs to the buffer
    // based on connections, so channels 0-1 are dry, 2-3 are wet.
    // After processing, the graph reads channels 0-1 as output.

    if (numChannels < 4)
    {
        // Fallback: if we don't have 4 channels, just pass through
        return;
    }

    smoothedMix.setTargetValue(mix.load(std::memory_order_relaxed));

    const float* dryL = buffer.getReadPointer(0);
    const float* dryR = buffer.getReadPointer(1);
    const float* wetL = buffer.getReadPointer(2);
    const float* wetR = buffer.getReadPointer(3);

    float* outL = buffer.getWritePointer(0);
    float* outR = buffer.getWritePointer(1);

    if (smoothedMix.isSmoothing())
    {
        for (int i = 0; i < numSamples; ++i)
        {
            const float w = smoothedMix.getNextValue();
            const float d = 1.0f - w;
            outL[i] = dryL[i] * d + wetL[i] * w;
            outR[i] = dryR[i] * d + wetR[i] * w;
        }
    }
    else
    {
        const float w = smoothedMix.getCurrentValue();
        const float d = 1.0f - w;

        for (int i = 0; i < numSamples; ++i)
        {
            outL[i] = dryL[i] * d + wetL[i] * w;
            outR[i] = dryR[i] * d + wetR[i] * w;
        }
    }

    // Clear the extra channels (wet inputs) so they don't bleed
    buffer.clear(2, 0, numSamples);
    buffer.clear(3, 0, numSamples);
}
