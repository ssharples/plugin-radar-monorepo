#pragma once

#include <juce_core/juce_core.h>
#include "ChainProcessor.h"
#include <functional>

struct GroupTemplateInfo
{
    juce::String name;
    juce::String category;
    juce::File file;
    juce::Time lastModified;
    GroupMode mode;
    int pluginCount;

    juce::var toJson() const
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("name", name);
        obj->setProperty("category", category);
        obj->setProperty("path", file.getFullPathName());
        obj->setProperty("lastModified", lastModified.toISO8601(true));
        obj->setProperty("mode", mode == GroupMode::Serial ? "serial" : "parallel");
        obj->setProperty("pluginCount", pluginCount);
        return juce::var(obj);
    }
};

class GroupTemplateManager
{
public:
    GroupTemplateManager(ChainProcessor& chainProcessor);
    ~GroupTemplateManager() = default;

    // Template operations
    bool saveGroupTemplate(ChainNodeId groupId, const juce::String& name, const juce::String& category);
    ChainNodeId loadGroupTemplate(const juce::File& templateFile, ChainNodeId parentId, int insertIndex);
    bool deleteTemplate(const juce::File& templateFile);

    // Template discovery
    void scanTemplates();
    juce::Array<GroupTemplateInfo> getTemplateList() const { return templates; }
    juce::var getTemplateListAsJson() const;

    // Callbacks
    std::function<void()> onTemplateListChanged;

    // Paths
    juce::File getTemplatesDirectory() const;
    juce::Array<juce::String> getCategories() const;

private:
    std::unique_ptr<juce::XmlElement> createTemplateXml(const ChainNode& groupNode, 
                                                         const juce::String& name, 
                                                         const juce::String& category);
    std::unique_ptr<ChainNode> parseTemplateXml(const juce::XmlElement& xml);
    
    void nodeToXmlWithPresets(const ChainNode& node, juce::XmlElement& parent);
    std::unique_ptr<ChainNode> xmlToNodeWithPresets(const juce::XmlElement& xml);
    
    int countPlugins(const ChainNode& node) const;
    void collectRequiredPlugins(const ChainNode& node, juce::StringArray& plugins) const;

    ChainProcessor& chain;
    juce::Array<GroupTemplateInfo> templates;

    static constexpr const char* TEMPLATE_EXTENSION = ".pcmgroup";
    static constexpr const char* TEMPLATE_VERSION = "1.0";

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(GroupTemplateManager)
};
