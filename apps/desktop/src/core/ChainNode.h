#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <variant>
#include <vector>
#include <memory>
#include <functional>

using ChainNodeId = int;

enum class GroupMode
{
    Serial,
    Parallel,
    Crossover   // Each child is one frequency band; the bands add back up flat
};

constexpr int kMaxCrossoverBands = 5;

// "serial" / "parallel" / "crossover"
const char* groupModeName(GroupMode mode);
bool parseGroupMode(const juce::String& text, GroupMode& mode);
// Parallel and crossover groups both split the signal into summed branches
inline bool isBranchingMode(GroupMode mode) { return mode != GroupMode::Serial; }

struct PluginLeaf
{
    juce::String persistentId = juce::Uuid().toString();
    juce::PluginDescription description;
    juce::AudioProcessorGraph::NodeID graphNodeId;
    juce::AudioProcessorGraph::NodeID meterNodeId;       // Output meter (after plugin)
    juce::AudioProcessorGraph::NodeID inputMeterNodeId;  // Input meter (before plugin)
    bool bypassed = false;
    bool suspended = false;
    bool recallSafe = false;     // Chain/preset loads keep this slot as it is
    bool ignoreLatency = false;  // Leave this plugin out of delay compensation
    bool sidechain = false;      // Key the plugin from ProChain's sidechain input
    juce::String retainedState;
    juce::String loadError;
};

// Forward declare ChainNode so GroupData can hold unique_ptr<ChainNode>
struct ChainNode;

struct GroupData
{
    GroupMode mode = GroupMode::Serial;
    float dryWetMix = 1.0f;
    std::vector<std::unique_ptr<ChainNode>> children;

    // Internal graph node IDs created during rebuildGraph (not serialized)
    juce::AudioProcessorGraph::NodeID dryWetMixNodeId;
    juce::AudioProcessorGraph::NodeID sumGainNodeId;
    std::vector<juce::AudioProcessorGraph::NodeID> branchGainNodeIds;
    std::vector<juce::AudioProcessorGraph::NodeID> branchGateNodeIds;

    // Crossover only: split points in Hz, one fewer than the bands (serialized)
    std::vector<float> crossoverHz;
    std::vector<juce::AudioProcessorGraph::NodeID> bandFilterNodeIds;
};

namespace CrossoverHelpers
{
    // Default split points for a number of bands
    std::vector<float> defaultFrequencies(int numBands);
    // Makes the split points fit the band count: keeps valid ones, else uses the defaults
    void fitFrequencies(GroupData& group);
    juce::String toString(const std::vector<float>& frequencies);
    bool fromString(const juce::String& text, std::vector<float>& frequencies);
}

struct ChainNode
{
    ChainNodeId id = 0;
    juce::String name;
    float branchGainDb = 0.0f;
    bool solo = false;
    bool mute = false;
    bool polarityInverted = false;  // Flip the sign of this parallel branch
    bool collapsed = false;
    std::variant<PluginLeaf, GroupData> data;

    bool isPlugin() const { return std::holds_alternative<PluginLeaf>(data); }
    bool isGroup() const { return std::holds_alternative<GroupData>(data); }

    PluginLeaf& getPlugin() { return std::get<PluginLeaf>(data); }
    const PluginLeaf& getPlugin() const { return std::get<PluginLeaf>(data); }

    GroupData& getGroup() { return std::get<GroupData>(data); }
    const GroupData& getGroup() const { return std::get<GroupData>(data); }
};

// Tree traversal helpers
namespace ChainNodeHelpers
{
    // Find a node by ID in the tree (returns nullptr if not found)
    ChainNode* findById(ChainNode& root, ChainNodeId id);
    const ChainNode* findById(const ChainNode& root, ChainNodeId id);

    // Find the parent of a node with the given ID (returns nullptr if root or not found)
    ChainNode* findParent(ChainNode& root, ChainNodeId childId);

    // Collect all plugin leaf nodes via DFS traversal (in signal processing order)
    void collectPlugins(const ChainNode& node, std::vector<const PluginLeaf*>& result);
    void collectPluginsMut(ChainNode& node, std::vector<PluginLeaf*>& result);

    // Count total plugin leaves in the tree
    int countPlugins(const ChainNode& node);

    // Find the index of a child within its parent's children vector
    int findChildIndex(const ChainNode& parent, ChainNodeId childId);

    // Check if a node is a descendant of another
    bool isDescendant(const ChainNode& ancestor, ChainNodeId descendantId);
}
