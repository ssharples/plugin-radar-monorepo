#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include "core/ChainProcessor.h"
#include "core/ChainNode.h"
#include "audio/PluginWithMeterWrapper.h"
#include "TestHelpers.h"

using Catch::Matchers::WithinAbs;

// =============================================================================
// Helper: create a ChainProcessor with its required PluginManager
// (MessageManager must be running for AudioProcessorGraph)
// =============================================================================

struct ChainProcessorFixture
{
    ChainProcessorFixture()
        : chainProcessor(pluginManager)
    {
        chainProcessor.prepareToPlay(44100.0, 512);
    }

    PluginManager pluginManager;
    ChainProcessor chainProcessor;
};

// =============================================================================
// Phase 3: ChainProcessor Tests
// =============================================================================

TEST_CASE("ChainProcessor: empty chain state", "[chain]")
{
    // JUCE MessageManager is needed for AudioProcessorGraph operations
    juce::ScopedJuceInitialiser_GUI juceInit;

    ChainProcessorFixture fix;

    // Root is a serial group with 0 children
    REQUIRE(fix.chainProcessor.getRootNode().isGroup());
    REQUIRE(fix.chainProcessor.getRootNode().getGroup().mode == GroupMode::Serial);
    REQUIRE(fix.chainProcessor.getNumSlots() == 0);
    REQUIRE(fix.chainProcessor.getFlatPluginList().empty());
}

TEST_CASE("ChainProcessor: getTotalLatencySamples empty", "[chain]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    ChainProcessorFixture fix;

    REQUIRE(fix.chainProcessor.getTotalLatencySamples() == 0);
}

TEST_CASE("ChainProcessor: getChainStateAsJson empty", "[chain]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    ChainProcessorFixture fix;

    auto json = fix.chainProcessor.getChainStateAsJson();
    REQUIRE(json.isObject());

    auto* obj = json.getDynamicObject();
    REQUIRE(obj != nullptr);

    auto nodesArr = obj->getProperty("nodes");
    REQUIRE(nodesArr.isArray());
    REQUIRE(nodesArr.getArray()->size() == 0);

    auto slotsArr = obj->getProperty("slots");
    REQUIRE(slotsArr.isArray());
    REQUIRE(slotsArr.getArray()->size() == 0);

    REQUIRE(static_cast<int>(obj->getProperty("numSlots")) == 0);
}

TEST_CASE("ChainProcessor: getStateInformation/setStateInformation roundtrip (empty)", "[chain]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    // Save empty chain state
    juce::MemoryBlock savedState;
    {
        ChainProcessorFixture fix;
        fix.chainProcessor.getStateInformation(savedState);
    }

    REQUIRE(savedState.getSize() > 0);

    // Restore into a fresh ChainProcessor
    {
        ChainProcessorFixture fix2;
        fix2.chainProcessor.setStateInformation(savedState.getData(),
                                                  static_cast<int>(savedState.getSize()));

        REQUIRE(fix2.chainProcessor.getNumSlots() == 0);
        REQUIRE(fix2.chainProcessor.getRootNode().isGroup());
    }
}

TEST_CASE("ChainProcessor: ChainNode tree helpers findById", "[chain]")
{
    // Test tree traversal helpers without needing a full ChainProcessor
    ChainNode root;
    root.id = 0;
    root.name = "Root";
    root.data = GroupData{ GroupMode::Serial };

    auto plugin1 = std::make_unique<ChainNode>();
    plugin1->id = 1;
    plugin1->name = "EQ";
    plugin1->data = PluginLeaf{};

    auto plugin2 = std::make_unique<ChainNode>();
    plugin2->id = 2;
    plugin2->name = "Comp";
    plugin2->data = PluginLeaf{};

    root.getGroup().children.push_back(std::move(plugin1));
    root.getGroup().children.push_back(std::move(plugin2));

    REQUIRE(ChainNodeHelpers::findById(root, 0) == &root);
    REQUIRE(ChainNodeHelpers::findById(root, 1) != nullptr);
    REQUIRE(ChainNodeHelpers::findById(root, 1)->name == "EQ");
    REQUIRE(ChainNodeHelpers::findById(root, 2)->name == "Comp");
    REQUIRE(ChainNodeHelpers::findById(root, 99) == nullptr);
}

