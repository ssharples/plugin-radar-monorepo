#pragma once

#include "audio/AudioMeter.h"
#include "audio/SignalAnalyzer.h"
#include "audio/DryWetMixProcessor.h"
#include "audio/GainProcessor.h"
#include "automation/ParameterProxyPool.h"
#include "core/CachedPlayHead.h"
#include "core/ChainProcessor.h"
#include "core/GroupTemplateManager.h"
#include "core/InstanceRegistry.h"
#include "core/PluginManager.h"
#include "core/PresetManager.h"
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_dsp/juce_dsp.h>

class MirrorManager;

class PluginChainManagerProcessor : public juce::AudioProcessor {
public:
  PluginChainManagerProcessor();
  ~PluginChainManagerProcessor() override;

  void prepareToPlay(double sampleRate, int samplesPerBlock) override;
  void releaseResources() override;

  bool isBusesLayoutSupported(const BusesLayout &layouts) const override;

  void processBlock(juce::AudioBuffer<float> &, juce::MidiBuffer &) override;

  juce::AudioProcessorEditor *createEditor() override;
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
  void changeProgramName(int index, const juce::String &newName) override;

  void getStateInformation(juce::MemoryBlock &destData) override;
  void setStateInformation(const void *data, int sizeInBytes) override;

  // DAW track properties (name, colour)
  void updateTrackProperties(const TrackProperties &properties) override;

  // Access to core components
  PluginManager &getPluginManager() { return pluginManager; }
  ChainProcessor &getChainProcessor() { return chainProcessor; }
  PresetManager &getPresetManager() { return presetManager; }
  GroupTemplateManager &getGroupTemplateManager() {
    return groupTemplateManager;
  }
  GainProcessor &getGainProcessor() { return gainProcessor; }
  AudioMeter &getInputMeter() { return inputMeter; }
  AudioMeter &getOutputMeter() { return outputMeter; }
  SignalAnalyzer::Snapshot getSignalSnapshot() const { return signalAnalyzer.getSnapshot(); }
  SignalAnalyzer &getSignalAnalyzer() { return signalAnalyzer; }
  DryWetMixProcessor &getMasterDryWetProcessor() {
    return masterDryWetProcessor;
  }

  // Oversampling control
  void setOversamplingFactor(int factor);
  int getOversamplingFactor() const { return oversamplingFactor; }
  bool isOversamplingEnabled() const { return oversamplingEnabled; }
  float getOversamplingLatencyMs() const;

  // Instance awareness
  InstanceRegistry &getInstanceRegistry() { return *instanceRegistry; }
  InstanceId getInstanceId() const { return instanceId; }
  MirrorManager &getMirrorManager() { return *mirrorManager; }
  ParameterProxyPool &getParameterPool() { return parameterPool; }

private:
  PluginManager pluginManager;
  ChainProcessor chainProcessor;
  PresetManager presetManager;
  GroupTemplateManager groupTemplateManager;
  GainProcessor gainProcessor;
  AudioMeter inputMeter;
  AudioMeter outputMeter;
  SignalAnalyzer signalAnalyzer;
  DryWetMixProcessor masterDryWetProcessor;
  juce::AudioBuffer<float>
      dryBufferForMaster; // Stores dry signal for master dry/wet
  juce::AudioBuffer<float>
      dryWetMixBuffer; // Pre-allocated 4-ch buffer for master dry/wet mixing
  juce::dsp::DelayLine<float> dryDelayLine{1}; // Latency-compensates dry signal
  int currentChainLatency = 0;
  ParameterProxyPool parameterPool;
  CachedPlayHead cachedPlayHead;

  // Oversampling
  std::unique_ptr<juce::dsp::Oversampling<float>> oversampling;
  int oversamplingFactor = 0; // 0=off, 1=2x, 2=4x
  bool oversamplingEnabled = false;
  double lastSampleRate = 44100.0;
  int lastBlockSize = 512;

  // P1-3: When setStateInformation() runs before prepareToPlay(), the
  // oversampling latency is stale.  This flag defers the latency report
  // to the start of the next processBlock() where everything is fully prepared.
  std::atomic<bool> needsLatencyUpdate{false};

  // Instance awareness — SharedResourcePointer ensures one registry per process
  juce::SharedResourcePointer<InstanceRegistry> instanceRegistry;
  InstanceId instanceId = -1;
  juce::String trackName;
  std::unique_ptr<MirrorManager> mirrorManager;

  /** Collect current chain info and push to registry. */
  void updateRegistryInfo();

  // Weak lifetime guard for deferred callbacks (mirrors pattern used by
  // MirrorManager, ChainProcessor, etc.)
  std::shared_ptr<std::atomic<bool>> aliveFlag =
      std::make_shared<std::atomic<bool>>(true);

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginChainManagerProcessor)
};
