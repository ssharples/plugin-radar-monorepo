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

    inline juce::StringArray getDefaultVST3Paths()
    {
        juce::StringArray paths;
#if JUCE_MAC
        paths.add(juce::File::getSpecialLocation(juce::File::userHomeDirectory)
            .getChildFile("Library/Audio/Plug-Ins/VST3").getFullPathName());
        paths.add("/Library/Audio/Plug-Ins/VST3");
#elif JUCE_WINDOWS
        paths.add("C:\\Program Files\\Common Files\\VST3");
        paths.add("C:\\Program Files (x86)\\Common Files\\VST3");
#endif
        return paths;
    }

    inline juce::StringArray getDefaultAUPaths()
    {
        juce::StringArray paths;
#if JUCE_MAC
        paths.add(juce::File::getSpecialLocation(juce::File::userHomeDirectory)
            .getChildFile("Library/Audio/Plug-Ins/Components").getFullPathName());
        paths.add("/Library/Audio/Plug-Ins/Components");
#endif
        return paths;
    }
}
