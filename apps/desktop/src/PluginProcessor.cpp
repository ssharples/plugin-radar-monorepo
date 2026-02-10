#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "core/MirrorManager.h"

PluginChainManagerProcessor::PluginChainManagerProcessor()
    : AudioProcessor(BusesProperties()
                     .withInput("Input", juce::AudioChannelSet::stereo(), true)
                     .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      chainProcessor(pluginManager),
      presetManager(chainProcessor)
{
    // Pre-allocate proxy parameters for DAW automation (must be in constructor)
    parameterPool.createAndRegister(*this);

    // Set up latency reporting callback
    chainProcessor.onLatencyChanged = [this](int latencySamples) {
        setLatencySamples(latencySamples);
        // Sync waveform display - delay input to match output
        waveformCapture.setLatencyCompensation(latencySamples);
    };

    // Rebind proxy parameters when plugins are added/removed/moved
    chainProcessor.onParameterBindingChanged = [this]() {
        parameterPool.rebindAll(chainProcessor);
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
}

PluginChainManagerProcessor::~PluginChainManagerProcessor()
{
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
    chainProcessor.setPlayConfigDetails(
        getTotalNumInputChannels(),
        getTotalNumOutputChannels(),
        sampleRate,
        samplesPerBlock
    );
    chainProcessor.prepareToPlay(sampleRate, samplesPerBlock);
    waveformCapture.reset();

    // Initialize gain processor and meters
    gainProcessor.prepareToPlay(sampleRate, samplesPerBlock);
    inputMeter.prepareToPlay(sampleRate, samplesPerBlock);
    outputMeter.prepareToPlay(sampleRate, samplesPerBlock);
    fftProcessor.prepareToPlay(sampleRate, samplesPerBlock);

    // Report initial latency to host and sync waveform display
    int latency = chainProcessor.getTotalLatencySamples();
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

    // Apply input gain
    gainProcessor.processInputGain(buffer);

    // Capture pre-processing waveform and meter input
    waveformCapture.pushPreSamples(buffer);
    inputMeter.process(buffer);

    // Process through the plugin chain
    chainProcessor.processBlock(buffer, midiMessages);

    // Capture post-processing waveform and meter output
    waveformCapture.pushPostSamples(buffer);
    outputMeter.process(buffer);

    // FFT analysis on post-chain signal (before output gain to show chain effect)
    fftProcessor.process(buffer);

    // Apply output gain
    gainProcessor.processOutputGain(buffer);
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

    // Parse the chain XML to add mirror group info
    if (auto xml = getXmlFromBinary(chainData.getData(), static_cast<int>(chainData.getSize())))
    {
        if (mirrorManager && mirrorManager->isMirrored())
        {
            auto* mirrorXml = xml->createNewChildElement("MirrorGroup");
            mirrorXml->setAttribute("id", mirrorManager->getMirrorGroupId());
        }

        copyXmlToBinary(*xml, destData);
    }
    else
    {
        destData = chainData;
    }
}

void PluginChainManagerProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    int savedMirrorGroupId = -1;

    // Check for mirror group info in the state XML
    if (auto xml = getXmlFromBinary(data, sizeInBytes))
    {
        if (auto* mirrorXml = xml->getChildByName("MirrorGroup"))
        {
            savedMirrorGroupId = mirrorXml->getIntAttribute("id", -1);
            xml->removeChildElement(mirrorXml, true);
        }

        // Re-encode without the MirrorGroup element and pass to chain processor
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
