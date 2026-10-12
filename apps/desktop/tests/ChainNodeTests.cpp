#include <catch2/catch_test_macros.hpp>
#include "core/ChainNode.h"

// =============================================================================
// Helpers to build synthetic trees
// =============================================================================

static std::unique_ptr<ChainNode> makePlugin(ChainNodeId id, const juce::String& name)
{
    auto node = std::make_unique<ChainNode>();
    node->id = id;
    node->name = name;
    PluginLeaf leaf;
    leaf.description.name = name;
    node->data = std::move(leaf);
    return node;
}

static std::unique_ptr<ChainNode> makeGroup(ChainNodeId id, GroupMode mode, const juce::String& name = "Group")
{
    auto node = std::make_unique<ChainNode>();
    node->id = id;
    node->name = name;
    GroupData group;
    group.mode = mode;
    node->data = std::move(group);
    return node;
}

// Build a reference tree used by many tests:
//
//   Root (Serial, id=0)
//   ├── Plugin A (id=1)
//   ├── Parallel Group (id=2)
//   │   ├── Plugin B (id=3)
//   │   └── Serial Sub-group (id=4)
//   │       ├── Plugin C (id=5)
//   │       └── Plugin D (id=6)
//   └── Plugin E (id=7)
//
static std::unique_ptr<ChainNode> buildReferenceTree()
{
    auto root = makeGroup(0, GroupMode::Serial, "Root");

    root->getGroup().children.push_back(makePlugin(1, "Plugin A"));

    auto parallel = makeGroup(2, GroupMode::Parallel, "Parallel Group");
    parallel->getGroup().children.push_back(makePlugin(3, "Plugin B"));

    auto serial = makeGroup(4, GroupMode::Serial, "Serial Sub");
    serial->getGroup().children.push_back(makePlugin(5, "Plugin C"));
    serial->getGroup().children.push_back(makePlugin(6, "Plugin D"));
    parallel->getGroup().children.push_back(std::move(serial));

    root->getGroup().children.push_back(std::move(parallel));
    root->getGroup().children.push_back(makePlugin(7, "Plugin E"));

    return root;
}

// =============================================================================
// findById
// =============================================================================

TEST_CASE("findById: returns root when searching for root id", "[chain-node][findById]")
{
    auto root = buildReferenceTree();
    auto* found = ChainNodeHelpers::findById(*root, 0);
    REQUIRE(found != nullptr);
    REQUIRE(found->id == 0);
    REQUIRE(found == root.get());
}

TEST_CASE("findById: finds direct child leaf", "[chain-node][findById]")
{
    auto root = buildReferenceTree();
    auto* found = ChainNodeHelpers::findById(*root, 1);
    REQUIRE(found != nullptr);
    REQUIRE(found->name == juce::String("Plugin A"));
    REQUIRE(found->isPlugin());
}

TEST_CASE("findById: finds nested group", "[chain-node][findById]")
{
    auto root = buildReferenceTree();
    auto* found = ChainNodeHelpers::findById(*root, 4);
    REQUIRE(found != nullptr);
    REQUIRE(found->isGroup());
    REQUIRE(found->getGroup().mode == GroupMode::Serial);
}

TEST_CASE("findById: finds deeply nested leaf", "[chain-node][findById]")
{
    auto root = buildReferenceTree();
    auto* found = ChainNodeHelpers::findById(*root, 6);
    REQUIRE(found != nullptr);
    REQUIRE(found->name == juce::String("Plugin D"));
}

TEST_CASE("findById: returns nullptr for non-existent id", "[chain-node][findById]")
{
    auto root = buildReferenceTree();
    REQUIRE(ChainNodeHelpers::findById(*root, 99) == nullptr);
    REQUIRE(ChainNodeHelpers::findById(*root, -1) == nullptr);
}

TEST_CASE("findById: const overload works", "[chain-node][findById]")
{
    auto root = buildReferenceTree();
    const ChainNode& constRoot = *root;
    const ChainNode* found = ChainNodeHelpers::findById(constRoot, 5);
    REQUIRE(found != nullptr);
    REQUIRE(found->name == juce::String("Plugin C"));
}

// =============================================================================
// findParent
// =============================================================================

TEST_CASE("findParent: returns nullptr for root id (root has no parent)", "[chain-node][findParent]")
{
    auto root = buildReferenceTree();
    REQUIRE(ChainNodeHelpers::findParent(*root, 0) == nullptr);
}

