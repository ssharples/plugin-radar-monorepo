#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "AudioMeter.h"
#include "../core/ChainNode.h"

/**
 * NodeMeterProcessor - Lightweight pass-through AudioProcessor that measures
 * peak levels via AudioMeter. Inserted after each active plugin in the graph
 * to provide per-plugin output metering.
 *
 * Reports zero latency so it does NOT affect PDC calculations.
 */
class NodeMeterProcessor : public juce::AudioProcessor
{
public:
    NodeMeterProcessor();
    ~NodeMeterProcessor() override = default;

    // AudioProcessor overrides
    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override;

    const juce::String getName() const override { return "NodeMeter"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return true; }
    double getTailLengthSeconds() const override { return 0.0; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}
    void getStateInformation(juce::MemoryBlock&) override {}
    void setStateInformation(const void*, int) override {}
    bool hasEditor() const override { return false; }
    juce::AudioProcessorEditor* createEditor() override { return nullptr; }

    // Zero latency - must not affect PDC
    int getLatencySamples() const { return 0; }

    // Thread-safe meter readings
    AudioMeter::Readings getReadings() const { return meter.getReadings(); }

    // Associate with a chain node for identification
    void setAssociatedNodeId(ChainNodeId id) { associatedNodeId = id; }
    ChainNodeId getAssociatedNodeId() const { return associatedNodeId; }

private:
    AudioMeter meter;
    ChainNodeId associatedNodeId = -1;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(NodeMeterProcessor)
};
