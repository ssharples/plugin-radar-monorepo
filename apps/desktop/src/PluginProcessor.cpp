#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "audio/FastMath.h"
#include "core/MirrorManager.h"
#include "utils/ProChainLogger.h"
#include <cmath>

// Replace any NaN/Inf samples with 0.0 to prevent downstream corruption.
// Uses SIMD-friendly findMinAndMax as a fast path; only iterates per-sample
// when the fast check detects a problem (preserves good samples).
static void sanitiseBuffer(juce::AudioBuffer<float> &buffer) {
  constexpr float maxSafe = 4.0f; // ~+12 dBFS hard limit
  for (int ch = 0; ch < buffer.getNumChannels(); ++ch) {
    auto range = juce::FloatVectorOperations::findMinAndMax(
        buffer.getReadPointer(ch), buffer.getNumSamples());
    if (std::isfinite(range.getStart()) && std::isfinite(range.getEnd()) &&
        range.getStart() >= -maxSafe && range.getEnd() <= maxSafe)
      continue; // fast path: buffer is clean and within safe range
    // slow path: clamp or zero bad samples
    auto *data = buffer.getWritePointer(ch);
    for (int i = 0; i < buffer.getNumSamples(); ++i) {
      if (!std::isfinite(data[i]))
        data[i] = 0.0f;
      else if (data[i] > maxSafe)
        data[i] = maxSafe;
      else if (data[i] < -maxSafe)
        data[i] = -maxSafe;
    }
  }
}
PluginChainManagerProcessor::PluginChainManagerProcessor()
    : AudioProcessor(
          BusesProperties()
              .withInput("Input", juce::AudioChannelSet::stereo(), true)
              // DISABLED: Sidechain bus removed to isolate audio routing issue
              // .withInput("Sidechain", juce::AudioChannelSet::stereo(), false)
              .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      chainProcessor(pluginManager), presetManager(chainProcessor),
      groupTemplateManager(chainProcessor) {
  PCLOG("PluginProcessor constructor — instance creating");

  // Force FastMath lookup table initialization on the message thread.
  // The table uses a static local array (841 std::pow calls on first use).
  // Without this, the first audio-thread call would stall while building it.
  (void)FastMath::dbToLinear(0.0f);

  // Pre-allocate proxy parameters for DAW automation (must be in constructor)
  parameterPool.createAndRegister(*this);

  // Set up latency reporting callback
  chainProcessor.onLatencyChanged = [this](int latencySamples) {
    // Chain reports latency at its operating rate.
    // When oversampling, convert from oversampled rate to original rate,
    // then add the oversampling filter's own latency (already at original
    // rate).
    int totalLatency = latencySamples;
    if (oversamplingEnabled && oversampling) {
      int osFactor = 1 << oversamplingFactor;   // 2^n
      totalLatency = latencySamples / osFactor; // Convert to original rate
      totalLatency += static_cast<int>(oversampling->getLatencyInSamples());
    }

    PCLOG("onLatencyChanged: reporting " + juce::String(totalLatency) +
          " samples to DAW (chain=" + juce::String(latencySamples) +
          " prev=" + juce::String(currentChainLatency) + ")");
    setLatencySamples(totalLatency);
    // Update dry signal delay to stay aligned with wet (chain-processed) signal
    currentChainLatency = totalLatency;
    if (totalLatency > 0)
      dryDelayLine.setDelay(static_cast<float>(totalLatency));
  };

  // Rebind proxy parameters when plugins are added/removed/moved
  chainProcessor.onParameterBindingChanged = [this]() {
    parameterPool.rebindAll(chainProcessor);
  };

  // Unbind a specific slot (used after duplication to clear automation)
  chainProcessor.onUnbindSlot = [this](int slotIndex) {
    parameterPool.unbindSlot(slotIndex);
  };

  // Register with the shared instance registry
  instanceId = instanceRegistry->registerInstance(this);

  // Set up chain changed callback for registry updates.
  // WebViewBridge::bindCallbacks() will wrap this to also emit JS events.
  chainProcessor.onChainChanged = [this]() { updateRegistryInfo(); };

  chainProcessor.onBeforeDeletePlugin = [this]() { parameterPool.unbindAll(); };

  // Create mirror manager (Phase 3)
  mirrorManager = std::make_unique<MirrorManager>(*this, *instanceRegistry);

  PCLOG("PluginProcessor constructor — instance #" + juce::String(instanceId) +
        " ready");
}

PluginChainManagerProcessor::~PluginChainManagerProcessor() {
  PCLOG("PluginProcessor destructor — instance #" + juce::String(instanceId) +
        " shutting down");

  // Signal deferred callbacks that this processor is being destroyed
  aliveFlag->store(false, std::memory_order_release);

  // CRITICAL: Stop audio thread from processing before destroying anything.
  // Without this, the audio thread can dereference freed plugin buffers
  // (EXC_BAD_ACCESS in AudioUnitPluginInstance::processAudio →
  // AudioBuffer::clear).
  suspendProcessing(true);

  // Wait for any in-flight audio callback to finish
  for (int i = 0; i < 500 && chainProcessor.isAudioThreadBusy(); ++i)
    juce::Thread::sleep(1);

  // CRITICAL: Clear parameter watcher BEFORE clearing the graph.
  // clearGraph() destroys all hosted plugin instances (and their parameters).
  // If parameterWatcher still holds raw AudioProcessorParameter* pointers,
  // its destructor would call removeListener() on dangling pointers
  // (use-after-free).
  chainProcessor.setParameterWatcherSuppressed(true);
  chainProcessor.clearParameterWatches();

  parameterPool.unbindAll();

  // Clear graph nodes while we still own them (before member destruction)
  chainProcessor.clearGraph();

  // Leave mirror group before deregistering
  if (mirrorManager)
    mirrorManager->leaveMirrorGroup();

  instanceRegistry->deregisterInstance(instanceId);
  PCLOG("PluginProcessor destructor — instance #" + juce::String(instanceId) +
        " done");
}

const juce::String PluginChainManagerProcessor::getName() const {
  return JucePlugin_Name;
}

bool PluginChainManagerProcessor::acceptsMidi() const { return false; }

bool PluginChainManagerProcessor::producesMidi() const { return false; }

bool PluginChainManagerProcessor::isMidiEffect() const { return false; }

double PluginChainManagerProcessor::getTailLengthSeconds() const {
  return chainProcessor.getTotalTailLengthSeconds();
}

int PluginChainManagerProcessor::getNumPrograms() { return 1; }

int PluginChainManagerProcessor::getCurrentProgram() { return 0; }

void PluginChainManagerProcessor::setCurrentProgram(int index) {
  juce::ignoreUnused(index);
}

const juce::String PluginChainManagerProcessor::getProgramName(int index) {
  juce::ignoreUnused(index);
  return {};
}

void PluginChainManagerProcessor::changeProgramName(
    int index, const juce::String &newName) {
  juce::ignoreUnused(index, newName);
}

void PluginChainManagerProcessor::prepareToPlay(double sampleRate,
                                                int samplesPerBlock) {
  PCLOG("prepareToPlay — SR=" + juce::String(sampleRate) +
        " block=" + juce::String(samplesPerBlock) +
        " OS=" + juce::String(oversamplingFactor));
  lastSampleRate = sampleRate;
  lastBlockSize = samplesPerBlock;

  // Initialize oversampling processor
  if (oversamplingEnabled) {
    oversampling = std::make_unique<juce::dsp::Oversampling<float>>(
        2, // stereo
        oversamplingFactor,
        juce::dsp::Oversampling<float>::filterHalfBandPolyphaseIIR,
        true, // max quality
        true  // use integer latency — required for accurate DAW PDC
    );
    oversampling->initProcessing(static_cast<size_t>(samplesPerBlock));
    oversampling->reset();
  } else {
    oversampling.reset();
  }

  // Calculate effective rate/block for the chain (Nx when oversampled)
  double effectiveRate = sampleRate;
  int effectiveBlock = samplesPerBlock;
  if (oversamplingEnabled) {
    int factor = 1 << oversamplingFactor; // 2^n: factor 1→2x, factor 2→4x
    effectiveRate = sampleRate * factor;
    effectiveBlock = samplesPerBlock * factor;
  }

  // Chain only processes stereo main audio (2-in/2-out).
  // Sidechain-capable plugins internally mirror main audio to SC channels.
  chainProcessor.setPlayConfigDetails(2, 2, effectiveRate, effectiveBlock);
  chainProcessor.prepareToPlay(effectiveRate, effectiveBlock);

  // Initialize gain processor and meters at original rate (they process
  // before/after oversampling)
  gainProcessor.prepareToPlay(sampleRate, samplesPerBlock);
  inputMeter.prepareToPlay(sampleRate, samplesPerBlock);
  outputMeter.prepareToPlay(sampleRate, samplesPerBlock);

  // Initialize master dry/wet processor
  masterDryWetProcessor.prepareToPlay(sampleRate, samplesPerBlock);

  // Pre-allocate all processBlock buffers with 4x headroom.
  // Some DAWs (Logic Pro, Ableton) occasionally send blocks larger than the
  // declared maximum. 4x headroom avoids audio-thread allocations.
  const int preAllocSamples = samplesPerBlock * 4;

  // Allocate dry buffer for master dry/wet mixing (stereo)
  dryBufferForMaster.setSize(2, preAllocSamples, false, false, true);

  // Pre-allocate 4-channel buffer for master dry/wet mixing
  dryWetMixBuffer.setSize(4, preAllocSamples, false, false, true);

  // Prepare dry signal delay line for latency compensation
  // Max delay = 2 seconds worth of samples (generous ceiling)
  juce::dsp::ProcessSpec delaySpec;
  delaySpec.sampleRate = sampleRate;
  delaySpec.maximumBlockSize = static_cast<juce::uint32>(samplesPerBlock);
  delaySpec.numChannels = 2;
  dryDelayLine.setMaximumDelayInSamples(static_cast<int>(sampleRate * 2.0));
  dryDelayLine.prepare(delaySpec);
  // NOTE: Do NOT setDelay() here with stale currentChainLatency — it was
  // computed at the old sample rate.  We recalculate fresh below.

  // Report initial latency to host (chain latency + oversampling filter
  // latency) Chain latency is in oversampled samples when OS is active —
  // convert to original rate
  int latency = chainProcessor.getTotalLatencySamples();
  if (oversamplingEnabled && oversampling) {
    int osFactor = 1 << oversamplingFactor; // 2^n
    latency =
        latency /
        osFactor; // Convert chain latency from oversampled to original rate
    latency += static_cast<int>(
        oversampling->getLatencyInSamples()); // Already at original rate
  }
  PCLOG("prepareToPlay: reporting latency=" + juce::String(latency) +
        " samples to DAW (prev currentChainLatency=" +
        juce::String(currentChainLatency) + ")");
  setLatencySamples(latency);

  // CRITICAL: Sync currentChainLatency and dryDelayLine immediately.
  // Without this, the dry delay line stays at 0 until the async
  // onLatencyChanged callback fires (up to ~100 processBlock calls later),
  // causing dry/wet misalignment during startup.
  currentChainLatency = latency;
  if (latency > 0)
    dryDelayLine.setDelay(static_cast<float>(latency));
}

void PluginChainManagerProcessor::releaseResources() {
  chainProcessor.releaseResources();
}

bool PluginChainManagerProcessor::isBusesLayoutSupported(
    const BusesLayout &layouts) const {
  if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
    return false;

  if (layouts.getMainInputChannelSet() != juce::AudioChannelSet::stereo())
    return false;

  // DISABLED: Sidechain bus check removed to isolate audio routing issue
  // if (layouts.inputBuses.size() > 1) {
  //   auto scSet = layouts.getChannelSet(true, 1);
  //   if (!scSet.isDisabled() && scSet != juce::AudioChannelSet::stereo())
  //     return false;
  // }

  return true;
}

void PluginChainManagerProcessor::processBlock(juce::AudioBuffer<float> &buffer,
                                               juce::MidiBuffer &midiMessages) {
  juce::ScopedNoDenormals noDenormals;

  // P1-3: Deferred latency update — oversampling is now fully prepared.
  if (needsLatencyUpdate.exchange(false, std::memory_order_acq_rel)) {
    int latency = chainProcessor.getTotalLatencySamples();
    if (oversamplingEnabled && oversampling) {
      int osFactor = 1 << oversamplingFactor;
      latency = latency / osFactor;
      latency += static_cast<int>(oversampling->getLatencyInSamples());
    }
    PCLOG("processBlock — deferred latency update=" + juce::String(latency));
    currentChainLatency = latency;
    if (latency > 0)
      dryDelayLine.setDelay(static_cast<float>(latency));
    setLatencySamples(latency);
  }

  // P0-5: Validate buffer has at least 2 channels for stereo processing.
  // Some DAWs may pass mono or empty buffers during configuration changes.
  if (buffer.getNumChannels() < 2) {
    buffer.clear();
    return;
  }

  auto totalNumInputChannels = getTotalNumInputChannels();
  auto totalNumOutputChannels = getTotalNumOutputChannels();

  for (auto i = totalNumInputChannels; i < totalNumOutputChannels; ++i)
    buffer.clear(i, 0, buffer.getNumSamples());

  // Clear any channels beyond stereo. Some DAWs cache the old bus layout
  // (which included a sidechain bus) and send >2 channels. If these extra
  // channels pass through unchanged they can create feedback loops when the
  // DAW routes the stale sidechain output back to its own sidechain input.
  for (int i = 2; i < buffer.getNumChannels(); ++i)
    buffer.clear(i, 0, buffer.getNumSamples());

  // Apply input gain first (operates on stereo ch0-1 only)
  gainProcessor.processInputGain(buffer);

  // Sanitise after input gain — extreme gain can push plugins into NaN/Inf
  sanitiseBuffer(buffer);

  // Meter input AFTER gain (showing what actually enters the chain)
  inputMeter.process(buffer);

  // Store dry signal (stereo only) for master dry/wet mixing (after input
  // gain). CRITICAL: Only copy 2 channels — dryDelayLine is prepared for 2
  // channels. Copying the full 4-ch DAW buffer causes out-of-bounds writes in
  // the delay line.
  // If the DAW sends a block larger than our pre-allocated buffer (4x headroom),
  // clamp to what fits rather than allocating on the audio thread.
  const int safeSamples = juce::jmin(buffer.getNumSamples(),
                                     dryBufferForMaster.getNumSamples());
  jassert(buffer.getNumSamples() <= dryBufferForMaster.getNumSamples()); // Should never exceed 4x headroom
  dryBufferForMaster.copyFrom(0, 0, buffer, 0, 0, safeSamples);
  dryBufferForMaster.copyFrom(1, 0, buffer, 1, 0, safeSamples);

  // Delay the dry signal to match chain latency (keeps dry/wet time-aligned)
  if (currentChainLatency > 0) {
    juce::dsp::AudioBlock<float> dryBlock(dryBufferForMaster);
    juce::dsp::ProcessContextReplacing<float> dryContext(dryBlock);
    dryDelayLine.process(dryContext);
  }

  // Capture DAW play head safely before passing it to the graph.
  // Without this caching, plugins see dangling play head pointer from Message
  // Thread and crash.
  cachedPlayHead.update(getPlayHead());
  chainProcessor.setPlayHead(&cachedPlayHead);

  // Process through the plugin chain (with optional oversampling).
  // Buffer is always stereo (no sidechain bus declared).
  // P1-9: Capture local pointer — if the oversampling object is swapped out
  // during graph rebuild we still use a consistent reference for this block.
  auto* localOS = oversampling.get();
  if (oversamplingEnabled && localOS != nullptr) {
    juce::dsp::AudioBlock<float> block(buffer);
    auto oversampledBlock = localOS->processSamplesUp(block);

    const int osNumSamples = static_cast<int>(oversampledBlock.getNumSamples());
    float *channelPtrs[2] = {nullptr, nullptr};
    for (int ch = 0;
         ch <
         juce::jmin(static_cast<int>(oversampledBlock.getNumChannels()), 2);
         ++ch)
      channelPtrs[ch] =
          oversampledBlock.getChannelPointer(static_cast<size_t>(ch));
    juce::AudioBuffer<float> osBuffer(channelPtrs, 2, osNumSamples);

    chainProcessor.processBlock(osBuffer, midiMessages);

    // Verify the oversampling object hasn't been replaced mid-block
    if (oversampling.get() == localOS)
      localOS->processSamplesDown(block);
    // else: oversampling was swapped — skip downsample, output the dry block
  } else {
    // CRITICAL: Pass a 2-channel view to the chain, not the full 4-channel
    // DAW buffer. The AudioProcessorGraph is configured for 2 I/O channels.
    // Passing 4 channels causes the graph's internal buffer allocation to
    // mismap channels, resulting in the graph reading/writing wrong data.
    juce::AudioBuffer<float> stereoView(buffer.getArrayOfWritePointers(), 2,
                                        buffer.getNumSamples());
    chainProcessor.processBlock(stereoView, midiMessages);
  }

  // Sanitise after chain — catch any NaN/Inf produced by plugins
  sanitiseBuffer(buffer);

  // Master dry/wet mixing (before output gain)
  {
    // Use pre-allocated 4-channel buffer: ch0-1 = dry (latency-compensated),
    // ch2-3 = wet. Clamp to pre-allocated size — never allocate on audio thread.
    const int mixSamples = juce::jmin(buffer.getNumSamples(),
                                      dryWetMixBuffer.getNumSamples());
    jassert(buffer.getNumSamples() <= dryWetMixBuffer.getNumSamples()); // Should never exceed 4x headroom

    // Copy latency-compensated dry signal to ch0-1
    dryWetMixBuffer.copyFrom(0, 0, dryBufferForMaster, 0, 0, mixSamples);
    dryWetMixBuffer.copyFrom(1, 0, dryBufferForMaster, 1, 0, mixSamples);

    // Copy wet signal (processed chain output) to ch2-3
    dryWetMixBuffer.copyFrom(2, 0, buffer, 0, 0, mixSamples);
    dryWetMixBuffer.copyFrom(3, 0, buffer, 1, 0, mixSamples);

    // Process mix — use a view with correct sample count to avoid processing
    // garbage beyond the valid region (dryWetMixBuffer is pre-allocated with
    // headroom)
    juce::AudioBuffer<float> mixView(dryWetMixBuffer.getArrayOfWritePointers(),
                                     4, mixSamples);
    juce::MidiBuffer emptyMidi;
    masterDryWetProcessor.processBlock(mixView, emptyMidi);

    // Copy mixed result back to main buffer
    buffer.copyFrom(0, 0, dryWetMixBuffer, 0, 0, mixSamples);
    buffer.copyFrom(1, 0, dryWetMixBuffer, 1, 0, mixSamples);
  }

  // Apply output gain
  gainProcessor.processOutputGain(buffer);

  // Meter final output (after output gain, showing "what goes to DAW")
  outputMeter.process(buffer);
}

bool PluginChainManagerProcessor::hasEditor() const { return true; }

juce::AudioProcessorEditor *PluginChainManagerProcessor::createEditor() {
  return new PluginChainManagerEditor(*this);
}

void PluginChainManagerProcessor::getStateInformation(
    juce::MemoryBlock &destData) {
  // Get chain state as binary (ChainProcessor encodes XML via copyXmlToBinary)
  juce::MemoryBlock chainData;
  chainProcessor.getStateInformation(chainData);

  // Parse the chain XML to add mirror group info and oversampling state
  if (auto xml = getXmlFromBinary(chainData.getData(),
                                  static_cast<int>(chainData.getSize()))) {
    if (mirrorManager && mirrorManager->isMirrored()) {
      auto *mirrorXml = xml->createNewChildElement("MirrorGroup");
      mirrorXml->setAttribute("id", mirrorManager->getMirrorGroupId());
      mirrorXml->setAttribute("wasLeader", mirrorManager->isLeader() ? 1 : 0);
    }

    // Save oversampling factor
    auto *osXml = xml->createNewChildElement("Oversampling");
    osXml->setAttribute("factor", oversamplingFactor);

    // Save master controls (IN/OUT gain, master dry/wet)
    auto *masterXml = xml->createNewChildElement("MasterControls");
    masterXml->setAttribute("inputGainDB", gainProcessor.getInputGainDB());
    masterXml->setAttribute("outputGainDB", gainProcessor.getOutputGainDB());
    masterXml->setAttribute("masterDryWet", masterDryWetProcessor.getMix());

    copyXmlToBinary(*xml, destData);
  } else {
    destData = chainData;
  }
}

void PluginChainManagerProcessor::setStateInformation(const void *data,
                                                      int sizeInBytes) {
  PCLOG("setStateInformation — " + juce::String(sizeInBytes) + " bytes");

  int savedMirrorGroupId = -1;
  int savedOversamplingFactor = 0;
  bool savedWasLeader = false;

  // Check for mirror group info and oversampling state in the state XML
  if (auto xml = getXmlFromBinary(data, sizeInBytes)) {
    if (auto *mirrorXml = xml->getChildByName("MirrorGroup")) {
      savedMirrorGroupId = mirrorXml->getIntAttribute("id", -1);
      savedWasLeader = mirrorXml->getBoolAttribute("wasLeader", false);
      xml->removeChildElement(mirrorXml, true);
    }

    if (auto *osXml = xml->getChildByName("Oversampling")) {
      savedOversamplingFactor = osXml->getIntAttribute("factor", 0);
      xml->removeChildElement(osXml, true);
    }

    // Restore master controls (IN/OUT gain, master dry/wet) before chain
    if (auto *masterXml = xml->getChildByName("MasterControls")) {
      float inputGainDB =
          (float)masterXml->getDoubleAttribute("inputGainDB", 0.0);
      float outputGainDB =
          (float)masterXml->getDoubleAttribute("outputGainDB", 0.0);
      float masterDryWet =
          (float)masterXml->getDoubleAttribute("masterDryWet", 1.0);
      xml->removeChildElement(masterXml, true);
      gainProcessor.setInputGain(inputGainDB);
      gainProcessor.setOutputGain(outputGainDB);
      masterDryWetProcessor.setMix(masterDryWet);
    }

    // Restore oversampling before chain (so chain prepares at correct rate)
    if (savedOversamplingFactor != oversamplingFactor)
      setOversamplingFactor(savedOversamplingFactor);

    // Re-encode without the extra elements and pass to chain processor
    juce::MemoryBlock chainData;
    copyXmlToBinary(*xml, chainData);
    chainProcessor.setStateInformation(chainData.getData(),
                                       static_cast<int>(chainData.getSize()));
  } else {
    chainProcessor.setStateInformation(data, sizeInBytes);
  }

  // Report chain latency to the DAW after state restoration.
  // If oversampling is enabled, the oversampling object may not yet be
  // prepared at the new rate (prepareToPlay hasn't been called yet during
  // session restore).  In that case, defer the latency report to the start
  // of the next processBlock() where everything is fully initialised.
  if (oversamplingEnabled) {
    needsLatencyUpdate.store(true, std::memory_order_release);
  } else {
    int chainLatency = chainProcessor.getTotalLatencySamples();
    PCLOG("setStateInformation — immediately syncing latency=" +
          juce::String(chainLatency) +
          " (prev=" + juce::String(currentChainLatency) + ")");
    currentChainLatency = chainLatency;
    if (chainLatency > 0)
      dryDelayLine.setDelay(static_cast<float>(chainLatency));
    setLatencySamples(chainLatency);
  }

  // Attempt to reconnect mirror group from saved DAW session
  if (savedMirrorGroupId > 0 && mirrorManager) {
    auto alive = aliveFlag;
    auto *mm = mirrorManager.get();
    auto callback = [alive, mm](int /*newGroupId*/) {
      if (!alive->load(std::memory_order_acquire))
        return;
      if (mm)
        mm->rejoinMirror();
    };

    int result = instanceRegistry->requestMirrorReconnection(
        savedMirrorGroupId, instanceId, savedWasLeader, callback);
    if (result >= 0) {
      // Match found immediately — partner already loaded
      mirrorManager->rejoinMirror();
    }
  }

  // Force-propagate restored state to mirror partners (Gap 6: snapshot recall
  // not mirroring)
  if (mirrorManager && mirrorManager->isMirrored())
    mirrorManager->forceFullPropagate();

  // Update registry with restored chain info
  updateRegistryInfo();
}

void PluginChainManagerProcessor::setOversamplingFactor(int factor) {
  oversamplingFactor = juce::jlimit(0, 2, factor); // 0=off (1x), 1=2x, 2=4x
  oversamplingEnabled = (oversamplingFactor > 0);

  // Must re-prepare the entire graph with the new effective sample rate
  if (lastSampleRate > 0) {
    suspendProcessing(true);
    prepareToPlay(lastSampleRate, lastBlockSize);
    suspendProcessing(false);
  }
}

float PluginChainManagerProcessor::getOversamplingLatencyMs() const {
  if (oversamplingEnabled && oversampling && lastSampleRate > 0)
    return static_cast<float>(oversampling->getLatencyInSamples() /
                              lastSampleRate * 1000.0);
  return 0.0f;
}

void PluginChainManagerProcessor::updateTrackProperties(
    const TrackProperties &properties) {
  trackName = (properties.name.has_value() && properties.name->isNotEmpty())
                  ? *properties.name
                  : ("Instance #" + juce::String(instanceId));

  updateRegistryInfo();
}

void PluginChainManagerProcessor::updateRegistryInfo() {
  // Collect flat plugin names from the chain tree
  auto flatPlugins = chainProcessor.getFlatPluginList();

  InstanceInfo info;
  info.id = instanceId;
  info.trackName = trackName.isEmpty()
                       ? ("Instance #" + juce::String(instanceId))
                       : trackName;
  info.pluginCount = static_cast<int>(flatPlugins.size());

  for (auto *leaf : flatPlugins)
    info.pluginNames.add(leaf->description.name);

  instanceRegistry->updateInstanceInfo(instanceId, info);
}

// This creates new instances of the plugin
juce::AudioProcessor *JUCE_CALLTYPE createPluginFilter() {
  return new PluginChainManagerProcessor();
}
