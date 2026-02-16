#include "DuckingProcessor.h"
#include <cmath>

DuckingProcessor::DuckingProcessor()
    : AudioProcessor(BusesProperties()
          .withInput("Audio", juce::AudioChannelSet::stereo(), true)
          .withInput("Sidechain", juce::AudioChannelSet::stereo(), true)
          .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
    smoothedGain.setCurrentAndTargetValue(1.0f);
}

void DuckingProcessor::setDuckAmount(float amount)
{
    duckAmount.store(juce::jlimit(0.0f, 1.0f, amount), std::memory_order_relaxed);
}

void DuckingProcessor::setReleaseMs(float ms)
{
    releaseMs.store(juce::jlimit(50.0f, 1000.0f, ms), std::memory_order_relaxed);
    updateCoefficients();
}

void DuckingProcessor::prepareToPlay(double sampleRate, int /*samplesPerBlock*/)
{
    currentSampleRate = sampleRate;
    envelopeLevel = 0.0f;
    smoothedGain.reset(sampleRate, 0.005); // 5ms ramp for gain changes
    smoothedGain.setCurrentAndTargetValue(1.0f);
    updateCoefficients();
}

void DuckingProcessor::updateCoefficients()
{
    if (currentSampleRate <= 0.0)
        return;

    // Attack: fast (~5ms) to catch transients
    const float attackMs = 5.0f;
    attackCoeff = std::exp(-1.0f / static_cast<float>(currentSampleRate * attackMs * 0.001));

    // Release: user-configurable
    float relMs = releaseMs.load(std::memory_order_relaxed);
    releaseCoeff = std::exp(-1.0f / static_cast<float>(currentSampleRate * relMs * 0.001));
}

void DuckingProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& /*midi*/)
{
    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();

    // We expect 4 input channels: ch0-1 = group audio, ch2-3 = sidechain reference
    if (numChannels < 4)
    {
        // Fallback passthrough
        return;
    }

    const float amount = duckAmount.load(std::memory_order_relaxed);

    const float* audioL = buffer.getReadPointer(0);
    const float* audioR = buffer.getReadPointer(1);
    const float* scL = buffer.getReadPointer(2);
    const float* scR = buffer.getReadPointer(3);

    float* outL = buffer.getWritePointer(0);
    float* outR = buffer.getWritePointer(1);

    // No ducking: just pass through audio channels
    if (amount < 0.001f)
    {
        // Audio is already in channels 0-1, clear sidechain channels
        buffer.clear(2, 0, numSamples);
        buffer.clear(3, 0, numSamples);

        // Smooth gain back to 1.0 if we were previously ducking
        smoothedGain.setTargetValue(1.0f);
        if (smoothedGain.isSmoothing())
        {
            for (int i = 0; i < numSamples; ++i)
            {
                float g = smoothedGain.getNextValue();
                outL[i] = audioL[i] * g;
                outR[i] = audioR[i] * g;
            }
        }
        return;
    }

    // Per-sample envelope following and gain application
    for (int i = 0; i < numSamples; ++i)
    {
        // Peak detection on sidechain
        float scPeak = std::max(std::abs(scL[i]), std::abs(scR[i]));

        // Envelope follower (attack/release)
        if (scPeak > envelopeLevel)
            envelopeLevel = attackCoeff * envelopeLevel + (1.0f - attackCoeff) * scPeak;
        else
            envelopeLevel = releaseCoeff * envelopeLevel + (1.0f - releaseCoeff) * scPeak;

        // Calculate target gain: 1.0 - (envelope * duckAmount)
        float clampedEnv = juce::jlimit(0.0f, 1.0f, envelopeLevel);
        float targetGain = 1.0f - (clampedEnv * amount);
        targetGain = juce::jlimit(0.0f, 1.0f, targetGain);

        smoothedGain.setTargetValue(targetGain);
        float g = smoothedGain.getNextValue();

        outL[i] = audioL[i] * g;
        outR[i] = audioR[i] * g;
    }

    // Clear sidechain channels so they don't bleed
    buffer.clear(2, 0, numSamples);
    buffer.clear(3, 0, numSamples);
}
