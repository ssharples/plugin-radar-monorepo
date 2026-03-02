#include "PluginWithMeterWrapper.h"
#include "../utils/ProChainLogger.h"

PluginWithMeterWrapper::PluginWithMeterWrapper(std::unique_ptr<juce::AudioPluginInstance> pluginToWrap)
    : AudioProcessor(BusesProperties()
          .withInput("Input", juce::AudioChannelSet::stereo(), true)
          .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      wrappedPlugin(std::move(pluginToWrap))
{
    if (!wrappedPlugin)
    {
        PCLOG("ERROR: PluginWithMeterWrapper created with null plugin!");
        return;
    }

    // Attempt to disable the sidechain bus (force plugin to 2-in/2-out).
    // If the plugin accepts this layout, processBlock can pass 2-channel
    // buffers directly without expanded buffer expansion.
    auto currentLayout = wrappedPlugin->getBusesLayout();
    if (currentLayout.inputBuses.size() > 1)
    {
        auto simplifiedLayout = currentLayout;
        // Try setting all extra input buses to disabled
        for (int b = 1; b < simplifiedLayout.inputBuses.size(); ++b)
            simplifiedLayout.inputBuses.getReference(b) = juce::AudioChannelSet::disabled();

        if (wrappedPlugin->setBusesLayout(simplifiedLayout))
        {
            PCLOG("PluginWithMeterWrapper: " + wrappedPlugin->getName()
                  + " accepted simplified layout (sidechain disabled)");
        }
        else
        {
            PCLOG("PluginWithMeterWrapper: " + wrappedPlugin->getName()
                  + " REJECTED simplified layout — keeping "
                  + juce::String(currentLayout.inputBuses.size()) + " input buses");
        }
    }

    // Reset all parameters to factory defaults to ensure clean initial state.
    // AU plugins can persist internal state (SC Listen mode, analyzer settings,
    // etc.) across sessions via NSUserDefaults or similar. This runs after the
    // AU is initialized/state-restored, so it overrides any persisted state.
    // Safe: if a saved preset is restored via setStateInformation later, it
    // will override these defaults.
    {
        auto& params = wrappedPlugin->getParameters();
        int resetCount = 0;
        juce::String scParams;
        for (auto* p : params)
        {
            if (p == nullptr)
                continue;
            float def = p->getDefaultValue();
            float cur = p->getValue();
            // Log any parameter whose name contains "sc", "listen", "solo",
            // or "side" so we can see what state SC Listen was in
            juce::String name = p->getName(64).toLowerCase();
            if (name.contains("sc") || name.contains("listen")
                || name.contains("solo") || name.contains("side"))
                scParams += " [" + p->getName(64) + "=" + juce::String(cur)
                          + "→" + juce::String(def) + "]";
            if (cur != def)
            {
                p->setValueNotifyingHost(def);
                ++resetCount;
            }
        }
        PCLOG("PluginWithMeterWrapper: " + wrappedPlugin->getName()
              + " reset " + juce::String(resetCount) + "/" + juce::String(params.size())
              + " params to defaults" + (scParams.isEmpty() ? "" : " SC:" + scParams));
    }

    pluginTotalInputChannels = wrappedPlugin->getTotalNumInputChannels();

    PCLOG("PluginWithMeterWrapper created for: " + wrappedPlugin->getName()
          + " (wrapperIn=2 wrapperOut=2"
          + " pluginIn=" + juce::String(pluginTotalInputChannels)
          + " pluginOut=" + juce::String(wrappedPlugin->getTotalNumOutputChannels()) + ")");

    // Register as AudioProcessorListener to receive latency change notifications
    // on the message thread immediately (faster than audio-thread polling).
    wrappedPlugin->addListener(this);
}

PluginWithMeterWrapper::~PluginWithMeterWrapper()
{
    if (wrappedPlugin)
    {
        // Remove listener first — releaseResources() can trigger state callbacks
        // that would otherwise reach us after we're partially destroyed.
        wrappedPlugin->removeListener(this);

        // Clear play head BEFORE unregistering AU callbacks. If a CoreFoundation
        // timer callback fires between now and AudioUnitUninitialize, JUCE's
        // getFromPlayHead() will safely see nullptr and return {} instead of
        // trying to dereference a stale AudioPlayHead pointer.
        wrappedPlugin->setPlayHead(nullptr);

        // Explicitly unregister CoreAudio host callbacks (via AudioUnitUninitialize).
        // Without this, AU plugins that register CFRunLoopTimer or kAudioUnit
        // HostCallbacks property handlers keep those callbacks alive after the
        // AudioUnitPluginInstance memory is freed, causing SIGBUS / SIGSEGV
        // crashes when the timer fires into the freed object (crashes 1-3).
        wrappedPlugin->releaseResources();
    }
}

void PluginWithMeterWrapper::audioProcessorChanged(juce::AudioProcessor* proc,
                                                    const ChangeDetails& details)
{
    // Called on the message thread when the wrapped plugin calls setLatencySamples()
    // or updateHostDisplay(). This is the primary (fast-path) latency change detector.
    // The audio-thread polling in processBlock() remains as a fallback for plugins
    // that change latency without calling updateHostDisplay().
    if (details.latencyChanged && wrappedPlugin)
    {
        int newLatency = wrappedPlugin->getLatencySamples();
        if (newLatency != lastReportedLatency.load(std::memory_order_relaxed))
        {
            setLatencySamples(newLatency);
            lastReportedLatency.store(newLatency, std::memory_order_relaxed);
            latencyChanged.store(true, std::memory_order_release);
            // Notify ChainProcessor directly on the message thread so a PDC
            // refresh is triggered even when the transport is stopped.
            // processBlock() is not called while stopped, so without this the
            // audio-thread relay never sets latencyRefreshNeeded and Ableton's
            // compensation stays stale until the next playback start.
            if (onLatencyDetected)
                onLatencyDetected();
            PCLOG("PluginWithMeterWrapper: latency changed via listener for "
                  + (proc ? proc->getName() : juce::String("?"))
                  + " → " + juce::String(newLatency) + " samples");
        }
    }
}

bool PluginWithMeterWrapper::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    // Wrapper is always simple stereo — the graph sees 2-in/2-out
    return layouts.getMainInputChannelSet() == juce::AudioChannelSet::stereo()
        && layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
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

        // Propagate the DAW play head to the wrapped plugin BEFORE prepareToPlay.
        // AU plugins register CoreAudio host callbacks (kAudioUnitProperty_HostCallbacks)
        // during AudioUnitInitialize (called inside prepareToPlay). If a CFRunLoopTimer
        // callback fires during that initialization — or if the AU itself calls
        // AudioUnitRender as part of its warm-up — JUCE's getFromPlayHead<bool>()
        // is invoked. Without this call, wrappedPlugin->getPlayHead() is null and
        // getFromPlayHead() returns {} safely for most JUCE versions, but certain
        // JUCE 8 internal paths dereference the optional without checking, crashing
        // with KERN_INVALID_ADDRESS at offset +0x10 (crash 3 / crash 4).
        // Setting it here ensures the AU gets a stable (or explicitly null) play head
        // from the moment its callbacks are registered.
        wrappedPlugin->setPlayHead(getPlayHead());

        // JUCE's AudioUnitPluginInstance::prepareToPlay (line 1223) already calls
        // releaseResources() internally as its FIRST action, guarded by
        // `if (prepared)`. If we call releaseResources() externally first,
        // `prepared` becomes false and JUCE's internal call is then a no-op —
        // skipping the AU bus reset and teardown sequence, which corrupts the
        // plugin's initialization state and sets prepared=false permanently.
        // JUCE also calls setRateAndBufferSizeDetails() internally at line 1287.
        // Both external calls are therefore redundant AND destructive.
        wrappedPlugin->prepareToPlay(sampleRate, maximumExpectedSamplesPerBlock);

        // Re-propagate after prepareToPlay in case the DAW updated the play head
        // during the AU initialization sequence (e.g. transport state change).
        wrappedPlugin->setPlayHead(getPlayHead());

        pluginTotalInputChannels = wrappedPlugin->getTotalNumInputChannels();
        setLatencySamples(wrappedPlugin->getLatencySamples());
        lastReportedLatency.store(wrappedPlugin->getLatencySamples(), std::memory_order_relaxed);

        // Channel mapping and buffer allocation done below after bus diagnostics

        // Log the JUCE channel mapping — critical for understanding where
        // the plugin reads/writes in the processBlock buffer.
        int numInBuses = wrappedPlugin->getBusCount(true);
        int numOutBuses = wrappedPlugin->getBusCount(false);
        juce::String busInfo = " buses(in=" + juce::String(numInBuses)
                             + " out=" + juce::String(numOutBuses) + ")";
        for (int b = 0; b < numInBuses; ++b)
        {
            auto* bus = wrappedPlugin->getBus(true, b);
            busInfo += " inBus" + juce::String(b) + "["
                     + juce::String(bus->getNumberOfChannels()) + "ch"
                     + (bus->isEnabled() ? ",on" : ",off") + "]";
            for (int c = 0; c < bus->getNumberOfChannels(); ++c)
                busInfo += " ch" + juce::String(c) + "→buf"
                         + juce::String(wrappedPlugin->getChannelIndexInProcessBlockBuffer(true, b, c));
        }
        for (int b = 0; b < numOutBuses; ++b)
        {
            auto* bus = wrappedPlugin->getBus(true, b);
            busInfo += " outBus" + juce::String(b) + "[";
            for (int c = 0; c < wrappedPlugin->getBus(false, b)->getNumberOfChannels(); ++c)
                busInfo += (c > 0 ? "," : "")
                         + juce::String(wrappedPlugin->getChannelIndexInProcessBlockBuffer(false, b, c));
            busInfo += "]";
        }
        PCLOG("prepareToPlay wrapper channel map: " + wrappedPlugin->getName() + busInfo);

        // Compute output channel indices and required buffer size
        pluginOutputL = wrappedPlugin->getChannelIndexInProcessBlockBuffer(false, 0, 0);
        pluginOutputR = wrappedPlugin->getChannelIndexInProcessBlockBuffer(false, 0, 1);

        // Find max channel index needed across all buses
        int maxCh = 0;
        for (int b = 0; b < numInBuses; ++b)
            for (int c = 0; c < wrappedPlugin->getBus(true, b)->getNumberOfChannels(); ++c)
                maxCh = std::max(maxCh, wrappedPlugin->getChannelIndexInProcessBlockBuffer(true, b, c));
        for (int b = 0; b < numOutBuses; ++b)
            for (int c = 0; c < wrappedPlugin->getBus(false, b)->getNumberOfChannels(); ++c)
                maxCh = std::max(maxCh, wrappedPlugin->getChannelIndexInProcessBlockBuffer(false, b, c));
        pluginRequiredBufferChannels = maxCh + 1;

        // Always allocate expanded buffer with the correct channel count
        expandedBuffer.setSize(pluginRequiredBufferChannels, maximumExpectedSamplesPerBlock);
        expandedBuffer.clear();
        PCLOG("prepareToPlay wrapper: buffer allocated ("
              + juce::String(pluginRequiredBufferChannels) + " ch)"
              + " outputL→buf" + juce::String(pluginOutputL)
              + " outputR→buf" + juce::String(pluginOutputR));

        PCLOG("prepareToPlay wrapper done: " + wrappedPlugin->getName()
              + " latency=" + juce::String(lastReportedLatency)
              + " wrapperIn=" + juce::String(getTotalNumInputChannels())
              + " wrapperOut=" + juce::String(getTotalNumOutputChannels()));
    }

    // Pre-allocate silence buffer for startup warm-up (avoids audio-thread heap allocation).
    // Use max of pluginRequiredBufferChannels and 2 (stereo) to cover both code paths.
    int silenceCh = juce::jmax(pluginRequiredBufferChannels, 2);
    tempSilenceBuffer.setSize(silenceCh, maximumExpectedSamplesPerBlock, false, true, false);

    // Warm-up guard — run the plugin with silence for N blocks to initialize
    // DSP filter state before the first real audio block arrives.
    startupSilenceBlocks = 8;

    inputMeter.prepareToPlay(sampleRate, maximumExpectedSamplesPerBlock);
    outputMeter.prepareToPlay(sampleRate, maximumExpectedSamplesPerBlock);
}