TEST_CASE("ChainProcessor: countPlugins in tree", "[chain]")
{
    ChainNode root;
    root.id = 0;
    root.data = GroupData{ GroupMode::Serial };

    auto group = std::make_unique<ChainNode>();
    group->id = 1;
    group->data = GroupData{ GroupMode::Parallel };

    auto p1 = std::make_unique<ChainNode>();
    p1->id = 2;
    p1->data = PluginLeaf{};

    auto p2 = std::make_unique<ChainNode>();
    p2->id = 3;
    p2->data = PluginLeaf{};

    auto p3 = std::make_unique<ChainNode>();
    p3->id = 4;
    p3->data = PluginLeaf{};

    group->getGroup().children.push_back(std::move(p2));
    group->getGroup().children.push_back(std::move(p3));

    root.getGroup().children.push_back(std::move(p1));
    root.getGroup().children.push_back(std::move(group));

    REQUIRE(ChainNodeHelpers::countPlugins(root) == 3);
}

TEST_CASE("ChainProcessor: findParent", "[chain]")
{
    ChainNode root;
    root.id = 0;
    root.data = GroupData{ GroupMode::Serial };

    auto group = std::make_unique<ChainNode>();
    group->id = 1;
    group->data = GroupData{ GroupMode::Serial };

    auto p1 = std::make_unique<ChainNode>();
    p1->id = 2;
    p1->data = PluginLeaf{};

    group->getGroup().children.push_back(std::move(p1));
    root.getGroup().children.push_back(std::move(group));

    // Parent of node 2 should be node 1 (the group)
    auto* parent = ChainNodeHelpers::findParent(root, 2);
    REQUIRE(parent != nullptr);
    REQUIRE(parent->id == 1);

    // Parent of node 1 should be node 0 (root)
    auto* parentOfGroup = ChainNodeHelpers::findParent(root, 1);
    REQUIRE(parentOfGroup != nullptr);
    REQUIRE(parentOfGroup->id == 0);

    // Parent of root (id=0) should be nullptr
    auto* parentOfRoot = ChainNodeHelpers::findParent(root, 0);
    REQUIRE(parentOfRoot == nullptr);
}

TEST_CASE("ChainProcessor: isDescendant", "[chain]")
{
    ChainNode root;
    root.id = 0;
    root.data = GroupData{ GroupMode::Serial };

    auto group = std::make_unique<ChainNode>();
    group->id = 1;
    group->data = GroupData{ GroupMode::Serial };

    auto p1 = std::make_unique<ChainNode>();
    p1->id = 2;
    p1->data = PluginLeaf{};

    group->getGroup().children.push_back(std::move(p1));
    root.getGroup().children.push_back(std::move(group));

    REQUIRE(ChainNodeHelpers::isDescendant(root, 2) == true);
    REQUIRE(ChainNodeHelpers::isDescendant(root, 1) == true);
    REQUIRE(ChainNodeHelpers::isDescendant(root, 0) == true);
    REQUIRE(ChainNodeHelpers::isDescendant(root, 99) == false);
}

