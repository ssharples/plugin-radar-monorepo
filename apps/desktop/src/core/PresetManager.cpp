#include "PresetManager.h"
#include "../utils/PlatformPaths.h"

PresetManager::PresetManager(ChainProcessor& chainProcessor)
    : chain(chainProcessor)
{
    // Ensure presets directory exists
    getPresetsDirectory().createDirectory();
    scanPresets();
}

juce::File PresetManager::getPresetsDirectory() const
{
    return PlatformPaths::getPresetsDirectory();
}

void PresetManager::scanPresets()
{
    presets.clear();

    auto presetsDir = getPresetsDirectory();
    if (!presetsDir.isDirectory())
        return;

    // Scan recursively for preset files
    for (const auto& entry : juce::RangedDirectoryIterator(presetsDir, true, "*" + juce::String(PRESET_EXTENSION)))
    {
        auto file = entry.getFile();
        if (auto xml = juce::XmlDocument::parse(file))
        {
            if (xml->hasTagName("PluginChainPreset"))
            {
                PresetInfo info;
                info.file = file;
                info.lastModified = file.getLastModificationTime();

                if (auto* meta = xml->getChildByName("MetaData"))
                {
                    info.name = meta->getStringAttribute("name", file.getFileNameWithoutExtension());
                    info.category = meta->getStringAttribute("category", "Uncategorized");
                }
                else
                {
                    info.name = file.getFileNameWithoutExtension();
                    info.category = "Uncategorized";
                }

                presets.add(info);
            }
        }
    }

    // Sort by name
    std::sort(presets.begin(), presets.end(), [](const PresetInfo& a, const PresetInfo& b) {
        return a.name.compareIgnoreCase(b.name) < 0;
    });

    if (onPresetListChanged)
        onPresetListChanged();
}

juce::var PresetManager::getPresetListAsJson() const
{
    juce::Array<juce::var> presetArray;
    for (const auto& preset : presets)
        presetArray.add(preset.toJson());
    return juce::var(presetArray);
}

juce::Array<juce::String> PresetManager::getCategories() const
{
    juce::StringArray categories;
    for (const auto& preset : presets)
    {
        if (!categories.contains(preset.category))
            categories.add(preset.category);
    }
    categories.sort(true);
    return juce::Array<juce::String>(categories.begin(), categories.size());
}

bool PresetManager::isV2Preset(const juce::XmlElement& xml)
{
    return xml.getChildByName("ChainTree") != nullptr;
}

bool PresetManager::savePreset(const juce::String& name, const juce::String& category)
{
    auto xml = createPresetXml(name, category);
    if (!xml)
        return false;

    // Create category directory if needed
    auto categoryDir = getPresetsDirectory().getChildFile(category);
    categoryDir.createDirectory();

    // Save file
    auto file = categoryDir.getChildFile(name + PRESET_EXTENSION);
    if (!xml->writeTo(file))
        return false;

    // Update current preset
    currentPreset = std::make_unique<PresetInfo>();
    currentPreset->name = name;
    currentPreset->category = category;
    currentPreset->file = file;
    currentPreset->lastModified = file.getLastModificationTime();
    dirty = false;

    scanPresets();
    return true;
}

bool PresetManager::loadPreset(const juce::File& presetFile)
{
    if (!presetFile.existsAsFile())
        return false;

    auto xml = juce::XmlDocument::parse(presetFile);
    if (!xml || !xml->hasTagName("PluginChainPreset"))
        return false;

    lastMissingPlugins.clear();

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
                    // Fallback: try matching by name+manufacturer (handles cross-format presets)
                    bool foundByName = false;
                    for (const auto& knownDesc : chain.getPluginManager().getKnownPlugins().getTypes())
                    {
                        if (knownDesc.name.equalsIgnoreCase(desc.name) &&
                            knownDesc.manufacturerName.equalsIgnoreCase(desc.manufacturerName))
                        {
                            foundByName = true;
                            break;
                        }
                    }
                    if (!foundByName)
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

    if (auto* chainTree = xml->getChildByName("ChainTree"))
    {
        for (auto* nodeXml : chainTree->getChildWithTagNameIterator("Node"))
            checkNode(*nodeXml);
    }

    if (missingPlugins.size() > 0)
    {
        juce::String msg = "Missing plugins:\n";
        for (auto& name : missingPlugins)
            msg += "- " + name + "\n";

        juce::AlertWindow::showMessageBoxAsync(
            juce::AlertWindow::WarningIcon,
            "Incompatible Preset",
            msg
        );

        return false;
    }

    if (!parsePresetXml(*xml, lastMissingPlugins))
        return false;

    // Update current preset info
    currentPreset = std::make_unique<PresetInfo>();
    currentPreset->file = presetFile;
    currentPreset->lastModified = presetFile.getLastModificationTime();

    if (auto* meta = xml->getChildByName("MetaData"))
    {
        currentPreset->name = meta->getStringAttribute("name", presetFile.getFileNameWithoutExtension());
        currentPreset->category = meta->getStringAttribute("category", "Uncategorized");
    }
    else
    {
        currentPreset->name = presetFile.getFileNameWithoutExtension();
        currentPreset->category = "Uncategorized";
    }

    dirty = false;

    if (onPresetLoaded)
        onPresetLoaded(currentPreset.get());

    return true;
}

