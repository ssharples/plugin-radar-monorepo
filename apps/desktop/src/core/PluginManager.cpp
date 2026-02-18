#include "PluginManager.h"
#include "ScannerUtils.h"
#include "../utils/PlatformPaths.h"

PluginManager::PluginManager()
{
    #if JUCE_PLUGINHOST_AU
    formatManager.addFormat(new juce::AudioUnitPluginFormat());
    #if JUCE_DEBUG
    std::cerr << "PluginManager: Added AudioUnit format" << std::endl;
    #endif
    #endif

    #if JUCE_PLUGINHOST_VST3
    formatManager.addFormat(new juce::VST3PluginFormat());
    #if JUCE_DEBUG
    std::cerr << "PluginManager: Added VST3 format" << std::endl;
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
    loadCustomScanPaths();
    loadDeactivatedList();
    loadAutoScanSettings();
}

PluginManager::~PluginManager() noexcept
{
    autoScanTimer.stopTimer();
    stopTimer();
    shouldStopScan.store(true);

    // Wait for scanner thread to finish with proper cleanup
    if (scanThread.joinable())
    {
        scanThread.join();
    }

    currentScanner.reset();
    scanning.store(false);
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
    std::lock_guard<std::mutex> lock(scanMutex);
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
        bool isLikelyInstrument = desc.isInstrument || desc.numInputChannels == 0;
        if (isLikelyInstrument)
            continue;

        // Filter out deactivated plugins from the main list
        if (deactivatedPlugins.contains(desc.fileOrIdentifier))
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

    // Append custom scan paths that match this format (or "All")
    for (const auto& custom : customScanPaths)
    {
        if (custom.format == format->getName() || custom.format == "All")
        {
            juce::File dir(custom.path);
            if (dir.isDirectory())
                paths.add(dir);
        }
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
    // Use atomic write pattern (temp file + rename)
    auto deadMansPedal = getDeadMansPedalFile();
    auto tempFile = deadMansPedal.getSiblingFile(deadMansPedal.getFileName() + ".tmp");

    tempFile.replaceWithText(pluginPath);
    tempFile.moveFileTo(deadMansPedal);  // Atomic rename

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

        // Wait for process to be reaped (up to 5 seconds)
        bool reaped = child.waitForProcessToFinish(5000);
        if (!reaped)
        {
            DBG("Scanner process failed to terminate: " + pluginPath);
        }

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

//==============================================================================
// Custom Scan Paths
//==============================================================================

juce::File PluginManager::getCustomScanPathsFile() const
{
    return PlatformPaths::getPluginCacheDirectory().getChildFile("custom-scan-paths.json");
}

void PluginManager::saveCustomScanPaths()
{
    auto file = getCustomScanPathsFile();
    file.getParentDirectory().createDirectory();

    juce::Array<juce::var> arr;
    for (const auto& p : customScanPaths)
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("path", p.path);
        obj->setProperty("format", p.format);
        arr.add(juce::var(obj));
    }

    auto jsonStr = juce::JSON::toString(juce::var(arr));
    file.replaceWithText(jsonStr);
}

void PluginManager::loadCustomScanPaths()
{
    auto file = getCustomScanPathsFile();
    if (!file.existsAsFile())
        return;

    auto parsed = juce::JSON::parse(file.loadFileAsString());
    if (!parsed.isArray())
        return;

    customScanPaths.clear();
    for (int i = 0; i < parsed.size(); ++i)
    {
        auto entry = parsed[i];
        CustomScanPath p;
        p.path = entry.getProperty("path", "").toString();
        p.format = entry.getProperty("format", "").toString();
        if (p.path.isNotEmpty() && p.format.isNotEmpty())
            customScanPaths.push_back(p);
    }

    #if JUCE_DEBUG
    std::cerr << "Loaded " << customScanPaths.size() << " custom scan paths" << std::endl;
    #endif
}

juce::var PluginManager::getCustomScanPathsAsJson() const
{
    auto* result = new juce::DynamicObject();
    juce::Array<juce::var> pathsArray;

    // Add default paths for each format
    for (int i = 0; i < formatManager.getNumFormats(); ++i)
    {
        auto* format = formatManager.getFormat(i);
        auto defaultPaths = format->getDefaultLocationsToSearch();

        // Handle AU fallback
        if (defaultPaths.getNumPaths() == 0 && format->getName() == "AudioUnit")
        {
            defaultPaths.add(juce::File("/Library/Audio/Plug-Ins/Components"));
            defaultPaths.add(juce::File::getSpecialLocation(juce::File::userHomeDirectory)
                .getChildFile("Library/Audio/Plug-Ins/Components"));
        }

        for (int j = 0; j < defaultPaths.getNumPaths(); ++j)
        {
            auto* obj = new juce::DynamicObject();
            obj->setProperty("path", defaultPaths[j].getFullPathName());
            obj->setProperty("format", format->getName());
            obj->setProperty("isDefault", true);
            pathsArray.add(juce::var(obj));
        }
    }

    // Add custom paths
    for (const auto& p : customScanPaths)
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("path", p.path);
        obj->setProperty("format", p.format);
        obj->setProperty("isDefault", false);
        pathsArray.add(juce::var(obj));
    }

    result->setProperty("paths", pathsArray);
    return juce::var(result);
}

