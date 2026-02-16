#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <atomic>

/**
 * MuteProcessor - Simple passthrough processor that can silence output.
 *
 * Unlike bypass (which disconnects the plugin), mute keeps the plugin active
 * in the processing chain (maintaining latency) but zeros the output.
 *
 * Use case: A/B testing with matched latency, or temporarily silencing
 * a plugin without affecting timing.
 */
class MuteProcessor : public juce::AudioProcessor
{
public:
    MuteProcessor();
    ~MuteProcessor() override = default;

    void setMuted(bool shouldMute) { muted.store(shouldMute, std::memory_order_relaxed); }
    bool isMuted() const { return muted.load(std::memory_order_relaxed); }

    // AudioProcessor overrides
    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override;

    const juce::String getName() const override { return "Mute"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return true; }
    double getTailLengthSeconds() const override { return 0.0; }

    // Zero latency - passthrough only
    int getLatencySamples() const { return 0; }

    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock&) override {}
    void setStateInformation(const void*, int) override {}

private:
    std::atomic<bool> muted{false};

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MuteProcessor)
};
