#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include "PluginProcessor.h"

using Catch::Matchers::WithinAbs;

// =============================================================================
// PluginProcessor Lifecycle Tests
//
// These tests exercise the exact sequences that Ableton Live performs when
// loading, restoring, and running the plugin. The goal is to catch crashes
// that only manifest inside a DAW host.
// =============================================================================

TEST_CASE("Processor: construction does not crash", "[lifecycle]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    // Just constructing the processor should not crash
    PluginChainManagerProcessor proc;

    REQUIRE(proc.getName().isNotEmpty());
    REQUIRE(proc.getNumPrograms() >= 1);
}

TEST_CASE("Processor: prepareToPlay after construction", "[lifecycle]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    PluginChainManagerProcessor proc;
    proc.prepareToPlay(44100.0, 512);

    REQUIRE(proc.getLatencySamples() >= 0);
}

TEST_CASE("Processor: processBlock after prepareToPlay (empty chain)", "[lifecycle]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    PluginChainManagerProcessor proc;
    proc.prepareToPlay(44100.0, 512);

    juce::AudioBuffer<float> buffer(2, 512);
    buffer.clear();
    juce::MidiBuffer midi;

    // Should not crash on empty chain
    proc.processBlock(buffer, midi);
}

TEST_CASE("Processor: multiple processBlock calls", "[lifecycle]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    PluginChainManagerProcessor proc;
    proc.prepareToPlay(44100.0, 512);

    juce::AudioBuffer<float> buffer(2, 512);
    juce::MidiBuffer midi;

    for (int i = 0; i < 100; ++i)
    {
        buffer.clear();
        proc.processBlock(buffer, midi);
    }
}

TEST_CASE("Processor: getStateInformation on fresh instance", "[lifecycle]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    PluginChainManagerProcessor proc;
    proc.prepareToPlay(44100.0, 512);

    juce::MemoryBlock state;
    proc.getStateInformation(state);

    REQUIRE(state.getSize() > 0);
}

TEST_CASE("Processor: setStateInformation roundtrip", "[lifecycle]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    juce::MemoryBlock savedState;
    {
        PluginChainManagerProcessor proc1;
        proc1.prepareToPlay(44100.0, 512);
        proc1.getStateInformation(savedState);
    }

    // Restore into new processor (Ableton's reload flow)
    {
        PluginChainManagerProcessor proc2;
        proc2.prepareToPlay(44100.0, 512);
        proc2.setStateInformation(savedState.getData(),
                                   static_cast<int>(savedState.getSize()));

        // Should still be functional after restore
        juce::AudioBuffer<float> buffer(2, 512);
        buffer.clear();
        juce::MidiBuffer midi;
        proc2.processBlock(buffer, midi);
    }
}

TEST_CASE("Processor: setStateInformation BEFORE prepareToPlay", "[lifecycle][critical]")
{
    // Ableton sometimes calls setStateInformation before prepareToPlay
    // (e.g., during project load or track freeze/unfreeze)
    juce::ScopedJuceInitialiser_GUI juceInit;

    juce::MemoryBlock savedState;
    {
        PluginChainManagerProcessor proc1;
        proc1.prepareToPlay(44100.0, 512);
        proc1.getStateInformation(savedState);
    }

    {
        PluginChainManagerProcessor proc2;

        // Restore state BEFORE calling prepareToPlay
        proc2.setStateInformation(savedState.getData(),
                                   static_cast<int>(savedState.getSize()));

        // Now prepare (Ableton calls this after setStateInformation in some flows)
        proc2.prepareToPlay(44100.0, 512);

        // Should work after the reversed order
        juce::AudioBuffer<float> buffer(2, 512);
        buffer.clear();
        juce::MidiBuffer midi;
        proc2.processBlock(buffer, midi);
    }
}

TEST_CASE("Processor: isBusesLayoutSupported stereo", "[lifecycle]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    PluginChainManagerProcessor proc;

    juce::AudioProcessor::BusesLayout stereoLayout;
    stereoLayout.inputBuses.add(juce::AudioChannelSet::stereo());
    stereoLayout.outputBuses.add(juce::AudioChannelSet::stereo());

    REQUIRE(proc.isBusesLayoutSupported(stereoLayout) == true);
}

TEST_CASE("Processor: isBusesLayoutSupported with sidechain", "[lifecycle]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    PluginChainManagerProcessor proc;

    juce::AudioProcessor::BusesLayout scLayout;
    scLayout.inputBuses.add(juce::AudioChannelSet::stereo());
    scLayout.inputBuses.add(juce::AudioChannelSet::stereo());  // Sidechain
    scLayout.outputBuses.add(juce::AudioChannelSet::stereo());

    REQUIRE(proc.isBusesLayoutSupported(scLayout) == true);
}

TEST_CASE("Processor: processBlock with 4-channel buffer (sidechain)", "[lifecycle]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    PluginChainManagerProcessor proc;

    // Enable sidechain bus
    juce::AudioProcessor::BusesLayout scLayout;
    scLayout.inputBuses.add(juce::AudioChannelSet::stereo());
    scLayout.inputBuses.add(juce::AudioChannelSet::stereo());
    scLayout.outputBuses.add(juce::AudioChannelSet::stereo());
    proc.setBusesLayout(scLayout);

    proc.prepareToPlay(44100.0, 512);

    // 4-channel buffer: ch0-1 = main, ch2-3 = sidechain
    juce::AudioBuffer<float> buffer(4, 512);
    buffer.clear();
    juce::MidiBuffer midi;

    // Should not crash with sidechain channels present
    proc.processBlock(buffer, midi);
}

