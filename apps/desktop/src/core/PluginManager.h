#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <functional>
#include <atomic>
#include <optional>
#include <thread>
#include <vector>

enum class ScanFailureReason { None, Crash, ScanFailure, Timeout };

struct ScanPluginResult
{
    bool success;
    ScanFailureReason failureReason;
};

class PluginManager : public juce::ChangeListener, public juce::Timer
{
public:
    PluginManager();
    ~PluginManager() noexcept override;

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

    // ============================================
    // Custom Scan Paths
    // ============================================
    juce::var getCustomScanPathsAsJson() const;
    bool addCustomScanPath(const juce::String& path, const juce::String& format);
    bool removeCustomScanPath(const juce::String& path, const juce::String& format);

    // ============================================
    // Plugin Deactivation
    // ============================================
    bool deactivatePlugin(const juce::String& identifier);
    bool reactivatePlugin(const juce::String& identifier);
    juce::var getDeactivatedPluginsAsJson() const;
    bool removeKnownPlugin(const juce::String& identifier);
    juce::var getPluginListIncludingDeactivatedAsJson() const;
    bool isDeactivated(const juce::String& identifier) const;

    // ============================================
    // Auto-Scan Detection
    // ============================================
    bool enableAutoScan(int intervalMs);
    bool disableAutoScan();
    juce::var getAutoScanStateAsJson() const;
    juce::var checkForNewPlugins();

    // Callbacks
    std::function<void()> onScanComplete;
    std::function<void(float, const juce::String&)> onScanProgress;
    std::function<void(const juce::String&, ScanFailureReason)> onPluginBlacklisted;
    std::function<void()> onDeactivationChanged;
    std::function<void(int, const juce::var&)> onNewPluginsDetected;  // count, plugins array
    std::function<void()> onAutoScanStateChanged;

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
    void checkForCrashedPlugin();

    // Custom scan paths persistence
    void saveCustomScanPaths();
    void loadCustomScanPaths();

    // Deactivation persistence
    void saveDeactivatedList();
    void loadDeactivatedList();

    // Auto-scan persistence
    void saveAutoScanSettings();
    void loadAutoScanSettings();

    juce::KnownPluginList knownPlugins;
    juce::AudioPluginFormatManager formatManager;

    std::atomic<bool> scanning { false };
    std::atomic<bool> shouldStopScan { false };
    std::atomic<float> scanProgress { 0.0f };
    juce::String currentlyScanning;
    mutable std::mutex scanMutex;

    // Main-thread scanner state
    std::unique_ptr<juce::PluginDirectoryScanner> currentScanner;
    int currentFormatIndex = 0;
    int currentPathIndex = 0;
    juce::FileSearchPath currentSearchPaths;

    // Out-of-process scanning
    juce::StringArray pluginsToScan;
    int currentPluginScanIndex = 0;
    juce::String currentFormatName;
    bool useOutOfProcessScanning = true;

    juce::File getCacheFile() const;
    juce::File getBlacklistFile() const;
    juce::File getDeadMansPedalFile() const;
    juce::File getScannerHelperPath() const;
    juce::File getCustomScanPathsFile() const;
    juce::File getDeactivatedPluginsFile() const;
    juce::File getAutoScanSettingsFile() const;
    juce::FileSearchPath getSearchPathsForFormat(juce::AudioPluginFormat* format) const;

    // Out-of-process scanning methods
    void collectPluginsToScan();
    void scanNextPluginOutOfProcess();
    void processPendingScanResult();

    struct BackgroundScanResult
    {
        ScanPluginResult scanResult;
        std::vector<juce::PluginDescription> discoveredPlugins;
        juce::String pluginPath;
    };

    BackgroundScanResult scanPluginWithHelper(const juce::String& formatName, const juce::String& pluginPath);

    // Background scanning state
    std::thread scanThread;
    std::atomic<bool> backgroundScanInProgress { false };
    std::atomic<bool> hasPendingScanResult { false };
    BackgroundScanResult pendingScanResult;

    // Custom scan paths: vector of {path, format} pairs
    struct CustomScanPath
    {
        juce::String path;
        juce::String format;  // "VST3", "AudioUnit", or "All"
    };
    std::vector<CustomScanPath> customScanPaths;

    // Deactivated plugins (identifiers)
    juce::StringArray deactivatedPlugins;

    // Auto-scan timer (separate from the scan timer used during scanning)
    class AutoScanTimer : public juce::Timer
    {
    public:
        AutoScanTimer(PluginManager& pm) : pluginMgr(pm) {}
        void timerCallback() override;
    private:
        PluginManager& pluginMgr;
    };
    AutoScanTimer autoScanTimer { *this };
    bool autoScanEnabled = false;
    int autoScanIntervalMs = 300000;  // default 5 minutes
    juce::int64 lastAutoScanCheckTime = 0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginManager)
};
