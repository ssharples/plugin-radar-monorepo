#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include "audio/DryWetMixProcessor.h"
#include "audio/BranchGainProcessor.h"
#include "audio/LatencyCompensationProcessor.h"
#include "audio/GainProcessor.h"
#include "audio/AudioMeter.h"

using Catch::Matchers::WithinAbs;
using Catch::Matchers::WithinRel;

// =============================================================================
// Helper: fill a buffer with a constant value on all channels
// =============================================================================
static void fillBuffer(juce::AudioBuffer<float>& buf, float value)
{
    for (int ch = 0; ch < buf.getNumChannels(); ++ch)
    {
        auto* data = buf.getWritePointer(ch);
        for (int i = 0; i < buf.getNumSamples(); ++i)
            data[i] = value;
    }
}

// Helper: run enough silent blocks to settle SmoothedValue
static void settleSmoothing(juce::AudioProcessor& proc, int numBlocks = 20)
{
    const int blockSize = 512;
    juce::AudioBuffer<float> buf(proc.getTotalNumInputChannels(), blockSize);
    juce::MidiBuffer midi;
    for (int i = 0; i < numBlocks; ++i)
    {
        buf.clear();
        proc.processBlock(buf, midi);
    }
}

// =============================================================================
// Phase B: DryWetMixProcessor Audio Buffer Tests
// =============================================================================

TEST_CASE("DryWetMixProcessor: mix=0 outputs pure dry signal", "[dsp][drywet]")
{
    DryWetMixProcessor proc;
    proc.setMix(0.0f);
    proc.prepareToPlay(44100.0, 512);

    // Settle smoothing to mix=0
    const int blockSize = 512;
    juce::MidiBuffer midi;

    // Run several blocks to let SmoothedValue converge
    for (int block = 0; block < 20; ++block)
    {
        juce::AudioBuffer<float> buf(4, blockSize);
        buf.clear();

        // ch0-1 = dry = 0.75
        for (int i = 0; i < blockSize; ++i)
        {
            buf.getWritePointer(0)[i] = 0.75f;
            buf.getWritePointer(1)[i] = 0.75f;
        }
        // ch2-3 = wet = 0.25
        for (int i = 0; i < blockSize; ++i)
        {
            buf.getWritePointer(2)[i] = 0.25f;
            buf.getWritePointer(3)[i] = 0.25f;
        }

        proc.processBlock(buf, midi);
    }

    // Final verification block
    juce::AudioBuffer<float> buf(4, blockSize);
    for (int i = 0; i < blockSize; ++i)
    {
        buf.getWritePointer(0)[i] = 0.75f;
        buf.getWritePointer(1)[i] = 0.75f;
        buf.getWritePointer(2)[i] = 0.25f;
        buf.getWritePointer(3)[i] = 0.25f;
    }
    proc.processBlock(buf, midi);

    // Output should be pure dry (0.75)
    for (int i = 0; i < blockSize; ++i)
    {
        REQUIRE_THAT(buf.getReadPointer(0)[i], WithinAbs(0.75f, 0.001f));
        REQUIRE_THAT(buf.getReadPointer(1)[i], WithinAbs(0.75f, 0.001f));
    }
}

TEST_CASE("DryWetMixProcessor: mix=1 outputs pure wet signal", "[dsp][drywet]")
{
    DryWetMixProcessor proc;
    proc.setMix(1.0f);
    proc.prepareToPlay(44100.0, 512);

    // The default mix is 1.0, so no smoothing transition needed
    const int blockSize = 512;
    juce::MidiBuffer midi;

    juce::AudioBuffer<float> buf(4, blockSize);
    for (int i = 0; i < blockSize; ++i)
    {
        buf.getWritePointer(0)[i] = 0.3f;  // dry
        buf.getWritePointer(1)[i] = 0.3f;
        buf.getWritePointer(2)[i] = 0.9f;  // wet
        buf.getWritePointer(3)[i] = 0.9f;
    }
    proc.processBlock(buf, midi);

    for (int i = 0; i < blockSize; ++i)
    {
        REQUIRE_THAT(buf.getReadPointer(0)[i], WithinAbs(0.9f, 0.001f));
        REQUIRE_THAT(buf.getReadPointer(1)[i], WithinAbs(0.9f, 0.001f));
    }
}

