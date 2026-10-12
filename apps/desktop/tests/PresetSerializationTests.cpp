#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include "core/SerializationUtils.h"
#include "core/ChainNode.h"

using namespace SerializationUtils;

// =============================================================================
// Helper: Build ChainNode trees for testing
// =============================================================================

static juce::PluginDescription makePluginDesc(const juce::String& name,
                                               const juce::String& manufacturer,
                                               const juce::String& format = "AudioUnit",
                                               int uid = 12345,
                                               const juce::String& fileOrId = "/path/to/plugin")
{
    juce::PluginDescription desc;
    desc.name = name;
    desc.manufacturerName = manufacturer;
    desc.pluginFormatName = format;
    desc.uniqueId = uid;
    desc.fileOrIdentifier = fileOrId;
    desc.version = "1.0";
    desc.isInstrument = false;
    desc.numInputChannels = 2;
    desc.numOutputChannels = 2;
    return desc;
}

static std::unique_ptr<ChainNode> makePluginNode(int id, const juce::PluginDescription& desc,
                                                   bool bypassed = false,
                                                   float branchGainDb = 0.0f,
                                                   bool solo = false, bool mute = false)
{
    auto node = std::make_unique<ChainNode>();
    node->id = id;
    node->name = desc.name;
    node->branchGainDb = branchGainDb;
    node->solo = solo;
    node->mute = mute;

    PluginLeaf leaf;
    leaf.description = desc;
    leaf.bypassed = bypassed;
    node->data = std::move(leaf);
    return node;
}

static std::unique_ptr<ChainNode> makeGroupNode(int id, const juce::String& name,
                                                  GroupMode mode, float dryWetMix = 1.0f,
                                                  bool collapsed = false)
{
    auto node = std::make_unique<ChainNode>();
    node->id = id;
    node->name = name;
    node->collapsed = collapsed;

    GroupData group;
    group.mode = mode;
    group.dryWetMix = dryWetMix;
    node->data = std::move(group);
    return node;
}

static ChainNode makeRootNode()
{
    ChainNode root;
    root.id = 0;
    root.name = "Root";
    root.data = GroupData{ GroupMode::Serial, 1.0f, {}, {}, {}, {} };
    return root;
}

// =============================================================================
// XML Roundtrip Tests
// =============================================================================

TEST_CASE("XML: empty chain roundtrips without error", "[serialization][xml]")
{
    auto root = makeRootNode();

    auto xml = serializeChainTreeToXml(root);
    REQUIRE(xml != nullptr);
    REQUIRE(xml->hasTagName("ChainTree"));
    REQUIRE(xml->getIntAttribute("version") == 2);
    REQUIRE(xml->getNumChildElements() == 0);

    int nextId = 1;
    auto children = restoreChainTreeFromXml(*xml, nextId);
    REQUIRE(children.empty());
}

TEST_CASE("XML: single plugin node roundtrips", "[serialization][xml]")
{
    auto root = makeRootNode();
    auto desc = makePluginDesc("Pro-Q 3", "FabFilter", "AudioUnit", 54321, "/Library/AU/ProQ3.component");
    root.getGroup().children.push_back(makePluginNode(1, desc, false, -3.5f, false, true));

    auto xml = serializeChainTreeToXml(root);
    REQUIRE(xml->getNumChildElements() == 1);

    int nextId = 1;
    auto children = restoreChainTreeFromXml(*xml, nextId);
    REQUIRE(children.size() == 1);

    auto& node = children[0];
    REQUIRE(node->id == 1);
    REQUIRE(node->isPlugin());
    REQUIRE(node->getPlugin().description.name == "Pro-Q 3");
    REQUIRE(node->getPlugin().description.manufacturerName == "FabFilter");
    REQUIRE(node->getPlugin().description.pluginFormatName == "AudioUnit");
    REQUIRE(node->getPlugin().description.uniqueId == 54321);
    REQUIRE(node->getPlugin().bypassed == false);
    REQUIRE_THAT(node->branchGainDb, Catch::Matchers::WithinAbs(-3.5f, 0.001f));
    REQUIRE(node->solo == false);
    REQUIRE(node->mute == true);
}

TEST_CASE("XML: bypassed plugin preserves bypass flag", "[serialization][xml]")
{
    auto root = makeRootNode();
    auto desc = makePluginDesc("Compressor", "Waves");
    root.getGroup().children.push_back(makePluginNode(1, desc, true));

    auto xml = serializeChainTreeToXml(root);

    int nextId = 1;
    auto children = restoreChainTreeFromXml(*xml, nextId);
    REQUIRE(children.size() == 1);
    REQUIRE(children[0]->isPlugin());
    REQUIRE(children[0]->getPlugin().bypassed == true);
}

TEST_CASE("XML: serial group with children roundtrips", "[serialization][xml]")
{
    auto root = makeRootNode();

    auto group = makeGroupNode(1, "EQ Chain", GroupMode::Serial, 0.75f, true);
    auto desc1 = makePluginDesc("Pro-Q 3", "FabFilter");
    auto desc2 = makePluginDesc("SSL Channel", "Waves");
    group->getGroup().children.push_back(makePluginNode(2, desc1));
    group->getGroup().children.push_back(makePluginNode(3, desc2));

    root.getGroup().children.push_back(std::move(group));

    auto xml = serializeChainTreeToXml(root);
    REQUIRE(xml->getNumChildElements() == 1);

    int nextId = 1;
    auto children = restoreChainTreeFromXml(*xml, nextId);
    REQUIRE(children.size() == 1);

    auto& restoredGroup = children[0];
    REQUIRE(restoredGroup->id == 1);
    REQUIRE(restoredGroup->isGroup());
    REQUIRE(restoredGroup->name == "EQ Chain");
    REQUIRE(restoredGroup->getGroup().mode == GroupMode::Serial);
    REQUIRE_THAT(restoredGroup->getGroup().dryWetMix, Catch::Matchers::WithinAbs(0.75f, 0.001f));
    REQUIRE(restoredGroup->collapsed == true);
    REQUIRE(restoredGroup->getGroup().children.size() == 2);

    REQUIRE(restoredGroup->getGroup().children[0]->isPlugin());
    REQUIRE(restoredGroup->getGroup().children[0]->getPlugin().description.name == "Pro-Q 3");
    REQUIRE(restoredGroup->getGroup().children[1]->isPlugin());
    REQUIRE(restoredGroup->getGroup().children[1]->getPlugin().description.name == "SSL Channel");
}

