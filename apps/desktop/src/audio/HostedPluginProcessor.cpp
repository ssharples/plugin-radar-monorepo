#include "HostedPluginProcessor.h"
#include <cmath>

HostedPluginProcessor::HostedPluginProcessor(std::unique_ptr<juce::AudioPluginInstance> p)
    : AudioProcessor(BusesProperties().withInput("Input", juce::AudioChannelSet::stereo(), true)
                                      .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      instance(std::move(p))
{
    observedLatency.store(instance->getLatencySamples());
    setLatencySamples(effectiveLatency());
    if (instance->getBusCount(true) > 1 && instance->getBus(true, 1)->isEnabled())
        sidechainChannels = instance->getBus(true, 1)->getNumberOfChannels();
    instance->addListener(this);
}

HostedPluginProcessor::~HostedPluginProcessor()
{
    instance->removeListener(this);

}

bool HostedPluginProcessor::configureStereo(juce::AudioPluginInstance& plugin, juce::String& error)
{
    auto layout = plugin.getBusesLayout();
    if (layout.inputBuses.isEmpty() || layout.outputBuses.isEmpty())
    { error = "This release requires a stereo audio effect."; return false; }
    for (auto& bus : layout.inputBuses) bus = juce::AudioChannelSet::disabled();
    for (auto& bus : layout.outputBuses) bus = juce::AudioChannelSet::disabled();
    layout.inputBuses.set(0, juce::AudioChannelSet::stereo());
    layout.outputBuses.set(0, juce::AudioChannelSet::stereo());
    if (layout.inputBuses.size() > 1)
    {
        // Try to keep a sidechain input; fall back to plain stereo if the plugin refuses
        for (auto set : { juce::AudioChannelSet::stereo(), juce::AudioChannelSet::mono() })
        {
            auto withSidechain = layout;
            withSidechain.inputBuses.set(1, set);
            if (plugin.setBusesLayout(withSidechain)) return true;
        }
    }
    if (!plugin.setBusesLayout(layout))
    { error = "The effect does not support stereo input/output without auxiliary buses."; return false; }
    return true;
}

void HostedPluginProcessor::prepareToPlay(double rate, int block)
{
    if (prepared && rate == preparedRate && block == preparedBlock) return;
    preparedRate = rate; preparedBlock = juce::jmax(1, block);
    instance->setRateAndBufferSizeDetails(rate, preparedBlock);
    instance->prepareToPlay(rate, preparedBlock);
    observedLatency.store(instance->getLatencySamples());
    setLatencySamples(effectiveLatency());
    directState = makeRenderState(rate, preparedBlock);
    prepared = true;
}

void HostedPluginProcessor::releaseResources()
{
    instance->releaseResources(); prepared = false;
}

void HostedPluginProcessor::reset() { resetRequested.store(true); }
void HostedPluginProcessor::setNonRealtime(bool value) noexcept
{
    AudioProcessor::setNonRealtime(value); instance->setNonRealtime(value);
}
void HostedPluginProcessor::audioWorkgroupContextChanged(const juce::AudioWorkgroup& group)
{ instance->audioWorkgroupContextChanged(group); }

void HostedPluginProcessor::audioProcessorChanged(juce::AudioProcessor*, const ChangeDetails& details)
{
    if (details.latencyChanged) observedLatency.store(instance->getLatencySamples());
}

HostedPluginProcessor::RenderState::RenderState(int samples, double rate, int block, bool bypass, bool suspend)
    : latency(juce::jmax(0, samples)), stopped(suspend), ring(2, juce::jmax(1, latency)), dry(2, juce::jmax(1, block)),
      wide(4, juce::jmax(1, block))
{
    ring.clear(); wet.reset(rate, 0.005);
    wet.setCurrentAndTargetValue(bypass || suspend ? 0.0f : 1.0f);
}

std::unique_ptr<HostedPluginProcessor::RenderState> HostedPluginProcessor::makeRenderState(double rate, int block) const
{
    return std::make_unique<RenderState>(getLatencySamples(), rate, block, bypassed.load(), suspended.load());
}

void HostedPluginProcessor::refreshLatency()
{
    setLatencySamples(effectiveLatency());
}

void HostedPluginProcessor::processWithState(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi, RenderState& state)
{
    auto& dry = state.dry; auto& wet = state.wet;
    if (buffer.getNumSamples() == 0) return;
    if (resetRequested.exchange(false))
    { instance->reset(); state.ring.clear(); state.position = 0; }

    if (state.latency == 0 && !state.stopped && state.warmupRemaining == 0
        && !suspended.load() && !bypassed.load() && !wet.isSmoothing() && wet.getCurrentValue() == 1.0f)
    {
        runPlugin(buffer, midi, state);
        dspStopped.store(false); return;
    }

    // ChainProcessor bounds every hosted callback to the prepared block size.
    jassert(buffer.getNumSamples() <= dry.getNumSamples());
    const auto count = juce::jmin(buffer.getNumSamples(), dry.getNumSamples());
    for (int i = 0; i < count; ++i)
    {
        for (int c = 0; c < 2; ++c)
        {
            const auto input = buffer.getSample(c, i);
            if (state.latency == 0) dry.setSample(c, i, input);
            else
            {
                dry.setSample(c, i, state.ring.getSample(c, state.position));
                state.ring.setSample(c, state.position, input);
            }
        }
        state.position = (state.position + 1) % state.ring.getNumSamples();
    }

    const auto stop = suspended.load();
    if (!stop && state.stopped)
    { state.stopped = false; state.warmupRemaining = state.latency; }
    const auto process = !state.stopped;
    if (process) runPlugin(buffer, midi, state);
    wet.setTargetValue(stop || bypassed.load() || state.warmupRemaining > 0 ? 0.0f : 1.0f);
    for (int i = 0; i < count; ++i)
    {
        const auto mix = wet.getNextValue();
        for (int c = 0; c < 2; ++c)
            buffer.setSample(c, i, dry.getSample(c, i) * (1.0f - mix) + buffer.getSample(c, i) * mix);
    }
    state.warmupRemaining = juce::jmax(0, state.warmupRemaining - count);
    if (stop && !wet.isSmoothing() && wet.getCurrentValue() == 0.0f)
        state.stopped = true;
    dspStopped.store(state.stopped);
}

void HostedPluginProcessor::runPlugin(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi, RenderState& state)
{
    instance->setPlayHead(getPlayHead());
    const auto count = buffer.getNumSamples();
    if (sidechainChannels == 0 || count > state.wide.getNumSamples())
    { instance->processBlock(buffer, midi); return; }

    // Main audio in channels 0-1, the sidechain after it
    juce::AudioBuffer<float> wide(state.wide.getArrayOfWritePointers(), 2 + sidechainChannels, count);
    for (int c = 0; c < 2; ++c) wide.copyFrom(c, 0, buffer, c, 0, count);
    const auto* source = feed.get();
    const bool external = useSidechain.load() && source != nullptr && source->active()
                          && source->offset + count <= source->numSamples;
    for (int c = 0; c < sidechainChannels; ++c)
    {
        if (external) wide.copyFrom(2 + c, 0, source->channels[c] + source->offset, count);
        else wide.copyFrom(2 + c, 0, buffer, c, 0, count);
    }
    if (sidechainChannels == 1 && external)
    {
        // Mono sidechain bus: mix the stereo key down
        wide.addFrom(2, 0, source->channels[1] + source->offset, count);
        wide.applyGain(2, 0, count, 0.5f);
    }
    instance->processBlock(wide, midi);
    for (int c = 0; c < 2; ++c) buffer.copyFrom(c, 0, wide, c, 0, count);
}