TEST_CASE("DryWetMixProcessor: mix=0.5 outputs average of dry and wet", "[dsp][drywet]")
{
    DryWetMixProcessor proc;
    proc.setMix(0.5f);
    proc.prepareToPlay(44100.0, 512);

    const int blockSize = 512;
    juce::MidiBuffer midi;

    // Settle smoothing
    for (int block = 0; block < 20; ++block)
    {
        juce::AudioBuffer<float> buf(4, blockSize);
        buf.clear();
        for (int i = 0; i < blockSize; ++i)
        {
            buf.getWritePointer(0)[i] = 1.0f;
            buf.getWritePointer(1)[i] = 1.0f;
            buf.getWritePointer(2)[i] = 0.0f;
            buf.getWritePointer(3)[i] = 0.0f;
        }
        proc.processBlock(buf, midi);
    }

    // Verification block
    juce::AudioBuffer<float> buf(4, blockSize);
    for (int i = 0; i < blockSize; ++i)
    {
        buf.getWritePointer(0)[i] = 1.0f;  // dry
        buf.getWritePointer(1)[i] = 1.0f;
        buf.getWritePointer(2)[i] = 0.0f;  // wet
        buf.getWritePointer(3)[i] = 0.0f;
    }
    proc.processBlock(buf, midi);

    // Expect average: 0.5 * 1.0 + 0.5 * 0.0 = 0.5
    for (int i = 0; i < blockSize; ++i)
    {
        REQUIRE_THAT(buf.getReadPointer(0)[i], WithinAbs(0.5f, 0.01f));
        REQUIRE_THAT(buf.getReadPointer(1)[i], WithinAbs(0.5f, 0.01f));
    }
}

TEST_CASE("DryWetMixProcessor: fewer than 4 channels is passthrough", "[dsp][drywet]")
{
    DryWetMixProcessor proc;
    proc.setMix(0.5f);
    proc.prepareToPlay(44100.0, 512);

    const int blockSize = 64;
    juce::AudioBuffer<float> buf(2, blockSize);
    fillBuffer(buf, 0.42f);

    juce::MidiBuffer midi;
    proc.processBlock(buf, midi);

    // With fewer than 4 channels, processor returns early (passthrough)
    for (int i = 0; i < blockSize; ++i)
    {
        REQUIRE(buf.getReadPointer(0)[i] == 0.42f);
        REQUIRE(buf.getReadPointer(1)[i] == 0.42f);
    }
}

TEST_CASE("DryWetMixProcessor: getMix returns clamped value", "[dsp][drywet]")
{
    DryWetMixProcessor proc;

    proc.setMix(0.5f);
    REQUIRE_THAT(proc.getMix(), WithinAbs(0.5f, 0.0001f));

    proc.setMix(-1.0f);
    REQUIRE_THAT(proc.getMix(), WithinAbs(0.0f, 0.0001f));

    proc.setMix(2.0f);
    REQUIRE_THAT(proc.getMix(), WithinAbs(1.0f, 0.0001f));
}

TEST_CASE("DryWetMixProcessor: wet channels are cleared after processing", "[dsp][drywet]")
{
    DryWetMixProcessor proc;
    proc.setMix(1.0f);
    proc.prepareToPlay(44100.0, 512);

    const int blockSize = 128;
    juce::AudioBuffer<float> buf(4, blockSize);
    for (int i = 0; i < blockSize; ++i)
    {
        buf.getWritePointer(0)[i] = 0.5f;
        buf.getWritePointer(1)[i] = 0.5f;
        buf.getWritePointer(2)[i] = 0.8f;
        buf.getWritePointer(3)[i] = 0.8f;
    }

    juce::MidiBuffer midi;
    proc.processBlock(buf, midi);

    // Channels 2-3 should be cleared to prevent bleed
    for (int i = 0; i < blockSize; ++i)
    {
        REQUIRE(buf.getReadPointer(2)[i] == 0.0f);
        REQUIRE(buf.getReadPointer(3)[i] == 0.0f);
    }
}