TEST_CASE("XML: parallel group preserves mode and branch controls", "[serialization][xml]")
{
    auto root = makeRootNode();

    auto group = makeGroupNode(1, "Parallel Comp", GroupMode::Parallel, 1.0f);
    auto desc1 = makePluginDesc("1176", "Universal Audio");
    auto desc2 = makePluginDesc("LA-2A", "Universal Audio");
    group->getGroup().children.push_back(makePluginNode(2, desc1, false, -6.0f, true, false));
    group->getGroup().children.push_back(makePluginNode(3, desc2, false, 3.0f, false, true));

    root.getGroup().children.push_back(std::move(group));

    auto xml = serializeChainTreeToXml(root);

    int nextId = 1;
    auto children = restoreChainTreeFromXml(*xml, nextId);
    auto& g = children[0];

    REQUIRE(g->getGroup().mode == GroupMode::Parallel);
    REQUIRE(g->getGroup().children.size() == 2);

    auto& branch0 = g->getGroup().children[0];
    REQUIRE_THAT(branch0->branchGainDb, Catch::Matchers::WithinAbs(-6.0f, 0.001f));
    REQUIRE(branch0->solo == true);
    REQUIRE(branch0->mute == false);

    auto& branch1 = g->getGroup().children[1];
    REQUIRE_THAT(branch1->branchGainDb, Catch::Matchers::WithinAbs(3.0f, 0.001f));
    REQUIRE(branch1->solo == false);
    REQUIRE(branch1->mute == true);
}

TEST_CASE("XML: nested groups (serial containing parallel) roundtrip", "[serialization][xml]")
{
    auto root = makeRootNode();

    // Build: Root > Serial Group > [Plugin, Parallel Group > [Plugin, Plugin]]
    auto outerGroup = makeGroupNode(1, "Outer", GroupMode::Serial, 0.5f);
    auto innerGroup = makeGroupNode(3, "Inner Parallel", GroupMode::Parallel, 1.0f);

    auto desc1 = makePluginDesc("Plugin A", "VendorA");
    auto desc2 = makePluginDesc("Plugin B", "VendorB");
    auto desc3 = makePluginDesc("Plugin C", "VendorC");

    innerGroup->getGroup().children.push_back(makePluginNode(4, desc2));
    innerGroup->getGroup().children.push_back(makePluginNode(5, desc3));

    outerGroup->getGroup().children.push_back(makePluginNode(2, desc1));
    outerGroup->getGroup().children.push_back(std::move(innerGroup));

    root.getGroup().children.push_back(std::move(outerGroup));

    auto xml = serializeChainTreeToXml(root);

    int nextId = 1;
    auto children = restoreChainTreeFromXml(*xml, nextId);
    REQUIRE(children.size() == 1);

    auto& outer = children[0];
    REQUIRE(outer->isGroup());
    REQUIRE(outer->getGroup().mode == GroupMode::Serial);
    REQUIRE(outer->getGroup().children.size() == 2);

    auto& firstChild = outer->getGroup().children[0];
    REQUIRE(firstChild->isPlugin());
    REQUIRE(firstChild->getPlugin().description.name == "Plugin A");

    auto& inner = outer->getGroup().children[1];
    REQUIRE(inner->isGroup());
    REQUIRE(inner->getGroup().mode == GroupMode::Parallel);
    REQUIRE(inner->name == "Inner Parallel");
    REQUIRE(inner->getGroup().children.size() == 2);
    REQUIRE(inner->getGroup().children[0]->getPlugin().description.name == "Plugin B");
    REQUIRE(inner->getGroup().children[1]->getPlugin().description.name == "Plugin C");
}

TEST_CASE("XML: nextNodeId stays ahead of all loaded IDs", "[serialization][xml]")
{
    auto root = makeRootNode();
    auto desc = makePluginDesc("TestPlugin", "TestVendor");
    root.getGroup().children.push_back(makePluginNode(42, desc));

    auto xml = serializeChainTreeToXml(root);

    int nextId = 1;
    auto children = restoreChainTreeFromXml(*xml, nextId);
    REQUIRE(nextId > 42);
}

TEST_CASE("XML: plugin description fields survive roundtrip", "[serialization][xml]")
{
    auto root = makeRootNode();

    juce::PluginDescription desc;
    desc.name = "Serum";
    desc.manufacturerName = "Xfer Records";
    desc.pluginFormatName = "VST3";
    desc.uniqueId = 99887766;
    desc.fileOrIdentifier = "/Library/Audio/Plug-Ins/VST3/Serum.vst3";
    desc.version = "1.35b8";
    desc.isInstrument = true;
    desc.numInputChannels = 0;
    desc.numOutputChannels = 2;

    root.getGroup().children.push_back(makePluginNode(1, desc));

    auto xml = serializeChainTreeToXml(root);

    int nextId = 1;
    auto children = restoreChainTreeFromXml(*xml, nextId);
    auto& restored = children[0]->getPlugin().description;

    REQUIRE(restored.name == "Serum");
    REQUIRE(restored.manufacturerName == "Xfer Records");
    REQUIRE(restored.pluginFormatName == "VST3");
    REQUIRE(restored.uniqueId == 99887766);
    REQUIRE(restored.fileOrIdentifier == "/Library/Audio/Plug-Ins/VST3/Serum.vst3");
}

// =============================================================================
// JSON Roundtrip Tests
// =============================================================================

TEST_CASE("JSON: single plugin roundtrips", "[serialization][json]")
{
    auto desc = makePluginDesc("Pro-Q 3", "FabFilter", "AudioUnit", 54321, "/Library/AU/ProQ3.component");
    auto node = makePluginNode(1, desc, true, -2.5f, true, false);

    auto json = nodeToJson(*node);

    int nextId = 1;
    auto restored = jsonToNode(json, nextId);

    REQUIRE(restored != nullptr);
    REQUIRE(restored->id == 1);
    REQUIRE(restored->isPlugin());
    REQUIRE(restored->getPlugin().description.name == "Pro-Q 3");
    REQUIRE(restored->getPlugin().description.manufacturerName == "FabFilter");
    REQUIRE(restored->getPlugin().description.pluginFormatName == "AudioUnit");
    REQUIRE(restored->getPlugin().description.uniqueId == 54321);
    REQUIRE(restored->getPlugin().bypassed == true);
    REQUIRE_THAT(restored->branchGainDb, Catch::Matchers::WithinAbs(-2.5f, 0.001f));
    REQUIRE(restored->solo == true);
    REQUIRE(restored->mute == false);
}

