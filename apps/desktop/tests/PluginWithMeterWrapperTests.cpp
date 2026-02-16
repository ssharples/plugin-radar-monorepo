#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include "audio/PluginWithMeterWrapper.h"
#include "TestHelpers.h"

using Catch::Matchers::WithinAbs;

// =============================================================================
// Phase 2: PluginWithMeterWrapper Tests
// =============================================================================

TEST_CASE("PluginWithMeterWrapper: null plugin construction", "[wrapper]")
{
    // Construct with nullptr — should not crash
    PluginWithMeterWrapper wrapper(nullptr);

    REQUIRE(wrapper.getWrappedPlugin() == nullptr);
    REQUIRE(wrapper.getName() == "PluginWithMeterWrapper");
    REQUIRE(wrapper.hasEditor() == false);
    REQUIRE(wrapper.acceptsMidi() == false);
    REQUIRE(wrapper.producesMidi() == false);
    REQUIRE(wrapper.getNumPrograms() == 1);
    REQUIRE(wrapper.getCurrentProgram() == 0);
}

TEST_CASE("PluginWithMeterWrapper: valid plugin construction", "[wrapper]")
{
    auto mock = std::make_unique<MockPluginInstance>("TestEQ", 2, 2, 0, 1.0f);
    auto* rawMock = mock.get();

    PluginWithMeterWrapper wrapper(std::move(mock));

    REQUIRE(wrapper.getWrappedPlugin() == rawMock);
    REQUIRE(wrapper.getName() == "TestEQ");
}

TEST_CASE("PluginWithMeterWrapper: sidechain plugin bus layout sync", "[wrapper]")
{
    // Create a 4-in/2-out mock (simulates sidechain plugin like Pro-L 2)
    auto mock = std::make_unique<MockPluginInstance>("Pro-L 2", 4, 2, 0, 1.0f);

    PluginWithMeterWrapper wrapper(std::move(mock));

    // The wrapper should have synced the bus layout from the wrapped plugin
    REQUIRE(wrapper.getTotalNumInputChannels() >= 2);
    REQUIRE(wrapper.getTotalNumOutputChannels() >= 2);
}

TEST_CASE("PluginWithMeterWrapper: processBlock input metering", "[wrapper]")
{
    auto mock = std::make_unique<MockPluginInstance>("Passthrough", 2, 2, 0, 1.0f);
    PluginWithMeterWrapper wrapper(std::move(mock));

    wrapper.prepareToPlay(44100.0, 512);

    juce::AudioBuffer<float> buf(2, 512);
    fillTestBuffer(buf, 0.75f);
    juce::MidiBuffer midi;

    wrapper.processBlock(buf, midi);

    auto inputReadings = wrapper.getInputMeter().getReadings();
    REQUIRE_THAT(inputReadings.peakL, WithinAbs(0.75f, 0.01f));
    REQUIRE_THAT(inputReadings.peakR, WithinAbs(0.75f, 0.01f));
}

TEST_CASE("PluginWithMeterWrapper: processBlock output metering", "[wrapper]")
{
    // Mock with gain=0.5 so output differs from input
    auto mock = std::make_unique<MockPluginInstance>("HalfGain", 2, 2, 0, 0.5f);
    PluginWithMeterWrapper wrapper(std::move(mock));

    wrapper.prepareToPlay(44100.0, 512);

    juce::AudioBuffer<float> buf(2, 512);
    fillTestBuffer(buf, 0.8f);
    juce::MidiBuffer midi;

    wrapper.processBlock(buf, midi);

    auto outputReadings = wrapper.getOutputMeter().getReadings();
    // Output should be 0.8 * 0.5 = 0.4
    REQUIRE_THAT(outputReadings.peakL, WithinAbs(0.4f, 0.01f));
    REQUIRE_THAT(outputReadings.peakR, WithinAbs(0.4f, 0.01f));
}

TEST_CASE("PluginWithMeterWrapper: processBlock empty buffer", "[wrapper]")
{
    auto mock = std::make_unique<MockPluginInstance>("TestPlugin");
    auto* rawMock = mock.get();
    PluginWithMeterWrapper wrapper(std::move(mock));

    wrapper.prepareToPlay(44100.0, 512);

    // 0 samples — should early return without crash
    juce::AudioBuffer<float> emptyBuf(2, 0);
    juce::MidiBuffer midi;

    wrapper.processBlock(emptyBuf, midi);

    // processBlock on the mock should NOT have been called (early return)
    REQUIRE(rawMock->processBlockCallCount == 0);
}

