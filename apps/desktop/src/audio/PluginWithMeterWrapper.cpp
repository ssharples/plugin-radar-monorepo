#include "PluginWithMeterWrapper.h"
#include "../utils/ProChainLogger.h"

PluginWithMeterWrapper::PluginWithMeterWrapper(std::unique_ptr<juce::AudioPluginInstance> pluginToWrap)
    : wrappedPlugin(std::move(pluginToWrap))
{
    // CRITICAL: Null plugin safety check (happens if plugin fails to load)
    if (!wrappedPlugin)
    {
        PCLOG("ERROR: PluginWithMeterWrapper created with null plugin!");
        setPlayConfigDetails(2, 2, 44100.0, 512);
        return;
    }

    int pluginIn = wrappedPlugin->getTotalNumInputChannels();
    int pluginOut = wrappedPlugin->getTotalNumOutputChannels();

    PCLOG("PluginWithMeterWrapper created for: " + wrappedPlugin->getName()
          + " (in=" + juce::String(pluginIn)
          + " out=" + juce::String(pluginOut) + ")");

    // ALWAYS declare 2-in/2-out to the AudioProcessorGraph.
    // Sidechain plugins (4-in/2-out) are handled internally via expandedBuffer.
    // This keeps the graph homogeneously 2-channel and avoids internal buffer
    // allocation conflicts that crash on the 2nd audio callback.
    setPlayConfigDetails(2, 2, 44100.0, 512);
    needsExpansion = (pluginIn > 2);
}

PluginWithMeterWrapper::~PluginWithMeterWrapper()
{
}

void PluginWithMeterWrapper::prepareToPlay(double sampleRate, int maximumExpectedSamplesPerBlock)
{
    if (wrappedPlugin)
    {
        PCLOG("prepareToPlay wrapper: " + wrappedPlugin->getName()
              + " SR=" + juce::String(sampleRate)
              + " block=" + juce::String(maximumExpectedSamplesPerBlock)
              + " pluginIn=" + juce::String(wrappedPlugin->getTotalNumInputChannels())
              + " pluginOut=" + juce::String(wrappedPlugin->getTotalNumOutputChannels()));

        wrappedPlugin->prepareToPlay(sampleRate, maximumExpectedSamplesPerBlock);

        setLatencySamples(wrappedPlugin->getLatencySamples());
        lastReportedLatency = wrappedPlugin->getLatencySamples();

        // Pre-allocate expanded buffer for sidechain plugins so the address
        // is stable across processBlock calls (AU plugins cache buffer pointers).
        // CRITICAL: Use avoidReallocating=true — the audio thread may still be
        // using expandedBuffer from a concurrent processBlock call (the old render
        // sequence runs to completion even after suspendProcessing is set).
        if (needsExpansion)
        {
            int reqCh = wrappedPlugin->getTotalNumInputChannels();
            expandedBuffer.setSize(reqCh, maximumExpectedSamplesPerBlock * 2, false, false, true);
        }

        PCLOG("prepareToPlay wrapper done: " + wrappedPlugin->getName()
              + " latency=" + juce::String(lastReportedLatency)
              + " needsExpansion=" + juce::String(needsExpansion ? 1 : 0));

    }

    // Prepare meters with same sample rate/block size
    inputMeter.prepareToPlay(sampleRate, maximumExpectedSamplesPerBlock);
    outputMeter.prepareToPlay(sampleRate, maximumExpectedSamplesPerBlock);
}

void PluginWithMeterWrapper::releaseResources()
{
    if (wrappedPlugin)
    {
        wrappedPlugin->releaseResources();
    }

    inputMeter.reset();
    outputMeter.reset();
}

