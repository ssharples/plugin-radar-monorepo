#include "PluginManager.h"
#include "ScannerUtils.h"
#include "../utils/PlatformPaths.h"

PluginManager::PluginManager()
{
    // Only scan AU plugins for now
    #if JUCE_PLUGINHOST_AU
    formatManager.addFormat(new juce::AudioUnitPluginFormat());
    #if JUCE_DEBUG
    std::cerr << "PluginManager: Added AudioUnit format" << std::endl;
    #endif
    #else
    #if JUCE_DEBUG
    std::cerr << "PluginManager: JUCE_PLUGINHOST_AU not defined!" << std::endl;
    #endif
    #endif

    #if JUCE_DEBUG
    std::cerr << "PluginManager: " << formatManager.getNumFormats() << " formats available" << std::endl;
    for (int i = 0; i < formatManager.getNumFormats(); ++i)
    {
        auto* format = formatManager.getFormat(i);
        std::cerr << "  Format " << i << ": " << format->getName() << std::endl;

        // Show default paths at startup
        auto paths = format->getDefaultLocationsToSearch();
        std::cerr << "    Default paths (" << paths.getNumPaths() << "):" << std::endl;
        for (int j = 0; j < paths.getNumPaths(); ++j)
            std::cerr << "      " << paths[j].getFullPathName() << std::endl;
    }
    #endif

    loadBlacklist();
    checkForCrashedPlugin();  // Auto-blacklist any plugin that crashed during previous scan
    loadPluginList();
}

PluginManager::~PluginManager()
{
    stopTimer();
    stopScan();
}

void PluginManager::startScan(bool /*rescanAll*/)
{
    #if JUCE_DEBUG
    std::cerr << "PluginManager::startScan called" << std::endl;
    #endif

    if (scanning.load())
    {
        #if JUCE_DEBUG
        std::cerr << "  Already scanning, returning" << std::endl;
        #endif
        return;
    }

    shouldStopScan.store(false);
    scanning.store(true);
    scanProgress.store(0.0f);
    currentFormatIndex = 0;
    currentPathIndex = 0;

    #if JUCE_DEBUG
    std::cerr << "  Starting scan with " << formatManager.getNumFormats() << " formats" << std::endl;
    #endif

    if (useOutOfProcessScanning)
    {
        // Collect all plugins to scan first, then scan them one by one out-of-process
        collectPluginsToScan();
    }
    else
    {
        // Fall back to in-process scanning (legacy)
        initializeScan();
    }
}

void PluginManager::stopScan()
{
    shouldStopScan.store(true);
    stopTimer();

    // Wait for background scan thread to finish before cleaning up
    if (scanThread.joinable())
        scanThread.join();

    currentScanner.reset();
    scanning.store(false);
}

juce::String PluginManager::getCurrentlyScanning() const
{
    std::lock_guard<std::mutex> lock(const_cast<std::mutex&>(scanMutex));
    return currentlyScanning;
}

void PluginManager::initializeScan()
{
    #if JUCE_DEBUG
    std::cerr << "initializeScan: numFormats=" << formatManager.getNumFormats()
              << " currentFormatIndex=" << currentFormatIndex << std::endl;
    #endif

    // Create scanner for first format and path
    while (currentFormatIndex < formatManager.getNumFormats())
    {
        auto* format = formatManager.getFormat(currentFormatIndex);

        // Get search paths using helper (handles manual fallback for AU)
        currentSearchPaths = getSearchPathsForFormat(format);

        #if JUCE_DEBUG
        std::cerr << "Format: " << format->getName() << " has " << currentSearchPaths.getNumPaths() << " paths" << std::endl;
        for (int i = 0; i < currentSearchPaths.getNumPaths(); ++i)
            std::cerr << "  Path " << i << ": " << currentSearchPaths[i].getFullPathName() << std::endl;
        #endif

        if (currentPathIndex < currentSearchPaths.getNumPaths())
        {
            auto searchPath = juce::FileSearchPath(currentSearchPaths[currentPathIndex].getFullPathName());

            #if JUCE_DEBUG
            std::cerr << "Starting scan of: " << currentSearchPaths[currentPathIndex].getFullPathName()
                      << " for format: " << format->getName() << std::endl;
            #endif

            currentScanner = std::make_unique<juce::PluginDirectoryScanner>(
                knownPlugins,
                *format,
                searchPath,
                true,  // recursive
                getDeadMansPedalFile(),  // Track currently scanning plugin to detect crashes
                true   // allow async plugins
            );

            // Start timer to process plugins one at a time on main thread
            // Using a short interval keeps UI responsive
            startTimer(1); // 1ms interval
            return;
        }

        currentPathIndex = 0;
        currentFormatIndex++;
    }

    // No more formats to scan
    finishScan();
}

