#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_dsp/juce_dsp.h>
#include <atomic>
#include <array>
#include <vector>
#include <thread>
#include <mutex>
#include <condition_variable>

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
    ~FFTProcessor();

    void prepareToPlay(double sampleRate, int samplesPerBlock);
    void reset();

    /** Call from audio thread. Accepts stereo buffer, downmixes to mono for FFT. */
    void process(const juce::AudioBuffer<float>& buffer);

    /**
     * Thread-safe getter for UI. Returns magnitude spectrum in dB (numBins values).
     * Range is approximately -100 dB to 0 dB (relative to full scale).
     * The caller receives the most recently completed FFT frame.
     */
    std::vector<float> getMagnitudes() const;

    /** Returns the number of output bins (numBins = fftSize/2). */
    int getNumBins() const { return numBins; }

    /** Returns the sample rate used for frequency calculations. */
    double getSampleRate() const { return currentSampleRate; }
    void setAnalysisEnabled(bool enabled);
    bool isAnalysisEnabled() const { return analysisEnabled.load(std::memory_order_acquire); }

private:
    juce::dsp::FFT forwardFFT;
    juce::dsp::WindowingFunction<float> windowFunction;

    // FIFO for collecting samples on the audio thread
    std::array<float, fftSize> fifo;
    int fifoIndex = 0;

    // FFT working buffer (2x size for real-only forward transform)
    std::array<float, fftSize * 2> fftWorkBuffer;

    struct Frame { std::array<float, fftSize> samples{}; };
    static constexpr int queueCapacity = 4;
    std::array<Frame, queueCapacity> frameQueue;
    std::atomic<unsigned> queueRead{0}, queueWrite{0};
    std::thread worker;
    std::atomic<bool> workerRunning{false};
    std::atomic<bool> analysisEnabled{true};
    std::atomic<bool> audioResetRequested{false};
    std::atomic<bool> workerResetRequested{false};
    std::atomic<bool> flushRequested{false};
    std::atomic<uint64_t> resetGeneration{0};
    std::mutex wakeMutex;
    std::condition_variable wakeCondition;
    void workerLoop();
    void stopWorker();

    // Double-buffer for magnitude data: audio thread writes to writeBuffer,
    // UI thread reads from the other buffer
    std::array<float, numBins> magnitudeBufferA;
    std::array<float, numBins> magnitudeBufferB;

    // 0 = A is the readable buffer, B is writable
    // 1 = B is the readable buffer, A is writable
    std::atomic<int> activeReadBuffer{0};

    // Flag: set by audio thread when new data is written, cleared by swap
    std::atomic<bool> newDataReady{false};
    mutable std::mutex publicationMutex;
    std::array<float, numBins> published{};
    std::atomic<uint64_t> publishedFrame{0};

    double currentSampleRate = 44100.0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(FFTProcessor)
};
