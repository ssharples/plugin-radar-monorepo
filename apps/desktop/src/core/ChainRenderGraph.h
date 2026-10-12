#pragma once
#include <juce_audio_processors/juce_audio_processors.h>

/** A prepared rendering snapshot. Its proxy nodes retain registry nodes, so replacing
    routing never destroys an effect still used by the previous audio callback. */
class ChainRenderGraph
{
public:
    ChainRenderGraph(const juce::AudioProcessorGraph& registry, double rate, int block, uint64_t revision);
    ~ChainRenderGraph();
    void process(juce::AudioBuffer<float>&, juce::MidiBuffer&, juce::AudioPlayHead*, bool offline);
    void reset();
    void audioWorkgroupContextChanged(const juce::AudioWorkgroup&);
    int latency() const { return graph.getLatencySamples(); }
    uint64_t revision;
private:
    juce::AudioProcessorGraph graph;
};