TEST_CASE("JSON: serial group with children roundtrips", "[serialization][json]")
{
    auto group = makeGroupNode(1, "FX Chain", GroupMode::Serial, 0.8f, true);
    auto desc1 = makePluginDesc("Reverb", "Valhalla");
    auto desc2 = makePluginDesc("Delay", "Soundtoys");
    group->getGroup().children.push_back(makePluginNode(2, desc1));
    group->getGroup().children.push_back(makePluginNode(3, desc2));

    auto json = nodeToJson(*group);

    int nextId = 1;
    auto restored = jsonToNode(json, nextId);

    REQUIRE(restored != nullptr);
    REQUIRE(restored->isGroup());
    REQUIRE(restored->name == "FX Chain");
    REQUIRE(restored->getGroup().mode == GroupMode::Serial);
    REQUIRE_THAT(restored->getGroup().dryWetMix, Catch::Matchers::WithinAbs(0.8f, 0.001f));
    REQUIRE(restored->collapsed == true);
    REQUIRE(restored->getGroup().children.size() == 2);
    REQUIRE(restored->getGroup().children[0]->getPlugin().description.name == "Reverb");
    REQUIRE(restored->getGroup().children[1]->getPlugin().description.name == "Delay");
}

TEST_CASE("JSON: parallel group preserves branch controls", "[serialization][json]")
{
    auto group = makeGroupNode(1, "Parallel Comp", GroupMode::Parallel);
    auto desc1 = makePluginDesc("1176", "UAD");
    auto desc2 = makePluginDesc("LA-2A", "UAD");
    group->getGroup().children.push_back(makePluginNode(2, desc1, false, -6.0f, true, false));
    group->getGroup().children.push_back(makePluginNode(3, desc2, false, 3.0f, false, true));

    auto json = nodeToJson(*group);

    int nextId = 1;
    auto restored = jsonToNode(json, nextId);

    REQUIRE(restored->getGroup().mode == GroupMode::Parallel);
    auto& b0 = restored->getGroup().children[0];
    auto& b1 = restored->getGroup().children[1];

    REQUIRE_THAT(b0->branchGainDb, Catch::Matchers::WithinAbs(-6.0f, 0.001f));
    REQUIRE(b0->solo == true);
    REQUIRE(b0->mute == false);

    REQUIRE_THAT(b1->branchGainDb, Catch::Matchers::WithinAbs(3.0f, 0.001f));
    REQUIRE(b1->solo == false);
    REQUIRE(b1->mute == true);
}

TEST_CASE("JSON: nested groups roundtrip", "[serialization][json]")
{
    auto outer = makeGroupNode(1, "Outer", GroupMode::Serial, 0.5f);
    auto inner = makeGroupNode(3, "Inner", GroupMode::Parallel);

    auto desc1 = makePluginDesc("A", "V1");
    auto desc2 = makePluginDesc("B", "V2");
    auto desc3 = makePluginDesc("C", "V3");

    inner->getGroup().children.push_back(makePluginNode(4, desc2));
    inner->getGroup().children.push_back(makePluginNode(5, desc3));

    outer->getGroup().children.push_back(makePluginNode(2, desc1));
    outer->getGroup().children.push_back(std::move(inner));

    auto json = nodeToJson(*outer);

    int nextId = 1;
    auto restored = jsonToNode(json, nextId);

    REQUIRE(restored->isGroup());
    REQUIRE(restored->getGroup().children.size() == 2);
    REQUIRE(restored->getGroup().children[0]->isPlugin());
    REQUIRE(restored->getGroup().children[1]->isGroup());
    REQUIRE(restored->getGroup().children[1]->getGroup().mode == GroupMode::Parallel);
    REQUIRE(restored->getGroup().children[1]->getGroup().children.size() == 2);
}

TEST_CASE("JSON: null/invalid input returns nullptr", "[serialization][json]")
{
    int nextId = 1;

    REQUIRE(jsonToNode(juce::var(), nextId) == nullptr);
    REQUIRE(jsonToNode(juce::var(42), nextId) == nullptr);
    REQUIRE(jsonToNode(juce::var("not an object"), nextId) == nullptr);
}

TEST_CASE("JSON: cloud format (nodeToJsonWithPresets) includes extended fields", "[serialization][json]")
{
    juce::PluginDescription desc;
    desc.name = "Serum";
    desc.manufacturerName = "Xfer Records";
    desc.pluginFormatName = "VST3";
    desc.uniqueId = 99887766;
    desc.fileOrIdentifier = "/path/to/Serum.vst3";
    desc.version = "1.35b8";
    desc.isInstrument = true;
    desc.numInputChannels = 0;
    desc.numOutputChannels = 2;

    auto node = makePluginNode(1, desc);

    auto json = nodeToJsonWithPresets(*node);

    auto* obj = json.getDynamicObject();
    REQUIRE(obj != nullptr);
    REQUIRE(obj->getProperty("type").toString() == "plugin");
    REQUIRE(obj->getProperty("name").toString() == "Serum");
    REQUIRE(obj->getProperty("manufacturer").toString() == "Xfer Records");
    REQUIRE(obj->getProperty("format").toString() == "VST3");
    REQUIRE(static_cast<int>(obj->getProperty("uid")) == 99887766);
    REQUIRE(obj->getProperty("version").toString() == "1.35b8");
    REQUIRE(static_cast<bool>(obj->getProperty("isInstrument")) == true);
    REQUIRE(static_cast<int>(obj->getProperty("numInputChannels")) == 0);
    REQUIRE(static_cast<int>(obj->getProperty("numOutputChannels")) == 2);
}

TEST_CASE("JSON: cloud format group includes children", "[serialization][json]")
{
    auto group = makeGroupNode(1, "My Group", GroupMode::Parallel, 0.6f, true);
    auto desc = makePluginDesc("Compressor", "Waves");
    group->getGroup().children.push_back(makePluginNode(2, desc));

    auto json = nodeToJsonWithPresets(*group);

    auto* obj = json.getDynamicObject();
    REQUIRE(obj != nullptr);
    REQUIRE(obj->getProperty("type").toString() == "group");
    REQUIRE(obj->getProperty("name").toString() == "My Group");
    REQUIRE(obj->getProperty("mode").toString() == "parallel");
    REQUIRE(static_cast<bool>(obj->getProperty("collapsed")) == true);

    auto childrenArr = obj->getProperty("children");
    REQUIRE(childrenArr.isArray());
    REQUIRE(childrenArr.getArray()->size() == 1);
}

// =============================================================================
// V1 vs V2 Format Detection
// =============================================================================

TEST_CASE("isV2Preset: returns true for V2 preset with ChainTree", "[serialization][version]")
{
    juce::XmlElement preset("PluginChainPreset");
    preset.setAttribute("version", "2.0");
    preset.createNewChildElement("MetaData")->setAttribute("name", "Test");
    auto* chainTree = preset.createNewChildElement("ChainTree");
    chainTree->setAttribute("version", 2);

    REQUIRE(isV2Preset(preset) == true);
}

TEST_CASE("isV2Preset: returns false for V1 preset without ChainTree", "[serialization][version]")
{
    juce::XmlElement preset("PluginChainPreset");
    preset.setAttribute("version", "1.0");
    preset.createNewChildElement("MetaData")->setAttribute("name", "Old Preset");
    preset.createNewChildElement("Chain"); // V1 uses <Chain>, not <ChainTree>

    REQUIRE(isV2Preset(preset) == false);
}