bool PluginManager::addCustomScanPath(const juce::String& path, const juce::String& format)
{
    // Validate directory exists
    juce::File dir(path);
    if (!dir.isDirectory())
        return false;

    // Validate format
    if (format != "VST3" && format != "AudioUnit" && format != "All")
        return false;

    // Check for duplicates
    for (const auto& existing : customScanPaths)
    {
        if (existing.path == path && existing.format == format)
            return false;
    }

    customScanPaths.push_back({ path, format });
    saveCustomScanPaths();

    #if JUCE_DEBUG
    std::cerr << "Added custom scan path: " << path << " (" << format << ")" << std::endl;
    #endif

    return true;
}

bool PluginManager::removeCustomScanPath(const juce::String& path, const juce::String& format)
{
    for (auto it = customScanPaths.begin(); it != customScanPaths.end(); ++it)
    {
        if (it->path == path && it->format == format)
        {
            customScanPaths.erase(it);
            saveCustomScanPaths();

            #if JUCE_DEBUG
            std::cerr << "Removed custom scan path: " << path << " (" << format << ")" << std::endl;
            #endif

            return true;
        }
    }

    return false;
}

//==============================================================================
// Plugin Deactivation
//==============================================================================

juce::File PluginManager::getDeactivatedPluginsFile() const
{
    return PlatformPaths::getPluginCacheDirectory().getChildFile("deactivated-plugins.txt");
}

void PluginManager::saveDeactivatedList()
{
    auto file = getDeactivatedPluginsFile();
    file.getParentDirectory().createDirectory();
    file.replaceWithText(deactivatedPlugins.joinIntoString("\n"));
}

void PluginManager::loadDeactivatedList()
{
    auto file = getDeactivatedPluginsFile();
    if (!file.existsAsFile())
        return;

    juce::StringArray lines;
    file.readLines(lines);

    deactivatedPlugins.clear();
    for (const auto& line : lines)
    {
        if (line.trim().isNotEmpty())
            deactivatedPlugins.add(line.trim());
    }

    #if JUCE_DEBUG
    std::cerr << "Loaded " << deactivatedPlugins.size() << " deactivated plugins" << std::endl;
    #endif
}

bool PluginManager::isDeactivated(const juce::String& identifier) const
{
    return deactivatedPlugins.contains(identifier);
}