bool PresetManager::deletePreset(const juce::File& presetFile)
{
    if (!presetFile.existsAsFile())
        return false;

    if (!presetFile.deleteFile())
        return false;

    // Clear current preset if it was the deleted one
    if (currentPreset && currentPreset->file == presetFile)
        currentPreset.reset();

    scanPresets();
    return true;
}

bool PresetManager::renamePreset(const juce::File& presetFile, const juce::String& newName)
{
    if (!presetFile.existsAsFile())
        return false;

    // Parse the XML to update the metadata name
    auto xml = juce::XmlDocument::parse(presetFile);
    if (!xml || !xml->hasTagName("PluginChainPreset"))
        return false;

    // Update metadata name
    if (auto* meta = xml->getChildByName("MetaData"))
        meta->setAttribute("name", newName);

    // Build new file path (same directory, new name)
    auto parentDir = presetFile.getParentDirectory();
    auto newFile = parentDir.getChildFile(newName + PRESET_EXTENSION);

    // Don't overwrite a different file
    if (newFile.existsAsFile() && newFile != presetFile)
        return false;

    // Write updated XML to new file
    if (!xml->writeTo(newFile))
        return false;

    // Delete old file if name changed (different path)
    if (newFile != presetFile)
        presetFile.deleteFile();

    // Update current preset if it was the renamed one
    if (currentPreset && currentPreset->file == presetFile)
    {
        currentPreset->name = newName;
        currentPreset->file = newFile;
    }

    scanPresets();
    return true;
}

std::unique_ptr<juce::XmlElement> PresetManager::createPresetXml(const juce::String& name, const juce::String& category)
{
    auto xml = std::make_unique<juce::XmlElement>("PluginChainPreset");
    xml->setAttribute("version", PRESET_VERSION);

    // Metadata
    auto* meta = xml->createNewChildElement("MetaData");
    meta->setAttribute("name", name);
    meta->setAttribute("category", category);
    meta->setAttribute("created", juce::Time::getCurrentTime().toISO8601(true));

    // Serialize full tree via ChainProcessor
    if (auto chainTree = chain.serializeChainToXml())
        xml->addChildElement(chainTree.release());

    return xml;
}

bool PresetManager::parsePresetXml(const juce::XmlElement& xml, juce::StringArray& missingPlugins)
{
    // Capture snapshot for rollback on failure
    auto snapshot = chain.captureSnapshot();

    if (isV2Preset(xml))
    {
        // V2: restore from <ChainTree> element
        auto* chainTree = xml.getChildByName("ChainTree");
        auto result = chain.restoreChainFromXml(*chainTree);
        missingPlugins = result.missingPlugins;

        if (!result.success)
        {
            chain.restoreSnapshot(snapshot);
            return false;
        }
    }
    else
    {
        // V1 backward compat: old <Chain><Slot> format
        // Old presets used <Plugin format="..." name="..." .../> + <State>base64</State>
        // which differs from the DAW state format (<PLUGIN .../> + state="..."),
        // so we convert each slot to the V2 Node format before calling restoreChainFromXml.
        auto* chainXml = xml.getChildByName("Chain");
        if (!chainXml)
        {
            chain.restoreSnapshot(snapshot);
            return false;
        }

        auto wrapper = std::make_unique<juce::XmlElement>("ChainTree");
        wrapper->setAttribute("version", 2);

        for (auto* slotXml : chainXml->getChildWithTagNameIterator("Slot"))
        {
            auto* pluginXml = slotXml->getChildByName("Plugin");
            if (!pluginXml)
                continue;

            // Build a PluginDescription and serialize it with createXml()
            // so xmlToNode() can read it via loadFromXml()
            juce::PluginDescription desc;
            desc.pluginFormatName = pluginXml->getStringAttribute("format");
            desc.name = pluginXml->getStringAttribute("name");
            desc.uniqueId = pluginXml->getIntAttribute("uid");
            desc.fileOrIdentifier = pluginXml->getStringAttribute("fileOrIdentifier");
            desc.manufacturerName = pluginXml->getStringAttribute("manufacturer");

            auto nodeXml = std::make_unique<juce::XmlElement>("Node");
            nodeXml->setAttribute("type", "plugin");
            nodeXml->setAttribute("bypassed", slotXml->getBoolAttribute("bypassed", false));

            // Add JUCE-format <PLUGIN> element
            if (auto descElement = desc.createXml())
                nodeXml->addChildElement(descElement.release());

            // Convert <State>base64</State> child to state="base64" attribute
            if (auto* stateXml = slotXml->getChildByName("State"))
            {
                auto stateText = stateXml->getAllSubText();
                if (stateText.isNotEmpty())
                    nodeXml->setAttribute("state", stateText);
            }

            wrapper->addChildElement(nodeXml.release());
        }

        auto result = chain.restoreChainFromXml(*wrapper);
        missingPlugins = result.missingPlugins;

        if (!result.success)
        {
            chain.restoreSnapshot(snapshot);
            return false;
        }
    }

    return true;
}
