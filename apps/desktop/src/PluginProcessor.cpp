#include "PluginProcessor.h"
#include "core/HostRestoreAdapter.h"
#include "PluginEditor.h"
#include "core/MirrorManager.h"
#include <cmath>

namespace {
bool validWrapperSettings(const juce::XmlElement& xml)
{
    if (!xml.hasTagName("PluginChainManagerState")) return false;
    for (const auto* key : {"inputGainDb", "outputGainDb", "gainMatchTargetDb"})
    {
        const auto value = xml.getDoubleAttribute(key, 0.0);
        if (!std::isfinite(value) || value < -100.0 || value > 24.0) return false;
    }
    return true;
}
}

PluginChainManagerProcessor::PluginChainManagerProcessor(PluginManager::InstanceFactory factory)
    : AudioProcessor(BusesProperties()
                     .withInput("Input", juce::AudioChannelSet::stereo(), true)
                     .withOutput("Output", juce::AudioChannelSet::stereo(), true)
                     .withInput("Sidechain", juce::AudioChannelSet::stereo(), false)),
      pluginManager(std::move(factory)),
      chainProcessor(pluginManager),
      presetManager(chainProcessor)
{
    // Pre-allocate proxy parameters for DAW automation (must be in constructor)
    parameterPool.createAndRegister(*this);
    parameterPool.bindings().beginNewSession();
    // Macro parameters come after the proxies so existing parameter indices don't move
    macroManager.createAndRegister(*this);
    macroManager.rebind(chainProcessor);

    // Set up latency reporting callback
    chainProcessor.onLatencyChanged = [this](int latencySamples) {
        setLatencySamples(latencySamples);
        // Sync waveform display - delay input to match output
        waveformCapture.setLatencyCompensation(latencySamples);
    };

    // Rebind proxy parameters when plugins are added/removed/moved
    chainProcessor.onParameterBindingChanged = [this]() {
        parameterPool.rebindAll(chainProcessor);
        macroManager.rebind(chainProcessor);
    };
    chainProcessor.onPluginRetiring = [this](const juce::String& id)
    { parameterPool.unbindAffected(id); macroManager.unbindAffected(id); };
    chainProcessor.canRetireTargets = [this]() { return parameterPool.isQuiescent() && macroManager.isQuiescent(); };

    presetManager.captureWrapperState = [this] { return captureWrapperState(); };
    presetManager.applyWrapperSettings = [this](const juce::XmlElement& state) { return applyWrapperSettings(state, false); };

    // Register with the shared instance registry
    instanceId = instanceRegistry->registerInstance(this);

    // Set up chain changed callback for registry updates.
    // WebViewBridge::bindCallbacks() will wrap this to also emit JS events.
    chainProcessor.onChainChanged = [this]() {
        updateRegistryInfo();
    };

    // Create mirror manager (Phase 3)
    mirrorManager = std::make_unique<MirrorManager>(*this, *instanceRegistry);
}

PluginChainManagerProcessor::~PluginChainManagerProcessor()
{
    lifetime->store(false);
    chainProcessor.onChainChanged = {};
    chainProcessor.onLatencyChanged = {};
    chainProcessor.onParameterBindingChanged = {};
    chainProcessor.onPluginRetiring = {};
    chainProcessor.canRetireTargets = {};
    parameterPool.shutdown();
    macroManager.shutdown();
    // Leave mirror group before deregistering
    if (mirrorManager)
        mirrorManager->leaveMirrorGroup();

    instanceRegistry->deregisterInstance(instanceId);
}

const juce::String PluginChainManagerProcessor::getName() const
{
    return JucePlugin_Name;
}

bool PluginChainManagerProcessor::acceptsMidi() const
{
    return true;
}

bool PluginChainManagerProcessor::producesMidi() const
{
    return true;
}

bool PluginChainManagerProcessor::isMidiEffect() const
{
    return false;
}