TEST_CASE("isV2Preset: returns false for empty preset", "[serialization][version]")
{
    juce::XmlElement preset("PluginChainPreset");
    REQUIRE(isV2Preset(preset) == false);
}

// =============================================================================
// Preset XML Structure Tests
// =============================================================================

TEST_CASE("Preset XML: metadata preserved in wrapper structure", "[serialization][preset]")
{
    // Simulate PresetManager::createPresetXml structure
    juce::XmlElement preset("PluginChainPreset");
    preset.setAttribute("version", "2.0");

    auto* meta = preset.createNewChildElement("MetaData");
    meta->setAttribute("name", "My Chain");
    meta->setAttribute("category", "Mixing");

    // Build a simple chain tree
    auto root = makeRootNode();
    auto desc = makePluginDesc("EQ", "FabFilter");
    root.getGroup().children.push_back(makePluginNode(1, desc));

    auto chainTree = serializeChainTreeToXml(root);
    preset.addChildElement(chainTree.release());

    // Verify structure
    REQUIRE(preset.hasTagName("PluginChainPreset"));
    REQUIRE(preset.getStringAttribute("version") == "2.0");

    auto* metaChild = preset.getChildByName("MetaData");
    REQUIRE(metaChild != nullptr);
    REQUIRE(metaChild->getStringAttribute("name") == "My Chain");
    REQUIRE(metaChild->getStringAttribute("category") == "Mixing");

    auto* treeChild = preset.getChildByName("ChainTree");
    REQUIRE(treeChild != nullptr);
    REQUIRE(treeChild->getIntAttribute("version") == 2);
    REQUIRE(treeChild->getNumChildElements() == 1);
}

TEST_CASE("Preset XML: ChainState (DAW save) has correct structure", "[serialization][preset]")
{
    // Simulate ChainProcessor::getStateInformation structure
    juce::XmlElement chainState("ChainState");
    chainState.setAttribute("version", 2);

    auto root = makeRootNode();
    auto desc1 = makePluginDesc("Plugin A", "Vendor");
    auto desc2 = makePluginDesc("Plugin B", "Vendor");
    root.getGroup().children.push_back(makePluginNode(1, desc1));
    root.getGroup().children.push_back(makePluginNode(2, desc2));

    for (const auto& child : root.getGroup().children)
        nodeToXml(*child, chainState);

    REQUIRE(chainState.hasTagName("ChainState"));
    REQUIRE(chainState.getIntAttribute("version") == 2);
    REQUIRE(chainState.getNumChildElements() == 2);

    auto* node1 = chainState.getChildElement(0);
    REQUIRE(node1->hasTagName("Node"));
    REQUIRE(node1->getStringAttribute("type") == "plugin");
}

// =============================================================================
// Edge Cases
// =============================================================================

TEST_CASE("XML: group with no children roundtrips", "[serialization][xml][edge]")
{
    auto root = makeRootNode();
    root.getGroup().children.push_back(makeGroupNode(1, "Empty Group", GroupMode::Serial));

    auto xml = serializeChainTreeToXml(root);

    int nextId = 1;
    auto children = restoreChainTreeFromXml(*xml, nextId);
    REQUIRE(children.size() == 1);
    REQUIRE(children[0]->isGroup());
    REQUIRE(children[0]->getGroup().children.empty());
}

TEST_CASE("JSON: group with no children roundtrips", "[serialization][json][edge]")
{
    auto group = makeGroupNode(1, "Empty", GroupMode::Parallel, 0.5f);

    auto json = nodeToJson(*group);

    int nextId = 1;
    auto restored = jsonToNode(json, nextId);
    REQUIRE(restored != nullptr);
    REQUIRE(restored->isGroup());
    REQUIRE(restored->getGroup().children.empty());
    REQUIRE(restored->getGroup().mode == GroupMode::Parallel);
    REQUIRE_THAT(restored->getGroup().dryWetMix, Catch::Matchers::WithinAbs(0.5f, 0.001f));
}

TEST_CASE("XML: multiple root-level children roundtrip", "[serialization][xml]")
{
    auto root = makeRootNode();
    auto desc1 = makePluginDesc("A", "V1");
    auto desc2 = makePluginDesc("B", "V2");
    auto group = makeGroupNode(3, "Group", GroupMode::Parallel);

    root.getGroup().children.push_back(makePluginNode(1, desc1));
    root.getGroup().children.push_back(makePluginNode(2, desc2));
    root.getGroup().children.push_back(std::move(group));

    auto xml = serializeChainTreeToXml(root);
    REQUIRE(xml->getNumChildElements() == 3);

    int nextId = 1;
    auto children = restoreChainTreeFromXml(*xml, nextId);
    REQUIRE(children.size() == 3);
    REQUIRE(children[0]->isPlugin());
    REQUIRE(children[1]->isPlugin());
    REQUIRE(children[2]->isGroup());
}

TEST_CASE("XML: dry/wet mix extremes (0.0 and 1.0) roundtrip", "[serialization][xml][edge]")
{
    auto root = makeRootNode();

    auto group0 = makeGroupNode(1, "Dry", GroupMode::Serial, 0.0f);
    auto group1 = makeGroupNode(2, "Wet", GroupMode::Serial, 1.0f);

    root.getGroup().children.push_back(std::move(group0));
    root.getGroup().children.push_back(std::move(group1));

    auto xml = serializeChainTreeToXml(root);

    int nextId = 1;
    auto children = restoreChainTreeFromXml(*xml, nextId);
    REQUIRE(children.size() == 2);
    REQUIRE_THAT(children[0]->getGroup().dryWetMix, Catch::Matchers::WithinAbs(0.0f, 0.001f));
    REQUIRE_THAT(children[1]->getGroup().dryWetMix, Catch::Matchers::WithinAbs(1.0f, 0.001f));
}

TEST_CASE("JSON: nextNodeId stays ahead of all loaded IDs", "[serialization][json]")
{
    auto group = makeGroupNode(100, "High ID Group", GroupMode::Serial);
    auto desc = makePluginDesc("Plugin", "Vendor");
    group->getGroup().children.push_back(makePluginNode(200, desc));

    auto json = nodeToJson(*group);

    int nextId = 1;
    auto restored = jsonToNode(json, nextId);
    REQUIRE(nextId > 200);
}

// =============================================================================
// Preset Binary Data Roundtrip Tests (E2E)
// =============================================================================
// These tests verify that plugin preset binary state (base64-encoded) survives
// a full save/load cycle through the serialization pipeline. This mirrors
// ChainProcessor::nodeToXml (which stores "state" attr) and
// ChainProcessor::nodeToJsonWithPresets (which stores "presetData" prop).
// =============================================================================