void PluginWithMeterWrapper::releaseResources()
{
    if (wrappedPlugin)
    {
        // Clear play head before releasing so that any AU transport callbacks
        // that fire during AudioUnitUninitialize see nullptr and return {} safely.
        wrappedPlugin->setPlayHead(nullptr);
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

    // Startup guard — after prepareToPlay, warm up the plugin's DSP state by
    // running it with zeroed input for N blocks. This initializes filter
    // state machines (e.g. Pro-Q 4's EQ filters) so the first real audio
    // block doesn't get zero output from cold DSP. Output is discarded
    // (replaced with silence) so stale graph buffer data never reaches DAW.
    if (startupSilenceBlocks > 0)
    {
        --startupSilenceBlocks;
        if (wrappedPlugin)
        {
            if (pluginRequiredBufferChannels > numChannels)
            {
                expandedBuffer.clear();
                constexpr float kTinySC = 1e-10f;
                for (int ch = numChannels; ch < pluginRequiredBufferChannels; ++ch)
                    juce::FloatVectorOperations::fill(expandedBuffer.getWritePointer(ch), kTinySC, numSamples);
                wrappedPlugin->processBlock(expandedBuffer, midiMessages);
            }
            else
            {
                // Use pre-allocated silence buffer instead of heap-allocating on audio thread.
                // Create a view with the correct channel/sample count (tempSilenceBuffer may be larger).
                const int silCh = juce::jmin(numChannels, tempSilenceBuffer.getNumChannels());
                const int silSamp = juce::jmin(numSamples, tempSilenceBuffer.getNumSamples());
                juce::AudioBuffer<float> silentView(tempSilenceBuffer.getArrayOfWritePointers(),
                                                    silCh, silSamp);
                silentView.clear();
                wrappedPlugin->processBlock(silentView, midiMessages);
            }
        }
        if (startupSilenceBlocks == 0 && wrappedPlugin)
            PCLOG("Wrapper warm-up complete: " + wrappedPlugin->getName());
        buffer.clear();  // Always output silence during warm-up
        inputMeter.process(buffer);
        outputMeter.process(buffer);
        processBlockCallCount++;
        return;
    }

    // Capture input meter (stereo)
    inputMeter.process(buffer);

    // Forward play head
    if (wrappedPlugin)
        wrappedPlugin->setPlayHead(getPlayHead());

    if (wrappedPlugin)
    {
        // Use expanded buffer with correct JUCE channel mapping.
        // JUCE may map output channels to indices beyond the input channels
        // (e.g., output at ch4-5 for a 4-in/2-out plugin). We must use
        // getChannelIndexInProcessBlockBuffer() to find the actual output location.
        if (pluginRequiredBufferChannels > numChannels)
        {
            // Copy stereo input to the main input bus channels (always ch0-1).
            // Use FloatVectorOperations::copy (raw memcpy) rather than
            // AudioBuffer::copyFrom to bypass isClear() metadata checks on the
            // graph's render sub-buffer, which can silently zero the copy.
            for (int ch = 0; ch < numChannels; ++ch)
                juce::FloatVectorOperations::copy(
                    expandedBuffer.getWritePointer(ch),
                    buffer.getReadPointer(ch), numSamples);

            // Self-sidechain: copy main input (ch0-1) to the sidechain channels.
            // This matches Logic Pro / Ableton behavior when no external sidechain
            // is connected. Dynamic EQ plugins (Pro-Q 4, Soothe 2) use the SC bus
            // for self-analysis — feeding tiny DC (1e-10) causes them to misdetect
            // input levels and apply massive compensatory gain or produce NaN.
            for (int ch = 0; ch < numChannels; ++ch)
            {
                const int scCh = numChannels + ch;
                if (scCh < pluginRequiredBufferChannels)
                    juce::FloatVectorOperations::copy(
                        expandedBuffer.getWritePointer(scCh),
                        expandedBuffer.getReadPointer(ch),
                        numSamples);
            }

            wrappedPlugin->processBlock(expandedBuffer, midiMessages);

            // Copy output from the MAPPED output channels back to graph buffer
            buffer.copyFrom(0, 0, expandedBuffer, pluginOutputL, 0, numSamples);
            buffer.copyFrom(1, 0, expandedBuffer, pluginOutputR, 0, numSamples);
        }
        else
        {
            // Fast path: standard stereo plugins (no channel remapping needed).
            // Call getWritePointer() to clear JUCE's isClear() metadata flag
            // that causes some plugins to output silence on graph render buffers.
            if (pluginOutputL == 0 && pluginOutputR == 1)
            {
                for (int ch = 0; ch < numChannels; ++ch)
                    (void)buffer.getWritePointer(ch);

                wrappedPlugin->processBlock(buffer, midiMessages);
            }
            else
            {
                // Non-standard output mapping: must route through expandedBuffer
                for (int ch = 0; ch < numChannels; ++ch)
                    juce::FloatVectorOperations::copy(
                        expandedBuffer.getWritePointer(ch),
                        buffer.getReadPointer(ch), numSamples);

                wrappedPlugin->processBlock(expandedBuffer, midiMessages);

                buffer.copyFrom(0, 0, expandedBuffer, pluginOutputL, 0, numSamples);
                buffer.copyFrom(1, 0, expandedBuffer, pluginOutputR, 0, numSamples);
            }
        }

        // Sanitize output — catch NaN/inf and clamp runaway values
        constexpr float kMaxSafe = 4.0f;
        for (int ch = 0; ch < numChannels; ++ch)
        {
            auto* data = buffer.getWritePointer(ch);
            auto range = juce::FloatVectorOperations::findMinAndMax(data, numSamples);
            if (std::isfinite(range.getStart()) && std::isfinite(range.getEnd())
                && range.getStart() >= -kMaxSafe && range.getEnd() <= kMaxSafe)
                continue;
            for (int i = 0; i < numSamples; ++i)
                data[i] = std::isfinite(data[i])
                         ? juce::jlimit(-kMaxSafe, kMaxSafe, data[i])
                         : 0.0f;
        }

        // Fallback latency polling — catches plugins that change latency without
        // calling updateHostDisplay() (i.e., don't fire AudioProcessorListener).
        // The primary detection path is audioProcessorChanged() on the message thread.
        int wrappedLatency = wrappedPlugin->getLatencySamples();
        if (wrappedLatency != lastReportedLatency.load(std::memory_order_relaxed))
        {
            setLatencySamples(wrappedLatency);
            lastReportedLatency.store(wrappedLatency, std::memory_order_relaxed);
            latencyChanged.store(true, std::memory_order_release);
        }
    }

    processBlockCallCount++;

    // Capture output meter (stereo)
    outputMeter.process(buffer);
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
        wrappedPlugin->setCurrentProgram(index);
}

const juce::String PluginWithMeterWrapper::getProgramName(int index)
{
    return wrappedPlugin ? wrappedPlugin->getProgramName(index) : juce::String();
}

void PluginWithMeterWrapper::changeProgramName(int index, const juce::String& newName)
{
    if (wrappedPlugin)
        wrappedPlugin->changeProgramName(index, newName);
}

void PluginWithMeterWrapper::getStateInformation(juce::MemoryBlock& destData)
{
    if (wrappedPlugin)
    {
        try { wrappedPlugin->getStateInformation(destData); }
        catch (...) { DBG("ERROR: plugin crashed during getStateInformation"); }
    }
}

void PluginWithMeterWrapper::setStateInformation(const void* data, int sizeInBytes)
{
    if (wrappedPlugin)
    {
        try { wrappedPlugin->setStateInformation(data, sizeInBytes); }
        catch (...) { DBG("ERROR: plugin crashed during setStateInformation"); }
    }
}

double PluginWithMeterWrapper::getTailLengthSeconds() const
{
    return wrappedPlugin ? wrappedPlugin->getTailLengthSeconds() : 0.0;
}
