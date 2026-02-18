#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "core/MirrorManager.h"
#include "utils/ProChainLogger.h"
#include <cmath>

// Replace any NaN/Inf samples with 0.0 to prevent downstream corruption.
// Uses SIMD-friendly findMinAndMax instead of per-sample isfinite() branches.
static void sanitiseBuffer(juce::AudioBuffer<float>& buffer)
{
    for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
    {
        auto range = juce::FloatVectorOperations::findMinAndMax(
            buffer.getReadPointer(ch), buffer.getNumSamples());
        if (!std::isfinite(range.getStart()) || !std::isfinite(range.getEnd()))
            buffer.clear(ch, 0, buffer.getNumSamples());
    }
}
PluginChainManagerProcessor::PluginChainManagerProcessor()
    : AudioProcessor(BusesProperties()
                     .withInput("Input", juce::AudioChannelSet::stereo(), true)
                     .withInput("Sidechain", juce::AudioChannelSet::stereo(), false)
                     .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      chainProcessor(pluginManager),
      presetManager(chainProcessor),
      groupTemplateManager(chainProcessor)
{
    PCLOG("PluginProcessor constructor — instance creating");

    // Pre-allocate proxy parameters for DAW automation (must be in constructor)
    parameterPool.createAndRegister(*this);

    // Set up latency reporting callback
    chainProcessor.onLatencyChanged = [this](int latencySamples) {
        // Chain reports latency at its operating rate.
        // When oversampling, convert from oversampled rate to original rate,
        // then add the oversampling filter's own latency (already at original rate).
        int totalLatency = latencySamples;
        if (oversamplingEnabled && oversampling)
        {
            int osFactor = 1 << oversamplingFactor;  // 2^n
            totalLatency = latencySamples / osFactor;  // Convert to original rate
            totalLatency += static_cast<int>(oversampling->getLatencyInSamples());
        }

        setLatencySamples(totalLatency);
        // Sync waveform display - delay input to match output
        waveformCapture.setLatencyCompensation(totalLatency);
        // Update dry signal delay to stay aligned with wet (chain-processed) signal
        currentChainLatency = totalLatency;
        if (totalLatency > 0)
            dryDelayLine.setDelay(static_cast<float>(totalLatency));
    };

    // Rebind proxy parameters when plugins are added/removed/moved
    chainProcessor.onParameterBindingChanged = [this]() {
        parameterPool.rebindAll(chainProcessor);
        // Reset top-level counter so we capture audio calls after graph change
        topLevelProcessBlockCount = 0;
    };

    // Unbind a specific slot (used after duplication to clear automation)
    chainProcessor.onUnbindSlot = [this](int slotIndex) {
        parameterPool.unbindSlot(slotIndex);
    };

    // Register with the shared instance registry
    instanceId = instanceRegistry->registerInstance(this);

    // Set up chain changed callback for registry updates.
    // WebViewBridge::bindCallbacks() will wrap this to also emit JS events.
    chainProcessor.onChainChanged = [this]() {
        updateRegistryInfo();
    };

    // Create mirror manager (Phase 3)
    mirrorManager = std::make_unique<MirrorManager>(*this, *instanceRegistry);

    PCLOG("PluginProcessor constructor — instance #" + juce::String(instanceId) + " ready");
}

PluginChainManagerProcessor::~PluginChainManagerProcessor()
{
    PCLOG("PluginProcessor destructor — instance #" + juce::String(instanceId) + " shutting down");

    // CRITICAL: Stop audio thread from processing before destroying anything.
    // Without this, the audio thread can dereference freed plugin buffers
    // (EXC_BAD_ACCESS in AudioUnitPluginInstance::processAudio → AudioBuffer::clear).
    suspendProcessing(true);

    // Wait for any in-flight audio callback to finish
    for (int i = 0; i < 500 && chainProcessor.isAudioThreadBusy(); ++i)
        juce::Thread::sleep(1);

    // Clear graph nodes while we still own them (before member destruction)
    chainProcessor.clearGraph();

    // Leave mirror group before deregistering
    if (mirrorManager)
        mirrorManager->leaveMirrorGroup();

    instanceRegistry->deregisterInstance(instanceId);
    PCLOG("PluginProcessor destructor — instance #" + juce::String(instanceId) + " done");
}

const juce::String PluginChainManagerProcessor::getName() const
{
    return JucePlugin_Name;
}

bool PluginChainManagerProcessor::acceptsMidi() const
{
    return false;
}

bool PluginChainManagerProcessor::producesMidi() const
{
    return false;
}

bool PluginChainManagerProcessor::isMidiEffect() const
{
    return false;
}

double PluginChainManagerProcessor::getTailLengthSeconds() const
{
    return 0.0;
}

int PluginChainManagerProcessor::getNumPrograms()
{
    return 1;
}

int PluginChainManagerProcessor::getCurrentProgram()
{
    return 0;
}

void PluginChainManagerProcessor::setCurrentProgram(int index)
{
    juce::ignoreUnused(index);
}

const juce::String PluginChainManagerProcessor::getProgramName(int index)
{
    juce::ignoreUnused(index);
    return {};
}

void PluginChainManagerProcessor::changeProgramName(int index, const juce::String& newName)
{
    juce::ignoreUnused(index, newName);
}

void PluginChainManagerProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    PCLOG("prepareToPlay — SR=" + juce::String(sampleRate) + " block=" + juce::String(samplesPerBlock)
          + " OS=" + juce::String(oversamplingFactor));
    lastSampleRate = sampleRate;
    lastBlockSize = samplesPerBlock;

    // Initialize oversampling processor
    if (oversamplingEnabled)
    {
        oversampling = std::make_unique<juce::dsp::Oversampling<float>>(
            2,  // stereo
            oversamplingFactor,
            juce::dsp::Oversampling<float>::filterHalfBandPolyphaseIIR,
            true,  // max quality
            true   // use integer latency — required for accurate DAW PDC
        );
        oversampling->initProcessing(static_cast<size_t>(samplesPerBlock));
        oversampling->reset();
    }
    else
    {
        oversampling.reset();
    }

    // Calculate effective rate/block for the chain (Nx when oversampled)
    double effectiveRate = sampleRate;
    int effectiveBlock = samplesPerBlock;
    if (oversamplingEnabled)
    {
        int factor = 1 << oversamplingFactor;  // 2^n: factor 1→2x, factor 2→4x
        effectiveRate = sampleRate * factor;
        effectiveBlock = samplesPerBlock * factor;
    }

    // Chain only processes stereo main audio (2-in/2-out).
    // Sidechain data reaches individual plugins via setSidechainBuffer(),
    // not through the graph's I/O channels.
    chainProcessor.setPlayConfigDetails(
        2,
        2,
        effectiveRate,
        effectiveBlock
    );
    chainProcessor.prepareToPlay(effectiveRate, effectiveBlock);
    waveformCapture.reset();

    // Initialize gain processor and meters at original rate (they process before/after oversampling)
    gainProcessor.prepareToPlay(sampleRate, samplesPerBlock);
    inputMeter.prepareToPlay(sampleRate, samplesPerBlock);
    outputMeter.prepareToPlay(sampleRate, samplesPerBlock);
    fftProcessor.prepareToPlay(sampleRate, samplesPerBlock);

    // Initialize master dry/wet processor
    masterDryWetProcessor.prepareToPlay(sampleRate, samplesPerBlock);

    // Allocate dry buffer for master dry/wet mixing (stereo)
    dryBufferForMaster.setSize(2, samplesPerBlock, false, false, true);

    // Pre-allocate sidechain buffer (stereo, avoidReallocating in processBlock)
    sidechainBuffer.setSize(2, samplesPerBlock, false, false, true);

    // Pre-allocate stereo buffer for chain processing
    chainStereoBuffer.setSize(2, samplesPerBlock, false, false, true);

    // Pre-allocate 4-channel buffer for master dry/wet mixing
    dryWetMixBuffer.setSize(4, samplesPerBlock, false, false, true);

    // Prepare dry signal delay line for latency compensation
    // Max delay = 2 seconds worth of samples (generous ceiling)
    juce::dsp::ProcessSpec delaySpec;
    delaySpec.sampleRate = sampleRate;
    delaySpec.maximumBlockSize = static_cast<juce::uint32>(samplesPerBlock);
    delaySpec.numChannels = 2;
    dryDelayLine.setMaximumDelayInSamples(static_cast<int>(sampleRate * 2.0));
    dryDelayLine.prepare(delaySpec);
    dryDelayLine.setDelay(static_cast<float>(currentChainLatency));

    // Report initial latency to host (chain latency + oversampling filter latency)
    // Chain latency is in oversampled samples when OS is active — convert to original rate
    int latency = chainProcessor.getTotalLatencySamples();
    if (oversamplingEnabled && oversampling)
    {
        int osFactor = 1 << oversamplingFactor;  // 2^n
        latency = latency / osFactor;  // Convert chain latency from oversampled to original rate
        latency += static_cast<int>(oversampling->getLatencyInSamples());  // Already at original rate
    }
    setLatencySamples(latency);
    waveformCapture.setLatencyCompensation(latency);
}

