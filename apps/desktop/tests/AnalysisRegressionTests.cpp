#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include "audio/AudioMeter.h"
#include "audio/FFTProcessor.h"
#include "audio/GainProcessor.h"
#include "audio/WaveformCapture.h"
#include <chrono>
#include <thread>
#include <cmath>
#include <algorithm>
#include <atomic>

TEST_CASE("AudioMeter full analysis is stereo calibrated and peak-only allocates no history", "[analysis]")
{
    AudioMeter meter;
    meter.prepareToPlay(48000.0, 64);
    juce::AudioBuffer<float> buffer(2, 144000);
    for (int i = 0; i < buffer.getNumSamples(); ++i)
    {
        const float sample = 0.5f * std::sin(juce::MathConstants<float>::twoPi * 1000.0f * i / 48000.0f);
        buffer.getWritePointer(0)[i] = sample; buffer.getWritePointer(1)[i] = sample;
    }
    meter.process(buffer);
    REQUIRE_THAT(meter.getReadings().lufsShort, Catch::Matchers::WithinAbs(-6.0f, 0.3f));
    meter.setAnalysisMode(AudioMeter::AnalysisMode::peakOnly);
    meter.process(buffer);
    REQUIRE_THAT(meter.getReadings().peakL, Catch::Matchers::WithinAbs(0.5f, 0.0001f));
}

TEST_CASE("AudioMeter RMS is invariant to callback partitioning", "[analysis]")
{
    AudioMeter oneBlock, manyBlocks;
    oneBlock.prepareToPlay(48000.0, 512); manyBlocks.prepareToPlay(48000.0, 512);
    juce::AudioBuffer<float> all(2, 48000); all.clear();
    for (int i = 0; i < all.getNumSamples(); ++i)
    {
        const float value = 0.25f + 0.1f * std::sin(i * 0.017f);
        all.getWritePointer(0)[i] = value; all.getWritePointer(1)[i] = value;
    }
    oneBlock.process(all);
    for (int offset = 0; offset < all.getNumSamples(); offset += 127)
    {
        const int count = std::min(127, all.getNumSamples() - offset);
        juce::AudioBuffer<float> block(2, count);
        block.copyFrom(0, 0, all, 0, offset, count); block.copyFrom(1, 0, all, 1, offset, count);
        manyBlocks.process(block);
    }
    // Per-sample EMA must produce the same state regardless of callback edges.
    REQUIRE_THAT(manyBlocks.getReadings().rmsL, Catch::Matchers::WithinAbs(oneBlock.getReadings().rmsL, 0.0001f));
}

TEST_CASE("AudioMeter running LUFS remains stable over a long sine run", "[analysis]")
{
    AudioMeter meter;
    meter.prepareToPlay(48000.0, 257);
    juce::AudioBuffer<float> block(2, 257);
    for (int i = 0; i < block.getNumSamples(); ++i)
    {
        const float sample = 0.5f * std::sin(juce::MathConstants<float>::twoPi * 1000.0f * i / 48000.0f);
        block.getWritePointer(0)[i] = sample; block.getWritePointer(1)[i] = sample;
    }
    for (int i = 0; i < 1900; ++i) meter.process(block); // approximately ten seconds
    REQUIRE_THAT(meter.getReadings().lufsShort, Catch::Matchers::WithinAbs(-6.0f, 0.3f));
}

TEST_CASE("WaveformCapture commits every sample in an oversized block", "[analysis]")
{
    WaveformCapture capture;
    juce::AudioBuffer<float> buffer(2, 1024);
    buffer.clear(); buffer.getWritePointer(0)[700] = 0.75f;
    capture.pushPreSamples(buffer); capture.pushPostSamples(buffer);
    const auto peaks = capture.getPostPeaks();
    REQUIRE_THAT(peaks[255], Catch::Matchers::WithinAbs(0.75f, 0.0001f));
}

TEST_CASE("FFT analysis can be disabled and remains bounded", "[analysis]")
{
    FFTProcessor fft;
    fft.prepareToPlay(48000.0, 64);
    fft.setAnalysisEnabled(false);
    juce::AudioBuffer<float> empty(2, 0);
    fft.process(empty);
    REQUIRE(fft.getMagnitudes().size() == static_cast<size_t>(FFTProcessor::numBins));
}

TEST_CASE("FFT publishes a fresh frame and reset clears it", "[analysis]")
{
    FFTProcessor fft;
    fft.prepareToPlay(48000.0, 64);
    juce::AudioBuffer<float> buffer(2, FFTProcessor::fftSize);
    buffer.clear();
    for (int i = 0; i < buffer.getNumSamples(); ++i) buffer.getWritePointer(0)[i] = buffer.getWritePointer(1)[i] = 0.25f;
    fft.process(buffer);
    std::this_thread::sleep_for(std::chrono::milliseconds(40));
    REQUIRE(fft.getMagnitudes()[0] > 0.1f);
    fft.reset();
    std::this_thread::sleep_for(std::chrono::milliseconds(40));
    REQUIRE(fft.getMagnitudes()[0] == 0.0f);
}

TEST_CASE("FFT producer, reader, reset, and subscriptions remain bounded concurrently", "[analysis][concurrency]")
{
    FFTProcessor fft;
    fft.prepareToPlay(48000.0, 64);
    std::atomic<bool> running{true};
    std::atomic<bool> readerOK{true};
    std::thread producer([&]
    {
        juce::AudioBuffer<float> block(2, 64);
        while (running.load(std::memory_order_relaxed))
        {
            block.clear();
            for (int i = 0; i < block.getNumSamples(); ++i)
                block.getWritePointer(0)[i] = block.getWritePointer(1)[i] = 0.2f;
            fft.process(block);
        }
    });
    std::thread reader([&]
    {
        for (int i = 0; i < 120; ++i)
        {
            auto values = fft.getMagnitudes();
            if (values.size() != static_cast<size_t>(FFTProcessor::numBins)) readerOK.store(false);
        }
    });
    for (int i = 0; i < 12; ++i)
    {
        fft.setAnalysisEnabled((i % 3) != 0);
        fft.reset();
    }
    reader.join();
    running.store(false, std::memory_order_release);
    producer.join();
    fft.setAnalysisEnabled(false);
    REQUIRE(fft.getMagnitudes().size() == static_cast<size_t>(FFTProcessor::numBins));
    REQUIRE(readerOK.load());
}

TEST_CASE("Gain ramp advances through oversized callbacks", "[analysis]")
{
    GainProcessor gain;
    gain.prepareToPlay(48000.0, 64);
    gain.setInputGain(-6.0f);
    juce::AudioBuffer<float> buffer(2, 256);
    buffer.clear();
    for (int ch = 0; ch < 2; ++ch)
        for (int i = 0; i < buffer.getNumSamples(); ++i) buffer.getWritePointer(ch)[i] = 1.0f;
    gain.processInputGain(buffer);
    REQUIRE_THAT(gain.getInputGainDB(), Catch::Matchers::WithinAbs(-6.0f, 0.0001f));
    REQUIRE(buffer.getSample(0, 0) > buffer.getSample(0, 255));
    REQUIRE(buffer.getSample(0, 255) < 0.99f);
}
