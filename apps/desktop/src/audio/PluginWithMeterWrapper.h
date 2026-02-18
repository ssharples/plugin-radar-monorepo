#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "AudioMeter.h"
#include <memory>

/**
 * PHASE 7: PluginWithMeterWrapper - Meter Node Consolidation
 *
 * Wraps a plugin instance with integrated input and output metering.
 * Reduces graph node count from 3 (InputMeter → Plugin → OutputMeter)
 * to 1 (PluginWithMeterWrapper).
 *
 * Expected impact:
 * - Node count: 40-50% reduction (30 plugins: 90 nodes → 48 nodes)
 * - CPU: 2-4% reduction (eliminates per-node graph overhead)
 * - Memory: 2-3 KB per chain
 *
 * Thread safety:
 * - processBlock() called from audio thread
 * - getInputMeter()/getOutputMeter() called from UI thread (lock-free atomics)
 */
class PluginWithMeterWrapper : public juce::AudioProcessor
{
public:
    /**
     * Construct wrapper around an existing plugin instance.
     * Takes ownership of the plugin via unique_ptr.
     */
    explicit PluginWithMeterWrapper(std::unique_ptr<juce::AudioPluginInstance> pluginToWrap);
    ~PluginWithMeterWrapper() override;

    // =============================================
    // AudioProcessor interface (delegate to wrapped plugin)
    // =============================================

    void prepareToPlay(double sampleRate, int maximumExpectedSamplesPerBlock) override;
    void releaseResources() override;

    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages) override;

    const juce::String getName() const override;
    bool acceptsMidi() const override;
    bool producesMidi() const override;
    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override;

    int getNumPrograms() override;
    int getCurrentProgram() override;
    void setCurrentProgram(int index) override;
    const juce::String getProgramName(int index) override;
    void changeProgramName(int index, const juce::String& newName) override;

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    double getTailLengthSeconds() const override;

    // =============================================
    // Meter access (UI thread safe)
    // =============================================

    AudioMeter& getInputMeter() { return inputMeter; }
    AudioMeter& getOutputMeter() { return outputMeter; }
    const AudioMeter& getInputMeter() const { return inputMeter; }
    const AudioMeter& getOutputMeter() const { return outputMeter; }

    /**
     * Get the wrapped plugin instance (for direct access to editor, parameters, etc.)
     * Returns nullptr if plugin failed to load.
     */
    juce::AudioPluginInstance* getWrappedPlugin() const { return wrappedPlugin.get(); }

    /**
     * Check if the wrapped plugin's latency has changed since last check.
     * Returns true if latency changed, false otherwise.
     * Thread-safe for calling from UI/message thread.
     */
    bool hasLatencyChanged() const { return latencyChanged.load(std::memory_order_acquire); }

    /**
     * Acknowledge latency change (called by ChainProcessor after handling).
     * Thread-safe for calling from UI/message thread.
     */
    void acknowledgeLatencyChange() { latencyChanged.store(false, std::memory_order_release); }

    /**
     * Set sidechain buffer for SC-capable plugins.
     * Buffer pointer is only valid during the current processBlock call.
     */
    void setSidechainBuffer(juce::AudioBuffer<float>* buf) { sidechainBuffer = buf; }

private:
    std::unique_ptr<juce::AudioPluginInstance> wrappedPlugin;

    AudioMeter inputMeter;
    AudioMeter outputMeter;

    // Track latency changes for dynamic updates (e.g., Auto-Tune mode toggle)
    std::atomic<bool> latencyChanged{false};
    int lastReportedLatency = 0;

    // Sidechain buffer from host (set per-block, not owned)
    juce::AudioBuffer<float>* sidechainBuffer = nullptr;

    // Sidechain plugins (4-in/2-out) need channel expansion.
    // Wrapper always declares 2-in/2-out to keep the graph homogeneously 2-channel.
    // Expansion is handled internally using this persistent buffer.
    bool needsExpansion = false;
    juce::AudioBuffer<float> expandedBuffer;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginWithMeterWrapper)
};
