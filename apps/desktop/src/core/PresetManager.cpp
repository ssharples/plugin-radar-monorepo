#include "PresetManager.h"
#include "../utils/PlatformPaths.h"
#include <mutex>
#include <cmath>

namespace {
struct FileLoadRequest
{
    uint64_t id = 0;
    juce::File file;
    bool allowPartial = false;
    PresetManager::LoadCompletion completion;
    PresetManager::LoadProgress progress;
};
struct ParsedPreset
{
    PresetInfo info;
    std::unique_ptr<juce::XmlElement> chain, wrapper;
    juce::String error;
};
ParsedPreset parsePreset(const juce::XmlElement& xml, const juce::File& file = {})
{
    ParsedPreset parsed;
    if (!xml.hasTagName("PluginChainPreset")) { parsed.error = "Unrecognised preset format"; return parsed; }
    parsed.info.file = file; parsed.info.lastModified = file.getLastModificationTime();
    parsed.info.name = file.getFileNameWithoutExtension(); parsed.info.category = "Uncategorized";
    if (auto* meta = xml.getChildByName("MetaData"))
    {
        parsed.info.name = meta->getStringAttribute("name", parsed.info.name);
        parsed.info.category = meta->getStringAttribute("category", parsed.info.category);
    }
    if (auto* wrapper = xml.getChildByName("PluginChainManagerState")) parsed.wrapper = std::make_unique<juce::XmlElement>(*wrapper);
    else if (auto* wrapper = xml.getChildByName("WrapperState"))
    { parsed.wrapper = std::make_unique<juce::XmlElement>(*wrapper); parsed.wrapper->setTagName("PluginChainManagerState"); }
    if (parsed.wrapper)
        for (auto key : { "inputGainDb", "outputGainDb", "gainMatchTargetDb" })
            if (!std::isfinite(parsed.wrapper->getDoubleAttribute(key, 0.0))
                || parsed.wrapper->getDoubleAttribute(key, 0.0) < -100.0
                || parsed.wrapper->getDoubleAttribute(key, 0.0) > 24.0)
            { parsed.error = "Preset contains an invalid gain setting"; return parsed; }
    if (auto* tree = xml.getChildByName("ChainTree")) parsed.chain = std::make_unique<juce::XmlElement>(*tree);
    else if (auto* legacy = xml.getChildByName("Chain"))
    {
        parsed.chain = std::make_unique<juce::XmlElement>("ChainTree"); parsed.chain->setAttribute("version", 2);
        for (auto* slot : legacy->getChildWithTagNameIterator("Slot"))
        {
            auto* description = slot->getChildByName("Plugin");
            if (!description) { parsed.error = "Legacy preset is missing an effect description"; return parsed; }
            juce::PluginDescription desc;
            desc.pluginFormatName = description->getStringAttribute("format"); desc.name = description->getStringAttribute("name");
            desc.uniqueId = description->getIntAttribute("uid"); desc.fileOrIdentifier = description->getStringAttribute("fileOrIdentifier");
            desc.manufacturerName = description->getStringAttribute("manufacturer");
            auto* node = parsed.chain->createNewChildElement("Node"); node->setAttribute("type", "plugin");
            node->setAttribute("bypassed", slot->getBoolAttribute("bypassed")); node->addChildElement(desc.createXml().release());
            if (auto* state = slot->getChildByName("State")) node->setAttribute("state", state->getAllSubText());
        }
    }
    else if (parsed.wrapper && parsed.wrapper->getChildByName("ChainTree"))
        parsed.chain = std::make_unique<juce::XmlElement>(*parsed.wrapper->getChildByName("ChainTree"));
    else parsed.error = "Preset does not contain a chain";
    return parsed;
}
}

struct PresetManager::FileLoadState
{
    std::atomic<bool> alive {true};
    std::atomic<uint64_t> generation {0};
    std::mutex mutex;
    std::shared_ptr<FileLoadRequest> pending;
    bool parsing = false;
};