// Helper: create a MemoryBlock with a known byte pattern
static juce::MemoryBlock makeKnownPresetData(size_t size, uint8_t seed = 0xAB)
{
    juce::MemoryBlock block(size);
    auto* data = static_cast<uint8_t*>(block.getData());
    for (size_t i = 0; i < size; ++i)
        data[i] = static_cast<uint8_t>((seed + i) & 0xFF);
    return block;
}

// Helper: serialize a plugin node to XML with an injected preset state attribute.
// Mirrors ChainProcessor::nodeToXml() which adds: nodeXml->setAttribute("state", state.toBase64Encoding())
static std::unique_ptr<juce::XmlElement> nodeToXmlWithPreset(const ChainNode& node,
                                                              const juce::MemoryBlock& presetState)
{
    auto xml = std::make_unique<juce::XmlElement>("Node");
    xml->setAttribute("id", node.id);

    if (node.isPlugin())
    {
        xml->setAttribute("type", "plugin");
        xml->setAttribute("bypassed", node.getPlugin().bypassed);
        xml->setAttribute("branchGainDb", static_cast<double>(node.branchGainDb));
        xml->setAttribute("solo", node.solo);
        xml->setAttribute("mute", node.mute);

        if (auto descXml = node.getPlugin().description.createXml())
            xml->addChildElement(descXml.release());

        // Inject preset state as base64 — mirrors ChainProcessor::nodeToXml
        if (presetState.getSize() > 0)
            xml->setAttribute("state", presetState.toBase64Encoding());
    }

    return xml;
}

// Helper: serialize a plugin node to JSON with injected presetData/presetSizeBytes.
// Mirrors ChainProcessor::nodeToJsonWithPresets() which adds presetData + presetSizeBytes
static juce::var nodeToJsonWithPresetData(const ChainNode& node,
                                           const juce::MemoryBlock& presetState)
{
    auto* obj = new juce::DynamicObject();
    obj->setProperty("id", node.id);
    obj->setProperty("type", "plugin");
    obj->setProperty("name", node.getPlugin().description.name);
    obj->setProperty("manufacturer", node.getPlugin().description.manufacturerName);
    obj->setProperty("format", node.getPlugin().description.pluginFormatName);
    obj->setProperty("uid", node.getPlugin().description.uniqueId);
    obj->setProperty("fileOrIdentifier", node.getPlugin().description.fileOrIdentifier);
    obj->setProperty("version", node.getPlugin().description.version);
    obj->setProperty("bypassed", node.getPlugin().bypassed);
    obj->setProperty("isInstrument", node.getPlugin().description.isInstrument);
    obj->setProperty("numInputChannels", node.getPlugin().description.numInputChannels);
    obj->setProperty("numOutputChannels", node.getPlugin().description.numOutputChannels);
    obj->setProperty("branchGainDb", node.branchGainDb);
    obj->setProperty("solo", node.solo);
    obj->setProperty("mute", node.mute);

    if (presetState.getSize() > 0)
    {
        obj->setProperty("presetData", presetState.toBase64Encoding());
        obj->setProperty("presetSizeBytes", static_cast<int>(presetState.getSize()));
    }

    return juce::var(obj);
}

// ---- Base64 MemoryBlock roundtrip (the primitive both paths rely on) ----

TEST_CASE("Preset: MemoryBlock base64 roundtrip with known byte pattern", "[preset][base64]")
{
    auto original = makeKnownPresetData(256, 0xAB);
    auto base64 = original.toBase64Encoding();

    juce::MemoryBlock restored;
    restored.fromBase64Encoding(base64);

    REQUIRE(restored.getSize() == original.getSize());
    REQUIRE(std::memcmp(restored.getData(), original.getData(), original.getSize()) == 0);
}

TEST_CASE("Preset: base64 roundtrip with null bytes in data", "[preset][base64]")
{
    // Preset data commonly contains null bytes — ensure they survive
    juce::MemoryBlock original(64);
    auto* data = static_cast<uint8_t*>(original.getData());
    std::memset(data, 0, 64);
    data[0] = 0xFF;
    data[31] = 0x42;
    data[63] = 0xFE;

    auto base64 = original.toBase64Encoding();
    juce::MemoryBlock restored;
    restored.fromBase64Encoding(base64);

    REQUIRE(restored.getSize() == 64);
    auto* restoredData = static_cast<const uint8_t*>(restored.getData());
    REQUIRE(restoredData[0] == 0xFF);
    REQUIRE(restoredData[1] == 0x00);
    REQUIRE(restoredData[31] == 0x42);
    REQUIRE(restoredData[63] == 0xFE);
}

TEST_CASE("Preset: base64 roundtrip with empty MemoryBlock", "[preset][base64]")
{
    juce::MemoryBlock original;
    REQUIRE(original.getSize() == 0);

    auto base64 = original.toBase64Encoding();
    juce::MemoryBlock restored;
    restored.fromBase64Encoding(base64);

    REQUIRE(restored.getSize() == 0);
}

TEST_CASE("Preset: base64 roundtrip with large data (>64KB)", "[preset][base64]")
{
    auto original = makeKnownPresetData(65536 + 100, 0x7F); // 64KB + 100 bytes
    auto base64 = original.toBase64Encoding();

    juce::MemoryBlock restored;
    restored.fromBase64Encoding(base64);

    REQUIRE(restored.getSize() == original.getSize());
    REQUIRE(std::memcmp(restored.getData(), original.getData(), original.getSize()) == 0);
}

TEST_CASE("Preset: base64 roundtrip covers all byte values 0x00-0xFF", "[preset][base64]")
{
    juce::MemoryBlock original(256);
    auto* data = static_cast<uint8_t*>(original.getData());
    for (int i = 0; i < 256; ++i)
        data[i] = static_cast<uint8_t>(i);

    auto base64 = original.toBase64Encoding();
    juce::MemoryBlock restored;
    restored.fromBase64Encoding(base64);

    REQUIRE(restored.getSize() == 256);
    REQUIRE(std::memcmp(restored.getData(), original.getData(), 256) == 0);
}

TEST_CASE("Preset: base64 padding edge cases (size%3)", "[preset][base64]")
{
    // base64 padding: size % 3 == 0 (no padding), == 1 (==), == 2 (=)
    for (size_t size : { size_t(3), size_t(4), size_t(5), size_t(6), size_t(7), size_t(8) })
    {
        auto original = makeKnownPresetData(size, 0xCC);
        auto base64 = original.toBase64Encoding();

        juce::MemoryBlock restored;
        restored.fromBase64Encoding(base64);

        REQUIRE(restored.getSize() == size);
        REQUIRE(std::memcmp(restored.getData(), original.getData(), size) == 0);
    }
}

