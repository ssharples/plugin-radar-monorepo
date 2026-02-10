#pragma once

#include "ChainNode.h"
#include <juce_core/juce_core.h>
#include <juce_audio_processors/juce_audio_processors.h>

/**
 * Pure serialization functions extracted from ChainProcessor for testability.
 * These handle structural serialization/deserialization of ChainNode trees
 * to/from XML and JSON without requiring AudioProcessorGraph or PluginManager.
 *
 * Note: Plugin state (preset data) and graph node instantiation are NOT handled
 * here — those require a live ChainProcessor. These functions only deal with
 * the tree structure and metadata (node IDs, types, names, descriptions,
 * group modes, dry/wet, branch gains, solo/mute, bypass, collapsed).
 */
namespace SerializationUtils
{

// =========================================================================
// XML Serialization
// =========================================================================

/**
 * Serialize a ChainNode to XML (structural only — no plugin state).
 * Mirrors ChainProcessor::nodeToXml() but skips getStateInformation().
 */
inline void nodeToXml(const ChainNode& node, juce::XmlElement& parent)
{
    auto* nodeXml = parent.createNewChildElement("Node");
    nodeXml->setAttribute("id", node.id);

    if (node.isPlugin())
    {
        nodeXml->setAttribute("type", "plugin");
        nodeXml->setAttribute("bypassed", node.getPlugin().bypassed);
        nodeXml->setAttribute("branchGainDb", static_cast<double>(node.branchGainDb));
        nodeXml->setAttribute("solo", node.solo);
        nodeXml->setAttribute("mute", node.mute);

        if (auto descXml = node.getPlugin().description.createXml())
            nodeXml->addChildElement(descXml.release());
    }
    else if (node.isGroup())
    {
        nodeXml->setAttribute("type", "group");
        nodeXml->setAttribute("mode", node.getGroup().mode == GroupMode::Serial ? "serial" : "parallel");
        nodeXml->setAttribute("dryWet", static_cast<double>(node.getGroup().dryWetMix));
        nodeXml->setAttribute("name", node.name);
        nodeXml->setAttribute("collapsed", node.collapsed);

        for (const auto& child : node.getGroup().children)
            nodeToXml(*child, *nodeXml);
    }
}

/**
 * Create a full preset XML structure (ChainTree wrapper) from root children.
 */
inline std::unique_ptr<juce::XmlElement> serializeChainTreeToXml(const ChainNode& rootNode)
{
    auto xml = std::make_unique<juce::XmlElement>("ChainTree");
    xml->setAttribute("version", 2);

    if (rootNode.isGroup())
    {
        for (const auto& child : rootNode.getGroup().children)
            nodeToXml(*child, *xml);
    }

    return xml;
}

/**
 * Deserialize XML to a ChainNode tree (structural only — no plugin instantiation).
 * Mirrors ChainProcessor::xmlToNode() but skips createPluginInstance().
 * The nextNodeId parameter is updated to stay ahead of all loaded IDs.
 */
inline std::unique_ptr<ChainNode> xmlToNode(const juce::XmlElement& xml, int& nextNodeId)
{
    auto node = std::make_unique<ChainNode>();
    node->id = xml.getIntAttribute("id", nextNodeId++);

    if (node->id >= nextNodeId)
        nextNodeId = node->id + 1;

    auto type = xml.getStringAttribute("type");

    if (type == "plugin")
    {
        node->branchGainDb = static_cast<float>(xml.getDoubleAttribute("branchGainDb", 0.0));
        node->solo = xml.getBoolAttribute("solo", false);
        node->mute = xml.getBoolAttribute("mute", false);

        PluginLeaf leaf;
        leaf.bypassed = xml.getBoolAttribute("bypassed", false);

        if (auto* descXml = xml.getChildByName("PLUGIN"))
        {
            leaf.description.loadFromXml(*descXml);
            node->name = leaf.description.name;
        }

        node->data = std::move(leaf);
    }
    else if (type == "group")
    {
        node->name = xml.getStringAttribute("name", "Group");
        node->collapsed = xml.getBoolAttribute("collapsed", false);

        GroupData group;
        group.mode = xml.getStringAttribute("mode") == "parallel" ? GroupMode::Parallel : GroupMode::Serial;
        group.dryWetMix = static_cast<float>(xml.getDoubleAttribute("dryWet", 1.0));

        for (auto* childXml : xml.getChildWithTagNameIterator("Node"))
        {
            if (auto child = xmlToNode(*childXml, nextNodeId))
                group.children.push_back(std::move(child));
        }

        node->data = std::move(group);
    }

    return node;
}

/**
 * Restore a chain tree from a ChainTree XML element into a root node.
 * Returns the children that were deserialized.
 */
inline std::vector<std::unique_ptr<ChainNode>> restoreChainTreeFromXml(
    const juce::XmlElement& chainTreeXml, int& nextNodeId)
{
    std::vector<std::unique_ptr<ChainNode>> children;

    for (auto* nodeXml : chainTreeXml.getChildWithTagNameIterator("Node"))
    {
        if (auto child = xmlToNode(*nodeXml, nextNodeId))
            children.push_back(std::move(child));
    }

    return children;
}

// =========================================================================
// JSON Serialization
// =========================================================================

/**
 * Serialize a ChainNode to JSON (structural only — no preset data).
 * Mirrors ChainProcessor::nodeToJson().
 */
inline juce::var nodeToJson(const ChainNode& node)
{
    auto* obj = new juce::DynamicObject();
    obj->setProperty("id", node.id);

    if (node.isPlugin())
    {
        obj->setProperty("type", "plugin");
        obj->setProperty("name", node.getPlugin().description.name);
        obj->setProperty("format", node.getPlugin().description.pluginFormatName);
        obj->setProperty("uid", node.getPlugin().description.uniqueId);
        obj->setProperty("fileOrIdentifier", node.getPlugin().description.fileOrIdentifier);
        obj->setProperty("bypassed", node.getPlugin().bypassed);
        obj->setProperty("manufacturer", node.getPlugin().description.manufacturerName);
        obj->setProperty("branchGainDb", node.branchGainDb);
        obj->setProperty("solo", node.solo);
        obj->setProperty("mute", node.mute);
    }
    else if (node.isGroup())
    {
        obj->setProperty("type", "group");
        obj->setProperty("name", node.name);
        obj->setProperty("mode", node.getGroup().mode == GroupMode::Serial ? "serial" : "parallel");
        obj->setProperty("dryWet", node.getGroup().dryWetMix);
        obj->setProperty("collapsed", node.collapsed);

        juce::Array<juce::var> childrenArr;
        for (const auto& child : node.getGroup().children)
            childrenArr.add(nodeToJson(*child));
        obj->setProperty("children", childrenArr);
    }

    return juce::var(obj);
}

/**
 * Serialize a ChainNode to JSON with full preset fields (cloud sharing format).
 * Mirrors ChainProcessor::nodeToJsonWithPresets() but without actual preset binary data.
 */
inline juce::var nodeToJsonWithPresets(const ChainNode& node)
{
    auto* obj = new juce::DynamicObject();
    obj->setProperty("id", node.id);

    if (node.isPlugin())
    {
        auto& leaf = node.getPlugin();
        obj->setProperty("type", "plugin");
        obj->setProperty("name", leaf.description.name);
        obj->setProperty("manufacturer", leaf.description.manufacturerName);
        obj->setProperty("format", leaf.description.pluginFormatName);
        obj->setProperty("uid", leaf.description.uniqueId);
        obj->setProperty("fileOrIdentifier", leaf.description.fileOrIdentifier);
        obj->setProperty("version", leaf.description.version);
        obj->setProperty("bypassed", leaf.bypassed);
        obj->setProperty("isInstrument", leaf.description.isInstrument);
        obj->setProperty("numInputChannels", leaf.description.numInputChannels);
        obj->setProperty("numOutputChannels", leaf.description.numOutputChannels);
        obj->setProperty("branchGainDb", node.branchGainDb);
        obj->setProperty("solo", node.solo);
        obj->setProperty("mute", node.mute);
        // Note: presetData and presetSizeBytes omitted (require live processor)
    }
    else if (node.isGroup())
    {
        obj->setProperty("type", "group");
        obj->setProperty("name", node.name);
        obj->setProperty("mode", node.getGroup().mode == GroupMode::Serial ? "serial" : "parallel");
        obj->setProperty("dryWet", node.getGroup().dryWetMix);
        obj->setProperty("collapsed", node.collapsed);

        juce::Array<juce::var> childrenArr;
        for (const auto& child : node.getGroup().children)
            childrenArr.add(nodeToJsonWithPresets(*child));
        obj->setProperty("children", childrenArr);
    }

    return juce::var(obj);
}

/**
 * Deserialize JSON to a ChainNode tree (structural only — no plugin instantiation).
 * Mirrors ChainProcessor::jsonToNode() but skips createPluginInstance().
 */
inline std::unique_ptr<ChainNode> jsonToNode(const juce::var& json, int& nextNodeId)
{
    if (!json.isObject())
        return nullptr;

    auto* obj = json.getDynamicObject();
    if (!obj)
        return nullptr;

    auto node = std::make_unique<ChainNode>();
    node->id = static_cast<int>(obj->getProperty("id"));
    if (node->id >= nextNodeId)
        nextNodeId = node->id + 1;

    auto type = obj->getProperty("type").toString();

    if (type == "plugin")
    {
        node->name = obj->getProperty("name").toString();
        node->branchGainDb = static_cast<float>(obj->getProperty("branchGainDb"));
        node->solo = static_cast<bool>(obj->getProperty("solo"));
        node->mute = static_cast<bool>(obj->getProperty("mute"));

        PluginLeaf leaf;
        leaf.bypassed = static_cast<bool>(obj->getProperty("bypassed"));

        juce::PluginDescription desc;
        desc.name = obj->getProperty("name").toString();
        desc.manufacturerName = obj->getProperty("manufacturer").toString();
        desc.pluginFormatName = obj->getProperty("format").toString();
        desc.uniqueId = static_cast<int>(obj->getProperty("uid"));
        desc.fileOrIdentifier = obj->getProperty("fileOrIdentifier").toString();
        desc.version = obj->getProperty("version").toString();
        desc.isInstrument = static_cast<bool>(obj->getProperty("isInstrument"));
        desc.numInputChannels = static_cast<int>(obj->getProperty("numInputChannels"));
        desc.numOutputChannels = static_cast<int>(obj->getProperty("numOutputChannels"));
        leaf.description = desc;

        node->data = std::move(leaf);
    }
    else if (type == "group")
    {
        node->name = obj->getProperty("name").toString();
        node->collapsed = static_cast<bool>(obj->getProperty("collapsed"));

        GroupData group;
        group.mode = obj->getProperty("mode").toString() == "parallel" ? GroupMode::Parallel : GroupMode::Serial;
        group.dryWetMix = static_cast<float>(obj->getProperty("dryWet"));

        auto childrenVar = obj->getProperty("children");
        if (childrenVar.isArray())
        {
            for (const auto& childVar : *childrenVar.getArray())
            {
                if (auto child = jsonToNode(childVar, nextNodeId))
                    group.children.push_back(std::move(child));
            }
        }

        node->data = std::move(group);
    }

    return node;
}

/**
 * Detect V1 vs V2 preset format.
 * V2 presets have a <ChainTree> child element; V1 presets use <Chain><Slot> format.
 */
inline bool isV2Preset(const juce::XmlElement& xml)
{
    return xml.getChildByName("ChainTree") != nullptr;
}

} // namespace SerializationUtils