void PluginChainManagerProcessor::releaseResources()
{
    chainProcessor.releaseResources();
}

bool PluginChainManagerProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
        return false;

    if (layouts.getMainInputChannelSet() != juce::AudioChannelSet::stereo())
        return false;

    // Accept stereo or disabled for the optional sidechain bus
    if (layouts.inputBuses.size() > 1)
    {
        auto scSet = layouts.getChannelSet(true, 1);
        if (!scSet.isDisabled() && scSet != juce::AudioChannelSet::stereo())
            return false;
    }

    return true;
}

void PluginChainManagerProcessor::processBlock(juce::AudioBuffer<float>& buffer,
                                                juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;

    auto totalNumInputChannels = getTotalNumInputChannels();
    auto totalNumOutputChannels = getTotalNumOutputChannels();

    for (auto i = totalNumInputChannels; i < totalNumOutputChannels; ++i)
        buffer.clear(i, 0, buffer.getNumSamples());

    // Extract sidechain buffer if DAW provides extra channels (beyond stereo main)
    bool hasSC = buffer.getNumChannels() > 2;
    if (hasSC)
    {
        if (sidechainBuffer.getNumSamples() < buffer.getNumSamples())
            sidechainBuffer.setSize(2, buffer.getNumSamples() * 2, false, false, true);
        sidechainBuffer.copyFrom(0, 0, buffer, 2, 0, buffer.getNumSamples());
        sidechainBuffer.copyFrom(1, 0, buffer, 3, 0, buffer.getNumSamples());
    }
    chainProcessor.setSidechainBuffer(hasSC ? &sidechainBuffer : nullptr);

    // Apply input gain first (operates on stereo ch0-1 only)
    gainProcessor.processInputGain(buffer);

    // Sanitise after input gain — extreme gain can push plugins into NaN/Inf
    sanitiseBuffer(buffer);

    // Meter input AFTER gain (showing what actually enters the chain)
    inputMeter.process(buffer);

    // Store dry signal (stereo only) for master dry/wet mixing (after input gain).
    // CRITICAL: Only copy 2 channels — dryDelayLine is prepared for 2 channels.
    // Copying the full 4-ch DAW buffer causes out-of-bounds writes in the delay line.
    if (dryBufferForMaster.getNumSamples() < buffer.getNumSamples())
        dryBufferForMaster.setSize(2, buffer.getNumSamples() * 2, false, false, true);
    dryBufferForMaster.copyFrom(0, 0, buffer, 0, 0, buffer.getNumSamples());
    dryBufferForMaster.copyFrom(1, 0, buffer, 1, 0, buffer.getNumSamples());

    // Delay the dry signal to match chain latency (keeps dry/wet time-aligned)
    if (currentChainLatency > 0)
    {
        juce::dsp::AudioBlock<float> dryBlock(dryBufferForMaster);
        juce::dsp::ProcessContextReplacing<float> dryContext(dryBlock);
        dryDelayLine.process(dryContext);
    }

    // Capture pre-processing waveform (after input gain, showing "what hits the plugins")
    waveformCapture.pushPreSamples(buffer);

    // Process through the plugin chain (with optional oversampling).
    // Chain processes stereo only (2-in/2-out).
    // When buffer is already stereo (no sidechain), process directly to avoid copies.
    // When sidechain is present (4+ channels), isolate stereo into chainStereoBuffer.
    // CRITICAL: Oversampling is initialized for 2 channels — passing the full 4-ch
    // DAW buffer causes out-of-bounds writes identical to the dryDelayLine crash.
    const bool needsStereoIsolation = buffer.getNumChannels() > 2;

    if (needsStereoIsolation)
    {
        if (chainStereoBuffer.getNumSamples() < buffer.getNumSamples())
            chainStereoBuffer.setSize(2, buffer.getNumSamples() * 2, false, false, true);
        chainStereoBuffer.copyFrom(0, 0, buffer, 0, 0, buffer.getNumSamples());
        chainStereoBuffer.copyFrom(1, 0, buffer, 1, 0, buffer.getNumSamples());
    }

    auto& processBuffer = needsStereoIsolation ? chainStereoBuffer : buffer;

    if (oversamplingEnabled && oversampling)
    {
        juce::dsp::AudioBlock<float> block(processBuffer);
        auto oversampledBlock = oversampling->processSamplesUp(block);

        const int osNumSamples = static_cast<int>(oversampledBlock.getNumSamples());
        float* channelPtrs[2] = { nullptr, nullptr };
        for (int ch = 0; ch < juce::jmin(static_cast<int>(oversampledBlock.getNumChannels()), 2); ++ch)
            channelPtrs[ch] = oversampledBlock.getChannelPointer(static_cast<size_t>(ch));
        juce::AudioBuffer<float> osBuffer(channelPtrs, 2, osNumSamples);

        chainProcessor.processBlock(osBuffer, midiMessages);

        oversampling->processSamplesDown(block);
    }
    else
    {
        chainProcessor.processBlock(processBuffer, midiMessages);
    }

    if (needsStereoIsolation)
    {
        buffer.copyFrom(0, 0, chainStereoBuffer, 0, 0, buffer.getNumSamples());
        buffer.copyFrom(1, 0, chainStereoBuffer, 1, 0, buffer.getNumSamples());
    }

    // Sanitise after chain — catch any NaN/Inf produced by plugins
    sanitiseBuffer(buffer);

    // Capture post-processing waveform and analyze via FFT (before output gain)
    waveformCapture.pushPostSamples(buffer);
    fftProcessor.process(buffer);

    // Master dry/wet mixing (before output gain)
    {
        // Use pre-allocated 4-channel buffer: ch0-1 = dry (latency-compensated), ch2-3 = wet
        if (dryWetMixBuffer.getNumSamples() < buffer.getNumSamples())
            dryWetMixBuffer.setSize(4, buffer.getNumSamples() * 2, false, false, true);

        // Copy latency-compensated dry signal to ch0-1
        dryWetMixBuffer.copyFrom(0, 0, dryBufferForMaster, 0, 0, buffer.getNumSamples());
        dryWetMixBuffer.copyFrom(1, 0, dryBufferForMaster, 1, 0, buffer.getNumSamples());

        // Copy wet signal (processed chain output) to ch2-3
        dryWetMixBuffer.copyFrom(2, 0, buffer, 0, 0, buffer.getNumSamples());
        dryWetMixBuffer.copyFrom(3, 0, buffer, 1, 0, buffer.getNumSamples());

        // Process mix
        juce::MidiBuffer emptyMidi;
        masterDryWetProcessor.processBlock(dryWetMixBuffer, emptyMidi);

        // Copy mixed result back to main buffer
        buffer.copyFrom(0, 0, dryWetMixBuffer, 0, 0, buffer.getNumSamples());
        buffer.copyFrom(1, 0, dryWetMixBuffer, 1, 0, buffer.getNumSamples());
    }

    // Apply output gain
    gainProcessor.processOutputGain(buffer);

    // Meter final output (after output gain, showing "what goes to DAW")
    outputMeter.process(buffer);
}