double PluginChainManagerProcessor::getTailLengthSeconds() const
{
    return chainProcessor.getTailLengthSeconds();
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
    chainProcessor.setPlayHead(getPlayHead());
    // The chain always runs in stereo; mono tracks are converted at the edges
    chainProcessor.setPlayConfigDetails(2, 2, sampleRate, samplesPerBlock);
    monoWork.setSize(2, juce::jmax(1, samplesPerBlock), false, false, true);
    sidechainWork.setSize(2, juce::jmax(1, samplesPerBlock), false, false, true);
    chainProcessor.prepareToPlay(sampleRate, samplesPerBlock);
    waveformCapture.reset();

    // Initialize gain processor and meters
    gainProcessor.prepareToPlay(sampleRate, samplesPerBlock);
    inputMeter.prepareToPlay(sampleRate, samplesPerBlock);
    outputMeter.prepareToPlay(sampleRate, samplesPerBlock);
    fftProcessor.prepareToPlay(sampleRate, samplesPerBlock);
    fftProcessor.setAnalysisEnabled(fftSubscribed.load());

    // Report initial latency to host and sync waveform display
    int latency = chainProcessor.getTotalLatencySamples();
    setLatencySamples(latency);
    waveformCapture.setLatencyCompensation(latency);
}

void PluginChainManagerProcessor::releaseResources()
{
    chainProcessor.releaseResources();
}

void PluginChainManagerProcessor::setNonRealtime(bool nonRealtime) noexcept
{
    AudioProcessor::setNonRealtime(nonRealtime);
    chainProcessor.setNonRealtime(nonRealtime);
}

void PluginChainManagerProcessor::reset()
{
    AudioProcessor::reset();
    gainProcessor.reset();
    waveformCapture.reset();
    inputMeter.reset(); outputMeter.reset(); fftProcessor.reset();
    chainProcessor.reset();
}

void PluginChainManagerProcessor::audioWorkgroupContextChanged(const juce::AudioWorkgroup& group)
{
    chainProcessor.audioWorkgroupContextChanged(group);
}

void PluginChainManagerProcessor::setAnalysisSubscriptions(bool waveform, bool fft)
{
    waveformSubscribed.store(waveform, std::memory_order_release);
    fftSubscribed.store(fft, std::memory_order_release);
    fftProcessor.setAnalysisEnabled(fft);
}

bool PluginChainManagerProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    // Mono or stereo on each side: mono, mono-to-stereo, stereo and stereo-to-mono tracks
    const auto supported = [](const juce::AudioChannelSet& set)
    { return set == juce::AudioChannelSet::mono() || set == juce::AudioChannelSet::stereo(); };
    if (!supported(layouts.getMainInputChannelSet()) || !supported(layouts.getMainOutputChannelSet())) return false;
    // Optional sidechain input: off, mono or stereo
    for (int bus = 1; bus < layouts.inputBuses.size(); ++bus)
        if (!layouts.inputBuses[bus].isDisabled() && !supported(layouts.inputBuses[bus])) return false;
    return true;
}

void PluginChainManagerProcessor::processBlock(juce::AudioBuffer<float>& buffer,
                                                juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;

    const auto numInputs = getMainBusNumInputChannels();
    const auto numOutputs = getMainBusNumOutputChannels();
    const auto numSamples = buffer.getNumSamples();

    // Copy the sidechain out first: its channels share the buffer with the main audio
    auto sidechain = getBusCount(true) > 1 ? getBusBuffer(buffer, true, 1) : juce::AudioBuffer<float>();
    const bool hasSidechain = sidechain.getNumChannels() > 0;
    if (hasSidechain)
    {
        sidechainWork.setSize(2, numSamples, false, false, true);
        for (int c = 0; c < 2; ++c)
            sidechainWork.copyFrom(c, 0, sidechain, juce::jmin(c, sidechain.getNumChannels() - 1), 0, numSamples);
    }
    const auto keyChain = [&](int samples)
    {
        if (hasSidechain)
            chainProcessor.setSidechainInput(sidechainWork.getReadPointer(0), sidechainWork.getReadPointer(1), samples);
    };

    if (numInputs < 2 && numOutputs < 2)
    {
        // Mono track: run the stereo chain on a copy, then fold back down
        monoWork.setSize(2, numSamples, false, false, true);
        for (int c = 0; c < 2; ++c) monoWork.copyFrom(c, 0, buffer, 0, 0, numSamples);
        keyChain(numSamples);
        processStereo(monoWork, midiMessages);
        buffer.copyFrom(0, 0, monoWork, 0, 0, numSamples);
        buffer.addFrom(0, 0, monoWork, 1, 0, numSamples);
        buffer.applyGain(0, 0, numSamples, 0.5f);
        for (auto i = 1; i < buffer.getNumChannels(); ++i)
            buffer.clear(i, 0, numSamples);
        return;
    }

    if (numInputs == 1)
        buffer.copyFrom(1, 0, buffer, 0, 0, numSamples); // mono in, stereo out
    for (auto i = 2; i < buffer.getNumChannels(); ++i)
        buffer.clear(i, 0, numSamples);

    keyChain(numSamples);
    processStereo(buffer, midiMessages);

    if (numOutputs == 1)
    {
        // Stereo in, mono out
        buffer.addFrom(0, 0, buffer, 1, 0, numSamples);
        buffer.applyGain(0, 0, numSamples, 0.5f);
    }
}

