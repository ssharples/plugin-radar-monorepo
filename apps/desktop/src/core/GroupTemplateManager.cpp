#include "GroupTemplateManager.h"
#include "../utils/PlatformPaths.h"
#include "SerializationUtils.h"

GroupTemplateManager::GroupTemplateManager(ChainProcessor& chainProcessor)
    : chain(chainProcessor)
{
    // Ensure templates directory exists
    getTemplatesDirectory().createDirectory();
    scanTemplates();
}

juce::File GroupTemplateManager::getTemplatesDirectory() const
{
    return PlatformPaths::getGroupTemplatesDirectory();
}

void GroupTemplateManager::scanTemplates()
{
    templates.clear();

    auto templatesDir = getTemplatesDirectory();
    if (!templatesDir.isDirectory())
        return;

    // Scan recursively for template files
    for (const auto& entry : juce::RangedDirectoryIterator(templatesDir, true, "*" + juce::String(TEMPLATE_EXTENSION)))
    {
        auto file = entry.getFile();
        if (auto xml = juce::XmlDocument::parse(file))
        {
            if (xml->hasTagName("GroupTemplate"))
            {
                GroupTemplateInfo info;
                info.file = file;
                info.lastModified = file.getLastModificationTime();

                if (auto* meta = xml->getChildByName("MetaData"))
                {
                    info.name = meta->getStringAttribute("name", file.getFileNameWithoutExtension());
                    info.category = meta->getStringAttribute("category", "Uncategorized");
                    info.mode = meta->getStringAttribute("mode") == "parallel" ? GroupMode::Parallel : GroupMode::Serial;
                    info.pluginCount = meta->getIntAttribute("pluginCount", 0);
                }
                else
                {
                    info.name = file.getFileNameWithoutExtension();
                    info.category = "Uncategorized";
                    info.mode = GroupMode::Serial;
                    info.pluginCount = 0;
                }

                templates.add(info);
            }
        }
    }

    // Sort by name
    std::sort(templates.begin(), templates.end(), [](const GroupTemplateInfo& a, const GroupTemplateInfo& b) {
        return a.name.compareIgnoreCase(b.name) < 0;
    });

    if (onTemplateListChanged)
        onTemplateListChanged();
}

juce::var GroupTemplateManager::getTemplateListAsJson() const
{
    juce::Array<juce::var> templateArray;
    for (const auto& tmpl : templates)
        templateArray.add(tmpl.toJson());
    return juce::var(templateArray);
}

juce::Array<juce::String> GroupTemplateManager::getCategories() const
{
    juce::StringArray categories;
    for (const auto& tmpl : templates)
    {
        if (!categories.contains(tmpl.category))
            categories.add(tmpl.category);
    }
    categories.sort(true);
    return juce::Array<juce::String>(categories.begin(), categories.size());
}

int GroupTemplateManager::countPlugins(const ChainNode& node) const
{
    if (node.isPlugin())
        return 1;
    
    if (node.isGroup())
    {
        int count = 0;
        for (const auto& child : node.getGroup().children)
            count += countPlugins(*child);
        return count;
    }
    
    return 0;
}

void GroupTemplateManager::collectRequiredPlugins(const ChainNode& node, juce::StringArray& plugins) const
{
    if (node.isPlugin())
    {
        auto& desc = node.getPlugin().description;
        juce::String pluginInfo = desc.name + " (" + desc.manufacturerName + ")";
        if (!plugins.contains(pluginInfo))
            plugins.add(pluginInfo);
    }
    else if (node.isGroup())
    {
        for (const auto& child : node.getGroup().children)
            collectRequiredPlugins(*child, plugins);
    }
}