bool PluginChainManagerProcessor::hasEditor() const
{
    return true;
}

juce::AudioProcessorEditor* PluginChainManagerProcessor::createEditor()
{
    return new PluginChainManagerEditor(*this);
}

void PluginChainManagerProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    // Get chain state as binary (ChainProcessor encodes XML via copyXmlToBinary)
    juce::MemoryBlock chainData;
    chainProcessor.getStateInformation(chainData);

    // Parse the chain XML to add mirror group info and oversampling state
    if (auto xml = getXmlFromBinary(chainData.getData(), static_cast<int>(chainData.getSize())))
    {
        if (mirrorManager && mirrorManager->isMirrored())
        {
            auto* mirrorXml = xml->createNewChildElement("MirrorGroup");
            mirrorXml->setAttribute("id", mirrorManager->getMirrorGroupId());
            mirrorXml->setAttribute("wasLeader", mirrorManager->isLeader() ? 1 : 0);
        }

        // Save oversampling factor
        auto* osXml = xml->createNewChildElement("Oversampling");
        osXml->setAttribute("factor", oversamplingFactor);

        copyXmlToBinary(*xml, destData);
    }
    else
    {
        destData = chainData;
    }
}

void PluginChainManagerProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    PCLOG("setStateInformation — " + juce::String(sizeInBytes) + " bytes");

    int savedMirrorGroupId = -1;
    int savedOversamplingFactor = 0;
    bool savedWasLeader = false;

    // Check for mirror group info and oversampling state in the state XML
    if (auto xml = getXmlFromBinary(data, sizeInBytes))
    {
        if (auto* mirrorXml = xml->getChildByName("MirrorGroup"))
        {
            savedMirrorGroupId = mirrorXml->getIntAttribute("id", -1);
            savedWasLeader = mirrorXml->getBoolAttribute("wasLeader", false);
            xml->removeChildElement(mirrorXml, true);
        }

        if (auto* osXml = xml->getChildByName("Oversampling"))
        {
            savedOversamplingFactor = osXml->getIntAttribute("factor", 0);
            xml->removeChildElement(osXml, true);
        }

        // Restore oversampling before chain (so chain prepares at correct rate)
        if (savedOversamplingFactor != oversamplingFactor)
            setOversamplingFactor(savedOversamplingFactor);

        // Re-encode without the extra elements and pass to chain processor
        juce::MemoryBlock chainData;
        copyXmlToBinary(*xml, chainData);
        chainProcessor.setStateInformation(chainData.getData(), static_cast<int>(chainData.getSize()));
    }
    else
    {
        chainProcessor.setStateInformation(data, sizeInBytes);
    }

    // Attempt to reconnect mirror group from saved DAW session
    if (savedMirrorGroupId > 0 && mirrorManager)
    {
        auto* mm = mirrorManager.get();
        auto callback = [mm](int /*newGroupId*/) {
            if (mm)
                mm->rejoinMirror();
        };

        int result = instanceRegistry->requestMirrorReconnection(savedMirrorGroupId, instanceId, savedWasLeader, callback);
        if (result >= 0)
        {
            // Match found immediately — partner already loaded
            mirrorManager->rejoinMirror();
        }
    }

    // Update registry with restored chain info
    updateRegistryInfo();
}