bool PluginManager::deactivatePlugin(const juce::String& identifier)
{
    if (deactivatedPlugins.contains(identifier))
        return true;  // Already deactivated

    // Verify the plugin exists in known plugins
    bool found = false;
    for (const auto& desc : knownPlugins.getTypes())
    {
        if (desc.fileOrIdentifier == identifier)
        {
            found = true;
            break;
        }
    }

    if (!found)
        return false;

    deactivatedPlugins.add(identifier);
    saveDeactivatedList();

    #if JUCE_DEBUG
    std::cerr << "Deactivated plugin: " << identifier << std::endl;
    #endif

    if (onDeactivationChanged)
        onDeactivationChanged();

    return true;
}

bool PluginManager::reactivatePlugin(const juce::String& identifier)
{
    int idx = deactivatedPlugins.indexOf(identifier);
    if (idx < 0)
        return false;  // Not deactivated

    deactivatedPlugins.remove(idx);
    saveDeactivatedList();

    #if JUCE_DEBUG
    std::cerr << "Reactivated plugin: " << identifier << std::endl;
    #endif

    if (onDeactivationChanged)
        onDeactivationChanged();

    return true;
}

juce::var PluginManager::getDeactivatedPluginsAsJson() const
{
    juce::Array<juce::var> arr;

    for (const auto& identifier : deactivatedPlugins)
    {
        // Look up metadata from knownPlugins
        for (const auto& desc : knownPlugins.getTypes())
        {
            if (desc.fileOrIdentifier == identifier)
            {
                auto* obj = new juce::DynamicObject();
                obj->setProperty("identifier", desc.fileOrIdentifier);
                obj->setProperty("name", desc.name);
                obj->setProperty("manufacturer", desc.manufacturerName);
                obj->setProperty("format", desc.pluginFormatName);
                arr.add(juce::var(obj));
                break;
            }
        }
    }

    return juce::var(arr);
}

bool PluginManager::removeKnownPlugin(const juce::String& identifier)
{
    // Find and remove the plugin from knownPlugins
    bool removed = false;
    auto types = knownPlugins.getTypes();

    for (int i = 0; i < static_cast<int>(types.size()); ++i)
    {
        if (types[i].fileOrIdentifier == identifier)
        {
            knownPlugins.removeType(types[i]);
            removed = true;
            break;
        }
    }

    if (!removed)
        return false;

    // Also remove from deactivated list if present
    int deactIdx = deactivatedPlugins.indexOf(identifier);
    if (deactIdx >= 0)
        deactivatedPlugins.remove(deactIdx);

    savePluginList();
    saveDeactivatedList();

    #if JUCE_DEBUG
    std::cerr << "Removed known plugin: " << identifier << std::endl;
    #endif

    return true;
}

juce::var PluginManager::getPluginListIncludingDeactivatedAsJson() const
{
    juce::Array<juce::var> pluginArray;

    for (const auto& desc : knownPlugins.getTypes())
    {
        // Still filter out instruments (same as getPluginListAsJson)
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
        obj->setProperty("isDeactivated", deactivatedPlugins.contains(desc.fileOrIdentifier));
        pluginArray.add(juce::var(obj));
    }

    return juce::var(pluginArray);
}

//==============================================================================
// Auto-Scan Detection
//==============================================================================

juce::File PluginManager::getAutoScanSettingsFile() const
{
    return PlatformPaths::getPluginCacheDirectory().getChildFile("auto-scan-settings.json");
}

void PluginManager::saveAutoScanSettings()
{
    auto file = getAutoScanSettingsFile();
    file.getParentDirectory().createDirectory();

    auto* obj = new juce::DynamicObject();
    obj->setProperty("enabled", autoScanEnabled);
    obj->setProperty("intervalMs", autoScanIntervalMs);
    obj->setProperty("lastCheckTime", lastAutoScanCheckTime);

    auto jsonStr = juce::JSON::toString(juce::var(obj));
    file.replaceWithText(jsonStr);
}