void PluginManager::timerCallback()
{
    if (useOutOfProcessScanning)
    {
        scanNextPluginOutOfProcess();
    }
    else
    {
        // In-process scanning (legacy fallback)
        if (shouldStopScan.load() || !currentScanner)
        {
            stopScan();
            return;
        }

        juce::String pluginBeingScanned;
        bool hasMore = currentScanner->scanNextFile(true, pluginBeingScanned);

        if (!pluginBeingScanned.isEmpty())
        {
            {
                std::lock_guard<std::mutex> lock(scanMutex);
                currentlyScanning = pluginBeingScanned;
            }

            float progress = currentScanner->getProgress();
            scanProgress.store(progress);

            #if JUCE_DEBUG
            std::cerr << "Scanning: " << pluginBeingScanned << " (" << (int)(progress * 100) << "%)" << std::endl;
            #endif

            savePluginList();

            if (onScanProgress)
                onScanProgress(progress, pluginBeingScanned);
        }

        if (!hasMore)
        {
            stopTimer();
            currentScanner.reset();
            currentPathIndex++;

            if (currentPathIndex >= currentSearchPaths.getNumPaths())
            {
                currentPathIndex = 0;
                currentFormatIndex++;
            }

            initializeScan();
        }
    }
}

void PluginManager::finishScan()
{
    stopTimer();

    // Join background scan thread if it's still around
    if (scanThread.joinable())
        scanThread.join();

    currentScanner.reset();

    // Clear the dead man's pedal file since scan completed successfully
    getDeadMansPedalFile().deleteFile();

    savePluginList();
    saveBlacklist();  // Save any auto-blacklisted plugins
    scanning.store(false);
    scanProgress.store(1.0f);

    #if JUCE_DEBUG
    int effectCount = 0;
    int instrumentCount = 0;
    for (const auto& desc : knownPlugins.getTypes())
    {
        // Same logic as getPluginListAsJson - instruments have isInstrument=true OR 0 audio inputs
        bool isLikelyInstrument = desc.isInstrument || desc.numInputChannels == 0;
        if (isLikelyInstrument)
            instrumentCount++;
        else
            effectCount++;
    }
    std::cerr << "Scan complete. Found " << knownPlugins.getNumTypes() << " plugins total." << std::endl;
    std::cerr << "  Audio effects: " << effectCount << std::endl;
    std::cerr << "  Instruments (filtered out): " << instrumentCount << std::endl;
    std::cerr << "  Blacklisted: " << knownPlugins.getBlacklistedFiles().size() << std::endl;
    #endif

    if (onScanComplete)
        onScanComplete();
}

std::unique_ptr<juce::AudioPluginInstance> PluginManager::createPluginInstance(
    const juce::PluginDescription& desc,
    double sampleRate,
    int blockSize,
    juce::String& errorMessage)
{
    return formatManager.createPluginInstance(desc, sampleRate, blockSize, errorMessage);
}