// ---- XML preset data roundtrip (DAW save/load path) ----

TEST_CASE("Preset XML: state attribute roundtrips through XML serialization", "[preset][xml]")
{
    auto desc = makePluginDesc("Pro-Q 3", "FabFilter", "AudioUnit", 54321);
    auto node = makePluginNode(1, desc);
    auto presetData = makeKnownPresetData(512, 0xDE);

    // Serialize to XML with preset state injected
    auto xml = nodeToXmlWithPreset(*node, presetData);

    // Verify the state attribute exists
    REQUIRE(xml->hasAttribute("state"));
    auto stateBase64 = xml->getStringAttribute("state");
    REQUIRE(stateBase64.isNotEmpty());

    // Decode and verify exact match
    juce::MemoryBlock decoded;
    decoded.fromBase64Encoding(stateBase64);
    REQUIRE(decoded.getSize() == presetData.getSize());
    REQUIRE(std::memcmp(decoded.getData(), presetData.getData(), presetData.getSize()) == 0);

    // Also verify structural data survives alongside preset data
    int nextId = 1;
    auto restored = SerializationUtils::xmlToNode(*xml, nextId);
    REQUIRE(restored != nullptr);
    REQUIRE(restored->id == 1);
    REQUIRE(restored->isPlugin());
    REQUIRE(restored->getPlugin().description.name == "Pro-Q 3");

    // The state attribute should still be accessible on the XML
    // (xmlToNode doesn't consume it — in production, ChainProcessor reads it separately)
    REQUIRE(xml->getStringAttribute("state") == stateBase64);
}

TEST_CASE("Preset XML: state attribute preserved through toString/parse cycle", "[preset][xml]")
{
    auto desc = makePluginDesc("SSL Channel", "Waves");
    auto node = makePluginNode(1, desc);
    auto presetData = makeKnownPresetData(1024, 0xBE);

    auto xml = nodeToXmlWithPreset(*node, presetData);

    // Serialize XML to string and parse back (full serialization roundtrip)
    auto xmlString = xml->toString();
    auto parsed = juce::XmlDocument::parse(xmlString);
    REQUIRE(parsed != nullptr);

    auto stateBase64 = parsed->getStringAttribute("state");
    REQUIRE(stateBase64.isNotEmpty());

    juce::MemoryBlock decoded;
    decoded.fromBase64Encoding(stateBase64);
    REQUIRE(decoded.getSize() == presetData.getSize());
    REQUIRE(std::memcmp(decoded.getData(), presetData.getData(), presetData.getSize()) == 0);
}

TEST_CASE("Preset XML: ChainState with preset data roundtrips through binary", "[preset][xml]")
{
    // Simulate the full DAW save/load: ChainState XML → copyXmlToBinary → getXmlFromBinary
    auto desc = makePluginDesc("Compressor", "UAD");
    auto node = makePluginNode(1, desc);
    auto presetData = makeKnownPresetData(2048, 0x55);

    // Build ChainState XML (as ChainProcessor::getStateInformation does)
    juce::XmlElement chainState("ChainState");
    chainState.setAttribute("version", 2);

    auto nodeXml = nodeToXmlWithPreset(*node, presetData);
    chainState.addChildElement(nodeXml.release());

    // Serialize to binary (as DAW save does)
    juce::MemoryBlock binaryData;
    juce::AudioProcessor::copyXmlToBinary(chainState, binaryData);

    // Deserialize from binary (as DAW load does)
    auto restored = juce::AudioProcessor::getXmlFromBinary(
        binaryData.getData(), static_cast<int>(binaryData.getSize()));
    REQUIRE(restored != nullptr);
    REQUIRE(restored->hasTagName("ChainState"));
    REQUIRE(restored->getIntAttribute("version") == 2);

    auto* nodeChild = restored->getChildElement(0);
    REQUIRE(nodeChild != nullptr);
    REQUIRE(nodeChild->hasTagName("Node"));

    auto stateBase64 = nodeChild->getStringAttribute("state");
    REQUIRE(stateBase64.isNotEmpty());

    juce::MemoryBlock decoded;
    decoded.fromBase64Encoding(stateBase64);
    REQUIRE(decoded.getSize() == presetData.getSize());
    REQUIRE(std::memcmp(decoded.getData(), presetData.getData(), presetData.getSize()) == 0);
}

TEST_CASE("Preset XML: nested group with multiple plugins preserves all preset states", "[preset][xml]")
{
    auto presetA = makeKnownPresetData(256, 0xAA);
    auto presetB = makeKnownPresetData(512, 0xBB);

    auto descA = makePluginDesc("Plugin A", "VendorA");
    auto descB = makePluginDesc("Plugin B", "VendorB");

    // Build: ChainState > Group > [PluginA(with preset), PluginB(with preset)]
    juce::XmlElement chainState("ChainState");
    chainState.setAttribute("version", 2);

    auto* groupXml = chainState.createNewChildElement("Node");
    groupXml->setAttribute("id", 1);
    groupXml->setAttribute("type", "group");
    groupXml->setAttribute("mode", "serial");
    groupXml->setAttribute("dryWet", 0.8);
    groupXml->setAttribute("name", "FX Chain");

    auto nodeA = makePluginNode(2, descA);
    auto nodeB = makePluginNode(3, descB);
    auto xmlA = nodeToXmlWithPreset(*nodeA, presetA);
    auto xmlB = nodeToXmlWithPreset(*nodeB, presetB);
    groupXml->addChildElement(xmlA.release());
    groupXml->addChildElement(xmlB.release());

    // Full binary roundtrip
    juce::MemoryBlock binaryData;
    juce::AudioProcessor::copyXmlToBinary(chainState, binaryData);

    auto restored = juce::AudioProcessor::getXmlFromBinary(
        binaryData.getData(), static_cast<int>(binaryData.getSize()));
    REQUIRE(restored != nullptr);

    auto* restoredGroup = restored->getChildElement(0);
    REQUIRE(restoredGroup->getStringAttribute("type") == "group");
    REQUIRE(restoredGroup->getNumChildElements() == 2);

    // Verify plugin A preset
    auto* childA = restoredGroup->getChildElement(0);
    juce::MemoryBlock decodedA;
    decodedA.fromBase64Encoding(childA->getStringAttribute("state"));
    REQUIRE(decodedA.getSize() == presetA.getSize());
    REQUIRE(std::memcmp(decodedA.getData(), presetA.getData(), presetA.getSize()) == 0);

    // Verify plugin B preset
    auto* childB = restoredGroup->getChildElement(1);
    juce::MemoryBlock decodedB;
    decodedB.fromBase64Encoding(childB->getStringAttribute("state"));
    REQUIRE(decodedB.getSize() == presetB.getSize());
    REQUIRE(std::memcmp(decodedB.getData(), presetB.getData(), presetB.getSize()) == 0);
}

