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
#include <csignal>
#include <unistd.h>

//==============================================================================
// Signal handler for crash recovery.
// When a plugin causes a segfault/abort, this writes SCAN_FAILED to stdout
// before dying so the host can detect the failure via exit code.
// Only uses async-signal-safe functions (write, _exit).
static void crashSignalHandler(int signal)
{
    const char* msg = "SCAN_FAILED:Signal\n";
    (void)write(STDOUT_FILENO, msg, 19);
    _exit(128 + signal);
}

//==============================================================================
class ScannerApplication : public juce::JUCEApplicationBase
{
public:
    const juce::String getApplicationName() override { return "PluginScannerHelper"; }
    const juce::String getApplicationVersion() override { return "1.0.0"; }
    bool moreThanOneInstanceAllowed() override { return true; }

    void initialise(const juce::String& commandLine) override
    {
        // Install signal handlers FIRST so any crash during scanning writes
        // SCAN_FAILED to stdout before the process dies
        std::signal(SIGSEGV, crashSignalHandler);
        std::signal(SIGABRT, crashSignalHandler);
        std::signal(SIGBUS,  crashSignalHandler);
        std::signal(SIGFPE,  crashSignalHandler);

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
            setApplicationReturnValue(1);  // Exit 1 = scan failure (likely license/auth issue)
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
        setApplicationReturnValue(2);  // Exit 2 = exception caught (crash-like)
    }
};

//==============================================================================
START_JUCE_APPLICATION(ScannerApplication)
