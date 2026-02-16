#include "BranchGainProcessor.h"
#include "FastMath.h"  // PHASE 4: Fast dB to linear conversion
#include <cmath>

BranchGainProcessor::BranchGainProcessor()
    : AudioProcessor(BusesProperties()
          .withInput("Input", juce::AudioChannelSet::stereo(), true)
          .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
    smoothedGain.setCurrentAndTargetValue(1.0f);
}

void BranchGainProcessor::setGainDb(float dB)
{
    gainDb.store(juce::jlimit(-60.0f, 24.0f, dB), std::memory_order_relaxed);
}

void BranchGainProcessor::prepareToPlay(double sampleRate, int /*samplesPerBlock*/)
{
    smoothedGain.reset(sampleRate, 0.02); // 20ms ramp
    smoothedGain.setCurrentAndTargetValue(dbToLinear(gainDb.load(std::memory_order_relaxed)));
}

void BranchGainProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& /*midi*/)
{
    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();

    smoothedGain.setTargetValue(dbToLinear(gainDb.load(std::memory_order_relaxed)));

    if (smoothedGain.isSmoothing())
    {
        for (int i = 0; i < numSamples; ++i)
        {
            float g = smoothedGain.getNextValue();
            for (int ch = 0; ch < numChannels; ++ch)
                buffer.getWritePointer(ch)[i] *= g;
        }
    }
    else
    {
        float g = smoothedGain.getCurrentValue();
        if (std::abs(g - 1.0f) > 0.0001f)
            buffer.applyGain(g);
    }
}

// PHASE 4: Use FastMath lookup table (10-20x faster than std::pow)
float BranchGainProcessor::dbToLinear(float dB) noexcept
{
    return FastMath::dbToLinear(dB);
}