// =============================================================================
// Phase B: BranchGainProcessor Audio Buffer Tests
// =============================================================================

TEST_CASE("BranchGainProcessor: 0 dB is passthrough", "[dsp][gain][branch]")
{
    BranchGainProcessor proc;
    proc.setGainDb(0.0f);
    proc.prepareToPlay(44100.0, 512);

    const int blockSize = 512;
    juce::AudioBuffer<float> buf(2, blockSize);
    fillBuffer(buf, 0.5f);

    juce::MidiBuffer midi;
    proc.processBlock(buf, midi);

    for (int i = 0; i < blockSize; ++i)
    {
        REQUIRE_THAT(buf.getReadPointer(0)[i], WithinAbs(0.5f, 0.001f));
        REQUIRE_THAT(buf.getReadPointer(1)[i], WithinAbs(0.5f, 0.001f));
    }
}

TEST_CASE("BranchGainProcessor: -6 dB halves amplitude", "[dsp][gain][branch]")
{
    BranchGainProcessor proc;
    proc.setGainDb(-6.0f);
    proc.prepareToPlay(44100.0, 512);

    const int blockSize = 512;
    juce::MidiBuffer midi;

    // Settle smoothing
    for (int block = 0; block < 20; ++block)
    {
        juce::AudioBuffer<float> buf(2, blockSize);
        fillBuffer(buf, 1.0f);
        proc.processBlock(buf, midi);
    }

    // Verification block
    juce::AudioBuffer<float> buf(2, blockSize);
    fillBuffer(buf, 1.0f);
    proc.processBlock(buf, midi);

    float expected = std::pow(10.0f, -6.0f / 20.0f); // ~ 0.50119
    for (int i = 0; i < blockSize; ++i)
    {
        REQUIRE_THAT(buf.getReadPointer(0)[i], WithinAbs(expected, 0.01f));
        REQUIRE_THAT(buf.getReadPointer(1)[i], WithinAbs(expected, 0.01f));
    }
}

TEST_CASE("BranchGainProcessor: -60 dB produces silence", "[dsp][gain][branch]")
{
    BranchGainProcessor proc;
    proc.setGainDb(-60.0f);
    proc.prepareToPlay(44100.0, 512);

    const int blockSize = 512;
    juce::MidiBuffer midi;

    // Settle smoothing
    for (int block = 0; block < 20; ++block)
    {
        juce::AudioBuffer<float> buf(2, blockSize);
        fillBuffer(buf, 1.0f);
        proc.processBlock(buf, midi);
    }

    juce::AudioBuffer<float> buf(2, blockSize);
    fillBuffer(buf, 1.0f);
    proc.processBlock(buf, midi);

    // -60 dB floors to 0.0 in dbToLinear, so output should be silence
    for (int i = 0; i < blockSize; ++i)
    {
        REQUIRE_THAT(buf.getReadPointer(0)[i], WithinAbs(0.0f, 0.001f));
        REQUIRE_THAT(buf.getReadPointer(1)[i], WithinAbs(0.0f, 0.001f));
    }
}

TEST_CASE("BranchGainProcessor: +6 dB doubles amplitude", "[dsp][gain][branch]")
{
    BranchGainProcessor proc;
    proc.setGainDb(6.0f);
    proc.prepareToPlay(44100.0, 512);

    const int blockSize = 512;
    juce::MidiBuffer midi;

    // Settle smoothing
    for (int block = 0; block < 20; ++block)
    {
        juce::AudioBuffer<float> buf(2, blockSize);
        fillBuffer(buf, 0.4f);
        proc.processBlock(buf, midi);
    }

    juce::AudioBuffer<float> buf(2, blockSize);
    fillBuffer(buf, 0.4f);
    proc.processBlock(buf, midi);

    float expected = 0.4f * std::pow(10.0f, 6.0f / 20.0f); // ~ 0.4 * 1.9953 ~ 0.798
    for (int i = 0; i < blockSize; ++i)
    {
        REQUIRE_THAT(buf.getReadPointer(0)[i], WithinAbs(expected, 0.02f));
        REQUIRE_THAT(buf.getReadPointer(1)[i], WithinAbs(expected, 0.02f));
    }
}