TEST_CASE("ChainProcessor: collectPlugins DFS order", "[chain]")
{
    ChainNode root;
    root.id = 0;
    root.data = GroupData{ GroupMode::Serial };

    auto p1 = std::make_unique<ChainNode>();
    p1->id = 1;
    p1->data = PluginLeaf{};
    p1->getPlugin().description.name = "First";

    auto group = std::make_unique<ChainNode>();
    group->id = 2;
    group->data = GroupData{ GroupMode::Serial };

    auto p2 = std::make_unique<ChainNode>();
    p2->id = 3;
    p2->data = PluginLeaf{};
    p2->getPlugin().description.name = "Second";

    auto p3 = std::make_unique<ChainNode>();
    p3->id = 4;
    p3->data = PluginLeaf{};
    p3->getPlugin().description.name = "Third";

    group->getGroup().children.push_back(std::move(p2));
    group->getGroup().children.push_back(std::move(p3));

    root.getGroup().children.push_back(std::move(p1));
    root.getGroup().children.push_back(std::move(group));

    std::vector<const PluginLeaf*> plugins;
    ChainNodeHelpers::collectPlugins(root, plugins);

    REQUIRE(plugins.size() == 3);
    REQUIRE(plugins[0]->description.name == "First");
    REQUIRE(plugins[1]->description.name == "Second");
    REQUIRE(plugins[2]->description.name == "Third");
}

TEST_CASE("ChainProcessor: setNodeBypassed on leaf", "[chain]")
{
    ChainNode root;
    root.id = 0;
    root.data = GroupData{ GroupMode::Serial };

    auto p1 = std::make_unique<ChainNode>();
    p1->id = 1;
    p1->data = PluginLeaf{};
    p1->getPlugin().bypassed = false;

    root.getGroup().children.push_back(std::move(p1));

    // Verify initial state
    auto* node = ChainNodeHelpers::findById(root, 1);
    REQUIRE(node != nullptr);
    REQUIRE(node->isPlugin());
    REQUIRE(node->getPlugin().bypassed == false);

    // Toggle bypass
    node->getPlugin().bypassed = true;
    REQUIRE(node->getPlugin().bypassed == true);

    // Toggle back
    node->getPlugin().bypassed = false;
    REQUIRE(node->getPlugin().bypassed == false);
}

TEST_CASE("ChainProcessor: group mode toggle", "[chain]")
{
    ChainNode root;
    root.id = 0;
    root.data = GroupData{ GroupMode::Serial };

    auto group = std::make_unique<ChainNode>();
    group->id = 1;
    group->data = GroupData{ GroupMode::Serial };

    root.getGroup().children.push_back(std::move(group));

    auto* groupNode = ChainNodeHelpers::findById(root, 1);
    REQUIRE(groupNode != nullptr);
    REQUIRE(groupNode->isGroup());
    REQUIRE(groupNode->getGroup().mode == GroupMode::Serial);

    // Toggle to parallel
    groupNode->getGroup().mode = GroupMode::Parallel;
    REQUIRE(groupNode->getGroup().mode == GroupMode::Parallel);

    // Toggle back
    groupNode->getGroup().mode = GroupMode::Serial;
    REQUIRE(groupNode->getGroup().mode == GroupMode::Serial);
}

TEST_CASE("ChainProcessor: findChildIndex", "[chain]")
{
    ChainNode parent;
    parent.id = 0;
    parent.data = GroupData{ GroupMode::Serial };

    auto c1 = std::make_unique<ChainNode>();
    c1->id = 10;
    c1->data = PluginLeaf{};

    auto c2 = std::make_unique<ChainNode>();
    c2->id = 20;
    c2->data = PluginLeaf{};

    auto c3 = std::make_unique<ChainNode>();
    c3->id = 30;
    c3->data = PluginLeaf{};

    parent.getGroup().children.push_back(std::move(c1));
    parent.getGroup().children.push_back(std::move(c2));
    parent.getGroup().children.push_back(std::move(c3));

    REQUIRE(ChainNodeHelpers::findChildIndex(parent, 10) == 0);
    REQUIRE(ChainNodeHelpers::findChildIndex(parent, 20) == 1);
    REQUIRE(ChainNodeHelpers::findChildIndex(parent, 30) == 2);
    REQUIRE(ChainNodeHelpers::findChildIndex(parent, 99) == -1);
}
