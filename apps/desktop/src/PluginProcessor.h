#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "core/PluginManager.h"
#include "core/ChainProcessor.h"
#include "core/PresetManager.h"
#include "core/InstanceRegistry.h"
#include "audio/WaveformCapture.h"
#include "audio/GainProcessor.h"
#include "audio/AudioMeter.h"
#include "audio/FFTProcessor.h"
#include "automation/ParameterProxyPool.h"
#include "automation/MacroManager.h"

class MirrorManager;

class PluginChainManagerProcessor : public juce::AudioProcessor
{
public:
    explicit PluginChainManagerProcessor(PluginManager::InstanceFactory factory = {});
    ~PluginChainManagerProcessor() override;

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;

    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;

    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override;

    const juce::String getName() const override;

    bool acceptsMidi() const override;
    bool producesMidi() const override;
    bool isMidiEffect() const override;
    double getTailLengthSeconds() const override;

    int getNumPrograms() override;
    int getCurrentProgram() override;
    void setCurrentProgram(int index) override;
    const juce::String getProgramName(int index) override;
    void changeProgramName(int index, const juce::String& newName) override;

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;
    void setNonRealtime(bool) noexcept override;
    void audioWorkgroupContextChanged(const juce::AudioWorkgroup&) override;
    void reset() override;

    // DAW track properties (name, colour)
    void updateTrackProperties(const TrackProperties& properties) override;

    // Access to core components
    PluginManager& getPluginManager() { return pluginManager; }
    ChainProcessor& getChainProcessor() { return chainProcessor; }
    PresetManager& getPresetManager() { return presetManager; }
    WaveformCapture& getWaveformCapture() { return waveformCapture; }
    GainProcessor& getGainProcessor() { return gainProcessor; }
    AudioMeter& getInputMeter() { return inputMeter; }
    AudioMeter& getOutputMeter() { return outputMeter; }
    FFTProcessor& getFFTProcessor() { return fftProcessor; }
    ParameterProxyPool& getParameterPool() { return parameterPool; }
    MacroManager& getMacroManager() { return macroManager; }
    void setAnalysisSubscriptions(bool waveform, bool fft);
    void setGainMatchEnabled(bool enabled) { gainMatchEnabled.store(enabled); gainProcessor.setGainMatchEnabled(enabled); }
    bool isGainMatchEnabled() const { return gainMatchEnabled.load(); }
    void setGainMatchTargetDB(float db) { gainProcessor.setGainMatchTargetDB(db); }
    float getGainMatchTargetDB() const { return gainProcessor.getGainMatchTargetDB(); }
    std::unique_ptr<juce::XmlElement> captureWrapperState() const;
    bool applyWrapperSettings(const juce::XmlElement&, bool restoreAssignmentsExactly = true);

    // Instance awareness
    InstanceRegistry& getInstanceRegistry() { return *instanceRegistry; }
    InstanceId getInstanceId() const { return instanceId; }
    MirrorManager& getMirrorManager() { return *mirrorManager; }

private:
    PluginManager pluginManager;
    ChainProcessor chainProcessor;
    PresetManager presetManager;
    WaveformCapture waveformCapture;
    GainProcessor gainProcessor;
    AudioMeter inputMeter;
    AudioMeter outputMeter;
    FFTProcessor fftProcessor;
    ParameterProxyPool parameterPool;
    MacroManager macroManager;

    // Instance awareness — SharedResourcePointer ensures one registry per process
    juce::SharedResourcePointer<InstanceRegistry> instanceRegistry;
    InstanceId instanceId = -1;
    juce::String trackName;
    std::unique_ptr<MirrorManager> mirrorManager;
    std::atomic<bool> waveformSubscribed{false};
    std::atomic<bool> fftSubscribed{false};
    std::atomic<bool> gainMatchEnabled{false};
    juce::String pendingRequestedState;
    juce::AudioBuffer<float> monoWork; // stereo copy of a mono track's audio
    juce::AudioBuffer<float> sidechainWork; // stereo copy of the host's sidechain input

    void processStereo(juce::AudioBuffer<float>&, juce::MidiBuffer&);
    std::shared_ptr<std::atomic<bool>> lifetime = std::make_shared<std::atomic<bool>>(true);

    /** Collect current chain info and push to registry. */
    void updateRegistryInfo();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginChainManagerProcessor)
};