bool GroupTemplateManager::saveGroupTemplate(ChainNodeId groupId, const juce::String& name, const juce::String& category)
{
    // Find the group node in the chain
    auto& rootNode = const_cast<ChainNode&>(chain.getRootNode());
    auto* groupNode = ChainNodeHelpers::findById(rootNode, groupId);
    if (!groupNode || !groupNode->isGroup())
        return false;

    auto xml = createTemplateXml(*groupNode, name, category);
    if (!xml)
        return false;

    // Create category directory if needed
    auto categoryName = category.isEmpty() ? "Uncategorized" : category;
    auto categoryDir = getTemplatesDirectory().getChildFile(categoryName);
    categoryDir.createDirectory();

    // Save file
    auto file = categoryDir.getChildFile(name + TEMPLATE_EXTENSION);
    if (!xml->writeTo(file))
        return false;

    scanTemplates();
    return true;
}

ChainNodeId GroupTemplateManager::loadGroupTemplate(const juce::File& templateFile, ChainNodeId parentId, int insertIndex)
{
    if (!templateFile.existsAsFile())
        return -1;

    auto xml = juce::XmlDocument::parse(templateFile);
    if (!xml || !xml->hasTagName("GroupTemplate"))
        return -1;

    // Check plugin availability before loading
    juce::StringArray missingPlugins;
    std::function<void(const juce::XmlElement&)> checkNode = [&](const juce::XmlElement& nodeXml)
    {
        auto type = nodeXml.getStringAttribute("type");
        if (type == "plugin")
        {
            if (auto* descXml = nodeXml.getChildByName("PLUGIN"))
            {
                juce::PluginDescription desc;
                desc.loadFromXml(*descXml);

                if (!chain.getPluginManager().findPluginByIdentifier(desc.fileOrIdentifier))
                {
                    missingPlugins.add(desc.name);
                }
            }
        }
        else if (type == "group")
        {
            for (auto* childXml : nodeXml.getChildWithTagNameIterator("Node"))
                checkNode(*childXml);
        }
    };

    if (auto* groupNodeXml = xml->getChildByName("GroupNode"))
    {
        if (auto* nodeXml = groupNodeXml->getFirstChildElement())
            checkNode(*nodeXml);
    }

    if (missingPlugins.size() > 0)
    {
        juce::String msg = "Cannot load template - missing plugins:";
        for (auto& name : missingPlugins)
            msg += " " + name + ";";

        DBG(msg);

        return -1;
    }

    // Parse the template
    auto groupNode = parseTemplateXml(*xml);
    if (!groupNode)
        return -1;

    // Insert the loaded group into the chain
    auto newNodeId = chain.insertNodeTree(std::move(groupNode), parentId, insertIndex);
    
    return newNodeId;
}

bool GroupTemplateManager::deleteTemplate(const juce::File& templateFile)
{
    if (!templateFile.existsAsFile())
        return false;

    if (!templateFile.deleteFile())
        return false;

    scanTemplates();
    return true;
}

std::unique_ptr<juce::XmlElement> GroupTemplateManager::createTemplateXml(const ChainNode& groupNode, 
                                                                            const juce::String& name, 
                                                                            const juce::String& category)
{
    auto xml = std::make_unique<juce::XmlElement>("GroupTemplate");
    xml->setAttribute("version", TEMPLATE_VERSION);

    // Metadata
    auto* meta = xml->createNewChildElement("MetaData");
    meta->setAttribute("name", name);
    meta->setAttribute("category", category.isEmpty() ? "Uncategorized" : category);
    meta->setAttribute("created", juce::Time::getCurrentTime().toISO8601(true));
    meta->setAttribute("mode", groupNode.getGroup().mode == GroupMode::Serial ? "serial" : "parallel");
    meta->setAttribute("pluginCount", countPlugins(groupNode));

    // Serialize group node with presets
    auto* groupNodeXml = xml->createNewChildElement("GroupNode");
    nodeToXmlWithPresets(groupNode, *groupNodeXml);

    // Compatibility info
    juce::StringArray requiredPlugins;
    collectRequiredPlugins(groupNode, requiredPlugins);
    
    if (requiredPlugins.size() > 0)
    {
        auto* compatXml = xml->createNewChildElement("CompatibilityInfo");
        for (const auto& pluginInfo : requiredPlugins)
        {
            auto* pluginXml = compatXml->createNewChildElement("RequiredPlugin");
            
            // Parse "name (manufacturer)" format
            auto openParen = pluginInfo.indexOfChar('(');
            if (openParen > 0)
            {
                auto pluginName = pluginInfo.substring(0, openParen).trim();
                auto manufacturer = pluginInfo.substring(openParen + 1, pluginInfo.length() - 1).trim();
                pluginXml->setAttribute("name", pluginName);
                pluginXml->setAttribute("manufacturer", manufacturer);
            }
            else
            {
                pluginXml->setAttribute("name", pluginInfo);
            }
        }
    }

    return xml;
}