TEST_CASE("Processor: releaseResources then re-prepare", "[lifecycle]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    PluginChainManagerProcessor proc;
    proc.prepareToPlay(44100.0, 512);

    juce::AudioBuffer<float> buffer(2, 512);
    buffer.clear();
    juce::MidiBuffer midi;
    proc.processBlock(buffer, midi);

    proc.releaseResources();

    // Re-prepare at different rate (DAW sample rate change)
    proc.prepareToPlay(48000.0, 256);

    buffer.setSize(2, 256);
    buffer.clear();
    proc.processBlock(buffer, midi);
}

// =============================================================================
// Oversampling processBlock paths
// =============================================================================

TEST_CASE("Processor: processBlock with oversampling enabled", "[lifecycle][oversampling]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    PluginChainManagerProcessor proc;
    proc.prepareToPlay(44100.0, 512);

    // Enable 2x oversampling
    proc.setOversamplingFactor(1);
    REQUIRE(proc.isOversamplingEnabled() == true);

    juce::AudioBuffer<float> buffer(2, 512);
    buffer.clear();
    juce::MidiBuffer midi;

    // The oversampling processBlock path uses channelPtrs[2] — must not crash
    proc.processBlock(buffer, midi);
}

TEST_CASE("Processor: processBlock with 4x oversampling", "[lifecycle][oversampling]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    PluginChainManagerProcessor proc;
    proc.prepareToPlay(44100.0, 512);

    proc.setOversamplingFactor(2);  // 4x
    REQUIRE(proc.isOversamplingEnabled() == true);

    juce::AudioBuffer<float> buffer(2, 512);
    buffer.clear();
    juce::MidiBuffer midi;

    proc.processBlock(buffer, midi);
}

TEST_CASE("Processor: oversampling toggle during processing", "[lifecycle][oversampling]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    PluginChainManagerProcessor proc;
    proc.prepareToPlay(44100.0, 512);

    juce::AudioBuffer<float> buffer(2, 512);
    juce::MidiBuffer midi;

    // Process without oversampling
    buffer.clear();
    proc.processBlock(buffer, midi);

    // Enable oversampling mid-stream
    proc.setOversamplingFactor(1);
    buffer.clear();
    proc.processBlock(buffer, midi);

    // Disable again
    proc.setOversamplingFactor(0);
    buffer.clear();
    proc.processBlock(buffer, midi);
}

TEST_CASE("Processor: oversampling state restore then processBlock", "[lifecycle][oversampling]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    // Save state with oversampling
    juce::MemoryBlock savedState;
    {
        PluginChainManagerProcessor proc1;
        proc1.prepareToPlay(44100.0, 512);
        proc1.setOversamplingFactor(2);  // 4x
        proc1.getStateInformation(savedState);
    }

    // Restore and process
    {
        PluginChainManagerProcessor proc2;
        proc2.prepareToPlay(44100.0, 512);
        proc2.setStateInformation(savedState.getData(),
                                   static_cast<int>(savedState.getSize()));

        REQUIRE(proc2.getOversamplingFactor() == 2);

        juce::AudioBuffer<float> buffer(2, 512);
        buffer.clear();
        juce::MidiBuffer midi;
        proc2.processBlock(buffer, midi);
    }
}

// =============================================================================
// Dry/Wet and Delay Line safety
// =============================================================================

TEST_CASE("Processor: dry delay line handles zero latency", "[lifecycle]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    PluginChainManagerProcessor proc;
    proc.prepareToPlay(44100.0, 512);

    // With empty chain, latency should be 0
    REQUIRE(proc.getLatencySamples() == 0);

    // processBlock should skip delay processing (currentChainLatency == 0)
    juce::AudioBuffer<float> buffer(2, 512);
    for (int ch = 0; ch < 2; ++ch)
        for (int i = 0; i < 512; ++i)
            buffer.getWritePointer(ch)[i] = 0.5f;

    juce::MidiBuffer midi;
    proc.processBlock(buffer, midi);
}

// =============================================================================
// Destruction safety
// =============================================================================

TEST_CASE("Processor: destruction after prepareToPlay", "[lifecycle]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    auto proc = std::make_unique<PluginChainManagerProcessor>();
    proc->prepareToPlay(44100.0, 512);

    juce::AudioBuffer<float> buffer(2, 512);
    buffer.clear();
    juce::MidiBuffer midi;
    proc->processBlock(buffer, midi);

    // Should not crash on destruction
    proc.reset();
}

TEST_CASE("Processor: destruction without prepareToPlay", "[lifecycle]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    // Construct and immediately destroy — should not crash
    auto proc = std::make_unique<PluginChainManagerProcessor>();
    proc.reset();
}

TEST_CASE("Processor: multiple instances", "[lifecycle]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    // Multiple instances in same process (like multiple tracks in Ableton)
    PluginChainManagerProcessor proc1;
    PluginChainManagerProcessor proc2;

    proc1.prepareToPlay(44100.0, 512);
    proc2.prepareToPlay(48000.0, 256);

    juce::AudioBuffer<float> buf1(2, 512);
    juce::AudioBuffer<float> buf2(2, 256);
    juce::MidiBuffer midi;

    buf1.clear();
    proc1.processBlock(buf1, midi);

    buf2.clear();
    proc2.processBlock(buf2, midi);

    // Each should have a unique instance ID
    REQUIRE(proc1.getInstanceId() != proc2.getInstanceId());
}
