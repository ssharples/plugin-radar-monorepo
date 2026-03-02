#include "DuckingProcessor.h"
#include "FastMath.h"
#include "../utils/ProChainLogger.h"
#include <cmath>

DuckingProcessor::DuckingProcessor()
    : SimpleAudioProcessor(BusesProperties()
          .withInput("Audio", juce::AudioChannelSet::stereo(), true)
          .withInput("Sidechain", juce::AudioChannelSet::stereo(), true)
          .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
}

void DuckingProcessor::setThresholdDb(float db)
{
    thresholdDb.store(juce::jlimit(-60.0f, 0.0f, db), std::memory_order_relaxed);
}

void DuckingProcessor::setAttackMs(float ms)
{
    attackMs.store(juce::jlimit(0.1f, 500.0f, ms), std::memory_order_relaxed);
    updateCoefficients();
}

void DuckingProcessor::setReleaseMs(float ms)
{
    releaseMs.store(juce::jlimit(50.0f, 5000.0f, ms), std::memory_order_relaxed);
    updateCoefficients();
}

void DuckingProcessor::prepareToPlay(double sampleRate, int /*samplesPerBlock*/)
{
    currentSampleRate = sampleRate;
    envelopeLevel = 0.0f;
    updateCoefficients();
}

void DuckingProcessor::updateCoefficients()
{
    if (currentSampleRate <= 0.0)
        return;

    // Attack: user-configurable
    float atkMs = attackMs.load(std::memory_order_relaxed);
    attackCoeff.store(std::exp(-1.0f / static_cast<float>(currentSampleRate * atkMs * 0.001)),
                      std::memory_order_relaxed);

    // Release: user-configurable
    float relMs = releaseMs.load(std::memory_order_relaxed);
    releaseCoeff.store(std::exp(-1.0f / static_cast<float>(currentSampleRate * relMs * 0.001)),
                       std::memory_order_relaxed);
}

void DuckingProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& /*midi*/)
{
    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();

    // We expect 4 input channels: ch0-1 = group audio, ch2-3 = sidechain reference
    if (numChannels < 4)
    {
        // Fallback passthrough — copy ch0-1 to output so audio doesn't disappear
        DBG("DuckingProcessor: expected 4+ channels, got " + juce::String(numChannels)
            + ". Passing through input unchanged (ducking disabled).");
        jassertfalse;
        // Input ch0-1 are already in the output position — nothing to copy.
        return;
    }

    const float thrDb = thresholdDb.load(std::memory_order_relaxed);
    const float thresholdLin = FastMath::dbToLinear(thrDb);

    const float* audioL = buffer.getReadPointer(0);
    const float* audioR = buffer.getReadPointer(1);
    const float* scL = buffer.getReadPointer(2);
    const float* scR = buffer.getReadPointer(3);

    float* outL = buffer.getWritePointer(0);
    float* outR = buffer.getWritePointer(1);

    // Load coefficients once per block to avoid per-sample atomic reads
    const float atkCoeff = attackCoeff.load(std::memory_order_relaxed);
    const float relCoeff = releaseCoeff.load(std::memory_order_relaxed);

    // Per-sample envelope following and gain application
    const float denom = std::max(0.001f, 1.0f - thresholdLin);

    for (int i = 0; i < numSamples; ++i)
    {
        // Peak detection on sidechain
        float scPeak = std::max(std::abs(scL[i]), std::abs(scR[i]));

        // Compute how far above threshold the sidechain is (normalized 0..1)
        float scAboveThreshold = std::max(0.0f, scPeak - thresholdLin) / denom;

        // Envelope follower (attack/release)
        if (scAboveThreshold > envelopeLevel)
            envelopeLevel = atkCoeff * envelopeLevel + (1.0f - atkCoeff) * scAboveThreshold;
        else
            envelopeLevel = relCoeff * envelopeLevel + (1.0f - relCoeff) * scAboveThreshold;

        // Calculate gain: 1.0 - envelope (clamped)
        float clampedEnv = juce::jlimit(0.0f, 1.0f, envelopeLevel);
        float g = 1.0f - clampedEnv;
        g = juce::jlimit(0.0f, 1.0f, g);

        outL[i] = audioL[i] * g;
        outR[i] = audioR[i] * g;
    }

    // Clear sidechain channels so they don't bleed
    buffer.clear(2, 0, numSamples);
    buffer.clear(3, 0, numSamples);
}
