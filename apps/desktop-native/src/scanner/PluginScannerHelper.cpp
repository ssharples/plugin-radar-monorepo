/**
 * Out-of-process plugin scanner helper
 *
 * This is a separate executable that scans a single plugin and outputs the result.
 * If the plugin crashes during scanning, only this helper process dies, not the main app.
 *
 * Usage: PluginScannerHelper <format> <plugin-path>
 * Output: JSON on stdout with plugin info, or "SCAN_FAILED" on failure
 * Exit codes: 0 = success, 1 = scan failed, other = crash
 */

#include <juce_audio_processors/juce_audio_processors.h>
#include <iostream>

//==============================================================================
class ScannerApplication : public juce::JUCEApplicationBase
{
public:
    const juce::String getApplicationName() override { return "PluginScannerHelper"; }
    const juce::String getApplicationVersion() override { return "1.0.0"; }
    bool moreThanOneInstanceAllowed() override { return true; }

    void initialise(const juce::String& commandLine) override
    {
        juce::StringArray args = juce::JUCEApplicationBase::getCommandLineParameterArray();

        if (args.size() < 2)
        {
            std::cerr << "Usage: PluginScannerHelper <format> <plugin-path>" << std::endl;
            setApplicationReturnValue(1);
            quit();
            return;
        }

        juce::String format = args[0];
        juce::String pluginPath = args[1];

        // Initialize the format manager
        juce::AudioPluginFormatManager formatManager;

        #if JUCE_PLUGINHOST_AU
        if (format == "AudioUnit")
            formatManager.addFormat(new juce::AudioUnitPluginFormat());
        #endif

        #if JUCE_PLUGINHOST_VST3
        if (format == "VST3")
            formatManager.addFormat(new juce::VST3PluginFormat());
        #endif

        if (formatManager.getNumFormats() == 0)
        {
            std::cout << "SCAN_FAILED:Unknown format" << std::endl;
            setApplicationReturnValue(1);
            quit();
            return;
        }

        // Try to scan the plugin
        juce::OwnedArray<juce::PluginDescription> results;
        auto* pluginFormat = formatManager.getFormat(0);

        pluginFormat->findAllTypesForFile(results, pluginPath);

        if (results.isEmpty())
        {
            std::cout << "SCAN_FAILED:No plugins found" << std::endl;
            setApplicationReturnValue(1);
            quit();
            return;
        }

        // Output plugin info as JSON
        std::cout << "SCAN_SUCCESS:" << results.size() << std::endl;

        for (auto* desc : results)
        {
            // Output each plugin description in a parseable format
            std::cout << "PLUGIN_START" << std::endl;
            std::cout << "name=" << desc->name << std::endl;
            std::cout << "descriptiveName=" << desc->descriptiveName << std::endl;
            std::cout << "pluginFormatName=" << desc->pluginFormatName << std::endl;
            std::cout << "category=" << desc->category << std::endl;
            std::cout << "manufacturerName=" << desc->manufacturerName << std::endl;
            std::cout << "version=" << desc->version << std::endl;
            std::cout << "fileOrIdentifier=" << desc->fileOrIdentifier << std::endl;
            std::cout << "uniqueId=" << desc->uniqueId << std::endl;
            std::cout << "isInstrument=" << (desc->isInstrument ? "1" : "0") << std::endl;
            std::cout << "numInputChannels=" << desc->numInputChannels << std::endl;
            std::cout << "numOutputChannels=" << desc->numOutputChannels << std::endl;
            std::cout << "uid=" << desc->uniqueId << std::endl;
            std::cout << "PLUGIN_END" << std::endl;
        }

        setApplicationReturnValue(0);
        quit();
    }

    void shutdown() override {}
    void anotherInstanceStarted(const juce::String&) override {}
    void systemRequestedQuit() override { quit(); }
    void suspended() override {}
    void resumed() override {}
    void unhandledException(const std::exception*, const juce::String&, int) override
    {
        std::cout << "SCAN_FAILED:Exception" << std::endl;
        setApplicationReturnValue(1);
    }
};

//==============================================================================
START_JUCE_APPLICATION(ScannerApplication)
