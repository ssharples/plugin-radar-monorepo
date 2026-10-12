#pragma once
#include "core/PluginManager.h"
#include <map>

struct SyntheticStats
{
    int calls = 0;
    int destroyed = 0;
    int resets = 0;
    bool sawPlayhead = false;
    bool offline = false;
    double lastBpm = 0.0;
};

class SyntheticPlugin final : public juce::AudioPluginInstance
{
public:
    SyntheticPlugin(const juce::PluginDescription& d, std::shared_ptr<SyntheticStats> s)
        : AudioPluginInstance(busesFor(d.name)),
          description(d), stats(std::move(s))
    {
        gain = new juce::AudioParameterFloat("gain", "Gain", 0.0f, 4.0f, d.name == "gain2" ? 2.0f : 1.0f);
        juce::AudioProcessor::addParameter(gain);
        setLatencySamples(juce::jmax(0, d.uniqueId));
    }
    ~SyntheticPlugin() override { ++stats->destroyed; }
    void fillInPluginDescription(juce::PluginDescription& d) const override { d = description; }
    const juce::String getName() const override { return description.name; }
    void prepareToPlay(double, int) override
    {
        ring.setSize(2, juce::jmax(1, getLatencySamples()));
        reset();
    }
    void reset() override { ++stats->resets; ring.clear(); position = 0; }
    void releaseResources() override {}
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override
    {
        ++stats->calls;
        stats->sawPlayhead = getPlayHead() != nullptr;
        stats->offline = isNonRealtime();
        if (auto* playhead = getPlayHead())
            if (auto positionInfo = playhead->getPosition())
                if (auto bpm = positionInfo->getBpm()) stats->lastBpm = *bpm;
        if (description.name.startsWith("key"))
        {
            // Outputs whatever reaches its sidechain input
            auto key = getBusBuffer(buffer, true, 1);
            for (int c = 0; c < 2; ++c)
                buffer.copyFrom(c, 0, key, juce::jmin(c, key.getNumChannels() - 1), 0, buffer.getNumSamples());
            return;
        }
        if (description.name.startsWith("note"))
            midi.addEvent(juce::MidiMessage::noteOn(1, description.name.substring(4).getIntValue(), (juce::uint8)100), 0);
        for (int i = 0; i < buffer.getNumSamples(); ++i)
        {
            for (int c = 0; c < buffer.getNumChannels(); ++c)
            {
                auto sample = buffer.getSample(c, i);
                if (getLatencySamples() > 0)
                {
                    auto old = ring.getSample(c, position);
                    ring.setSample(c, position, sample);
                    sample = old;
                }
                buffer.setSample(c, i, sample * gain->get());
            }
            position = (position + 1) % ring.getNumSamples();
        }
    }
    double getTailLengthSeconds() const override { return description.name == "tail" ? 2.0 : 0.0; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return true; }
    bool hasEditor() const override { return false; }
    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}
    void getStateInformation(juce::MemoryBlock& data) override
    {
        const auto value = gain->get();
        data.replaceAll(&value, sizeof(value));
    }
    void setStateInformation(const void* data, int size) override
    {
        if (size == sizeof(float))
        {
            float value; std::memcpy(&value, data, sizeof(value));
            *gain = value;
        }
    }
    juce::AudioParameterFloat* gain = nullptr;
private:
    static BusesProperties busesFor(const juce::String& name)
    {
        auto buses = BusesProperties().withInput("in", juce::AudioChannelSet::stereo(), true)
                                      .withOutput("out", juce::AudioChannelSet::stereo(), true);
        return name.startsWith("key") ? buses.withInput("sidechain", juce::AudioChannelSet::stereo(), false) : buses;
    }
    juce::PluginDescription description;
    std::shared_ptr<SyntheticStats> stats;
    juce::AudioBuffer<float> ring;
    int position = 0;
};

inline juce::PluginDescription syntheticDescription(const juce::String& name, int latency = 0)
{
    juce::PluginDescription d;
    d.name = name; d.pluginFormatName = "Synthetic"; d.uniqueId = latency;
    d.fileOrIdentifier = name; d.version = "1"; d.numInputChannels = d.numOutputChannels = 2;
    return d;
}

struct SyntheticFactory
{
    std::map<juce::String, std::shared_ptr<SyntheticStats>> stats;
    std::unique_ptr<juce::AudioPluginInstance> operator()(const juce::PluginDescription& d, double, int, juce::String& error)
    {
        if (d.name == "missing") { error = "Synthetic missing plugin"; return {}; }
        auto& s = stats[d.name];
        if (!s) s = std::make_shared<SyntheticStats>();
        return std::make_unique<SyntheticPlugin>(d, s);
    }
};
