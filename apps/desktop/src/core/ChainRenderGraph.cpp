#include "ChainRenderGraph.h"
#include "../audio/HostedPluginProcessor.h"
#include <set>
#include <stdexcept>

namespace {
class NodeView final : public juce::AudioProcessor
{
public:
    explicit NodeView(juce::AudioProcessorGraph::Node::Ptr n) : AudioProcessor(buses(*n->getProcessor())), node(std::move(n))
    {
        hosted = dynamic_cast<HostedPluginProcessor*>(node->getProcessor());
        setLatencySamples(node->getProcessor()->getLatencySamples());
    }
    static BusesProperties buses(juce::AudioProcessor& p)
    {
        BusesProperties result;
        for (int i = 0; i < p.getBusCount(true); ++i)
        { auto* b = p.getBus(true, i); result = result.withInput(b->getName(), b->getCurrentLayout(), b->isEnabled()); }
        for (int i = 0; i < p.getBusCount(false); ++i)
        { auto* b = p.getBus(false, i); result = result.withOutput(b->getName(), b->getCurrentLayout(), b->isEnabled()); }
        return result;
    }
    void prepareToPlay(double rate, int block) override
    { if (hosted) hostedState = hosted->makeRenderState(rate, block); }
    void releaseResources() override {}
    void reset() override { node->getProcessor()->reset(); }
    void setNonRealtime(bool value) noexcept override { AudioProcessor::setNonRealtime(value); node->getProcessor()->setNonRealtime(value); }
    void audioWorkgroupContextChanged(const juce::AudioWorkgroup& group) override { node->getProcessor()->audioWorkgroupContextChanged(group); }
    void processBlock(juce::AudioBuffer<float>& b, juce::MidiBuffer& m) override
    {
        node->getProcessor()->setPlayHead(getPlayHead());
        if (hosted) hosted->processWithState(b, m, *hostedState);
        else node->getProcessor()->processBlock(b, m);
    }
    const juce::String getName() const override { return node->getProcessor()->getName(); }
    bool acceptsMidi() const override { return node->getProcessor()->acceptsMidi(); }
    bool producesMidi() const override { return node->getProcessor()->producesMidi(); }
    double getTailLengthSeconds() const override { return node->getProcessor()->getTailLengthSeconds(); }
    bool hasEditor() const override { return false; }
    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    int getNumPrograms() override { return 1; } int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {} const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}
    void getStateInformation(juce::MemoryBlock&) override {} void setStateInformation(const void*, int) override {}
private:
    juce::AudioProcessorGraph::Node::Ptr node;
    HostedPluginProcessor* hosted = nullptr;
    std::unique_ptr<HostedPluginProcessor::RenderState> hostedState;
};
}

ChainRenderGraph::ChainRenderGraph(const juce::AudioProcessorGraph& registry, double rate, int block, uint64_t version)
    : revision(version)
{
    graph.enableAllBuses(); graph.setPlayConfigDetails(2, 2, rate, block);
    std::set<juce::AudioProcessorGraph::NodeID> used;
    for (const auto& c : registry.getConnections()) { used.insert(c.source.nodeID); used.insert(c.destination.nodeID); }
    for (const auto& n : registry.getNodes())
    {
        if (used.count(n->nodeID) == 0) continue;
        std::unique_ptr<juce::AudioProcessor> view;
        if (auto* io = dynamic_cast<juce::AudioProcessorGraph::AudioGraphIOProcessor*>(n->getProcessor()))
            view = std::make_unique<juce::AudioProcessorGraph::AudioGraphIOProcessor>(io->getType());
        else view = std::make_unique<NodeView>(n);
        if (!graph.addNode(std::move(view), n->nodeID, juce::AudioProcessorGraph::UpdateKind::none))
            throw std::runtime_error("Could not create a rendering node");
    }
    for (const auto& c : registry.getConnections())
        if (!graph.addConnection(c, juce::AudioProcessorGraph::UpdateKind::none))
            throw std::runtime_error("Invalid audio or MIDI connection");
    graph.prepareToPlay(rate, block); graph.rebuild();
}
ChainRenderGraph::~ChainRenderGraph() = default;
void ChainRenderGraph::process(juce::AudioBuffer<float>& b, juce::MidiBuffer& m, juce::AudioPlayHead* p, bool offline)
{
    graph.setPlayHead(p);
    if (graph.isNonRealtime() != offline) graph.setNonRealtime(offline);
    graph.processBlock(b, m);
}
void ChainRenderGraph::reset() { graph.reset(); }
void ChainRenderGraph::audioWorkgroupContextChanged(const juce::AudioWorkgroup& group)
{ for (auto n : graph.getNodes()) n->getProcessor()->audioWorkgroupContextChanged(group); }
