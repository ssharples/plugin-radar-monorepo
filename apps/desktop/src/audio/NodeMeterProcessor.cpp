#include "NodeMeterProcessor.h"

NodeMeterProcessor::NodeMeterProcessor()
    : AudioProcessor(BusesProperties()
          .withInput("Input", juce::AudioChannelSet::stereo(), true)
          .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
}

void NodeMeterProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    meter.prepareToPlay(sampleRate, samplesPerBlock);
}

void NodeMeterProcessor::releaseResources()
{
    meter.reset();
}

void NodeMeterProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    meter.process(buffer);
    // Audio passes through unchanged - buffer is not modified
}