void PluginChainManagerProcessor::processStereo(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    // Apply input gain
    gainProcessor.processInputGain(buffer);
    chainProcessor.setPlayHead(getPlayHead());
    const auto matching = gainMatchEnabled.load(std::memory_order_acquire);
    double inputPower = 0.0;
    if (matching) for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
        for (int i = 0; i < buffer.getNumSamples(); ++i)
            inputPower += static_cast<double>(buffer.getReadPointer(ch)[i]) * buffer.getReadPointer(ch)[i];
    const float inputRms = buffer.getNumChannels() > 0 && buffer.getNumSamples() > 0
        ? static_cast<float>(std::sqrt(inputPower / (buffer.getNumChannels() * buffer.getNumSamples()))) : 0.0f;

    // Capture pre-processing waveform and meter input
    if (waveformSubscribed.load(std::memory_order_acquire)) waveformCapture.pushPreSamples(buffer);
    inputMeter.process(buffer);

    // Process through the plugin chain
    chainProcessor.processBlock(buffer, midiMessages);
    double outputPower = 0.0;
    if (matching) for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
        for (int i = 0; i < buffer.getNumSamples(); ++i)
            outputPower += static_cast<double>(buffer.getReadPointer(ch)[i]) * buffer.getReadPointer(ch)[i];
    const float rawOutputRms = buffer.getNumChannels() > 0 && buffer.getNumSamples() > 0
        ? static_cast<float>(std::sqrt(outputPower / (buffer.getNumChannels() * buffer.getNumSamples()))) : 0.0f;
    gainProcessor.processGainMatch(buffer, inputRms, rawOutputRms);

    // Capture post-processing waveform and meter output
    if (waveformSubscribed.load(std::memory_order_acquire)) waveformCapture.pushPostSamples(buffer);

    // Apply output gain before publishing the output meter, so the reading
    // describes the actual signal sent to the host.
    gainProcessor.processOutputGain(buffer);
    outputMeter.process(buffer);
    if (fftSubscribed.load(std::memory_order_acquire)) fftProcessor.process(buffer);
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
    if (!juce::MessageManager::getInstance()->isThisTheMessageThread())
    { onHostControlThread([&] { getStateInformation(destData); }); return; }
    if (auto xml = captureWrapperState())
    {
        if (mirrorManager && mirrorManager->isMirrored())
            xml->createNewChildElement("MirrorGroup")->setAttribute("id", mirrorManager->getMirrorGroupId());
        if (editorWidth.load() > 0 && editorHeight.load() > 0)
        {
            auto* size = xml->createNewChildElement("EditorSize");
            size->setAttribute("width", editorWidth.load());
            size->setAttribute("height", editorHeight.load());
        }
        copyXmlToBinary(*xml, destData);
    }
}

std::unique_ptr<juce::XmlElement> PluginChainManagerProcessor::captureWrapperState() const
{
    auto wrapper = std::make_unique<juce::XmlElement>("PluginChainManagerState");
    wrapper->setAttribute("version", 2);
    wrapper->setAttribute("inputGainDb", gainProcessor.getInputGainDB());
    wrapper->setAttribute("outputGainDb", gainProcessor.getOutputGainDB());
    wrapper->setAttribute("gainMatchEnabled", gainMatchEnabled.load(std::memory_order_acquire));
    wrapper->setAttribute("gainMatchTargetDb", gainProcessor.getGainMatchTargetDB());
    if (!pendingRequestedState.isEmpty()) wrapper->setAttribute("pendingRequestedState", pendingRequestedState);
    if (auto chain = chainProcessor.serializeChainToXml()) wrapper->addChildElement(chain.release());
    auto bindings = parameterPool.serializeBindings();
    wrapper->addChildElement(new juce::XmlElement(bindings));
    wrapper->addChildElement(new juce::XmlElement(macroManager.toXml()));
    return wrapper;
}