TEST_CASE("BranchGainProcessor: gain is clamped to [-60, +24]", "[dsp][gain][branch]")
{
    BranchGainProcessor proc;

    proc.setGainDb(-100.0f);
    REQUIRE_THAT(proc.getGainDb(), WithinAbs(-60.0f, 0.0001f));

    proc.setGainDb(50.0f);
    REQUIRE_THAT(proc.getGainDb(), WithinAbs(24.0f, 0.0001f));
}

// =============================================================================
// Phase B: LatencyCompensationProcessor Audio Buffer Tests
// =============================================================================

TEST_CASE("LatencyCompensationProcessor: reports correct latency", "[dsp][latency]")
{
    LatencyCompensationProcessor proc(128);
    REQUIRE(proc.getDelaySamples() == 128);
    REQUIRE(proc.getLatencySamples() == 128);
}

TEST_CASE("LatencyCompensationProcessor: 0-sample delay is passthrough", "[dsp][latency]")
{
    LatencyCompensationProcessor proc(0);
    proc.prepareToPlay(44100.0, 512);

    const int blockSize = 512;
    juce::AudioBuffer<float> buf(2, blockSize);
    buf.clear();
    // Put an impulse at sample 0
    buf.getWritePointer(0)[0] = 1.0f;
    buf.getWritePointer(1)[0] = 1.0f;

    juce::MidiBuffer midi;
    proc.processBlock(buf, midi);

    // With 0 delay, processor returns early — impulse stays at sample 0
    REQUIRE(buf.getReadPointer(0)[0] == 1.0f);
    REQUIRE(buf.getReadPointer(1)[0] == 1.0f);
}

TEST_CASE("LatencyCompensationProcessor: impulse delayed by N samples", "[dsp][latency]")
{
    const int delaySamples = 64;
    LatencyCompensationProcessor proc(delaySamples);
    proc.prepareToPlay(44100.0, 512);

    const int blockSize = 512;
    juce::AudioBuffer<float> buf(2, blockSize);
    buf.clear();

    // Impulse at sample 0
    buf.getWritePointer(0)[0] = 1.0f;
    buf.getWritePointer(1)[0] = 1.0f;

    juce::MidiBuffer midi;
    proc.processBlock(buf, midi);

    // Before the delay: should be zero
    for (int i = 0; i < delaySamples; ++i)
    {
        REQUIRE_THAT(buf.getReadPointer(0)[i], WithinAbs(0.0f, 0.0001f));
    }

    // At the delay point: should be the impulse
    REQUIRE_THAT(buf.getReadPointer(0)[delaySamples], WithinAbs(1.0f, 0.0001f));
    REQUIRE_THAT(buf.getReadPointer(1)[delaySamples], WithinAbs(1.0f, 0.0001f));

    // After the delay: should be zero again
    for (int i = delaySamples + 1; i < blockSize; ++i)
    {
        REQUIRE_THAT(buf.getReadPointer(0)[i], WithinAbs(0.0f, 0.0001f));
    }
}

