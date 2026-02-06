#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <functional>
#include <atomic>
#include <optional>

class PluginManager : public juce::ChangeListener, public juce::Timer
{
public:
    PluginManager();
    ~PluginManager() override;

    // Scanning
    void startScan(bool rescanAll = false);
    void stopScan();
    bool isScanning() const { return scanning.load(); }
    float getScanProgress() const { return scanProgress.load(); }
    juce::String getCurrentlyScanning() const;

    // Plugin access
    juce::KnownPluginList& getKnownPlugins() { return knownPlugins; }
    const juce::KnownPluginList& getKnownPlugins() const { return knownPlugins; }

    std::unique_ptr<juce::AudioPluginInstance> createPluginInstance(
        const juce::PluginDescription& desc,
        double sampleRate,
        int blockSize,
        juce::String& errorMessage);

    std::optional<juce::PluginDescription> findPluginByUid(int uid) const;
    std::optional<juce::PluginDescription> findPluginByIdentifier(const juce::String& identifier) const;

    // JSON export for React UI
    juce::var getPluginListAsJson() const;

    // Blacklist management - allows users to skip problematic plugins
    void addToBlacklist(const juce::String& pluginPath);
    void removeFromBlacklist(const juce::String& pluginPath);
    juce::StringArray getBlacklistedPlugins() const;
    bool isBlacklisted(const juce::String& pluginPath) const;
    void clearBlacklist();
    juce::var getBlacklistAsJson() const;

    // Callbacks
    std::function<void()> onScanComplete;
    std::function<void(float, const juce::String&)> onScanProgress;
    std::function<void(const juce::String&)> onPluginBlacklisted;  // Called when a plugin is auto-blacklisted due to crash

    // Persistence
    void savePluginList();
    void loadPluginList();

private:
    void changeListenerCallback(juce::ChangeBroadcaster* source) override;
    void timerCallback() override;
    void initializeScan();
    void finishScan();

    // Blacklist persistence
    void saveBlacklist();
    void loadBlacklist();
    void checkForCrashedPlugin();  // Check if previous scan crashed and blacklist the culprit

    juce::KnownPluginList knownPlugins;
    juce::AudioPluginFormatManager formatManager;

    std::atomic<bool> scanning { false };
    std::atomic<bool> shouldStopScan { false };
    std::atomic<float> scanProgress { 0.0f };
    juce::String currentlyScanning;
    std::mutex scanMutex;

    // Main-thread scanner state
    std::unique_ptr<juce::PluginDirectoryScanner> currentScanner;
    int currentFormatIndex = 0;
    int currentPathIndex = 0;
    juce::FileSearchPath currentSearchPaths;  // Cached search paths for current format

    // Out-of-process scanning
    juce::StringArray pluginsToScan;
    int currentPluginScanIndex = 0;
    juce::String currentFormatName;
    bool useOutOfProcessScanning = true;

    juce::File getCacheFile() const;
    juce::File getBlacklistFile() const;
    juce::File getDeadMansPedalFile() const;
    juce::File getScannerHelperPath() const;
    juce::FileSearchPath getSearchPathsForFormat(juce::AudioPluginFormat* format) const;

    // Out-of-process scanning methods
    void collectPluginsToScan();
    void scanNextPluginOutOfProcess();
    bool scanPluginWithHelper(const juce::String& formatName, const juce::String& pluginPath);
    bool parseHelperOutput(const juce::String& output, const juce::String& pluginPath);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginManager)
};
