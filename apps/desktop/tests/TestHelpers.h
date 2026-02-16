#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <cstring>

/**
 * MockPluginInstance - A configurable AudioPluginInstance for testing.
 *
 * Features:
 * - Configurable channel count (default 2in/2out, set to 4in/2out for sidechain tests)
 * - Configurable latency (mutable during processBlock for latency change detection)
 * - Configurable gain factor (multiply input samples for verifiable output)
 * - Known state data (getStateInformation writes "MOCK_STATE_<name>")
 * - A few dummy AudioParameterFloat for parameter enumeration tests
 */
class MockPluginInstance : public juce::AudioPluginInstance
{
public:
    MockPluginInstance(const juce::String& pluginName = "MockPlugin",
                       int numInputCh = 2,
                       int numOutputCh = 2,
                       int latencySamples = 0,
                       float gainFactor = 1.0f)
        : name(pluginName),
          numIn(numInputCh),
          numOut(numOutputCh),
          latency(latencySamples),
          gain(gainFactor)
    {
        setPlayConfigDetails(numIn, numOut, 44100.0, 512);
        setLatencySamples(latency);
    }

    // Allow changing latency during processBlock (for latency change detection tests)
    void setMockLatency(int newLatency)
    {
        latency = newLatency;
        setLatencySamples(latency);
    }

    void setGainFactor(float newGain) { gain = newGain; }
    float getGainFactor() const { return gain; }

    // =============================================
    // AudioPluginInstance overrides
    // =============================================

    void fillInPluginDescription(juce::PluginDescription& desc) const override
    {
        desc.name = name;
        desc.manufacturerName = "MockVendor";
        desc.pluginFormatName = "MockFormat";
        desc.uniqueId = 99999;
        desc.fileOrIdentifier = "/mock/" + name;
        desc.version = "1.0";
        desc.isInstrument = false;
        desc.numInputChannels = numIn;
        desc.numOutputChannels = numOut;
    }

    // =============================================
    // AudioProcessor overrides
    // =============================================

    void prepareToPlay(double sampleRate, int maximumExpectedSamplesPerBlock) override
    {
        setPlayConfigDetails(numIn, numOut, sampleRate, maximumExpectedSamplesPerBlock);
        setLatencySamples(latency);
        prepared = true;
    }

    void releaseResources() override { prepared = false; }

    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer&) override
    {
        processBlockCallCount++;

        // Apply gain factor to all channels/samples
        if (std::abs(gain - 1.0f) > 0.0001f)
        {
            for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
                buffer.applyGain(ch, 0, buffer.getNumSamples(), gain);
        }
    }

    const juce::String getName() const override { return name; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return "Default"; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock& destData) override
    {
        // Write a known pattern: "MOCK_STATE_<name>"
        juce::String stateStr = "MOCK_STATE_" + name;
        destData.replaceAll(stateStr.toRawUTF8(), stateStr.getNumBytesAsUTF8());
    }

    void setStateInformation(const void* data, int sizeInBytes) override
    {
        lastRestoredState = juce::String::fromUTF8(static_cast<const char*>(data),
                                                    sizeInBytes);
        stateRestoreCount++;
    }

    // =============================================
    // Test inspection
    // =============================================

    int processBlockCallCount = 0;
    int stateRestoreCount = 0;
    juce::String lastRestoredState;
    bool prepared = false;

private:
    juce::String name;
    int numIn;
    int numOut;
    int latency;
    float gain;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MockPluginInstance)
};

// =============================================================================
// Shared helper functions
// =============================================================================

/**
 * Fill an audio buffer with a constant value on all channels.
 * (Duplicated from DSPTests.cpp for use across test files)
 */
inline void fillTestBuffer(juce::AudioBuffer<float>& buf, float value)
{
    for (int ch = 0; ch < buf.getNumChannels(); ++ch)
    {
        auto* data = buf.getWritePointer(ch);
        for (int i = 0; i < buf.getNumSamples(); ++i)
            data[i] = value;
    }
}

/**
 * Run enough blocks to settle SmoothedValue parameters.
 */
inline void settleTestSmoothing(juce::AudioProcessor& proc, int numBlocks = 20)
{
    const int blockSize = 512;
    juce::AudioBuffer<float> buf(proc.getTotalNumInputChannels(), blockSize);
    juce::MidiBuffer midi;
    for (int i = 0; i < numBlocks; ++i)
    {
        buf.clear();
        proc.processBlock(buf, midi);
    }
}
