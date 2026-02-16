#include <catch2/catch_test_macros.hpp>
#include "../src/core/PluginManager.h"
#include <thread>
#include <chrono>

#if JUCE_MAC
#include <cstdlib>
#include <sstream>

// Helper to count zombie processes on macOS
static int countZombieProcesses()
{
    FILE* pipe = popen("ps aux | grep '<defunct>' | grep -v grep | wc -l", "r");
    if (!pipe)
        return -1;

    char buffer[128];
    std::string result;
    while (fgets(buffer, sizeof(buffer), pipe) != nullptr)
        result += buffer;
    pclose(pipe);

    return std::stoi(result);
}
#endif

TEST_CASE("Scanner stress test - no zombie processes", "[scanner][stress]")
{
#if JUCE_MAC
    PluginManager manager;

    // Get initial zombie count
    int initialZombies = countZombieProcesses();
    REQUIRE(initialZombies >= 0);  // Verify the command works

    INFO("Initial zombie count: " << initialZombies);

    // Start a scan
    manager.startScan(false);

    // Wait for scan to process some plugins (up to 30 seconds)
    int checksPerformed = 0;
    const int maxChecks = 30;

    while (manager.isScanning() && checksPerformed < maxChecks)
    {
        std::this_thread::sleep_for(std::chrono::seconds(1));
        checksPerformed++;

        // Check for zombies every 5 seconds
        if (checksPerformed % 5 == 0)
        {
            int currentZombies = countZombieProcesses();
            INFO("After " << checksPerformed << " seconds, zombie count: " << currentZombies);

            // Allow a small margin, but there should be no zombie accumulation
            REQUIRE(currentZombies <= initialZombies + 2);
        }
    }

    // Stop scan if still running
    if (manager.isScanning())
        manager.stopScan();

    // Wait a bit for cleanup
    std::this_thread::sleep_for(std::chrono::milliseconds(500));

    // Final zombie check
    int finalZombies = countZombieProcesses();
    INFO("Final zombie count: " << finalZombies);

    // There should be no new zombie processes after scan
    REQUIRE(finalZombies <= initialZombies + 1);
#else
    WARN("Zombie process test only runs on macOS");
#endif
}

TEST_CASE("Scanner handles rapid start/stop", "[scanner][stress]")
{
    PluginManager manager;

    // Rapidly start and stop scanning multiple times
    for (int i = 0; i < 5; ++i)
    {
        manager.startScan(false);
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        manager.stopScan();
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }

    // Should not crash or leak resources
    SUCCEED("Rapid start/stop completed without crash");
}

TEST_CASE("Scanner handles concurrent requests", "[scanner][stress]")
{
    PluginManager manager;

    // Start scan
    manager.startScan(false);

    // Try to start again while already scanning (should be handled gracefully)
    manager.startScan(false);

    // Wait a bit
    std::this_thread::sleep_for(std::chrono::milliseconds(500));

    // Stop
    manager.stopScan();

    // Wait for cleanup
    std::this_thread::sleep_for(std::chrono::milliseconds(500));

    REQUIRE(!manager.isScanning());
}

TEST_CASE("Scanner progress reporting", "[scanner]")
{
    PluginManager manager;

    bool progressCallbackCalled = false;
    float lastProgress = 0.0f;

    manager.onScanProgress = [&](float progress, const juce::String& pluginName) {
        progressCallbackCalled = true;
        REQUIRE(progress >= 0.0f);
        REQUIRE(progress <= 1.0f);
        REQUIRE(progress >= lastProgress);  // Progress should be monotonic
        lastProgress = progress;
    };

    manager.startScan(false);

    // Wait for some progress
    for (int i = 0; i < 10 && manager.isScanning(); ++i)
        std::this_thread::sleep_for(std::chrono::milliseconds(500));

    manager.stopScan();

    // If no plugins were found to scan, the scan completes instantly — that's OK
    if (!progressCallbackCalled)
    {
        WARN("No plugins found to scan — progress callback was not invoked (expected in minimal test environments)");
    }
    else
    {
        CHECK(lastProgress >= 0.0f);
    }
}

TEST_CASE("Scanner blacklist persistence", "[scanner]")
{
    PluginManager manager1;

    // Add a plugin to blacklist
    juce::String testPlugin = "/Library/Audio/Plug-Ins/Components/TestBadPlugin.component";
    manager1.addToBlacklist(testPlugin);

    REQUIRE(manager1.isBlacklisted(testPlugin));

    // Save the plugin list (which includes blacklist)
    manager1.savePluginList();

    // Create a new manager instance (should load the blacklist)
    PluginManager manager2;

    // The blacklist should persist
    CHECK(manager2.isBlacklisted(testPlugin));

    // Cleanup
    manager2.removeFromBlacklist(testPlugin);
    manager2.savePluginList();
}