TEST_CASE("Preset XML: empty state attribute roundtrips as empty", "[preset][xml][edge]")
{
    auto desc = makePluginDesc("TestPlugin", "TestVendor");
    auto node = makePluginNode(1, desc);
    juce::MemoryBlock emptyPreset; // empty

    auto xml = nodeToXmlWithPreset(*node, emptyPreset);

    // Empty preset should not create a state attribute
    REQUIRE_FALSE(xml->hasAttribute("state"));
}

TEST_CASE("Preset XML: large preset (>64KB) survives binary roundtrip", "[preset][xml][edge]")
{
    auto desc = makePluginDesc("Synth", "Massive");
    auto node = makePluginNode(1, desc);
    auto largePreset = makeKnownPresetData(100000, 0x77); // ~100KB

    juce::XmlElement chainState("ChainState");
    chainState.setAttribute("version", 2);
    chainState.addChildElement(nodeToXmlWithPreset(*node, largePreset).release());

    juce::MemoryBlock binaryData;
    juce::AudioProcessor::copyXmlToBinary(chainState, binaryData);

    auto restored = juce::AudioProcessor::getXmlFromBinary(
        binaryData.getData(), static_cast<int>(binaryData.getSize()));
    REQUIRE(restored != nullptr);

    auto* childNode = restored->getChildElement(0);
    juce::MemoryBlock decoded;
    decoded.fromBase64Encoding(childNode->getStringAttribute("state"));
    REQUIRE(decoded.getSize() == largePreset.getSize());
    REQUIRE(std::memcmp(decoded.getData(), largePreset.getData(), largePreset.getSize()) == 0);
}

// ---- JSON preset data roundtrip (cloud sharing path) ----

TEST_CASE("Preset JSON: presetData property roundtrips through JSON serialization", "[preset][json]")
{
    auto desc = makePluginDesc("Pro-Q 3", "FabFilter", "VST3", 54321);
    auto node = makePluginNode(1, desc);
    auto presetData = makeKnownPresetData(512, 0xDE);

    auto json = nodeToJsonWithPresetData(*node, presetData);

    // Verify presetData exists in JSON
    auto* obj = json.getDynamicObject();
    REQUIRE(obj != nullptr);
    auto presetBase64 = obj->getProperty("presetData").toString();
    REQUIRE(presetBase64.isNotEmpty());
    REQUIRE(static_cast<int>(obj->getProperty("presetSizeBytes")) == 512);

    // Decode and verify exact match
    juce::MemoryBlock decoded;
    decoded.fromBase64Encoding(presetBase64);
    REQUIRE(decoded.getSize() == presetData.getSize());
    REQUIRE(std::memcmp(decoded.getData(), presetData.getData(), presetData.getSize()) == 0);

    // Structural data also preserved alongside preset data
    REQUIRE(obj->getProperty("name").toString() == "Pro-Q 3");
    REQUIRE(obj->getProperty("manufacturer").toString() == "FabFilter");
}

TEST_CASE("Preset JSON: presetData survives JSON stringify/parse cycle", "[preset][json]")
{
    auto desc = makePluginDesc("Reverb", "Valhalla");
    auto node = makePluginNode(1, desc);
    auto presetData = makeKnownPresetData(1024, 0xAF);

    auto json = nodeToJsonWithPresetData(*node, presetData);

    // Serialize to JSON string and parse back
    auto jsonString = juce::JSON::toString(json);
    auto parsed = juce::JSON::parse(jsonString);
    REQUIRE(parsed.isObject());

    auto* obj = parsed.getDynamicObject();
    auto presetBase64 = obj->getProperty("presetData").toString();

    juce::MemoryBlock decoded;
    decoded.fromBase64Encoding(presetBase64);
    REQUIRE(decoded.getSize() == presetData.getSize());
    REQUIRE(std::memcmp(decoded.getData(), presetData.getData(), presetData.getSize()) == 0);
}

TEST_CASE("Preset JSON: cloud export format with tree structure and presets", "[preset][json]")
{
    // Simulate exportChainWithPresets format: { version: 2, nodes: [...], slots: [...] }
    auto presetA = makeKnownPresetData(256, 0xAA);
    auto presetB = makeKnownPresetData(768, 0xBB);

    auto descA = makePluginDesc("EQ", "FabFilter");
    auto descB = makePluginDesc("Compressor", "Waves");
    auto nodeA = makePluginNode(2, descA);
    auto nodeB = makePluginNode(3, descB);

    // Build the export structure
    auto* exportObj = new juce::DynamicObject();
    exportObj->setProperty("version", 2);

    juce::Array<juce::var> nodesArray;
    nodesArray.add(nodeToJsonWithPresetData(*nodeA, presetA));
    nodesArray.add(nodeToJsonWithPresetData(*nodeB, presetB));
    exportObj->setProperty("nodes", nodesArray);

    juce::var exportJson(exportObj);

    // Stringify and parse (simulating network transfer to cloud)
    auto jsonString = juce::JSON::toString(exportJson);
    auto parsed = juce::JSON::parse(jsonString);
    REQUIRE(parsed.isObject());

    auto* parsedObj = parsed.getDynamicObject();
    auto parsedNodes = parsedObj->getProperty("nodes");
    REQUIRE(parsedNodes.isArray());
    REQUIRE(parsedNodes.getArray()->size() == 2);

    // Verify preset A
    auto* nodeObjA = (*parsedNodes.getArray())[0].getDynamicObject();
    juce::MemoryBlock decodedA;
    decodedA.fromBase64Encoding(nodeObjA->getProperty("presetData").toString());
    REQUIRE(decodedA.getSize() == presetA.getSize());
    REQUIRE(std::memcmp(decodedA.getData(), presetA.getData(), presetA.getSize()) == 0);

    // Verify preset B
    auto* nodeObjB = (*parsedNodes.getArray())[1].getDynamicObject();
    juce::MemoryBlock decodedB;
    decodedB.fromBase64Encoding(nodeObjB->getProperty("presetData").toString());
    REQUIRE(decodedB.getSize() == presetB.getSize());
    REQUIRE(std::memcmp(decodedB.getData(), presetB.getData(), presetB.getSize()) == 0);
}

TEST_CASE("Preset JSON: empty presetData not added to JSON", "[preset][json][edge]")
{
    auto desc = makePluginDesc("TestPlugin", "TestVendor");
    auto node = makePluginNode(1, desc);
    juce::MemoryBlock emptyPreset;

    auto json = nodeToJsonWithPresetData(*node, emptyPreset);
    auto* obj = json.getDynamicObject();

    // Empty preset should not have presetData property
    REQUIRE_FALSE(obj->hasProperty("presetData"));
    REQUIRE_FALSE(obj->hasProperty("presetSizeBytes"));
}