void GroupTemplateManager::nodeToXmlWithPresets(const ChainNode& node, juce::XmlElement& parent)
{
    auto* nodeXml = parent.createNewChildElement("Node");
    nodeXml->setAttribute("id", node.id);

    if (node.isPlugin())
    {
        nodeXml->setAttribute("type", "plugin");
        nodeXml->setAttribute("bypassed", node.getPlugin().bypassed);
        nodeXml->setAttribute("branchGainDb", static_cast<double>(node.branchGainDb));
        nodeXml->setAttribute("solo", node.solo.load(std::memory_order_relaxed));
        nodeXml->setAttribute("mute", node.mute.load(std::memory_order_relaxed));

        if (auto descXml = node.getPlugin().description.createXml())
            nodeXml->addChildElement(descXml.release());

        // Serialize plugin state if available
        if (auto gNode = chain.getNodeForId(node.getPlugin().graphNodeId))
        {
            if (auto* processor = gNode->getProcessor())
            {
                juce::MemoryBlock stateBlock;
                processor->getStateInformation(stateBlock);
                
                if (stateBlock.getSize() > 0)
                {
                    auto base64 = stateBlock.toBase64Encoding();
                    nodeXml->setAttribute("state", base64);
                }
            }
        }
    }
    else if (node.isGroup())
    {
        nodeXml->setAttribute("type", "group");
        nodeXml->setAttribute("mode", node.getGroup().mode == GroupMode::Serial ? "serial" : "parallel");
        nodeXml->setAttribute("dryWet", static_cast<double>(node.getGroup().dryWetMix));
        nodeXml->setAttribute("name", node.name);
        nodeXml->setAttribute("collapsed", node.collapsed);

        for (const auto& child : node.getGroup().children)
            nodeToXmlWithPresets(*child, *nodeXml);
    }
}

std::unique_ptr<ChainNode> GroupTemplateManager::parseTemplateXml(const juce::XmlElement& xml)
{
    auto* groupNodeXml = xml.getChildByName("GroupNode");
    if (!groupNodeXml)
        return nullptr;

    auto* nodeXml = groupNodeXml->getFirstChildElement();
    if (!nodeXml)
        return nullptr;

    // Deserialize with preset data
    return xmlToNodeWithPresets(*nodeXml);
}

std::unique_ptr<ChainNode> GroupTemplateManager::xmlToNodeWithPresets(const juce::XmlElement& xml)
{
    auto node = std::make_unique<ChainNode>();
    node->id = xml.getIntAttribute("id", 0);  // ID will be reassigned by insertNodeTree

    auto type = xml.getStringAttribute("type");

    if (type == "plugin")
    {
        node->branchGainDb = static_cast<float>(xml.getDoubleAttribute("branchGainDb", 0.0));
        node->solo.store(xml.getBoolAttribute("solo", false), std::memory_order_relaxed);
        node->mute.store(xml.getBoolAttribute("mute", false), std::memory_order_relaxed);

        PluginLeaf leaf;
        leaf.bypassed = xml.getBoolAttribute("bypassed", false);

        if (auto* descXml = xml.getChildByName("PLUGIN"))
        {
            leaf.description.loadFromXml(*descXml);
            node->name = leaf.description.name;

            // Store preset data for later restoration (after rebuildGraph)
            auto stateStr = xml.getStringAttribute("state");
            if (stateStr.isNotEmpty())
            {
                leaf.pendingPresetData = stateStr;
            }
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
            if (auto child = xmlToNodeWithPresets(*childXml))
                group.children.push_back(std::move(child));
        }

        node->data = std::move(group);
    }

    return node;
}
