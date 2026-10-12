#include "GainProcessor.h"
#include <cmath>

GainProcessor::GainProcessor()
{
    inputGainSmoothed.setCurrentAndTargetValue(1.0f);
    outputGainSmoothed.setCurrentAndTargetValue(1.0f);
    gainMatchSmoothed.setCurrentAndTargetValue(1.0f);
}

void GainProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    currentSampleRate = sampleRate;
    maxBlockSize = samplesPerBlock;

    inputGainSmoothed.reset(sampleRate, smoothingTimeSeconds);
    outputGainSmoothed.reset(sampleRate, smoothingTimeSeconds);
    gainMatchSmoothed.reset(sampleRate, smoothingTimeSeconds);

    // Set to current values
    inputGainSmoothed.setCurrentAndTargetValue(dbToLinear(inputGainDB.load()));
    outputGainSmoothed.setCurrentAndTargetValue(dbToLinear(outputGainDB.load()));
    gainMatchSmoothed.setCurrentAndTargetValue(1.0f);

    // Sync pending atomics
    pendingInputGainLinear.store(dbToLinear(inputGainDB.load()), std::memory_order_relaxed);
    pendingOutputGainLinear.store(dbToLinear(outputGainDB.load()), std::memory_order_relaxed);

    // Pre-allocate gain ramp buffer (no heap alloc on audio thread)
    gainRampBuffer.resize(static_cast<size_t>(std::max(1, samplesPerBlock)), 1.0f);
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

void GainProcessor::setGainMatchTargetDB(float dB)
{
    gainMatchTargetDB.store(std::isfinite(dB) ? juce::jlimit(-24.0f, 24.0f, dB) : 0.0f, std::memory_order_release);
}

void GainProcessor::processGainMatch(juce::AudioBuffer<float>& buffer, float inputRms, float outputRms)
{
    if (buffer.getNumSamples() <= 0 || buffer.getNumChannels() == 0) return;
    if (gainMatchEnabled.load(std::memory_order_acquire))
    {
        // Silence freezes the absolute correction target; the existing gain
        // remains applied to decays. Disabling matching smoothly returns to 1.
        if (std::isfinite(inputRms) && std::isfinite(outputRms) && inputRms > 1.0e-6f && outputRms > 1.0e-6f)
        {
            const auto correctionDB = juce::jlimit(-24.0f, 24.0f, 20.0f * std::log10(inputRms / outputRms));
            gainMatchTargetDB.store(correctionDB, std::memory_order_relaxed);
        }
        gainMatchSmoothed.setTargetValue(dbToLinear(gainMatchTargetDB.load(std::memory_order_relaxed)));
    }
    else gainMatchSmoothed.setTargetValue(1.0f);
    if (!gainMatchSmoothed.isSmoothing())
    { if (gainMatchSmoothed.getCurrentValue() != 1.0f) buffer.applyGain(gainMatchSmoothed.getCurrentValue()); return; }
    const int count = std::min(buffer.getNumSamples(), static_cast<int>(gainRampBuffer.size()));
    for (int i = 0; i < count; ++i) gainRampBuffer[static_cast<size_t>(i)] = gainMatchSmoothed.getNextValue();
    for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
        for (int i = 0; i < count; ++i) buffer.getWritePointer(ch)[i] *= gainRampBuffer[static_cast<size_t>(i)];
    if (count < buffer.getNumSamples())
    {
        for (int i = count; i < buffer.getNumSamples(); ++i)
        {
            const float gain = gainMatchSmoothed.getNextValue();
            for (int ch = 0; ch < buffer.getNumChannels(); ++ch) buffer.getWritePointer(ch)[i] *= gain;
        }
    }
}

void GainProcessor::processInputGain(juce::AudioBuffer<float>& buffer)
{
    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();

    // Audio thread: read the atomic target and set SmoothedValue here
    inputGainSmoothed.setTargetValue(pendingInputGainLinear.load(std::memory_order_acquire));

    if (inputGainSmoothed.isSmoothing())
    {
        const int chunkSize = std::max(1, static_cast<int>(gainRampBuffer.size()));
        for (int offset = 0; offset < numSamples; offset += chunkSize)
        {
            const int count = std::min(chunkSize, numSamples - offset);
            for (int i = 0; i < count; ++i)
                gainRampBuffer[static_cast<size_t>(i)] = inputGainSmoothed.getNextValue();
            for (int channel = 0; channel < numChannels; ++channel)
            {
                auto* data = buffer.getWritePointer(channel);
                for (int i = 0; i < count; ++i) data[offset + i] *= gainRampBuffer[static_cast<size_t>(i)];
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
        const int chunkSize = std::max(1, static_cast<int>(gainRampBuffer.size()));
        for (int offset = 0; offset < numSamples; offset += chunkSize)
        {
            const int count = std::min(chunkSize, numSamples - offset);
            for (int i = 0; i < count; ++i)
                gainRampBuffer[static_cast<size_t>(i)] = outputGainSmoothed.getNextValue();
            for (int channel = 0; channel < numChannels; ++channel)
            {
                auto* data = buffer.getWritePointer(channel);
                for (int i = 0; i < count; ++i) data[offset + i] *= gainRampBuffer[static_cast<size_t>(i)];
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

float GainProcessor::dbToLinear(float dB)
{
    if (dB <= MinGainDB)
        return 0.0f;
    return std::pow(10.0f, dB / 20.0f);
}

float GainProcessor::clampGain(float dB)
{
    return juce::jlimit(MinGainDB, MaxGainDB, dB);
}
