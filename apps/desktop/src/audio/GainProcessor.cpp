#include "GainProcessor.h"
#include "FastMath.h"  // PHASE 4: Fast dB to linear conversion
#include <cmath>

GainProcessor::GainProcessor()
{
    inputGainSmoothed.setCurrentAndTargetValue(1.0f);
    outputGainSmoothed.setCurrentAndTargetValue(1.0f);
}

void GainProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    currentSampleRate = sampleRate;
    maxBlockSize = samplesPerBlock;

    inputGainSmoothed.reset(sampleRate, smoothingTimeSeconds);
    outputGainSmoothed.reset(sampleRate, smoothingTimeSeconds);

    // Set to current values
    inputGainSmoothed.setCurrentAndTargetValue(dbToLinear(inputGainDB.load()));
    outputGainSmoothed.setCurrentAndTargetValue(dbToLinear(outputGainDB.load()));

    // Sync pending atomics
    pendingInputGainLinear.store(dbToLinear(inputGainDB.load()), std::memory_order_relaxed);
    pendingOutputGainLinear.store(dbToLinear(outputGainDB.load()), std::memory_order_relaxed);

    // Pre-allocate gain ramp buffer (no heap alloc on audio thread)
    gainRampBuffer.resize(static_cast<size_t>(samplesPerBlock), 1.0f);
}

void GainProcessor::reset()
{
    inputGainSmoothed.setCurrentAndTargetValue(dbToLinear(inputGainDB.load()));
    outputGainSmoothed.setCurrentAndTargetValue(dbToLinear(outputGainDB.load()));

    pendingInputGainLinear.store(dbToLinear(inputGainDB.load()), std::memory_order_relaxed);
    pendingOutputGainLinear.store(dbToLinear(outputGainDB.load()), std::memory_order_relaxed);
}

void GainProcessor::setInputGain(float dB)
{
    dB = clampGain(dB);
    inputGainDB.store(dB, std::memory_order_relaxed);
    // Only store the linear target -- SmoothedValue is driven from the audio thread
    pendingInputGainLinear.store(dbToLinear(dB), std::memory_order_release);
}

void GainProcessor::setOutputGain(float dB)
{
    dB = clampGain(dB);
    outputGainDB.store(dB, std::memory_order_relaxed);
    pendingOutputGainLinear.store(dbToLinear(dB), std::memory_order_release);
}

void GainProcessor::processInputGain(juce::AudioBuffer<float>& buffer)
{
    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();

    // Audio thread: read the atomic target and set SmoothedValue here
    inputGainSmoothed.setTargetValue(pendingInputGainLinear.load(std::memory_order_acquire));

    if (inputGainSmoothed.isSmoothing())
    {
        // Guard against hosts delivering blocks larger than prepareToPlay indicated
        const int rampSamples = std::min(numSamples, static_cast<int>(gainRampBuffer.size()));

        // Build the gain ramp once into the pre-allocated buffer
        for (int i = 0; i < rampSamples; ++i)
            gainRampBuffer[static_cast<size_t>(i)] = inputGainSmoothed.getNextValue();

        // Apply the ramp to all channels using SIMD multiply
        const float* rampData = gainRampBuffer.data();
        for (int channel = 0; channel < numChannels; ++channel)
        {
            auto* data = buffer.getWritePointer(channel);
            juce::FloatVectorOperations::multiply(data, rampData, rampSamples);
        }

        // Any remaining samples beyond the ramp buffer get the final ramp value
        if (rampSamples < numSamples)
        {
            float tailGain = gainRampBuffer[static_cast<size_t>(rampSamples - 1)];
            for (int channel = 0; channel < numChannels; ++channel)
            {
                auto* data = buffer.getWritePointer(channel);
                juce::FloatVectorOperations::multiply(data + rampSamples, tailGain, numSamples - rampSamples);
            }
        }
    }
    else
    {
        // No smoothing needed - apply constant gain
        float gain = inputGainSmoothed.getCurrentValue();
        if (std::abs(gain - 1.0f) > 0.0001f)
        {
            buffer.applyGain(gain);
        }
    }
}

void GainProcessor::processOutputGain(juce::AudioBuffer<float>& buffer)
{
    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();

    // Audio thread: read the atomic target and set SmoothedValue here
    outputGainSmoothed.setTargetValue(pendingOutputGainLinear.load(std::memory_order_acquire));

    if (outputGainSmoothed.isSmoothing())
    {
        // Guard against hosts delivering blocks larger than prepareToPlay indicated
        const int rampSamples = std::min(numSamples, static_cast<int>(gainRampBuffer.size()));

        // Build the gain ramp once into the pre-allocated buffer
        for (int i = 0; i < rampSamples; ++i)
            gainRampBuffer[static_cast<size_t>(i)] = outputGainSmoothed.getNextValue();

        // Apply the ramp to all channels using SIMD multiply
        const float* rampData = gainRampBuffer.data();
        for (int channel = 0; channel < numChannels; ++channel)
        {
            auto* data = buffer.getWritePointer(channel);
            juce::FloatVectorOperations::multiply(data, rampData, rampSamples);
        }

        // Any remaining samples beyond the ramp buffer get the final ramp value
        if (rampSamples < numSamples)
        {
            float tailGain = gainRampBuffer[static_cast<size_t>(rampSamples - 1)];
            for (int channel = 0; channel < numChannels; ++channel)
            {
                auto* data = buffer.getWritePointer(channel);
                juce::FloatVectorOperations::multiply(data + rampSamples, tailGain, numSamples - rampSamples);
            }
        }
    }
    else
    {
        float gain = outputGainSmoothed.getCurrentValue();
        if (std::abs(gain - 1.0f) > 0.0001f)
        {
            buffer.applyGain(gain);
        }
    }
}

// PHASE 4: Use FastMath lookup table (10-20x faster than std::pow)
float GainProcessor::dbToLinear(float dB)
{
    return FastMath::dbToLinear(dB);
}

float GainProcessor::clampGain(float dB)
{
    return juce::jlimit(MinGainDB, MaxGainDB, dB);
}