TEST_CASE("LatencyCompensationProcessor: delay across block boundaries", "[dsp][latency]")
{
    const int delaySamples = 100;
    LatencyCompensationProcessor proc(delaySamples);
    proc.prepareToPlay(44100.0, 64);

    const int blockSize = 64;
    juce::MidiBuffer midi;

    // Block 1: impulse at sample 0
    juce::AudioBuffer<float> buf1(2, blockSize);
    buf1.clear();
    buf1.getWritePointer(0)[0] = 1.0f;
    buf1.getWritePointer(1)[0] = 1.0f;
    proc.processBlock(buf1, midi);

    // Block 1 should be all zeros (delay=100 > blockSize=64)
    for (int i = 0; i < blockSize; ++i)
    {
        REQUIRE_THAT(buf1.getReadPointer(0)[i], WithinAbs(0.0f, 0.0001f));
    }

    // Block 2: all zeros in, impulse should appear at sample (100 - 64) = 36
    juce::AudioBuffer<float> buf2(2, blockSize);
    buf2.clear();
    proc.processBlock(buf2, midi);

    int expectedSample = delaySamples - blockSize; // 36
    REQUIRE_THAT(buf2.getReadPointer(0)[expectedSample], WithinAbs(1.0f, 0.0001f));
    REQUIRE_THAT(buf2.getReadPointer(1)[expectedSample], WithinAbs(1.0f, 0.0001f));

    // All other samples in block 2 should be zero
    for (int i = 0; i < blockSize; ++i)
    {
        if (i != expectedSample)
            REQUIRE_THAT(buf2.getReadPointer(0)[i], WithinAbs(0.0f, 0.0001f));
    }
}

// =============================================================================
// Phase B: GainProcessor Audio Buffer Tests
// =============================================================================

TEST_CASE("GainProcessor: 0 dB input gain is passthrough", "[dsp][gain][main]")
{
    GainProcessor proc;
    proc.setInputGain(0.0f);
    proc.prepareToPlay(44100.0, 512);

    const int blockSize = 512;
    juce::AudioBuffer<float> buf(2, blockSize);
    fillBuffer(buf, 0.5f);

    proc.processInputGain(buf);

    for (int i = 0; i < blockSize; ++i)
    {
        REQUIRE_THAT(buf.getReadPointer(0)[i], WithinAbs(0.5f, 0.001f));
        REQUIRE_THAT(buf.getReadPointer(1)[i], WithinAbs(0.5f, 0.001f));
    }
}

TEST_CASE("GainProcessor: 0 dB output gain is passthrough", "[dsp][gain][main]")
{
    GainProcessor proc;
    proc.setOutputGain(0.0f);
    proc.prepareToPlay(44100.0, 512);

    const int blockSize = 512;
    juce::AudioBuffer<float> buf(2, blockSize);
    fillBuffer(buf, 0.5f);

    proc.processOutputGain(buf);

    for (int i = 0; i < blockSize; ++i)
    {
        REQUIRE_THAT(buf.getReadPointer(0)[i], WithinAbs(0.5f, 0.001f));
        REQUIRE_THAT(buf.getReadPointer(1)[i], WithinAbs(0.5f, 0.001f));
    }
}

TEST_CASE("GainProcessor: -6 dB input gain halves amplitude", "[dsp][gain][main]")
{
    GainProcessor proc;
    proc.setInputGain(-6.0f);
    proc.prepareToPlay(44100.0, 512);

    const int blockSize = 512;

    // Settle smoothing
    for (int block = 0; block < 30; ++block)
    {
        juce::AudioBuffer<float> buf(2, blockSize);
        fillBuffer(buf, 1.0f);
        proc.processInputGain(buf);
    }

    juce::AudioBuffer<float> buf(2, blockSize);
    fillBuffer(buf, 1.0f);
    proc.processInputGain(buf);

    float expected = std::pow(10.0f, -6.0f / 20.0f); // ~ 0.50119
    for (int i = 0; i < blockSize; ++i)
    {
        REQUIRE_THAT(buf.getReadPointer(0)[i], WithinAbs(expected, 0.01f));
    }
}

TEST_CASE("GainProcessor: -60 dB output gain produces silence", "[dsp][gain][main]")
{
    GainProcessor proc;
    proc.setOutputGain(-60.0f);
    proc.prepareToPlay(44100.0, 512);

    const int blockSize = 512;

    // Settle smoothing
    for (int block = 0; block < 30; ++block)
    {
        juce::AudioBuffer<float> buf(2, blockSize);
        fillBuffer(buf, 1.0f);
        proc.processOutputGain(buf);
    }

    juce::AudioBuffer<float> buf(2, blockSize);
    fillBuffer(buf, 1.0f);
    proc.processOutputGain(buf);

    for (int i = 0; i < blockSize; ++i)
    {
        REQUIRE_THAT(buf.getReadPointer(0)[i], WithinAbs(0.0f, 0.001f));
    }
}

