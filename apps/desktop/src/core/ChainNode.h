#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <variant>
#include <vector>
#include <map>
#include <memory>
#include <functional>

using ChainNodeId = int;

// Parameter data from seeded chains (applied after plugin load when no binary presetData exists)
struct PendingParameter
{
    juce::String name;           // "Band 1 Frequency"
    juce::String semantic;       // "eq_band_1_freq"
    juce::String unit;           // "hz"
    float physicalValue = 0.f;   // 1000.0 (the actual physical value)
    float normalizedValue = 0.f; // 0-1 fallback (seed's normalization)
    bool hasPhysicalValue = false;
};

enum class GroupMode
{
    Serial,
    Parallel
};

enum class MidSideMode
{
    Off = 0,       // Normal stereo L/R (default)
    MidOnly = 1,   // Process mid only, bypass side
    SideOnly = 2,  // Process side only, bypass mid
    MidSide = 3    // Full M/S: mid on L input, side on R input
};

struct PluginLeaf
{
    juce::PluginDescription description;
    juce::AudioProcessorGraph::NodeID graphNodeId;
    juce::AudioProcessorGraph::NodeID meterNodeId;       // Output meter (after plugin)
    juce::AudioProcessorGraph::NodeID inputMeterNodeId;  // Input meter (before plugin)
    bool bypassed = false;
    juce::String pendingPresetData;  // Preset data to apply after prepareToPlay (for safe import)

    // Per-plugin controls (serialized in presets)
    float inputGainDb = 0.0f;
    float outputGainDb = 0.0f;
    float dryWetMix = 1.0f;          // 0.0=dry, 1.0=wet
    int sidechainSource = 0;          // 0=none, 1=external (host SC bus)
    MidSideMode midSideMode = MidSideMode::Off;  // M/S processing mode

    // Utility graph node IDs (created during wiring, NOT serialized)
    juce::AudioProcessorGraph::NodeID inputGainNodeId;
    juce::AudioProcessorGraph::NodeID outputGainNodeId;
    juce::AudioProcessorGraph::NodeID pluginDryWetNodeId;
    juce::AudioProcessorGraph::NodeID msEncodeNodeId;
    juce::AudioProcessorGraph::NodeID msDecodeNodeId;
    juce::AudioProcessorGraph::NodeID msBypassDelayNodeId;

    // Pending parameter values from seeded chains (cleared after application)
    std::vector<PendingParameter> pendingParameters;
};

// Forward declare ChainNode so GroupData can hold unique_ptr<ChainNode>
struct ChainNode;

struct GroupData
{
    GroupMode mode = GroupMode::Serial;
    float dryWetMix = 1.0f;
    float duckAmount = 0.0f;       // 0.0 = no ducking, 1.0 = full ducking (serial and parallel groups)
    float duckReleaseMs = 200.0f;  // Envelope release time in ms (50-1000)
    std::vector<std::unique_ptr<ChainNode>> children;

    // Internal graph node IDs created during rebuildGraph (not serialized)
    juce::AudioProcessorGraph::NodeID dryWetMixNodeId;
    juce::AudioProcessorGraph::NodeID sumGainNodeId;
    juce::AudioProcessorGraph::NodeID duckingNodeId;  // DuckingProcessor for serial and parallel group ducking
    std::vector<juce::AudioProcessorGraph::NodeID> branchGainNodeIds;
};

struct ChainNode
{
    ChainNodeId id = 0;
    juce::String name;
    float branchGainDb = 0.0f;
    std::atomic<bool> solo { false };
    std::atomic<bool> mute { false };
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
