#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "core/PluginManager.h"
#include "core/ChainProcessor.h"
#include "core/PresetManager.h"
#include "audio/WaveformCapture.h"
#include "audio/GainProcessor.h"
#include "audio/AudioMeter.h"
#include "audio/FFTProcessor.h"
#include "automation/ParameterProxyPool.h"

class PluginChainManagerProcessor : public juce::AudioProcessor
{
public:
    PluginChainManagerProcessor();
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

    // Access to core components
    PluginManager& getPluginManager() { return pluginManager; }
    ChainProcessor& getChainProcessor() { return chainProcessor; }
    PresetManager& getPresetManager() { return presetManager; }
    WaveformCapture& getWaveformCapture() { return waveformCapture; }
    GainProcessor& getGainProcessor() { return gainProcessor; }
    AudioMeter& getInputMeter() { return inputMeter; }
    AudioMeter& getOutputMeter() { return outputMeter; }
    FFTProcessor& getFFTProcessor() { return fftProcessor; }

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

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginChainManagerProcessor)
};