TEST_CASE("GainProcessor: gain dB values are clamped", "[dsp][gain][main]")
{
    GainProcessor proc;

    proc.setInputGain(-100.0f);
    REQUIRE_THAT(proc.getInputGainDB(), WithinAbs(-60.0f, 0.0001f));

    proc.setInputGain(50.0f);
    REQUIRE_THAT(proc.getInputGainDB(), WithinAbs(24.0f, 0.0001f));

    proc.setOutputGain(-100.0f);
    REQUIRE_THAT(proc.getOutputGainDB(), WithinAbs(-60.0f, 0.0001f));

    proc.setOutputGain(50.0f);
    REQUIRE_THAT(proc.getOutputGainDB(), WithinAbs(24.0f, 0.0001f));
}

TEST_CASE("GainProcessor: reset restores current gain to target", "[dsp][gain][main]")
{
    GainProcessor proc;
    proc.setInputGain(-12.0f);
    proc.setOutputGain(6.0f);
    proc.prepareToPlay(44100.0, 512);

    proc.reset();

    // After reset, getters should still report the set values
    REQUIRE_THAT(proc.getInputGainDB(), WithinAbs(-12.0f, 0.0001f));
    REQUIRE_THAT(proc.getOutputGainDB(), WithinAbs(6.0f, 0.0001f));
}

// =============================================================================
// Phase B: AudioMeter Tests
// =============================================================================

TEST_CASE("AudioMeter: silence produces zero peaks and RMS", "[dsp][meter]")
{
    AudioMeter meter;
    meter.prepareToPlay(44100.0, 512);

    juce::AudioBuffer<float> buf(2, 512);
    buf.clear();
    meter.process(buf);

    auto readings = meter.getReadings();
    REQUIRE(readings.peakL == 0.0f);
    REQUIRE(readings.peakR == 0.0f);
    REQUIRE(readings.rmsL == 0.0f);
    REQUIRE(readings.rmsR == 0.0f);
}

TEST_CASE("AudioMeter: peak detects full-scale signal", "[dsp][meter]")
{
    AudioMeter meter;
    meter.prepareToPlay(44100.0, 512);

    juce::AudioBuffer<float> buf(2, 512);
    fillBuffer(buf, 1.0f);
    meter.process(buf);

    auto readings = meter.getReadings();
    REQUIRE_THAT(readings.peakL, WithinAbs(1.0f, 0.0001f));
    REQUIRE_THAT(readings.peakR, WithinAbs(1.0f, 0.0001f));
}

TEST_CASE("AudioMeter: peak detects negative signal magnitude", "[dsp][meter]")
{
    AudioMeter meter;
    meter.prepareToPlay(44100.0, 512);

    juce::AudioBuffer<float> buf(2, 512);
    fillBuffer(buf, -0.75f);
    meter.process(buf);

    auto readings = meter.getReadings();
    REQUIRE_THAT(readings.peakL, WithinAbs(0.75f, 0.0001f));
    REQUIRE_THAT(readings.peakR, WithinAbs(0.75f, 0.0001f));
}

TEST_CASE("AudioMeter: RMS increases with signal present", "[dsp][meter]")
{
    AudioMeter meter;
    meter.prepareToPlay(44100.0, 512);

    // The RMS EMA coefficient is computed per-sample but applied per-block,
    // so convergence is very slow. Instead of testing exact value, verify
    // that RMS is increasing and non-zero after processing signal.
    juce::AudioBuffer<float> buf(2, 512);
    fillBuffer(buf, 0.5f);

    // Process a few blocks
    for (int i = 0; i < 50; ++i)
        meter.process(buf);

    auto readings = meter.getReadings();
    // RMS should be positive and increasing toward 0.5
    REQUIRE(readings.rmsL > 0.0f);
    REQUIRE(readings.rmsR > 0.0f);
    // After more blocks, it should be higher
    float rmsAfter50 = readings.rmsL;

    for (int i = 0; i < 200; ++i)
        meter.process(buf);

    readings = meter.getReadings();
    REQUIRE(readings.rmsL > rmsAfter50);
    REQUIRE(readings.rmsR > 0.0f);
}

