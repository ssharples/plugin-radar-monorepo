#include "LatencyCompensationProcessor.h"

LatencyCompensationProcessor::LatencyCompensationProcessor(int delaySamples)
    : delaySamples(delaySamples),
      delayLine(delaySamples > 0 ? delaySamples : 1)
{
    setLatencySamples(delaySamples);
}

void LatencyCompensationProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sampleRate;
    spec.maximumBlockSize = static_cast<juce::uint32>(samplesPerBlock);
    spec.numChannels = 2;

    delayLine.prepare(spec);
    delayLine.setDelay(static_cast<float>(delaySamples));
}

void LatencyCompensationProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    if (delaySamples <= 0)
        return;

    juce::dsp::AudioBlock<float> block(buffer);
    juce::dsp::ProcessContextReplacing<float> context(block);
    delayLine.process(context);
}