bool PluginChainManagerProcessor::applyWrapperSettings(const juce::XmlElement& xml, bool restoreAssignmentsExactly)
{
    if (!validWrapperSettings(xml)) return false;
    gainProcessor.setInputGain(static_cast<float>(xml.getDoubleAttribute("inputGainDb", 0.0)));
    gainProcessor.setOutputGain(static_cast<float>(xml.getDoubleAttribute("outputGainDb", 0.0)));
    gainMatchEnabled.store(xml.getBoolAttribute("gainMatchEnabled", false), std::memory_order_release);
    gainProcessor.setGainMatchTargetDB(static_cast<float>(xml.getDoubleAttribute("gainMatchTargetDb", 0.0)));
    gainProcessor.setGainMatchEnabled(gainMatchEnabled.load());
    if (auto* bindings = xml.getChildByName("AUTOMATION_BINDINGS"))
    {
        parameterPool.restoreBindings(*bindings, restoreAssignmentsExactly ? AutomationBindingManager::RestoreMode::Replace
                                                                           : AutomationBindingManager::RestoreMode::PreserveOccupied);
        parameterPool.rebindAll(chainProcessor);
    }
    if (auto* macros = xml.getChildByName("MACROS")) { if (!macroManager.restoreFromXml(*macros)) macroManager.clear(); }
    else macroManager.clear();
    return true;
}

void PluginChainManagerProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    if (!juce::MessageManager::getInstance()->isThisTheMessageThread())
    { onHostControlThread([&] { setStateInformation(data, sizeInBytes); }); return; }
    int savedMirrorGroupId = -1;
    bool restored = false;

    // Check for mirror group info in the state XML
    if (auto xml = getXmlFromBinary(data, sizeInBytes))
    {
        if (auto* mirrorXml = xml->getChildByName("MirrorGroup"))
        {
            savedMirrorGroupId = mirrorXml->getIntAttribute("id", -1);

        }

        if (auto* size = xml->getChildByName("EditorSize"))
        {
            editorWidth.store(size->getIntAttribute("width", 0));
            editorHeight.store(size->getIntAttribute("height", 0));
        }

        if (xml->hasTagName("PluginChainManagerState"))
        {
            if (auto* chain = xml->getChildByName("ChainTree"); chain && validWrapperSettings(*xml))
            {
                auto result = chainProcessor.restoreChainFromXml(*chain, false);
                if (!result.success) pendingRequestedState = xml->toString();
                else { restored = applyWrapperSettings(*xml); pendingRequestedState = xml->getStringAttribute("pendingRequestedState"); }
            }
            else pendingRequestedState = xml->toString();
        }
        else
        {
            const auto result = chainProcessor.restoreChainFromXml(*xml, false);
            if (!result.success) pendingRequestedState = xml->toString();
            else
            {
                restored = true;
                pendingRequestedState.clear();
                parameterPool.bindings() = AutomationBindingManager();
                std::vector<juce::String> ids;
                for (auto* leaf : chainProcessor.getFlatPluginList()) ids.push_back(leaf->persistentId);
                parameterPool.bindings().migrateLegacy(ids);
                parameterPool.rebindAll(chainProcessor);
            }
        }
    }
    else
    {
        pendingRequestedState = "base64:" + juce::MemoryBlock(data, static_cast<size_t>(juce::jmax(0, sizeInBytes))).toBase64Encoding();
    }

    // Attempt to reconnect mirror group from saved DAW session
    if (restored && savedMirrorGroupId > 0 && mirrorManager)
    {
        auto* mm = mirrorManager.get();
        auto callback = [mm, token = lifetime](int /*newGroupId*/) {
            if (token->load())
                mm->rejoinMirror();
        };

        int result = instanceRegistry->requestMirrorReconnection(savedMirrorGroupId, instanceId, callback);
        if (result >= 0)
        {
            // Match found immediately — partner already loaded
            mirrorManager->rejoinMirror();
        }
    }

    // Update registry with restored chain info
    updateRegistryInfo();
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
