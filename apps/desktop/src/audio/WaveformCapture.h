#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <array>
#include <atomic>
#include <vector>

/**
 * Lock-free waveform capture for real-time audio visualization.
 *
 * Captures peak values from audio buffers in a ring buffer pattern.
 * Safe to call from the audio thread (pushPreSamples/pushPostSamples).
 * Safe to call from the UI thread (getSnapshot).
 *
 * Uses a shared write index so pre (input) and post (output) peaks are
 * always time-aligned in the ring buffer. Supports latency compensation
 * via a delay line on the pre signal.
 */
class WaveformCapture
{
public:
    static constexpr size_t NUM_PEAKS = 256;  // Number of peak values to store
    static constexpr int SAMPLES_PER_PEAK = 512;  // Samples averaged per peak
    static constexpr int MAX_DELAY_SAMPLES = 48000;  // Max 1 second at 48kHz

    // PHASE 3: Zero-allocation snapshot struct (returned by value, no heap allocation)
    struct PeakSnapshot
    {
        std::array<float, NUM_PEAKS> prePeaks;
        std::array<float, NUM_PEAKS> postPeaks;
    };

    WaveformCapture();
    ~WaveformCapture() = default;

    /** Set latency compensation in samples (delays the input to align with output) */
    void setLatencyCompensation(int samples);

    /** Call from audio thread BEFORE processing */
    void pushPreSamples(const juce::AudioBuffer<float>& buffer);

    /** Call from audio thread AFTER processing */
    void pushPostSamples(const juce::AudioBuffer<float>& buffer);

    /** PHASE 3: Get snapshot of both pre/post peaks (UI thread safe, no allocation) */
    PeakSnapshot getSnapshot() const;

    /** Reset capture state */
    void reset();

private:
    // Shared write index — both pre and post write to the same slot
    std::atomic<size_t> sharedWriteIndex{0};

    // Peak arrays (no per-buffer write index)
    std::array<std::atomic<float>, NUM_PEAKS> prePeaks;
    std::array<std::atomic<float>, NUM_PEAKS> postPeaks;

    // Shared sample accumulator — driven by pushPostSamples (the "clock")
    float preAccumulator = 0.0f;
    float postAccumulator = 0.0f;
    int sampleCount = 0;  // Single counter shared between pre and post

    // Delay line for latency compensation (stores peaks, not samples)
    static constexpr size_t MAX_DELAY_PEAKS = MAX_DELAY_SAMPLES / SAMPLES_PER_PEAK + 1;
    std::array<float, MAX_DELAY_PEAKS> delayLine;
    size_t delayWritePos = 0;
    size_t delayReadPos = 0;
    std::atomic<int> delayInPeaks{0};
    size_t peaksInDelayLine = 0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(WaveformCapture)
};