TEST_CASE("Preset JSON: large preset (>64KB) survives JSON roundtrip", "[preset][json][edge]")
{
    auto desc = makePluginDesc("Synth", "Massive");
    auto node = makePluginNode(1, desc);
    auto largePreset = makeKnownPresetData(100000, 0x77);

    auto json = nodeToJsonWithPresetData(*node, largePreset);

    auto jsonString = juce::JSON::toString(json);
    auto parsed = juce::JSON::parse(jsonString);
    auto* obj = parsed.getDynamicObject();

    juce::MemoryBlock decoded;
    decoded.fromBase64Encoding(obj->getProperty("presetData").toString());
    REQUIRE(decoded.getSize() == largePreset.getSize());
    REQUIRE(std::memcmp(decoded.getData(), largePreset.getData(), largePreset.getSize()) == 0);
}

// ---- Cross-format consistency ----

TEST_CASE("Preset: same binary data produces identical base64 in XML and JSON paths", "[preset][cross]")
{
    auto desc = makePluginDesc("Pro-Q 3", "FabFilter");
    auto node = makePluginNode(1, desc);
    auto presetData = makeKnownPresetData(512, 0xCC);

    auto xml = nodeToXmlWithPreset(*node, presetData);
    auto json = nodeToJsonWithPresetData(*node, presetData);

    auto xmlBase64 = xml->getStringAttribute("state");
    auto jsonBase64 = json.getDynamicObject()->getProperty("presetData").toString();

    // Both paths use MemoryBlock::toBase64Encoding, so they should be identical
    REQUIRE(xmlBase64 == jsonBase64);
}

TEST_CASE("Preset: binary data from XML path matches JSON path after decode", "[preset][cross]")
{
    auto presetData = makeKnownPresetData(4096, 0xEE);

    auto desc = makePluginDesc("Compressor", "Waves");
    auto node = makePluginNode(1, desc);

    // Serialize through XML path
    auto xml = nodeToXmlWithPreset(*node, presetData);
    juce::XmlElement chainState("ChainState");
    chainState.setAttribute("version", 2);
    chainState.addChildElement(new juce::XmlElement(*xml));

    juce::MemoryBlock binaryBlock;
    juce::AudioProcessor::copyXmlToBinary(chainState, binaryBlock);
    auto restoredXml = juce::AudioProcessor::getXmlFromBinary(
        binaryBlock.getData(), static_cast<int>(binaryBlock.getSize()));
    auto xmlBase64 = restoredXml->getChildElement(0)->getStringAttribute("state");

    // Serialize through JSON path
    auto json = nodeToJsonWithPresetData(*node, presetData);
    auto jsonString = juce::JSON::toString(json);
    auto parsedJson = juce::JSON::parse(jsonString);
    auto jsonBase64 = parsedJson.getDynamicObject()->getProperty("presetData").toString();

    // Both should decode to the same bytes
    juce::MemoryBlock fromXml, fromJson;
    fromXml.fromBase64Encoding(xmlBase64);
    fromJson.fromBase64Encoding(jsonBase64);

    REQUIRE(fromXml.getSize() == fromJson.getSize());
    REQUIRE(fromXml.getSize() == presetData.getSize());
    REQUIRE(std::memcmp(fromXml.getData(), fromJson.getData(), presetData.getSize()) == 0);
    REQUIRE(std::memcmp(fromXml.getData(), presetData.getData(), presetData.getSize()) == 0);
}

// ---- V1 backward compatibility with preset data ----

TEST_CASE("Preset XML: V1 Slot format with state attribute roundtrips", "[preset][xml][v1]")
{
    // V1 presets use <Slot state="base64">...</Slot> format
    auto presetData = makeKnownPresetData(128, 0x33);
    auto base64 = presetData.toBase64Encoding();

    juce::XmlElement chainState("ChainState");
    chainState.setAttribute("version", 1);

    auto* slotXml = chainState.createNewChildElement("Slot");
    slotXml->setAttribute("bypassed", false);
    slotXml->setAttribute("state", base64);

    juce::PluginDescription desc;
    desc.name = "OldPlugin";
    desc.manufacturerName = "OldVendor";
    desc.pluginFormatName = "VST3";
    if (auto descXml = desc.createXml())
        slotXml->addChildElement(descXml.release());

    // Binary roundtrip
    juce::MemoryBlock binaryData;
    juce::AudioProcessor::copyXmlToBinary(chainState, binaryData);

    auto restored = juce::AudioProcessor::getXmlFromBinary(
        binaryData.getData(), static_cast<int>(binaryData.getSize()));
    REQUIRE(restored != nullptr);
    REQUIRE(restored->getIntAttribute("version") == 1);

    auto* restoredSlot = restored->getChildElement(0);
    REQUIRE(restoredSlot->hasTagName("Slot"));

    auto stateBase64 = restoredSlot->getStringAttribute("state");
    juce::MemoryBlock decoded;
    decoded.fromBase64Encoding(stateBase64);
    REQUIRE(decoded.getSize() == presetData.getSize());
    REQUIRE(std::memcmp(decoded.getData(), presetData.getData(), presetData.getSize()) == 0);
}

// ---- Stress test: realistic plugin preset sizes ----

TEST_CASE("Preset: realistic preset sizes roundtrip correctly", "[preset][stress]")
{
    // Typical preset sizes for common plugins:
    // Simple EQ: ~500 bytes, Complex synth: ~50KB, Sampler: ~200KB+
    for (size_t size : { size_t(100), size_t(500), size_t(2048), size_t(8192),
                         size_t(32768), size_t(65536), size_t(131072) })
    {
        auto presetData = makeKnownPresetData(size, static_cast<uint8_t>(size & 0xFF));

        // XML path
        auto base64 = presetData.toBase64Encoding();
        juce::MemoryBlock decoded;
        decoded.fromBase64Encoding(base64);
        REQUIRE(decoded.getSize() == size);
        REQUIRE(std::memcmp(decoded.getData(), presetData.getData(), size) == 0);

        // JSON path (stringify/parse)
        auto* obj = new juce::DynamicObject();
        obj->setProperty("presetData", base64);
        juce::var json(obj);
        auto jsonStr = juce::JSON::toString(json);
        auto parsed = juce::JSON::parse(jsonStr);
        auto parsedBase64 = parsed.getDynamicObject()->getProperty("presetData").toString();

        juce::MemoryBlock decodedJson;
        decodedJson.fromBase64Encoding(parsedBase64);
        REQUIRE(decodedJson.getSize() == size);
        REQUIRE(std::memcmp(decodedJson.getData(), presetData.getData(), size) == 0);
    }
}
