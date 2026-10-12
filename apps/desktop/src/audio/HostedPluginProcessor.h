#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include <atomic>
#include <memory>

/** The wrapper's sidechain audio for the block being rendered. ChainProcessor
    fills it on the audio thread before each chunk; hosted plugins read it. */
struct SidechainFeed
{
    const float* channels[2] = { nullptr, nullptr };
    int numSamples = 0;
    int offset = 0; // start of the chunk being rendered
    bool active() const noexcept { return channels[0] != nullptr && channels[1] != nullptr; }
};

/** Keeps a hosted effect warm for bypass and stops its DSP only for explicit Suspend.
    The graph sees the same latency in every control state. */
class HostedPluginProcessor final : public juce::AudioProcessor,
                                    private juce::AudioProcessorListener
{
public:
    explicit HostedPluginProcessor(std::unique_ptr<juce::AudioPluginInstance>);
    ~HostedPluginProcessor() override;
    juce::AudioPluginInstance* plugin() const noexcept { return instance.get(); }
    // Stereo in and out, plus the plugin's sidechain input when it has one
    static bool configureStereo(juce::AudioPluginInstance&, juce::String& error);
    bool hasSidechainInput() const noexcept { return sidechainChannels > 0; }
    void setSidechainFeed(std::shared_ptr<const SidechainFeed> f) { feed = std::move(f); }
    // Off: the plugin's sidechain hears its own input, as if it had none
    void setUseSidechain(bool value) noexcept { useSidechain.store(value); }
    void setBypassed(bool value) noexcept { bypassed.store(value); }
    void setSuspended(bool value) noexcept { suspended.store(value); }
    bool isDspSuspended() const noexcept { return dspStopped.load(); }
    bool hasLatencyChange() const noexcept { return effectiveLatency() != getLatencySamples(); }
    // Report zero latency to the graph, for plugins that report it wrongly
    void setIgnoreLatency(bool value) noexcept { ignoreLatency.store(value); }
    bool isIgnoringLatency() const noexcept { return ignoreLatency.load(); }
    int getPluginLatencySamples() const noexcept { return observedLatency.load(); }
    struct RenderState
    {
        RenderState(int latency, double rate, int block, bool bypass, bool suspend);
        int latency, position = 0, warmupRemaining = 0;
        bool stopped;
        juce::AudioBuffer<float> ring, dry, wide; // wide: main plus sidechain channels
        juce::SmoothedValue<float> wet;
    };
    std::unique_ptr<RenderState> makeRenderState(double rate, int block) const;
    void refreshLatency(); // control thread, before compiling a replacement graph
    void processWithState(juce::AudioBuffer<float>&, juce::MidiBuffer&, RenderState&);
    void prepareToPlay(double, int) override;
    void releaseResources() override;
    void reset() override;
    void setNonRealtime(bool value) noexcept override;
    void audioWorkgroupContextChanged(const juce::AudioWorkgroup&) override;
    void processBlock(juce::AudioBuffer<float>& b, juce::MidiBuffer& m) override { if (directState) processWithState(b, m, *directState); }
    const juce::String getName() const override { return instance->getName(); }
    bool acceptsMidi() const override { return instance->acceptsMidi(); }
    bool producesMidi() const override { return instance->producesMidi(); }
    double getTailLengthSeconds() const override { return instance->getTailLengthSeconds(); }
    bool hasEditor() const override { return instance->hasEditor(); }
    juce::AudioProcessorEditor* createEditor() override { return instance->createEditorIfNeeded(); }
    int getNumPrograms() override { return instance->getNumPrograms(); }
    int getCurrentProgram() override { return instance->getCurrentProgram(); }
    void setCurrentProgram(int i) override { instance->setCurrentProgram(i); }
    const juce::String getProgramName(int i) override { return instance->getProgramName(i); }
    void changeProgramName(int i, const juce::String& n) override { instance->changeProgramName(i, n); }
    void getStateInformation(juce::MemoryBlock& b) override { instance->getStateInformation(b); }
    void setStateInformation(const void* b, int s) override { instance->setStateInformation(b, s); }
private:
    void audioProcessorParameterChanged(juce::AudioProcessor*, int, float) override {}
    void audioProcessorChanged(juce::AudioProcessor*, const ChangeDetails&) override;
    void runPlugin(juce::AudioBuffer<float>&, juce::MidiBuffer&, RenderState&);
    std::unique_ptr<juce::AudioPluginInstance> instance;
    int sidechainChannels = 0;
    std::shared_ptr<const SidechainFeed> feed;
    std::atomic<bool> useSidechain { false };
    std::atomic<bool> bypassed { false }, suspended { false }, dspStopped { false }, resetRequested { false };
    std::atomic<int> observedLatency { 0 };
    std::atomic<bool> ignoreLatency { false };
    int effectiveLatency() const noexcept { return ignoreLatency.load() ? 0 : juce::jmax(0, observedLatency.load()); }
    std::unique_ptr<RenderState> directState;
    double preparedRate = 0;
    int preparedBlock = 0;
    bool prepared = false;
};
