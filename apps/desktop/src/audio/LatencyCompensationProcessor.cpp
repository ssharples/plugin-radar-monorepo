#include "LatencyCompensationProcessor.h"

LatencyCompensationProcessor::LatencyCompensationProcessor(int delaySamples)
    : delaySamples(delaySamples),
      delayLine(delaySamples > 0 ? delaySamples : 1)
{
    setLatencySamples(delaySamples);
}

void LatencyCompensationProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    storedBlockSize = samplesPerBlock;

    currentSpec.sampleRate = sampleRate;
    currentSpec.maximumBlockSize = static_cast<juce::uint32>(samplesPerBlock);
    currentSpec.numChannels = 2;

    delayLine.prepare(currentSpec);
    delayLine.setDelay(static_cast<float>(delaySamples));
}

void LatencyCompensationProcessor::setDelaySamples(int newDelay)
{
    if (newDelay != delaySamples)
    {
        delaySamples = std::max(0, newDelay);

        // Reallocate delay line — maximumBlockSize must be at least the audio
        // processing block size, otherwise the internal buffer is undersized.
        auto spec = currentSpec;
        spec.maximumBlockSize = static_cast<juce::uint32>(std::max(storedBlockSize, delaySamples + 1));
        delayLine.prepare(spec);
        delayLine.setDelay(static_cast<float>(delaySamples));

        setLatencySamples(delaySamples);
    }
}

void LatencyCompensationProcessor::reset()
{
    delayLine.reset();
}

void LatencyCompensationProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    // NOTE: Do NOT early-return when delaySamples == 0.
    // When used as a bypass buffer node (e.g., M/S processing), the delay line
    // must process every block to properly "own" its buffer in the graph.
    // With delay=0, the delay line passes through immediately (no cost).
    juce::dsp::AudioBlock<float> block(buffer);
    juce::dsp::ProcessContextReplacing<float> context(block);
    delayLine.process(context);
}
