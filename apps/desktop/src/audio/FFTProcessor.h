#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_dsp/juce_dsp.h>
#include <atomic>
#include <array>
#include <vector>

/**
 * FFTProcessor - Lock-free stereo FFT spectrum analysis for real-time visualization
 *
 * Audio thread pushes samples into L and R FIFOs independently. When full, a Hann window
 * is applied and the FFT is computed per channel. Results are stored in double-buffers
 * with atomic swap flags so the UI thread can read stable magnitude data without locking.
 *
 * Thread safety:
 * - process() is called from the audio thread only
 * - getMagnitudesL/R/getMagnitudes() are safe to call from any thread (UI timer callback)
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

    /** Call from audio thread. Processes L and R channels independently for stereo FFT. */
    void process(const juce::AudioBuffer<float>& buffer);

    /**
     * Thread-safe getter for UI. Returns LEFT channel magnitude spectrum (numBins values).
     * Range is linear magnitudes (frontend converts to dB).
     */
    const std::array<float, numBins>& getMagnitudesL() const;

    /**
     * Thread-safe getter for UI. Returns RIGHT channel magnitude spectrum (numBins values).
     * Range is linear magnitudes (frontend converts to dB).
     */
    const std::array<float, numBins>& getMagnitudesR() const;

    /**
     * Backward-compatible mono getter. Returns average of L and R channels.
     * Copies into an internal buffer, so slightly less efficient than L/R getters.
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
    /** Compute FFT for a single channel's FIFO data and write to the target buffer. */
    void computeFFT(const std::array<float, fftSize>& channelFifo, int channelWritePos,
                    std::array<float, numBins>& targetBufferA,
                    std::array<float, numBins>& targetBufferB,
                    std::atomic<int>& activeRead);

    juce::dsp::FFT forwardFFT;
    juce::dsp::WindowingFunction<float> windowFunction;

    // Per-channel FIFOs
    std::array<float, fftSize> fifoL;
    std::array<float, fftSize> fifoR;
    int writePosL = 0;
    int writePosR = 0;
    int samplesInFifo = 0;  // Shared counter (L and R advance together)

    // FFT working buffer (2x size for real-only forward transform)
    std::array<float, fftSize * 2> fftWorkBuffer;

    // Double-buffers for L channel magnitudes
    std::array<float, numBins> magnitudeLBufferA;
    std::array<float, numBins> magnitudeLBufferB;
    std::atomic<int> activeReadBufferL{0};

    // Double-buffers for R channel magnitudes
    std::array<float, numBins> magnitudeRBufferA;
    std::array<float, numBins> magnitudeRBufferB;
    std::atomic<int> activeReadBufferR{0};

    // Mono average buffer (for backward compat getMagnitudes())
    mutable std::array<float, numBins> monoAverageBuffer;

    // Flag: set by audio thread when new data is written
    std::atomic<bool> newDataReady{false};

    double currentSampleRate = 44100.0;

    std::atomic<bool> enabled{true};

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(FFTProcessor)
};
