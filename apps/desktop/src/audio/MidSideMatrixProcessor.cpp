#include "MidSideMatrixProcessor.h"
#include <cmath>

MidSideMatrixProcessor::MidSideMatrixProcessor()
    : SimpleAudioProcessor(BusesProperties()
          .withInput("Input", juce::AudioChannelSet::stereo(), true)
          .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
}

void MidSideMatrixProcessor::prepareToPlay(double /*sampleRate*/, int samplesPerBlock)
{
    tempBuffer.setSize(1, samplesPerBlock);
}

void MidSideMatrixProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& /*midi*/)
{
    if (buffer.getNumChannels() < 2)
    {
        // Log only once to avoid audio-thread spam
        if (!insufficientChannelsLogged_)
        {
            insufficientChannelsLogged_ = true;
            juce::Logger::writeToLog("MidSideMatrix: INSUFFICIENT CHANNELS — got " + juce::String(buffer.getNumChannels()));
        }
        return;
    }

    const int numSamples = buffer.getNumSamples();
    auto* left  = buffer.getWritePointer(0);
    auto* right = buffer.getWritePointer(1);

    // Fast SIMD path: check for NaN/Inf using vectorized scan
    auto rangeL = juce::FloatVectorOperations::findMinAndMax(left, numSamples);
    auto rangeR = juce::FloatVectorOperations::findMinAndMax(right, numSamples);

    if (std::isfinite(rangeL.getStart()) && std::isfinite(rangeL.getEnd())
        && std::isfinite(rangeR.getStart()) && std::isfinite(rangeR.getEnd()))
    {
        // Clean audio — use SIMD vectorized operations
        // Ensure tempBuffer is large enough (handle oversized blocks from DAW)
        if (tempBuffer.getNumSamples() < numSamples)
            tempBuffer.setSize(1, numSamples, false, false, true);

        float* temp = tempBuffer.getWritePointer(0);

        // temp = left (save original left before overwriting)
        juce::FloatVectorOperations::copy(temp, left, numSamples);
        // left = (left + right) * kInvSqrt2  (Mid)
        juce::FloatVectorOperations::add(left, right, numSamples);
        juce::FloatVectorOperations::multiply(left, kInvSqrt2, numSamples);
        // right = (temp - right) * kInvSqrt2  (Side)
        juce::FloatVectorOperations::subtract(temp, right, numSamples);
        juce::FloatVectorOperations::copy(right, temp, numSamples);
        juce::FloatVectorOperations::multiply(right, kInvSqrt2, numSamples);
    }
    else
    {
        // Dirty audio — per-sample with NaN guard
        for (int i = 0; i < numSamples; ++i)
        {
            float l = left[i];
            float r = right[i];
            if (!std::isfinite(l)) l = 0.0f;
            if (!std::isfinite(r)) r = 0.0f;
            left[i]  = (l + r) * kInvSqrt2;
            right[i] = (l - r) * kInvSqrt2;
        }
    }
}