void PluginChainManagerProcessor::setOversamplingFactor(int factor)
{
    oversamplingFactor = juce::jlimit(0, 2, factor);  // 0=off (1x), 1=2x, 2=4x
    oversamplingEnabled = (oversamplingFactor > 0);

    // Must re-prepare the entire graph with the new effective sample rate
    if (lastSampleRate > 0)
    {
        suspendProcessing(true);
        prepareToPlay(lastSampleRate, lastBlockSize);
        suspendProcessing(false);
    }
}

float PluginChainManagerProcessor::getOversamplingLatencyMs() const
{
    if (oversamplingEnabled && oversampling && lastSampleRate > 0)
        return static_cast<float>(oversampling->getLatencyInSamples() / lastSampleRate * 1000.0);
    return 0.0f;
}

void PluginChainManagerProcessor::updateTrackProperties(const TrackProperties& properties)
{
    trackName = properties.name.isNotEmpty() ? properties.name
                                              : ("Instance #" + juce::String(instanceId));

    updateRegistryInfo();
}

void PluginChainManagerProcessor::updateRegistryInfo()
{
    // Collect flat plugin names from the chain tree
    auto flatPlugins = chainProcessor.getFlatPluginList();

    InstanceInfo info;
    info.id = instanceId;
    info.trackName = trackName.isEmpty() ? ("Instance #" + juce::String(instanceId)) : trackName;
    info.pluginCount = static_cast<int>(flatPlugins.size());

    for (auto* leaf : flatPlugins)
        info.pluginNames.add(leaf->description.name);

    instanceRegistry->updateInstanceInfo(instanceId, info);
}

// This creates new instances of the plugin
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new PluginChainManagerProcessor();
}
