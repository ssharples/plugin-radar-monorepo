#include "PluginProcessor.h"
#include "PluginEditor.h"

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
}

PluginChainManagerProcessor::~PluginChainManagerProcessor()
{
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
    chainProcessor.getStateInformation(destData);
}

void PluginChainManagerProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    chainProcessor.setStateInformation(data, sizeInBytes);
}

// This creates new instances of the plugin
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new PluginChainManagerProcessor();
}