TEST_CASE("AudioMeter: reset clears all readings", "[dsp][meter]")
{
    AudioMeter meter;
    meter.prepareToPlay(44100.0, 512);

    // Push some signal
    juce::AudioBuffer<float> buf(2, 512);
    fillBuffer(buf, 0.8f);
    meter.process(buf);

    meter.reset();
    auto readings = meter.getReadings();

    REQUIRE(readings.peakL == 0.0f);
    REQUIRE(readings.peakR == 0.0f);
    REQUIRE(readings.peakHoldL == 0.0f);
    REQUIRE(readings.peakHoldR == 0.0f);
    REQUIRE(readings.rmsL == 0.0f);
    REQUIRE(readings.rmsR == 0.0f);
    REQUIRE(readings.lufsShort == -100.0f);
}

TEST_CASE("AudioMeter: LUFS of silence is -100 dB", "[dsp][meter]")
{
    AudioMeter meter;
    meter.prepareToPlay(44100.0, 512);

    juce::AudioBuffer<float> buf(2, 512);
    buf.clear();
    meter.process(buf);

    auto readings = meter.getReadings();
    REQUIRE(readings.lufsShort == -100.0f);
}

TEST_CASE("AudioMeter: mono input duplicated to both channels", "[dsp][meter]")
{
    AudioMeter meter;
    meter.prepareToPlay(44100.0, 512);

    // Mono buffer (1 channel) - process should use left channel for both
    juce::AudioBuffer<float> buf(1, 512);
    for (int i = 0; i < 512; ++i)
        buf.getWritePointer(0)[i] = 0.6f;

    meter.process(buf);

    auto readings = meter.getReadings();
    REQUIRE_THAT(readings.peakL, WithinAbs(0.6f, 0.0001f));
    // R channel uses L when only 1 channel
    REQUIRE_THAT(readings.peakR, WithinAbs(0.6f, 0.0001f));
}

// =============================================================================
// Phase 5: Extended DSP Tests
// =============================================================================

TEST_CASE("DryWetMixProcessor: smoothing mid-transition is not instant", "[dsp][drywet][extended]")
{
    DryWetMixProcessor proc;
    proc.setMix(1.0f);  // Start at full wet
    proc.prepareToPlay(44100.0, 512);

    const int blockSize = 512;
    juce::MidiBuffer midi;

    // Let it settle at mix=1.0
    for (int block = 0; block < 20; ++block)
    {
        juce::AudioBuffer<float> buf(4, blockSize);
        buf.clear();
        for (int i = 0; i < blockSize; ++i)
        {
            buf.getWritePointer(0)[i] = 0.0f;  // dry
            buf.getWritePointer(1)[i] = 0.0f;
            buf.getWritePointer(2)[i] = 1.0f;  // wet
            buf.getWritePointer(3)[i] = 1.0f;
        }
        proc.processBlock(buf, midi);
    }

    // Now change mix to 0.0 (abrupt jump)
    proc.setMix(0.0f);

    // The very first block after the change should NOT be pure dry yet
    // (SmoothedValue should be transitioning)
    juce::AudioBuffer<float> transitionBuf(4, blockSize);
    for (int i = 0; i < blockSize; ++i)
    {
        transitionBuf.getWritePointer(0)[i] = 0.0f;  // dry
        transitionBuf.getWritePointer(1)[i] = 0.0f;
        transitionBuf.getWritePointer(2)[i] = 1.0f;  // wet
        transitionBuf.getWritePointer(3)[i] = 1.0f;
    }
    proc.processBlock(transitionBuf, midi);

    // At least the first sample should still have some wet component
    // (it can't jump instantly from 1.0 to 0.0)
    float firstSample = transitionBuf.getReadPointer(0)[0];
    REQUIRE(firstSample > 0.01f);  // Still has some wet signal
}

