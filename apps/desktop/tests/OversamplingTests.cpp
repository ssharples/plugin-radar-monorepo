#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include "PluginProcessor.h"

using Catch::Matchers::WithinAbs;

// =============================================================================
// Phase 4: Oversampling Tests
// =============================================================================

TEST_CASE("Oversampling: default state", "[oversampling]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    PluginChainManagerProcessor proc;

    REQUIRE(proc.getOversamplingFactor() == 0);
    REQUIRE(proc.isOversamplingEnabled() == false);
    REQUIRE_THAT(proc.getOversamplingLatencyMs(), WithinAbs(0.0f, 0.0001f));
}

TEST_CASE("Oversampling: factor clamping", "[oversampling]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    PluginChainManagerProcessor proc;
    proc.prepareToPlay(44100.0, 512);

    // Negative → 0
    proc.setOversamplingFactor(-1);
    REQUIRE(proc.getOversamplingFactor() == 0);
    REQUIRE(proc.isOversamplingEnabled() == false);

    // 0 → 0 (off)
    proc.setOversamplingFactor(0);
    REQUIRE(proc.getOversamplingFactor() == 0);
    REQUIRE(proc.isOversamplingEnabled() == false);

    // 1 → 1 (2x)
    proc.setOversamplingFactor(1);
    REQUIRE(proc.getOversamplingFactor() == 1);
    REQUIRE(proc.isOversamplingEnabled() == true);

    // 2 → 2 (4x)
    proc.setOversamplingFactor(2);
    REQUIRE(proc.getOversamplingFactor() == 2);
    REQUIRE(proc.isOversamplingEnabled() == true);

    // 3 → 2 (clamped to max)
    proc.setOversamplingFactor(3);
    REQUIRE(proc.getOversamplingFactor() == 2);

    // 100 → 2 (clamped to max)
    proc.setOversamplingFactor(100);
    REQUIRE(proc.getOversamplingFactor() == 2);
}

TEST_CASE("Oversampling: latency > 0 when active", "[oversampling]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    PluginChainManagerProcessor proc;
    proc.prepareToPlay(44100.0, 512);

    proc.setOversamplingFactor(1);  // 2x oversampling

    // Should report non-zero latency from the oversampling filter
    REQUIRE(proc.getOversamplingLatencyMs() > 0.0f);
}

TEST_CASE("Oversampling: latency 0 when disabled", "[oversampling]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    PluginChainManagerProcessor proc;
    proc.prepareToPlay(44100.0, 512);

    proc.setOversamplingFactor(0);

    REQUIRE_THAT(proc.getOversamplingLatencyMs(), WithinAbs(0.0f, 0.0001f));
}

TEST_CASE("Oversampling: state serialization includes factor", "[oversampling]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    juce::MemoryBlock savedState;
    {
        PluginChainManagerProcessor proc;
        proc.prepareToPlay(44100.0, 512);
        proc.setOversamplingFactor(2);  // 4x

        proc.getStateInformation(savedState);
    }

    REQUIRE(savedState.getSize() > 0);

    // Parse the saved XML to verify Oversampling element
    auto xml = juce::AudioProcessor::getXmlFromBinary(
        savedState.getData(), static_cast<int>(savedState.getSize()));
    REQUIRE(xml != nullptr);

    auto* osXml = xml->getChildByName("Oversampling");
    REQUIRE(osXml != nullptr);
    REQUIRE(osXml->getIntAttribute("factor") == 2);
}

TEST_CASE("Oversampling: state restoration", "[oversampling]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    juce::MemoryBlock savedState;
    {
        PluginChainManagerProcessor proc;
        proc.prepareToPlay(44100.0, 512);
        proc.setOversamplingFactor(2);  // 4x

        proc.getStateInformation(savedState);
    }

    // Restore into new processor
    {
        PluginChainManagerProcessor proc2;
        proc2.prepareToPlay(44100.0, 512);

        REQUIRE(proc2.getOversamplingFactor() == 0);  // Default

        proc2.setStateInformation(savedState.getData(),
                                    static_cast<int>(savedState.getSize()));

        REQUIRE(proc2.getOversamplingFactor() == 2);
        REQUIRE(proc2.isOversamplingEnabled() == true);
    }
}
