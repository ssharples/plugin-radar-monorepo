#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

struct PluginSlot
{
    juce::PluginDescription description;
    juce::AudioProcessorGraph::NodeID nodeId;
    bool bypassed = false;

    juce::var toJson() const
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("name", description.name);
        obj->setProperty("format", description.pluginFormatName);
        obj->setProperty("uid", description.uniqueId);
        obj->setProperty("fileOrIdentifier", description.fileOrIdentifier);
        obj->setProperty("bypassed", bypassed);
        obj->setProperty("nodeId", static_cast<int>(nodeId.uid));
        return juce::var(obj);
    }
};