TEST_CASE("findParent: returns root for direct child", "[chain-node][findParent]")
{
    auto root = buildReferenceTree();
    auto* parent = ChainNodeHelpers::findParent(*root, 1);
    REQUIRE(parent != nullptr);
    REQUIRE(parent->id == 0);
}

TEST_CASE("findParent: returns correct parent for nested child", "[chain-node][findParent]")
{
    auto root = buildReferenceTree();
    // Plugin C (id=5) is child of Serial Sub (id=4)
    auto* parent = ChainNodeHelpers::findParent(*root, 5);
    REQUIRE(parent != nullptr);
    REQUIRE(parent->id == 4);
}

TEST_CASE("findParent: returns correct parent for group child of parallel", "[chain-node][findParent]")
{
    auto root = buildReferenceTree();
    // Serial Sub (id=4) is child of Parallel Group (id=2)
    auto* parent = ChainNodeHelpers::findParent(*root, 4);
    REQUIRE(parent != nullptr);
    REQUIRE(parent->id == 2);
}

TEST_CASE("findParent: returns nullptr for non-existent id", "[chain-node][findParent]")
{
    auto root = buildReferenceTree();
    REQUIRE(ChainNodeHelpers::findParent(*root, 99) == nullptr);
}

// =============================================================================
// collectPlugins
// =============================================================================

TEST_CASE("collectPlugins: collects all leaves in DFS order", "[chain-node][collectPlugins]")
{
    auto root = buildReferenceTree();
    std::vector<const PluginLeaf*> plugins;
    ChainNodeHelpers::collectPlugins(*root, plugins);

    REQUIRE(plugins.size() == 5);
    REQUIRE(plugins[0]->description.name == juce::String("Plugin A"));
    REQUIRE(plugins[1]->description.name == juce::String("Plugin B"));
    REQUIRE(plugins[2]->description.name == juce::String("Plugin C"));
    REQUIRE(plugins[3]->description.name == juce::String("Plugin D"));
    REQUIRE(plugins[4]->description.name == juce::String("Plugin E"));
}

TEST_CASE("collectPlugins: single plugin node returns itself", "[chain-node][collectPlugins]")
{
    auto leaf = makePlugin(10, "Solo");
    std::vector<const PluginLeaf*> plugins;
    ChainNodeHelpers::collectPlugins(*leaf, plugins);

    REQUIRE(plugins.size() == 1);
    REQUIRE(plugins[0]->description.name == juce::String("Solo"));
}

TEST_CASE("collectPlugins: empty group returns nothing", "[chain-node][collectPlugins]")
{
    auto group = makeGroup(0, GroupMode::Serial, "Empty");
    std::vector<const PluginLeaf*> plugins;
    ChainNodeHelpers::collectPlugins(*group, plugins);

    REQUIRE(plugins.empty());
}

TEST_CASE("collectPluginsMut: returns mutable pointers", "[chain-node][collectPlugins]")
{
    auto root = buildReferenceTree();
    std::vector<PluginLeaf*> plugins;
    ChainNodeHelpers::collectPluginsMut(*root, plugins);

    REQUIRE(plugins.size() == 5);
    // Verify we can mutate through the pointer
    plugins[0]->bypassed = true;
    auto* found = ChainNodeHelpers::findById(*root, 1);
    REQUIRE(found->getPlugin().bypassed == true);
}

// =============================================================================
// countPlugins
// =============================================================================

TEST_CASE("countPlugins: matches collectPlugins size for reference tree", "[chain-node][countPlugins]")
{
    auto root = buildReferenceTree();
    std::vector<const PluginLeaf*> plugins;
    ChainNodeHelpers::collectPlugins(*root, plugins);

    REQUIRE(ChainNodeHelpers::countPlugins(*root) == static_cast<int>(plugins.size()));
    REQUIRE(ChainNodeHelpers::countPlugins(*root) == 5);
}

TEST_CASE("countPlugins: single plugin returns 1", "[chain-node][countPlugins]")
{
    auto leaf = makePlugin(1, "One");
    REQUIRE(ChainNodeHelpers::countPlugins(*leaf) == 1);
}

TEST_CASE("countPlugins: empty group returns 0", "[chain-node][countPlugins]")
{
    auto group = makeGroup(0, GroupMode::Parallel, "Empty");
    REQUIRE(ChainNodeHelpers::countPlugins(*group) == 0);
}

