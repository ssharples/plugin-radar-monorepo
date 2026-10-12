#include <catch2/catch_test_macros.hpp>
#include "core/ScannerUtils.h"

using namespace ScannerUtils;

// =============================================================================
// Exit Code Classification
// =============================================================================

TEST_CASE("classifyExitCode: exit 0 returns None (success)", "[scanner][exit-code]")
{
    REQUIRE(classifyExitCode(0) == ScanFailureReason::None);
}

TEST_CASE("classifyExitCode: exit 1 returns ScanFailure (likely unlicensed)", "[scanner][exit-code]")
{
    REQUIRE(classifyExitCode(1) == ScanFailureReason::ScanFailure);
}

TEST_CASE("classifyExitCode: exit 2 returns Crash (exception caught)", "[scanner][exit-code]")
{
    REQUIRE(classifyExitCode(2) == ScanFailureReason::Crash);
}

TEST_CASE("classifyExitCode: exit 3+ returns Crash", "[scanner][exit-code]")
{
    REQUIRE(classifyExitCode(3) == ScanFailureReason::Crash);
    REQUIRE(classifyExitCode(42) == ScanFailureReason::Crash);
    REQUIRE(classifyExitCode(127) == ScanFailureReason::Crash);
}

TEST_CASE("classifyExitCode: exit 129 (SIGHUP) returns Crash", "[scanner][exit-code]")
{
    REQUIRE(classifyExitCode(129) == ScanFailureReason::Crash);
}

TEST_CASE("classifyExitCode: exit 134 (SIGABRT) returns Crash", "[scanner][exit-code]")
{
    REQUIRE(classifyExitCode(134) == ScanFailureReason::Crash);
}

TEST_CASE("classifyExitCode: exit 139 (SIGSEGV) returns Crash", "[scanner][exit-code]")
{
    REQUIRE(classifyExitCode(139) == ScanFailureReason::Crash);
}

TEST_CASE("classifyExitCode: exit 137 (SIGKILL) returns Crash", "[scanner][exit-code]")
{
    REQUIRE(classifyExitCode(137) == ScanFailureReason::Crash);
}

TEST_CASE("classifyExitCode: negative exit code returns Crash (signal on some platforms)", "[scanner][exit-code]")
{
    REQUIRE(classifyExitCode(-1) == ScanFailureReason::Crash);
    REQUIRE(classifyExitCode(-11) == ScanFailureReason::Crash);  // SIGSEGV on some systems
    REQUIRE(classifyExitCode(-9) == ScanFailureReason::Crash);   // SIGKILL on some systems
}

// =============================================================================
// Scanner Output Parsing
// =============================================================================

TEST_CASE("parseScannerOutput: single plugin success", "[scanner][parse]")
{
    juce::String output =
        "SCAN_SUCCESS:1\n"
        "PLUGIN_START\n"
        "name=ProQ 3\n"
        "descriptiveName=FabFilter Pro-Q 3\n"
        "pluginFormatName=AudioUnit\n"
        "category=EQ\n"
        "manufacturerName=FabFilter\n"
        "version=3.20\n"
        "fileOrIdentifier=/Library/Audio/Plug-Ins/Components/FabFilter Pro-Q 3.component\n"
        "uniqueId=12345\n"
        "isInstrument=0\n"
        "numInputChannels=2\n"
        "numOutputChannels=2\n"
        "PLUGIN_END\n";

    auto result = parseScannerOutput(output);

    REQUIRE(result.success == true);
    REQUIRE(result.plugins.size() == 1);
    REQUIRE(result.plugins[0].name == juce::String("ProQ 3"));
    REQUIRE(result.plugins[0].manufacturerName == juce::String("FabFilter"));
    REQUIRE(result.plugins[0].pluginFormatName == juce::String("AudioUnit"));
    REQUIRE(result.plugins[0].category == juce::String("EQ"));
    REQUIRE(result.plugins[0].version == juce::String("3.20"));
    REQUIRE(result.plugins[0].uniqueId == 12345);
    REQUIRE(result.plugins[0].isInstrument == false);
    REQUIRE(result.plugins[0].numInputChannels == 2);
    REQUIRE(result.plugins[0].numOutputChannels == 2);
}

TEST_CASE("parseScannerOutput: multiple plugins", "[scanner][parse]")
{
    juce::String output =
        "SCAN_SUCCESS:2\n"
        "PLUGIN_START\n"
        "name=Plugin A\n"
        "manufacturerName=Vendor A\n"
        "PLUGIN_END\n"
        "PLUGIN_START\n"
        "name=Plugin B\n"
        "manufacturerName=Vendor B\n"
        "isInstrument=1\n"
        "PLUGIN_END\n";

    auto result = parseScannerOutput(output);

    REQUIRE(result.success == true);
    REQUIRE(result.plugins.size() == 2);
    REQUIRE(result.plugins[0].name == juce::String("Plugin A"));
    REQUIRE(result.plugins[0].manufacturerName == juce::String("Vendor A"));
    REQUIRE(result.plugins[1].name == juce::String("Plugin B"));
    REQUIRE(result.plugins[1].manufacturerName == juce::String("Vendor B"));
    REQUIRE(result.plugins[1].isInstrument == true);
}