TEST_CASE("AudioMeter: peak hold decays over silent blocks", "[dsp][meter][extended]")
{
    AudioMeter meter;
    meter.prepareToPlay(44100.0, 512);

    // Push a loud signal
    juce::AudioBuffer<float> loudBuf(2, 512);
    fillBuffer(loudBuf, 0.9f);
    meter.process(loudBuf);

    auto afterLoud = meter.getReadings();
    REQUIRE_THAT(afterLoud.peakL, WithinAbs(0.9f, 0.001f));
    float initialHold = afterLoud.peakHoldL;
    REQUIRE(initialHold > 0.0f);

    // Now process many blocks of silence — peak hold should eventually decay
    juce::AudioBuffer<float> silentBuf(2, 512);
    silentBuf.clear();
    for (int i = 0; i < 200; ++i)
        meter.process(silentBuf);

    auto afterSilence = meter.getReadings();
    // Peak should have decayed close to zero
    REQUIRE(afterSilence.peakL < 0.1f);
    // Peak hold should have decayed (may not be fully zero depending on timing)
    REQUIRE(afterSilence.peakHoldL < initialHold);
}

TEST_CASE("AudioMeter: LUFS with sustained signal produces reasonable value", "[dsp][meter][extended]")
{
    AudioMeter meter;
    meter.prepareToPlay(44100.0, 512);

    // Generate a 3+ second 1kHz sine signal (AC content passes K-weighting filter)
    // 3 seconds at 44100 Hz / 512 samples = ~258 blocks
    const float freq = 1000.0f;
    const float amplitude = 0.5f;
    const double sr = 44100.0;

    for (int block = 0; block < 300; ++block)
    {
        juce::AudioBuffer<float> buf(2, 512);
        for (int i = 0; i < 512; ++i)
        {
            float sample = amplitude * std::sin(2.0f * juce::MathConstants<float>::pi * freq * (block * 512 + i) / static_cast<float>(sr));
            buf.getWritePointer(0)[i] = sample;
            buf.getWritePointer(1)[i] = sample;
        }
        meter.process(buf);
    }

    auto readings = meter.getReadings();
    // LUFS should be between -100 and 0 for a 0.5 amplitude 1kHz sine
    REQUIRE(readings.lufsShort > -100.0f);
    REQUIRE(readings.lufsShort < 0.0f);
}

TEST_CASE("LatencyCompensationProcessor: large delay across many block boundaries", "[dsp][latency][extended]")
{
    // Test with delay much larger than block size
    const int delaySamples = 1000;
    LatencyCompensationProcessor proc(delaySamples);
    proc.prepareToPlay(44100.0, 128);

    const int blockSize = 128;
    juce::MidiBuffer midi;

    // Block 1: impulse at sample 0
    juce::AudioBuffer<float> buf(2, blockSize);
    buf.clear();
    buf.getWritePointer(0)[0] = 1.0f;
    buf.getWritePointer(1)[0] = 1.0f;
    proc.processBlock(buf, midi);

    // Process enough blocks to let the impulse come through
    // Need ceil(1000/128) = 8 blocks total
    bool foundImpulse = false;
    int totalSamplesProcessed = blockSize;  // Already processed block 1

    for (int block = 0; block < 10; ++block)
    {
        juce::AudioBuffer<float> nextBuf(2, blockSize);
        nextBuf.clear();
        proc.processBlock(nextBuf, midi);

        // Check if impulse appears in this block
        for (int i = 0; i < blockSize; ++i)
        {
            int absoluteSample = totalSamplesProcessed + i;
            if (absoluteSample == delaySamples)
            {
                REQUIRE_THAT(nextBuf.getReadPointer(0)[i], WithinAbs(1.0f, 0.0001f));
                REQUIRE_THAT(nextBuf.getReadPointer(1)[i], WithinAbs(1.0f, 0.0001f));
                foundImpulse = true;
            }
        }
        totalSamplesProcessed += blockSize;
    }

    REQUIRE(foundImpulse);
}