// =============================================================================
// findChildIndex
// =============================================================================

TEST_CASE("findChildIndex: returns correct index for children", "[chain-node][findChildIndex]")
{
    auto root = buildReferenceTree();
    // Root children: Plugin A (id=1), Parallel Group (id=2), Plugin E (id=7)
    REQUIRE(ChainNodeHelpers::findChildIndex(*root, 1) == 0);
    REQUIRE(ChainNodeHelpers::findChildIndex(*root, 2) == 1);
    REQUIRE(ChainNodeHelpers::findChildIndex(*root, 7) == 2);
}

TEST_CASE("findChildIndex: returns -1 for non-child id", "[chain-node][findChildIndex]")
{
    auto root = buildReferenceTree();
    // id=5 is a grandchild, not a direct child of root
    REQUIRE(ChainNodeHelpers::findChildIndex(*root, 5) == -1);
    REQUIRE(ChainNodeHelpers::findChildIndex(*root, 99) == -1);
}

TEST_CASE("findChildIndex: returns -1 when called on a leaf", "[chain-node][findChildIndex]")
{
    auto leaf = makePlugin(1, "Leaf");
    REQUIRE(ChainNodeHelpers::findChildIndex(*leaf, 1) == -1);
}

// =============================================================================
// isDescendant
// =============================================================================

TEST_CASE("isDescendant: node is its own descendant (returns true for self)", "[chain-node][isDescendant]")
{
    auto root = buildReferenceTree();
    REQUIRE(ChainNodeHelpers::isDescendant(*root, 0) == true);
}

TEST_CASE("isDescendant: direct child is a descendant", "[chain-node][isDescendant]")
{
    auto root = buildReferenceTree();
    REQUIRE(ChainNodeHelpers::isDescendant(*root, 1) == true);
    REQUIRE(ChainNodeHelpers::isDescendant(*root, 2) == true);
}

TEST_CASE("isDescendant: deeply nested node is a descendant", "[chain-node][isDescendant]")
{
    auto root = buildReferenceTree();
    REQUIRE(ChainNodeHelpers::isDescendant(*root, 6) == true);
}

TEST_CASE("isDescendant: non-existent id returns false", "[chain-node][isDescendant]")
{
    auto root = buildReferenceTree();
    REQUIRE(ChainNodeHelpers::isDescendant(*root, 99) == false);
}

TEST_CASE("isDescendant: prevents moving group into own subtree", "[chain-node][isDescendant]")
{
    auto root = buildReferenceTree();
    // Parallel Group (id=2) contains Serial Sub (id=4) which contains Plugin C (id=5)
    // If we wanted to move id=2 into id=4, we'd check isDescendant(id=2_node, id=4)
    auto* parallel = ChainNodeHelpers::findById(*root, 2);
    REQUIRE(parallel != nullptr);

    // id=4 IS a descendant of id=2 — so moving id=2 under id=4 would be a cycle
    REQUIRE(ChainNodeHelpers::isDescendant(*parallel, 4) == true);
    REQUIRE(ChainNodeHelpers::isDescendant(*parallel, 5) == true);

    // id=1 is NOT a descendant of id=2
    REQUIRE(ChainNodeHelpers::isDescendant(*parallel, 1) == false);
    // id=7 is NOT a descendant of id=2
    REQUIRE(ChainNodeHelpers::isDescendant(*parallel, 7) == false);
}

TEST_CASE("isDescendant: leaf has no descendants besides itself", "[chain-node][isDescendant]")
{
    auto leaf = makePlugin(10, "Leaf");
    REQUIRE(ChainNodeHelpers::isDescendant(*leaf, 10) == true);
    REQUIRE(ChainNodeHelpers::isDescendant(*leaf, 0) == false);
}

// =============================================================================
// ChainNode type predicates
// =============================================================================

TEST_CASE("ChainNode: isPlugin and isGroup are mutually exclusive", "[chain-node][type]")
{
    auto leaf = makePlugin(1, "P");
    REQUIRE(leaf->isPlugin() == true);
    REQUIRE(leaf->isGroup() == false);

    auto group = makeGroup(2, GroupMode::Serial);
    REQUIRE(group->isPlugin() == false);
    REQUIRE(group->isGroup() == true);
}
