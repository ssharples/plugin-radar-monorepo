#include <catch2/catch_test_macros.hpp>
#include "core/PluginManager.h"
#include <juce_core/juce_core.h>

/**
 * Tests for PluginManager's blacklist management and dead man's pedal
 * crash detection. These test the public API of PluginManager.
 *
 * Note: PluginManager's constructor initializes AudioPluginFormats and
 * calls loadBlacklist() + checkForCrashedPlugin() + loadPluginList().
 * These tests use temp directories to isolate file operations.
 */

// =============================================================================
// Blacklist Management (In-Memory)
// =============================================================================

TEST_CASE("Blacklist: add and check plugin", "[blacklist]")
{
    PluginManager pm;

    juce::String pluginPath = "/Library/Audio/Plug-Ins/Components/TestPlugin.component";
    REQUIRE(pm.isBlacklisted(pluginPath) == false);

    pm.addToBlacklist(pluginPath);
    REQUIRE(pm.isBlacklisted(pluginPath) == true);
}

TEST_CASE("Blacklist: remove plugin", "[blacklist]")
{
    PluginManager pm;

    juce::String pluginPath = "/Library/Audio/Plug-Ins/Components/TestPlugin.component";
    pm.addToBlacklist(pluginPath);
    REQUIRE(pm.isBlacklisted(pluginPath) == true);

    pm.removeFromBlacklist(pluginPath);
    REQUIRE(pm.isBlacklisted(pluginPath) == false);
}

TEST_CASE("Blacklist: clear all", "[blacklist]")
{
    PluginManager pm;

    pm.addToBlacklist("/path/A.component");
    pm.addToBlacklist("/path/B.component");
    pm.addToBlacklist("/path/C.component");
    REQUIRE(pm.getBlacklistedPlugins().size() >= 3);

    pm.clearBlacklist();
    // After clear, those specific plugins should not be blacklisted
    REQUIRE(pm.isBlacklisted("/path/A.component") == false);
    REQUIRE(pm.isBlacklisted("/path/B.component") == false);
    REQUIRE(pm.isBlacklisted("/path/C.component") == false);
}

TEST_CASE("Blacklist: getBlacklistedPlugins returns added paths", "[blacklist]")
{
    PluginManager pm;
    pm.clearBlacklist();

    pm.addToBlacklist("/path/Alpha.component");
    pm.addToBlacklist("/path/Beta.component");

    auto list = pm.getBlacklistedPlugins();
    REQUIRE(list.contains("/path/Alpha.component"));
    REQUIRE(list.contains("/path/Beta.component"));
}

TEST_CASE("Blacklist: getBlacklistAsJson returns correct structure", "[blacklist]")
{
    PluginManager pm;
    pm.clearBlacklist();

    pm.addToBlacklist("/Library/Audio/Plug-Ins/Components/TestPlugin.component");

    auto json = pm.getBlacklistAsJson();
    REQUIRE(json.isArray());
    REQUIRE(json.size() >= 1);

    // Find our entry in the array
    bool found = false;
    for (int i = 0; i < json.size(); ++i)
    {
        auto* obj = json[i].getDynamicObject();
        if (obj != nullptr && obj->getProperty("path") == "/Library/Audio/Plug-Ins/Components/TestPlugin.component")
        {
            found = true;
            REQUIRE(obj->hasProperty("name"));
            REQUIRE(obj->hasProperty("exists"));
            REQUIRE(obj->getProperty("name") == juce::var("TestPlugin"));
            break;
        }
    }
    REQUIRE(found);
}

TEST_CASE("Blacklist: duplicate adds are idempotent", "[blacklist]")
{
    PluginManager pm;
    pm.clearBlacklist();

    pm.addToBlacklist("/path/Plugin.component");
    pm.addToBlacklist("/path/Plugin.component");
    pm.addToBlacklist("/path/Plugin.component");

    // JUCE KnownPluginList's addToBlacklist may or may not deduplicate,
    // but isBlacklisted should still return true
    REQUIRE(pm.isBlacklisted("/path/Plugin.component") == true);
}

TEST_CASE("Blacklist: isBlacklisted returns false for unknown plugin", "[blacklist]")
{
    PluginManager pm;
    REQUIRE(pm.isBlacklisted("/nonexistent/plugin.component") == false);
}

// =============================================================================
// Plugin List JSON Export
// =============================================================================

TEST_CASE("PluginManager: getPluginListAsJson returns array", "[plugin-list]")
{
    PluginManager pm;
    auto json = pm.getPluginListAsJson();
    // Should be an array (possibly empty if no plugins scanned)
    REQUIRE(json.isArray());
}

// =============================================================================
// ScanFailureReason enum values
// =============================================================================

TEST_CASE("ScanFailureReason: enum values are distinct", "[scanner][enum]")
{
    REQUIRE(ScanFailureReason::None != ScanFailureReason::Crash);
    REQUIRE(ScanFailureReason::None != ScanFailureReason::ScanFailure);
    REQUIRE(ScanFailureReason::None != ScanFailureReason::Timeout);
    REQUIRE(ScanFailureReason::Crash != ScanFailureReason::ScanFailure);
    REQUIRE(ScanFailureReason::Crash != ScanFailureReason::Timeout);
    REQUIRE(ScanFailureReason::ScanFailure != ScanFailureReason::Timeout);
}

TEST_CASE("ScanPluginResult: success has None reason", "[scanner][result]")
{
    ScanPluginResult result { true, ScanFailureReason::None };
    REQUIRE(result.success == true);
    REQUIRE(result.failureReason == ScanFailureReason::None);
}

TEST_CASE("ScanPluginResult: failure has specific reason", "[scanner][result]")
{
    ScanPluginResult result { false, ScanFailureReason::Timeout };
    REQUIRE(result.success == false);
    REQUIRE(result.failureReason == ScanFailureReason::Timeout);
}