void PluginWithMeterWrapper::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();



    if (numSamples <= 0 || numChannels <= 0)
        return;

    // Capture input meter BEFORE plugin processing (stereo only)
    if (numChannels >= 2)
    {
        juce::AudioBuffer<float> stereoView(buffer.getArrayOfWritePointers(),
                                            juce::jmin(2, numChannels),
                                            numSamples);
        inputMeter.process(stereoView);
    }

    // Process wrapped plugin
    if (wrappedPlugin)
    {
        if (needsExpansion)
        {
            // Sidechain plugin: expand 2-ch graph buffer → N-ch expandedBuffer
            int reqCh = wrappedPlugin->getTotalNumInputChannels();

            // Ensure expandedBuffer has correct size (should already from prepareToPlay,
            // but handle edge cases like block size changes)
            if (expandedBuffer.getNumChannels() < reqCh || expandedBuffer.getNumSamples() < numSamples)
                expandedBuffer.setSize(reqCh, numSamples * 2, false, false, true);

            // Copy main stereo audio to ch 0-1
            for (int ch = 0; ch < juce::jmin(2, numChannels); ++ch)
                expandedBuffer.copyFrom(ch, 0, buffer, ch, 0, numSamples);

            // Fill sidechain channels (ch 2+) from host SC bus, or mirror main audio.
            // Mirroring main audio (instead of zeroing) is standard DAW behavior —
            // plugins like Pro-L 2 interpret zero sidechain as "no signal → mute output".
            for (int ch = 2; ch < reqCh; ++ch)
            {
                int scCh = ch - 2;
                if (sidechainBuffer != nullptr && scCh < sidechainBuffer->getNumChannels())
                    expandedBuffer.copyFrom(ch, 0, *sidechainBuffer, scCh, 0, numSamples);
                else
                    expandedBuffer.copyFrom(ch, 0, expandedBuffer, ch % 2, 0, numSamples);
            }

            wrappedPlugin->processBlock(expandedBuffer, midiMessages);
            // Copy output (ch 0-1) back to graph buffer
            for (int ch = 0; ch < juce::jmin(2, numChannels); ++ch)
                buffer.copyFrom(ch, 0, expandedBuffer, ch, 0, numSamples);
        }
        else
        {
            // Standard stereo plugin: process directly on graph buffer
            wrappedPlugin->processBlock(buffer, midiMessages);
        }

        // Detect latency changes (e.g., Auto-Tune mode toggle)
        int wrappedLatency = wrappedPlugin->getLatencySamples();
        if (wrappedLatency != lastReportedLatency)
        {
            setLatencySamples(wrappedLatency);
            lastReportedLatency = wrappedLatency;
            latencyChanged.store(true, std::memory_order_release);
        }
    }

    // Capture output meter AFTER plugin processing (stereo only)
    if (numChannels >= 2)
    {
        juce::AudioBuffer<float> stereoView(buffer.getArrayOfWritePointers(),
                                            juce::jmin(2, numChannels),
                                            numSamples);
        outputMeter.process(stereoView);
    }
}

const juce::String PluginWithMeterWrapper::getName() const
{
    return wrappedPlugin ? wrappedPlugin->getName() : "PluginWithMeterWrapper";
}

bool PluginWithMeterWrapper::acceptsMidi() const
{
    return wrappedPlugin ? wrappedPlugin->acceptsMidi() : false;
}

bool PluginWithMeterWrapper::producesMidi() const
{
    return wrappedPlugin ? wrappedPlugin->producesMidi() : false;
}

juce::AudioProcessorEditor* PluginWithMeterWrapper::createEditor()
{
    // Delegate editor creation to wrapped plugin
    return wrappedPlugin ? wrappedPlugin->createEditor() : nullptr;
}

bool PluginWithMeterWrapper::hasEditor() const
{
    return wrappedPlugin ? wrappedPlugin->hasEditor() : false;
}

int PluginWithMeterWrapper::getNumPrograms()
{
    return wrappedPlugin ? wrappedPlugin->getNumPrograms() : 1;
}

int PluginWithMeterWrapper::getCurrentProgram()
{
    return wrappedPlugin ? wrappedPlugin->getCurrentProgram() : 0;
}

void PluginWithMeterWrapper::setCurrentProgram(int index)
{
    if (wrappedPlugin)
    {
        wrappedPlugin->setCurrentProgram(index);
    }
}

const juce::String PluginWithMeterWrapper::getProgramName(int index)
{
    return wrappedPlugin ? wrappedPlugin->getProgramName(index) : juce::String();
}

void PluginWithMeterWrapper::changeProgramName(int index, const juce::String& newName)
{
    if (wrappedPlugin)
    {
        wrappedPlugin->changeProgramName(index, newName);
    }
}

void PluginWithMeterWrapper::getStateInformation(juce::MemoryBlock& destData)
{
    // Store wrapped plugin's state directly (transparent pass-through)
    if (wrappedPlugin)
    {
        try
        {
            wrappedPlugin->getStateInformation(destData);
        }
        catch (const std::exception& e)
        {
            DBG("ERROR: Wrapped plugin crashed during getStateInformation: " + juce::String(e.what()));
        }
        catch (...)
        {
            DBG("ERROR: Wrapped plugin crashed during getStateInformation (unknown exception)");
        }
    }
}

void PluginWithMeterWrapper::setStateInformation(const void* data, int sizeInBytes)
{
    // Restore wrapped plugin's state directly (transparent pass-through)
    if (wrappedPlugin)
    {
        try
        {
            wrappedPlugin->setStateInformation(data, sizeInBytes);
        }
        catch (const std::exception& e)
        {
            DBG("ERROR: Wrapped plugin crashed during setStateInformation: " + juce::String(e.what()));
        }
        catch (...)
        {
            DBG("ERROR: Wrapped plugin crashed during setStateInformation (unknown exception)");
        }
    }
}

double PluginWithMeterWrapper::getTailLengthSeconds() const
{
    return wrappedPlugin ? wrappedPlugin->getTailLengthSeconds() : 0.0;
}