void PluginManager::loadAutoScanSettings()
{
    auto file = getAutoScanSettingsFile();
    if (!file.existsAsFile())
        return;

    auto parsed = juce::JSON::parse(file.loadFileAsString());
    if (parsed.isVoid())
        return;

    autoScanEnabled = static_cast<bool>(parsed.getProperty("enabled", false));
    autoScanIntervalMs = static_cast<int>(parsed.getProperty("intervalMs", 300000));
    lastAutoScanCheckTime = static_cast<juce::int64>(parsed.getProperty("lastCheckTime", 0));

    // Restart timer if it was enabled
    if (autoScanEnabled && autoScanIntervalMs > 0)
        autoScanTimer.startTimer(autoScanIntervalMs);

    #if JUCE_DEBUG
    std::cerr << "Loaded auto-scan settings: enabled=" << (autoScanEnabled ? "true" : "false")
              << " interval=" << autoScanIntervalMs << "ms" << std::endl;
    #endif
}

bool PluginManager::enableAutoScan(int intervalMs)
{
    if (intervalMs < 10000)  // Minimum 10 seconds
        return false;

    autoScanEnabled = true;
    autoScanIntervalMs = intervalMs;
    autoScanTimer.startTimer(intervalMs);
    saveAutoScanSettings();

    #if JUCE_DEBUG
    std::cerr << "Auto-scan enabled: interval=" << intervalMs << "ms" << std::endl;
    #endif

    if (onAutoScanStateChanged)
        onAutoScanStateChanged();

    return true;
}

bool PluginManager::disableAutoScan()
{
    autoScanEnabled = false;
    autoScanTimer.stopTimer();
    saveAutoScanSettings();

    #if JUCE_DEBUG
    std::cerr << "Auto-scan disabled" << std::endl;
    #endif

    if (onAutoScanStateChanged)
        onAutoScanStateChanged();

    return true;
}

juce::var PluginManager::getAutoScanStateAsJson() const
{
    auto* obj = new juce::DynamicObject();
    obj->setProperty("enabled", autoScanEnabled);
    obj->setProperty("intervalMs", autoScanIntervalMs);
    obj->setProperty("lastCheckTime", lastAutoScanCheckTime);
    return juce::var(obj);
}

juce::var PluginManager::checkForNewPlugins()
{
    juce::Array<juce::var> newPluginsArray;

    for (int i = 0; i < formatManager.getNumFormats(); ++i)
    {
        auto* format = formatManager.getFormat(i);
        auto searchPaths = getSearchPathsForFormat(format);

        for (int j = 0; j < searchPaths.getNumPaths(); ++j)
        {
            auto files = format->searchPathsForPlugins(
                juce::FileSearchPath(searchPaths[j].getFullPathName()), true, true);

            for (const auto& file : files)
            {
                // Check if already known
                bool alreadyKnown = false;
                for (const auto& desc : knownPlugins.getTypes())
                {
                    if (desc.fileOrIdentifier == file)
                    {
                        alreadyKnown = true;
                        break;
                    }
                }

                // Skip blacklisted
                if (knownPlugins.getBlacklistedFiles().contains(file))
                    continue;

                if (!alreadyKnown)
                {
                    auto* obj = new juce::DynamicObject();
                    obj->setProperty("path", file);
                    obj->setProperty("format", format->getName());
                    newPluginsArray.add(juce::var(obj));
                }
            }
        }
    }

    lastAutoScanCheckTime = juce::Time::currentTimeMillis();
    saveAutoScanSettings();

    auto* result = new juce::DynamicObject();
    result->setProperty("newCount", newPluginsArray.size());
    result->setProperty("newPlugins", newPluginsArray);
    return juce::var(result);
}

void PluginManager::AutoScanTimer::timerCallback()
{
    // Don't check if a scan is already in progress
    if (pluginMgr.scanning.load())
        return;

    auto result = pluginMgr.checkForNewPlugins();
    int count = static_cast<int>(result.getProperty("newCount", 0));

    if (count > 0)
    {
        #if JUCE_DEBUG
        std::cerr << "Auto-scan detected " << count << " new plugin(s)" << std::endl;
        #endif

        if (pluginMgr.onNewPluginsDetected)
            pluginMgr.onNewPluginsDetected(count, result.getProperty("newPlugins", juce::var()));
    }
}

