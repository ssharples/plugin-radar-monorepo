#pragma once

#include <juce_core/juce_core.h>

namespace PlatformPaths
{
    inline juce::File getPresetsDirectory()
    {
#if JUCE_MAC
        return juce::File::getSpecialLocation(juce::File::userHomeDirectory)
            .getChildFile("Library/Audio/Presets/PluginChainManager");
#elif JUCE_WINDOWS
        return juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory)
            .getChildFile("PluginChainManager/Presets");
#else
        return juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory)
            .getChildFile("PluginChainManager/Presets");
#endif
    }

    inline juce::File getGroupTemplatesDirectory()
    {
#if JUCE_MAC
        return juce::File::getSpecialLocation(juce::File::userHomeDirectory)
            .getChildFile("Library/Audio/Presets/PluginChainManager/Group Templates");
#elif JUCE_WINDOWS
        return juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory)
            .getChildFile("PluginChainManager/Group Templates");
#else
        return juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory)
            .getChildFile("PluginChainManager/Group Templates");
#endif
    }

    inline juce::File getPluginCacheDirectory()
    {
#if JUCE_MAC
        return juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory)
            .getChildFile("PluginChainManager");
#elif JUCE_WINDOWS
        return juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory)
            .getChildFile("PluginChainManager");
#else
        return juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory)
            .getChildFile("PluginChainManager");
#endif
    }

}