std::optional<juce::PluginDescription> PluginManager::findPluginByUid(int uid) const
{
    for (const auto& desc : knownPlugins.getTypes())
    {
        if (desc.uniqueId == uid)
            return desc;  // Return a copy, not a pointer
    }
    return std::nullopt;
}

std::optional<juce::PluginDescription> PluginManager::findPluginByIdentifier(const juce::String& identifier) const
{
    for (const auto& desc : knownPlugins.getTypes())
    {
        if (desc.fileOrIdentifier == identifier || desc.createIdentifierString() == identifier)
            return desc;  // Return a copy, not a pointer
    }
    return std::nullopt;
}

juce::var PluginManager::getPluginListAsJson() const
{
    juce::Array<juce::var> pluginArray;

    for (const auto& desc : knownPlugins.getTypes())
    {
        // Only include audio effect plugins, not instruments/synths
        // Check both isInstrument flag AND input channels (instruments typically have 0 audio inputs)
        bool isLikelyInstrument = desc.isInstrument || desc.numInputChannels == 0;
        if (isLikelyInstrument)
            continue;

        auto* obj = new juce::DynamicObject();
        obj->setProperty("id", desc.createIdentifierString());
        obj->setProperty("name", desc.name);
        obj->setProperty("manufacturer", desc.manufacturerName);
        obj->setProperty("category", desc.category);
        obj->setProperty("format", desc.pluginFormatName);
        obj->setProperty("uid", desc.uniqueId);
        obj->setProperty("fileOrIdentifier", desc.fileOrIdentifier);
        obj->setProperty("isInstrument", desc.isInstrument);
        obj->setProperty("numInputChannels", desc.numInputChannels);
        obj->setProperty("numOutputChannels", desc.numOutputChannels);
        obj->setProperty("version", desc.version);
        pluginArray.add(juce::var(obj));
    }

    return juce::var(pluginArray);
}

void PluginManager::savePluginList()
{
    auto cacheFile = getCacheFile();
    cacheFile.getParentDirectory().createDirectory();

    if (auto xml = knownPlugins.createXml())
        xml->writeTo(cacheFile);
}

void PluginManager::loadPluginList()
{
    auto cacheFile = getCacheFile();
    if (cacheFile.existsAsFile())
    {
        if (auto xml = juce::XmlDocument::parse(cacheFile))
            knownPlugins.recreateFromXml(*xml);
    }
}

juce::File PluginManager::getCacheFile() const
{
    return PlatformPaths::getPluginCacheDirectory().getChildFile("known-plugins.xml");
}

void PluginManager::changeListenerCallback(juce::ChangeBroadcaster*)
{
    // Not used currently
}

juce::FileSearchPath PluginManager::getSearchPathsForFormat(juce::AudioPluginFormat* format) const
{
    juce::FileSearchPath paths = format->getDefaultLocationsToSearch();

    // JUCE sometimes returns empty paths for AU on macOS - add manual paths as fallback
    if (paths.getNumPaths() == 0 && format->getName() == "AudioUnit")
    {
        paths.add(juce::File("/Library/Audio/Plug-Ins/Components"));
        paths.add(juce::File::getSpecialLocation(juce::File::userHomeDirectory)
            .getChildFile("Library/Audio/Plug-Ins/Components"));
    }

    return paths;
}

//==============================================================================
// Blacklist Management
//==============================================================================

void PluginManager::addToBlacklist(const juce::String& pluginPath)
{
    knownPlugins.addToBlacklist(pluginPath);
    saveBlacklist();
    #if JUCE_DEBUG
    std::cerr << "Added to blacklist: " << pluginPath << std::endl;
    #endif
}

void PluginManager::removeFromBlacklist(const juce::String& pluginPath)
{
    knownPlugins.removeFromBlacklist(pluginPath);
    saveBlacklist();
    #if JUCE_DEBUG
    std::cerr << "Removed from blacklist: " << pluginPath << std::endl;
    #endif
}

