#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "PluginManager.h"
#include <vector>

/**
 * Pure utility functions extracted from PluginManager for testability.
 * These have no side effects and no dependencies on PluginManager state.
 */
namespace ScannerUtils
{

/**
 * Maps a scanner helper exit code to a ScanFailureReason.
 *
 * Exit 0 = success (None)
 * Exit 1 = findAllTypesForFile returned empty (ScanFailure — likely license/auth)
 * Exit 2 = exception caught (Crash)
 * Exit > 128 or < 0 = signal death (Crash — segfault, SIGKILL, etc.)
 */
inline ScanFailureReason classifyExitCode(int exitCode)
{
    if (exitCode == 0)
        return ScanFailureReason::None;
    if (exitCode == 1)
        return ScanFailureReason::ScanFailure;
    if (exitCode > 128 || exitCode < 0)
        return ScanFailureReason::Crash;
    // Exit 2+ (exception or other) = Crash
    return ScanFailureReason::Crash;
}

/**
 * Result of parsing scanner helper stdout.
 */
struct ParsedScanResult
{
    bool success = false;
    std::vector<juce::PluginDescription> plugins;
};

/**
 * Parses the stdout output from PluginScannerHelper into plugin descriptions.
 *
 * Expected format:
 *   SCAN_SUCCESS:<count>
 *   PLUGIN_START
 *   name=<value>
 *   manufacturerName=<value>
 *   ...
 *   PLUGIN_END
 *
 * Returns parsed result without mutating any external state.
 */
inline ParsedScanResult parseScannerOutput(const juce::String& output)
{
    ParsedScanResult result;

    juce::StringArray lines;
    lines.addLines(output);

    juce::PluginDescription currentDesc;
    bool inPlugin = false;

    for (const auto& line : lines)
    {
        if (line.startsWith("SCAN_SUCCESS:"))
        {
            result.success = true;
        }
        else if (line.startsWith("SCAN_FAILED:"))
        {
            return { false, {} };
        }
        else if (line == "PLUGIN_START")
        {
            inPlugin = true;
            currentDesc = {};
        }
        else if (line == "PLUGIN_END")
        {
            if (inPlugin)
                result.plugins.push_back(currentDesc);
            inPlugin = false;
        }
        else if (inPlugin && line.contains("="))
        {
            auto key = line.upToFirstOccurrenceOf("=", false, false);
            auto value = line.fromFirstOccurrenceOf("=", false, false);

            if (key == "name") currentDesc.name = value;
            else if (key == "descriptiveName") currentDesc.descriptiveName = value;
            else if (key == "pluginFormatName") currentDesc.pluginFormatName = value;
            else if (key == "category") currentDesc.category = value;
            else if (key == "manufacturerName") currentDesc.manufacturerName = value;
            else if (key == "version") currentDesc.version = value;
            else if (key == "fileOrIdentifier") currentDesc.fileOrIdentifier = value;
            else if (key == "uniqueId") currentDesc.uniqueId = value.getIntValue();
            else if (key == "isInstrument") currentDesc.isInstrument = (value == "1");
            else if (key == "numInputChannels") currentDesc.numInputChannels = value.getIntValue();
            else if (key == "numOutputChannels") currentDesc.numOutputChannels = value.getIntValue();
        }
    }

    return result;
}

/**
 * Converts a ScanFailureReason enum to its string representation
 * (matches the strings emitted in WebViewBridge events).
 */
inline juce::String failureReasonToString(ScanFailureReason reason)
{
    switch (reason)
    {
        case ScanFailureReason::Crash:       return "crash";
        case ScanFailureReason::ScanFailure: return "scan-failure";
        case ScanFailureReason::Timeout:     return "timeout";
        case ScanFailureReason::None:
        default:                             return "none";
    }
}

} // namespace ScannerUtils
