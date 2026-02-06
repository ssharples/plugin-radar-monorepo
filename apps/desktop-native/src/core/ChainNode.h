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
    Parallel
};

struct PluginLeaf
{
    juce::PluginDescription description;
    juce::AudioProcessorGraph::NodeID graphNodeId;
    bool bypassed = false;
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
    std::vector<juce::AudioProcessorGraph::NodeID> delayCompNodeIds;
};

struct ChainNode
{
    ChainNodeId id = 0;
    juce::String name;
    float branchGainDb = 0.0f;
    bool solo = false;
    bool mute = false;
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