TEST_CASE("parseScannerOutput: SCAN_FAILED returns failure immediately", "[scanner][parse]")
{
    juce::String output = "SCAN_FAILED:No plugins found\n";

    auto result = parseScannerOutput(output);

    REQUIRE(result.success == false);
    REQUIRE(result.plugins.empty());
}

TEST_CASE("parseScannerOutput: SCAN_FAILED with exception", "[scanner][parse]")
{
    juce::String output = "SCAN_FAILED:Exception\n";

    auto result = parseScannerOutput(output);

    REQUIRE(result.success == false);
    REQUIRE(result.plugins.empty());
}

TEST_CASE("parseScannerOutput: empty output returns failure", "[scanner][parse]")
{
    auto result = parseScannerOutput("");

    REQUIRE(result.success == false);
    REQUIRE(result.plugins.empty());
}

TEST_CASE("parseScannerOutput: SCAN_SUCCESS with no plugins returns success with empty list", "[scanner][parse]")
{
    juce::String output = "SCAN_SUCCESS:0\n";

    auto result = parseScannerOutput(output);

    REQUIRE(result.success == true);
    REQUIRE(result.plugins.empty());
}

TEST_CASE("parseScannerOutput: ignores non-key-value lines inside PLUGIN_START block", "[scanner][parse]")
{
    juce::String output =
        "SCAN_SUCCESS:1\n"
        "PLUGIN_START\n"
        "name=TestPlugin\n"
        "some random debug line without equals\n"
        "manufacturerName=TestVendor\n"
        "PLUGIN_END\n";

    auto result = parseScannerOutput(output);

    REQUIRE(result.success == true);
    REQUIRE(result.plugins.size() == 1);
    REQUIRE(result.plugins[0].name == juce::String("TestPlugin"));
    REQUIRE(result.plugins[0].manufacturerName == juce::String("TestVendor"));
}

TEST_CASE("parseScannerOutput: handles values containing equals signs", "[scanner][parse]")
{
    juce::String output =
        "SCAN_SUCCESS:1\n"
        "PLUGIN_START\n"
        "name=My Plugin = Special Edition\n"
        "manufacturerName=Vendor\n"
        "PLUGIN_END\n";

    auto result = parseScannerOutput(output);

    REQUIRE(result.success == true);
    REQUIRE(result.plugins.size() == 1);
    // fromFirstOccurrenceOf("=", false, false) returns everything after first "="
    REQUIRE(result.plugins[0].name == juce::String("My Plugin = Special Edition"));
}

TEST_CASE("parseScannerOutput: handles instrument flag", "[scanner][parse]")
{
    juce::String output =
        "SCAN_SUCCESS:1\n"
        "PLUGIN_START\n"
        "name=Synth\n"
        "isInstrument=1\n"
        "PLUGIN_END\n";

    auto result = parseScannerOutput(output);

    REQUIRE(result.plugins[0].isInstrument == true);
}

TEST_CASE("parseScannerOutput: integer fields parse correctly", "[scanner][parse]")
{
    juce::String output =
        "SCAN_SUCCESS:1\n"
        "PLUGIN_START\n"
        "name=MultiCh\n"
        "uniqueId=98765\n"
        "numInputChannels=4\n"
        "numOutputChannels=8\n"
        "PLUGIN_END\n";

    auto result = parseScannerOutput(output);

    REQUIRE(result.plugins[0].uniqueId == 98765);
    REQUIRE(result.plugins[0].numInputChannels == 4);
    REQUIRE(result.plugins[0].numOutputChannels == 8);
}

// =============================================================================
// Failure Reason to String Conversion
// =============================================================================

TEST_CASE("failureReasonToString: Crash", "[scanner][reason-string]")
{
    REQUIRE(failureReasonToString(ScanFailureReason::Crash) == juce::String("crash"));
}

TEST_CASE("failureReasonToString: ScanFailure", "[scanner][reason-string]")
{
    REQUIRE(failureReasonToString(ScanFailureReason::ScanFailure) == juce::String("scan-failure"));
}

TEST_CASE("failureReasonToString: Timeout", "[scanner][reason-string]")
{
    REQUIRE(failureReasonToString(ScanFailureReason::Timeout) == juce::String("timeout"));
}

TEST_CASE("failureReasonToString: None", "[scanner][reason-string]")
{
    REQUIRE(failureReasonToString(ScanFailureReason::None) == juce::String("none"));
}