PresetManager::PresetManager(ChainProcessor& chainProcessor)
    : chain(chainProcessor), fileLoads(std::make_shared<FileLoadState>())
{
    getPresetsDirectory().createDirectory(); scanPresets();
}
PresetManager::~PresetManager()
{
    // File IO owns only this shared state. It may finish after the owner closes,
    // but all application callbacks check the token on the message thread.
    fileLoads->alive.store(false);
    const std::lock_guard<std::mutex> lock(fileLoads->mutex);
    fileLoads->pending.reset();
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

uint64_t PresetManager::loadPresetAsync(const juce::File& file, bool allowPartial,
                                        LoadCompletion completion, LoadProgress progress)
{
    auto state = fileLoads;
    auto request = std::make_shared<FileLoadRequest>();
    request->id = state->generation.fetch_add(1) + 1; request->file = file; request->allowPartial = allowPartial;
    request->completion = std::move(completion); request->progress = std::move(progress);
    chain.cancelPendingLoads();
    std::shared_ptr<FileLoadRequest> superseded;
    bool launch = false;
    {
        const std::lock_guard<std::mutex> lock(state->mutex);
        superseded = std::move(state->pending); state->pending = request;
        if (!state->parsing) { state->parsing = true; launch = true; }
    }
    if (superseded && superseded->completion)
    { ChainProcessor::RestoreResult result; result.requestId = superseded->id; result.status = "superseded"; superseded->completion(result); }
    if (request->progress) request->progress(request->id, "loading", 0, 0, {});
    if (launch) juce::Thread::launch([this, state] {
        for (;;)
        {
            std::shared_ptr<FileLoadRequest> next;
            {
                const std::lock_guard<std::mutex> lock(state->mutex);
                if (!state->alive.load() || !state->pending) { state->parsing = false; return; }
                next = std::move(state->pending);
            }
            auto parsed = std::make_shared<ParsedPreset>();
            if (auto xml = juce::XmlDocument::parse(next->file)) *parsed = parsePreset(*xml, next->file);
            else parsed->error = "The preset file could not be read";
            juce::MessageManager::callAsync([this, state, next, parsed] {
                if (!state->alive.load()) return;
                ChainProcessor::RestoreResult result; result.requestId = next->id;
                if (next->id != state->generation.load())
                { result.status = "superseded"; if (next->completion) next->completion(result); return; }
                if (parsed->error.isNotEmpty())
                { result.error = parsed->error; if (next->completion) next->completion(result); return; }
                chain.requestRestore(*parsed->chain, next->allowPartial,
                    [this, state, next, parsed](ChainProcessor::RestoreResult committed) {
                        if (!state->alive.load()) return;
                        committed.requestId = next->id;
                        if (committed.success)
                        {
                            if (applyWrapperSettings && parsed->wrapper) applyWrapperSettings(*parsed->wrapper);
                            currentPreset = std::make_unique<PresetInfo>(parsed->info);
                            dirty = committed.status == "partial"; lastMissingPlugins = committed.missingPlugins;
                            if (onPresetLoaded) onPresetLoaded(currentPreset.get());
                        }
                        if (next->completion) next->completion(committed);
                    }, [state, next](uint64_t, const juce::String& stage, int count, int total, const juce::String& name) {
                        if (state->alive.load() && next->id == state->generation.load() && next->progress)
                            next->progress(next->id, stage, count, total, name);
                    }, true);
            });
        }
    });
    return request->id;
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

    if (captureWrapperState)
        if (auto wrapper = captureWrapperState())
            xml->addChildElement(wrapper.release());

    return xml;
}

bool PresetManager::parsePresetXml(const juce::XmlElement& xml, juce::StringArray& missingPlugins)
{
    auto parsed = parsePreset(xml);
    if (parsed.error.isNotEmpty() || !parsed.chain) return false;
    auto result = chain.restoreChainFromXml(*parsed.chain, false);
    missingPlugins = result.missingPlugins;
    if (!result.success) return false;
    if (applyWrapperSettings && parsed.wrapper) applyWrapperSettings(*parsed.wrapper);
    return true;
}
