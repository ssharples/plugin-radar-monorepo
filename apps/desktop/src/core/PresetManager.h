#pragma once

#include <juce_core/juce_core.h>
#include "ChainProcessor.h"
#include <functional>

struct PresetInfo
{
    juce::String name;
    juce::String category;
    juce::File file;
    juce::Time lastModified;

    juce::var toJson() const
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("name", name);
        obj->setProperty("category", category);
        obj->setProperty("path", file.getFullPathName());
        obj->setProperty("lastModified", lastModified.toISO8601(true));
        return juce::var(obj);
    }
};

class PresetManager
{
public:
    PresetManager(ChainProcessor& chainProcessor);
    ~PresetManager() = default;

    // Preset operations
    bool savePreset(const juce::String& name, const juce::String& category);
    bool loadPreset(const juce::File& presetFile);
    bool deletePreset(const juce::File& presetFile);
    bool renamePreset(const juce::File& presetFile, const juce::String& newName);

    // Preset discovery
    void scanPresets();
    juce::Array<PresetInfo> getPresetList() const { return presets; }
    juce::var getPresetListAsJson() const;

    // Current preset info
    const PresetInfo* getCurrentPreset() const { return currentPreset.get(); }
    bool isDirty() const { return dirty; }
    void setDirty(bool isDirty) { dirty = isDirty; }

    // Missing plugins from last load
    const juce::StringArray& getLastMissingPlugins() const { return lastMissingPlugins; }

    // Callbacks
    std::function<void()> onPresetListChanged;
    std::function<void(const PresetInfo*)> onPresetLoaded;

    // Paths
    juce::File getPresetsDirectory() const;
    juce::Array<juce::String> getCategories() const;

    // Version detection
    static bool isV2Preset(const juce::XmlElement& xml);

private:
    std::unique_ptr<juce::XmlElement> createPresetXml(const juce::String& name, const juce::String& category);
    bool parsePresetXml(const juce::XmlElement& xml, juce::StringArray& missingPlugins);

    ChainProcessor& chain;
    juce::Array<PresetInfo> presets;
    std::unique_ptr<PresetInfo> currentPreset;
    bool dirty = false;
    juce::StringArray lastMissingPlugins;

    static constexpr const char* PRESET_EXTENSION = ".pcmpreset";
    static constexpr const char* PRESET_VERSION = "2.0";

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PresetManager)
};