TEST_CASE("PluginWithMeterWrapper: sidechain expansion (2ch -> 4ch)", "[wrapper]")
{
    // Mock expects 4 input channels (sidechain plugin)
    auto mock = std::make_unique<MockPluginInstance>("SC Plugin", 4, 2, 0, 1.0f);
    auto* rawMock = mock.get();
    PluginWithMeterWrapper wrapper(std::move(mock));

    wrapper.prepareToPlay(44100.0, 512);

    // Provide only 2-channel buffer (graph allocates stereo)
    juce::AudioBuffer<float> buf(2, 512);
    fillTestBuffer(buf, 0.6f);
    juce::MidiBuffer midi;

    wrapper.processBlock(buf, midi);

    // Plugin should have been called (expansion handled internally)
    REQUIRE(rawMock->processBlockCallCount == 1);

    // Output should be copied back to the 2-channel buffer
    for (int i = 0; i < 512; ++i)
    {
        REQUIRE_THAT(buf.getReadPointer(0)[i], WithinAbs(0.6f, 0.01f));
        REQUIRE_THAT(buf.getReadPointer(1)[i], WithinAbs(0.6f, 0.01f));
    }
}

TEST_CASE("PluginWithMeterWrapper: sidechain expansion with SC buffer", "[wrapper]")
{
    auto mock = std::make_unique<MockPluginInstance>("SC Plugin", 4, 2, 0, 1.0f);
    PluginWithMeterWrapper wrapper(std::move(mock));

    wrapper.prepareToPlay(44100.0, 512);

    // Set sidechain buffer with known signal
    juce::AudioBuffer<float> scBuf(2, 512);
    fillTestBuffer(scBuf, 0.3f);
    wrapper.setSidechainBuffer(&scBuf);

    juce::AudioBuffer<float> buf(2, 512);
    fillTestBuffer(buf, 0.6f);
    juce::MidiBuffer midi;

    // Should not crash and should process correctly
    wrapper.processBlock(buf, midi);

    // Clear sidechain buffer after use
    wrapper.setSidechainBuffer(nullptr);
}

TEST_CASE("PluginWithMeterWrapper: getStateInformation delegates", "[wrapper]")
{
    auto mock = std::make_unique<MockPluginInstance>("StatefulPlugin");
    PluginWithMeterWrapper wrapper(std::move(mock));

    juce::MemoryBlock destData;
    wrapper.getStateInformation(destData);

    // Should contain the mock's state pattern
    juce::String stateStr = juce::String::fromUTF8(
        static_cast<const char*>(destData.getData()),
        static_cast<int>(destData.getSize()));
    REQUIRE(stateStr.contains("MOCK_STATE_StatefulPlugin"));
}

TEST_CASE("PluginWithMeterWrapper: setStateInformation delegates", "[wrapper]")
{
    auto mock = std::make_unique<MockPluginInstance>("StatefulPlugin");
    auto* rawMock = mock.get();
    PluginWithMeterWrapper wrapper(std::move(mock));

    juce::String testData = "test_restore_data";
    wrapper.setStateInformation(testData.toRawUTF8(),
                                 static_cast<int>(testData.getNumBytesAsUTF8()));

    REQUIRE(rawMock->stateRestoreCount == 1);
    REQUIRE(rawMock->lastRestoredState == "test_restore_data");
}

TEST_CASE("PluginWithMeterWrapper: state ops with null plugin", "[wrapper]")
{
    PluginWithMeterWrapper wrapper(nullptr);

    // getStateInformation with null plugin should not crash
    juce::MemoryBlock destData;
    wrapper.getStateInformation(destData);
    REQUIRE(destData.getSize() == 0);

    // setStateInformation with null plugin should not crash
    juce::String testData = "test";
    wrapper.setStateInformation(testData.toRawUTF8(),
                                 static_cast<int>(testData.getNumBytesAsUTF8()));
}

TEST_CASE("PluginWithMeterWrapper: latency change detection", "[wrapper]")
{
    auto mock = std::make_unique<MockPluginInstance>("LatencyPlugin", 2, 2, 100, 1.0f);
    auto* rawMock = mock.get();
    PluginWithMeterWrapper wrapper(std::move(mock));

    wrapper.prepareToPlay(44100.0, 512);

    // Initially no latency change
    REQUIRE(wrapper.hasLatencyChanged() == false);

    // Change mock's latency during processBlock simulation
    rawMock->setMockLatency(200);

    juce::AudioBuffer<float> buf(2, 512);
    fillTestBuffer(buf, 0.5f);
    juce::MidiBuffer midi;
    wrapper.processBlock(buf, midi);

    // Wrapper should have detected the change
    REQUIRE(wrapper.hasLatencyChanged() == true);

    // Acknowledge and verify reset
    wrapper.acknowledgeLatencyChange();
    REQUIRE(wrapper.hasLatencyChanged() == false);
}

TEST_CASE("PluginWithMeterWrapper: prepareToPlay forwards latency", "[wrapper]")
{
    auto mock = std::make_unique<MockPluginInstance>("LatencyPlugin", 2, 2, 256, 1.0f);
    PluginWithMeterWrapper wrapper(std::move(mock));

    wrapper.prepareToPlay(44100.0, 512);

    // Wrapper should report the wrapped plugin's latency
    REQUIRE(wrapper.getLatencySamples() == 256);
}