juce::StringArray PluginManager::getBlacklistedPlugins() const
{
    return knownPlugins.getBlacklistedFiles();
}

bool PluginManager::isBlacklisted(const juce::String& pluginPath) const
{
    return knownPlugins.getBlacklistedFiles().contains(pluginPath);
}

void PluginManager::clearBlacklist()
{
    knownPlugins.clearBlacklistedFiles();
    saveBlacklist();
    #if JUCE_DEBUG
    std::cerr << "Cleared plugin blacklist" << std::endl;
    #endif
}

juce::var PluginManager::getBlacklistAsJson() const
{
    juce::Array<juce::var> blacklistArray;

    for (const auto& path : knownPlugins.getBlacklistedFiles())
    {
        auto* obj = new juce::DynamicObject();
        juce::File pluginFile(path);

        obj->setProperty("path", path);
        obj->setProperty("name", pluginFile.getFileNameWithoutExtension());
        obj->setProperty("exists", pluginFile.exists());

        blacklistArray.add(juce::var(obj));
    }

    return juce::var(blacklistArray);
}

void PluginManager::saveBlacklist()
{
    auto blacklistFile = getBlacklistFile();
    blacklistFile.getParentDirectory().createDirectory();

    juce::StringArray blacklist = knownPlugins.getBlacklistedFiles();
    blacklistFile.replaceWithText(blacklist.joinIntoString("\n"));
}

void PluginManager::loadBlacklist()
{
    auto blacklistFile = getBlacklistFile();
    if (blacklistFile.existsAsFile())
    {
        juce::StringArray lines;
        blacklistFile.readLines(lines);

        for (const auto& line : lines)
        {
            if (line.trim().isNotEmpty())
                knownPlugins.addToBlacklist(line.trim());
        }

        #if JUCE_DEBUG
        std::cerr << "Loaded " << lines.size() << " blacklisted plugins" << std::endl;
        #endif
    }
}

void PluginManager::checkForCrashedPlugin()
{
    auto deadMansPedal = getDeadMansPedalFile();

    if (deadMansPedal.existsAsFile())
    {
        juce::String crashedPlugin = deadMansPedal.loadFileAsString().trim();

        if (crashedPlugin.isNotEmpty())
        {
            #if JUCE_DEBUG
            std::cerr << "Detected crash while scanning: " << crashedPlugin << std::endl;
            std::cerr << "Auto-blacklisting this plugin to prevent future crashes." << std::endl;
            #endif

            knownPlugins.addToBlacklist(crashedPlugin);
            saveBlacklist();

            // Notify listeners about the auto-blacklisted plugin (crash from previous session)
            if (onPluginBlacklisted)
                onPluginBlacklisted(crashedPlugin, ScanFailureReason::Crash);
        }

        // Clear the dead man's pedal file
        deadMansPedal.deleteFile();
    }
}

juce::File PluginManager::getBlacklistFile() const
{
    return PlatformPaths::getPluginCacheDirectory().getChildFile("blacklisted-plugins.txt");
}

juce::File PluginManager::getDeadMansPedalFile() const
{
    return PlatformPaths::getPluginCacheDirectory().getChildFile("scanning-plugin.tmp");
}

juce::File PluginManager::getScannerHelperPath() const
{
    // Look for the helper in the app bundle's Resources folder
    auto appBundle = juce::File::getSpecialLocation(juce::File::currentExecutableFile)
        .getParentDirectory().getParentDirectory();

    auto helperInBundle = appBundle.getChildFile("Resources/PluginScannerHelper");
    if (helperInBundle.existsAsFile())
        return helperInBundle;

    // Fallback: look in same directory as executable
    auto helperBeside = juce::File::getSpecialLocation(juce::File::currentExecutableFile)
        .getParentDirectory().getChildFile("PluginScannerHelper");
    if (helperBeside.existsAsFile())
        return helperBeside;

    // Development fallback: look in build directory
    auto devHelper = juce::File::getSpecialLocation(juce::File::currentExecutableFile)
        .getParentDirectory().getParentDirectory().getParentDirectory()
        .getChildFile("PluginScannerHelper");
    if (devHelper.existsAsFile())
        return devHelper;

    return {};
}

