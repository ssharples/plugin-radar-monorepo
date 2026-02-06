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
 * Safe to call from the UI thread (getPrePeaks/getPostPeaks).
 *
 * Supports latency compensation - the pre (input) signal can be delayed
 * to align with the post (output) signal when plugins introduce latency.
 */
class WaveformCapture
{
public:
    static constexpr size_t NUM_PEAKS = 256;  // Number of peak values to store
    static constexpr int SAMPLES_PER_PEAK = 512;  // Samples averaged per peak
    static constexpr int MAX_DELAY_SAMPLES = 48000;  // Max 1 second at 48kHz

    WaveformCapture();
    ~WaveformCapture() = default;

    /** Set latency compensation in samples (delays the input to align with output) */
    void setLatencyCompensation(int samples);

    /** Call from audio thread BEFORE processing */
    void pushPreSamples(const juce::AudioBuffer<float>& buffer);

    /** Call from audio thread AFTER processing */
    void pushPostSamples(const juce::AudioBuffer<float>& buffer);

    /** Get current pre-processing peak data (UI thread safe) */
    std::vector<float> getPrePeaks() const;

    /** Get current post-processing peak data (UI thread safe) */
    std::vector<float> getPostPeaks() const;

    /** Reset capture state */
    void reset();

private:
    // Ring buffer for peak values
    struct PeakBuffer
    {
        std::array<std::atomic<float>, NUM_PEAKS> peaks;
        std::atomic<size_t> writeIndex{0};

        // Accumulator for computing peaks
        std::atomic<float> accumulator{0.0f};
        std::atomic<int> sampleCount{0};

        PeakBuffer()
        {
            for (auto& p : peaks)
                p.store(0.0f, std::memory_order_relaxed);
        }

        void pushPeak(float peak)
        {
            // Update accumulator
            float currentAcc = accumulator.load(std::memory_order_relaxed);
            int currentCount = sampleCount.load(std::memory_order_relaxed);

            currentAcc = std::max(currentAcc, peak);
            currentCount += SAMPLES_PER_PEAK;  // We're receiving pre-computed peaks

            if (currentCount >= SAMPLES_PER_PEAK)
            {
                size_t idx = writeIndex.load(std::memory_order_relaxed);
                peaks[idx].store(currentAcc, std::memory_order_relaxed);
                writeIndex.store((idx + 1) % NUM_PEAKS, std::memory_order_release);
                accumulator.store(0.0f, std::memory_order_relaxed);
                sampleCount.store(0, std::memory_order_relaxed);
            }
            else
            {
                accumulator.store(currentAcc, std::memory_order_relaxed);
                sampleCount.store(currentCount, std::memory_order_relaxed);
            }
        }

        void pushSamples(const juce::AudioBuffer<float>& buffer)
        {
            // Compute peak of incoming buffer (across all channels)
            float peak = 0.0f;
            for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
            {
                auto range = juce::FloatVectorOperations::findMinAndMax(
                    buffer.getReadPointer(ch), buffer.getNumSamples());
                peak = std::max(peak, std::max(std::abs(range.getStart()), std::abs(range.getEnd())));
            }

            // Update accumulator
            float currentAcc = accumulator.load(std::memory_order_relaxed);
            int currentCount = sampleCount.load(std::memory_order_relaxed);

            currentAcc = std::max(currentAcc, peak);
            currentCount += buffer.getNumSamples();

            if (currentCount >= SAMPLES_PER_PEAK)
            {
                size_t idx = writeIndex.load(std::memory_order_relaxed);
                peaks[idx].store(currentAcc, std::memory_order_relaxed);
                writeIndex.store((idx + 1) % NUM_PEAKS, std::memory_order_release);
                accumulator.store(0.0f, std::memory_order_relaxed);
                sampleCount.store(0, std::memory_order_relaxed);
            }
            else
            {
                accumulator.store(currentAcc, std::memory_order_relaxed);
                sampleCount.store(currentCount, std::memory_order_relaxed);
            }
        }

        std::vector<float> getPeaks() const
        {
            std::vector<float> result(NUM_PEAKS);
            size_t writeIdx = writeIndex.load(std::memory_order_acquire);

            // Read from oldest to newest
            for (size_t i = 0; i < NUM_PEAKS; ++i)
            {
                size_t readIdx = (writeIdx + i) % NUM_PEAKS;
                result[i] = peaks[readIdx].load(std::memory_order_relaxed);
            }

            return result;
        }

        void reset()
        {
            for (auto& p : peaks)
                p.store(0.0f, std::memory_order_relaxed);
            writeIndex.store(0, std::memory_order_relaxed);
            accumulator.store(0.0f, std::memory_order_relaxed);
            sampleCount.store(0, std::memory_order_relaxed);
        }
    };

    // Delay line for latency compensation (stores peaks, not samples)
    static constexpr size_t MAX_DELAY_PEAKS = MAX_DELAY_SAMPLES / SAMPLES_PER_PEAK + 1;
    std::array<float, MAX_DELAY_PEAKS> delayLine;
    size_t delayWritePos = 0;
    size_t delayReadPos = 0;
    std::atomic<int> delayInPeaks{0};

    // Temporary accumulator for pre-samples before delay
    float preAccumulator = 0.0f;
    int preSampleCount = 0;

    PeakBuffer preBuffer;
    PeakBuffer postBuffer;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(WaveformCapture)
};
