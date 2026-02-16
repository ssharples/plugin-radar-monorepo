#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_dsp/juce_dsp.h>
#include <atomic>
#include <array>
#include <vector>

/**
 * FFTProcessor - Lock-free FFT spectrum analysis for real-time visualization
 *
 * Audio thread pushes samples into a FIFO. When full, a Hann window is applied
 * and the FFT is computed. Results are stored in a double-buffer with an atomic
 * swap flag so the UI thread can read stable magnitude data without locking.
 *
 * Thread safety:
 * - process() is called from the audio thread only
 * - getMagnitudes() is safe to call from any thread (UI timer callback)
 * - prepareToPlay()/reset() are called from the message thread before audio starts
 */
class FFTProcessor
{
public:
    static constexpr int fftOrder = 11;                          // 2^11 = 2048
    static constexpr int fftSize = 1 << fftOrder;               // 2048 points
    static constexpr int numBins = fftSize / 2;                 // 1024 positive-frequency bins

    FFTProcessor();
    ~FFTProcessor() = default;

    void prepareToPlay(double sampleRate, int samplesPerBlock);
    void reset();

    /** Call from audio thread. Accepts stereo buffer, downmixes to mono for FFT. */
    void process(const juce::AudioBuffer<float>& buffer);

    /**
     * Thread-safe getter for UI. Returns magnitude spectrum reference (numBins values).
     * Range is linear magnitudes (frontend converts to dB).
     * The caller receives the most recently completed FFT frame.
     */
    const std::array<float, numBins>& getMagnitudes() const;

    /** Returns the number of output bins (numBins = fftSize/2). */
    int getNumBins() const { return numBins; }

    /** Returns the sample rate used for frequency calculations. */
    double getSampleRate() const { return currentSampleRate; }

    /** Enable/disable FFT processing. When disabled, process() returns immediately
     *  and getMagnitudes() returns the last computed frame (frozen spectrum). */
    void setEnabled(bool e) { enabled.store(e, std::memory_order_relaxed); }
    bool isEnabled() const { return enabled.load(std::memory_order_relaxed); }

private:
    juce::dsp::FFT forwardFFT;
    juce::dsp::WindowingFunction<float> windowFunction;

    // FIFO for collecting samples on the audio thread (ring buffer)
    std::array<float, fftSize> fifo;
    int writePos = 0;
    int samplesInFifo = 0;

    // FFT working buffer (2x size for real-only forward transform)
    std::array<float, fftSize * 2> fftWorkBuffer;

    // Double-buffer for magnitude data: audio thread writes to writeBuffer,
    // UI thread reads from the other buffer
    std::array<float, numBins> magnitudeBufferA;
    std::array<float, numBins> magnitudeBufferB;

    // 0 = A is the readable buffer, B is writable
    // 1 = B is the readable buffer, A is writable
    std::atomic<int> activeReadBuffer{0};

    // Flag: set by audio thread when new data is written, cleared by swap
    std::atomic<bool> newDataReady{false};

    double currentSampleRate = 44100.0;

    std::atomic<bool> enabled{true};

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(FFTProcessor)
};