//==============================================================================
// Out-of-Process Scanning
//==============================================================================

void PluginManager::collectPluginsToScan()
{
    pluginsToScan.clear();
    currentPluginScanIndex = 0;

    #if JUCE_DEBUG
    std::cerr << "Collecting plugins to scan..." << std::endl;
    #endif

    for (int i = 0; i < formatManager.getNumFormats(); ++i)
    {
        auto* format = formatManager.getFormat(i);
        currentFormatName = format->getName();

        auto searchPaths = getSearchPathsForFormat(format);

        for (int j = 0; j < searchPaths.getNumPaths(); ++j)
        {
            auto path = searchPaths[j];
            #if JUCE_DEBUG
            std::cerr << "Searching: " << path.getFullPathName() << std::endl;
            #endif

            auto files = format->searchPathsForPlugins(juce::FileSearchPath(path.getFullPathName()), true, true);

            for (const auto& file : files)
            {
                // Skip if already known
                bool alreadyKnown = false;
                for (const auto& desc : knownPlugins.getTypes())
                {
                    if (desc.fileOrIdentifier == file)
                    {
                        alreadyKnown = true;
                        break;
                    }
                }

                // Skip if blacklisted
                if (knownPlugins.getBlacklistedFiles().contains(file))
                {
                    #if JUCE_DEBUG
                    std::cerr << "  Skipping blacklisted: " << file << std::endl;
                    #endif
                    continue;
                }

                if (!alreadyKnown)
                    pluginsToScan.add(file);
            }
        }
    }

    #if JUCE_DEBUG
    std::cerr << "Found " << pluginsToScan.size() << " plugins to scan" << std::endl;
    #endif

    if (pluginsToScan.isEmpty())
    {
        finishScan();
        return;
    }

    // Start timer to poll for background scan completion
    startTimer(50);  // 50ms poll interval — actual scanning runs in background thread
}

void PluginManager::scanNextPluginOutOfProcess()
{
    // If a background scan is still running, just wait for the next timer tick
    if (backgroundScanInProgress.load())
        return;

    // Process the result from the previous background scan (on main thread)
    if (hasPendingScanResult.load())
    {
        processPendingScanResult();
        hasPendingScanResult.store(false);
        currentPluginScanIndex++;
    }

    if (shouldStopScan.load())
    {
        stopScan();
        return;
    }

    if (currentPluginScanIndex >= pluginsToScan.size())
    {
        finishScan();
        return;
    }

    auto pluginPath = pluginsToScan[currentPluginScanIndex];

    {
        std::lock_guard<std::mutex> lock(scanMutex);
        currentlyScanning = pluginPath;
    }

    float progress = (float)currentPluginScanIndex / (float)pluginsToScan.size();
    scanProgress.store(progress);

    #if JUCE_DEBUG
    std::cerr << "Scanning [" << currentPluginScanIndex + 1 << "/" << pluginsToScan.size() << "]: "
              << pluginPath << std::endl;
    #endif

    if (onScanProgress)
        onScanProgress(progress, pluginPath);

    // Write dead man's pedal BEFORE scanning — if the app crashes while the
    // helper is running, this file persists and checkForCrashedPlugin() will
    // auto-blacklist this plugin on next startup
    getDeadMansPedalFile().replaceWithText(pluginPath);

    // Launch scan in background thread so the UI stays responsive
    backgroundScanInProgress.store(true);

    if (scanThread.joinable())
        scanThread.join();

    scanThread = std::thread([this, format = currentFormatName, path = pluginPath]() {
        auto result = scanPluginWithHelper(format, path);
        {
            std::lock_guard<std::mutex> lock(scanMutex);
            pendingScanResult = std::move(result);
        }
        hasPendingScanResult.store(true);
        backgroundScanInProgress.store(false);
    });
}

void PluginManager::processPendingScanResult()
{
    BackgroundScanResult result;
    {
        std::lock_guard<std::mutex> lock(scanMutex);
        result = std::move(pendingScanResult);
    }

    // Clear dead man's pedal — we handled this plugin (whether success or failure)
    getDeadMansPedalFile().deleteFile();

    if (!result.scanResult.success)
    {
        #if JUCE_DEBUG
        std::cerr << "  -> Failed (reason: " << static_cast<int>(result.scanResult.failureReason)
                  << "), blacklisting: " << result.pluginPath << std::endl;
        #endif
        knownPlugins.addToBlacklist(result.pluginPath);
        saveBlacklist();

        if (onPluginBlacklisted)
            onPluginBlacklisted(result.pluginPath, result.scanResult.failureReason);
    }
    else
    {
        // Add discovered plugins to the known list (main thread only — not thread-safe)
        for (const auto& desc : result.discoveredPlugins)
        {
            knownPlugins.addType(desc);
            #if JUCE_DEBUG
            std::cerr << "  Found: " << desc.name << " by " << desc.manufacturerName << std::endl;
            #endif
        }
        savePluginList();
    }
}

PluginManager::BackgroundScanResult PluginManager::scanPluginWithHelper(const juce::String& formatName, const juce::String& pluginPath)
{
    auto helperPath = getScannerHelperPath();

    if (!helperPath.existsAsFile())
    {
        // FAIL LOUDLY — never fall back to in-process scanning.
        // In-process scanning defeats the entire purpose of crash isolation.
        std::cerr << "ERROR: Scanner helper not found! Searched locations:" << std::endl;
        std::cerr << "  Bundle:  <app>/Contents/Resources/PluginScannerHelper" << std::endl;
        std::cerr << "  Beside:  <exe-dir>/PluginScannerHelper" << std::endl;
        std::cerr << "  Dev:     <build-dir>/PluginScannerHelper" << std::endl;
        std::cerr << "  Refusing to scan in-process — skipping: " << pluginPath << std::endl;
        return { { false, ScanFailureReason::ScanFailure }, {}, pluginPath };
    }

    // Build command line
    juce::StringArray args;
    args.add(helperPath.getFullPathName());
    args.add(formatName);
    args.add(pluginPath);

    // Launch child process
    juce::ChildProcess child;

    if (!child.start(args, juce::ChildProcess::wantStdOut | juce::ChildProcess::wantStdErr))
    {
        std::cerr << "ERROR: Failed to start scanner helper" << std::endl;
        return { { false, ScanFailureReason::Crash }, {}, pluginPath };
    }

    // Wait for completion with timeout (30 seconds per plugin)
    bool finished = child.waitForProcessToFinish(30000);

    if (!finished)
    {
        std::cerr << "ERROR: Scanner helper timed out for: " << pluginPath << std::endl;
        child.kill();
        return { { false, ScanFailureReason::Timeout }, {}, pluginPath };
    }

    auto exitCode = child.getExitCode();
    auto output = child.readAllProcessOutput();

    if (exitCode != 0)
    {
        auto reason = ScannerUtils::classifyExitCode(exitCode);

        std::cerr << "ERROR: Scanner helper failed (exit code " << exitCode << ", reason: "
                  << ScannerUtils::failureReasonToString(reason) << ") for: " << pluginPath << std::endl;
        return { { false, reason }, {}, pluginPath };
    }

    // Parse the output — pure function, no shared state mutation
    auto parsed = ScannerUtils::parseScannerOutput(output);

    if (!parsed.success)
        return { { false, ScanFailureReason::ScanFailure }, {}, pluginPath };

    return { { true, ScanFailureReason::None }, std::move(parsed.plugins), pluginPath };
}

