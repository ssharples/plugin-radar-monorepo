#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_dsp/juce_dsp.h>
#include <atomic>
#include <array>

/**
 * AudioMeter - Lock-free peak, RMS, and LUFS metering
 *
 * Features:
 * - Peak detection with configurable hold and decay
 * - RMS using exponential moving average
 * - Short-term LUFS (3s integration per ITU-R BS.1770-4)
 *
 * All getters are thread-safe for UI access.
 */
class AudioMeter
{
public:
    struct Readings
    {
        float peakL = 0.0f;         // Current peak (linear 0-1+)
        float peakR = 0.0f;
        float peakHoldL = 0.0f;     // Peak hold (linear)
        float peakHoldR = 0.0f;
        float rmsL = 0.0f;          // RMS (linear)
        float rmsR = 0.0f;
        float lufsShort = -100.0f;  // Short-term LUFS (dB)
        float avgPeakDbL = -100.0f; // Averaged peak dB over 2.5s window
        float avgPeakDbR = -100.0f;
    };

    AudioMeter();
    ~AudioMeter() = default;

    void prepareToPlay(double sampleRate, int samplesPerBlock);
    void process(const juce::AudioBuffer<float>& buffer);
    void reset();

    // Thread-safe getters
    Readings getReadings() const;

    // Configuration
    void setPeakHoldTime(float seconds);    // Default: 1.5s
    void setPeakDecayRate(float dbPerSec);  // Default: 20 dB/s

    // PHASE 2: Conditional metering (enable/disable LUFS calculation)
    void setEnableLUFS(bool enabled);

private:
    // K-weighting filter for LUFS (simplified 2-stage)
    void processKWeighting(const float* input, float* output, int numSamples, int channel);

    // Atomic readings
    std::atomic<float> peakL{0.0f};
    std::atomic<float> peakR{0.0f};
    std::atomic<float> peakHoldL{0.0f};
    std::atomic<float> peakHoldR{0.0f};
    std::atomic<float> rmsL{0.0f};
    std::atomic<float> rmsR{0.0f};
    std::atomic<float> lufsShort{-100.0f};

    // Peak hold/decay state
    float peakHoldTimeSeconds = 1.5f;
    float peakDecayDbPerSec = 20.0f;
    float peakHoldCounterL = 0.0f;
    float peakHoldCounterR = 0.0f;

    // RMS state (exponential moving average)
    float rmsAccumL = 0.0f;
    float rmsAccumR = 0.0f;
    float rmsCoeff = 0.0f;  // EMA coefficient

    // LUFS integration buffer (3s short-term per ITU-R BS.1770)
    static constexpr int LufsWindowMs = 3000;
    std::vector<float> lufsBufferL;
    std::vector<float> lufsBufferR;
    int lufsBufferSize = 0;
    int lufsWritePos = 0;

    // PHASE 1: Incremental LUFS calculation (running sums for O(1) update)
    float lufsRunningSumL = 0.0f;
    float lufsRunningSumR = 0.0f;

    // Peak averaging ring buffer (2.5s window of per-block peak dB values)
    // O(1) running sum, same pattern as incremental LUFS
    static constexpr int PeakAvgWindowMs = 2500;
    std::vector<float> peakAvgBufferL;  // per-block peak dB values
    std::vector<float> peakAvgBufferR;
    int peakAvgBufferSize = 0;          // number of blocks in 2.5s window
    int peakAvgWritePos = 0;
    int peakAvgSamplesWritten = 0;      // tracks fill level before buffer is full
    float peakAvgRunningSumL = 0.0f;
    float peakAvgRunningSumR = 0.0f;
    std::atomic<float> avgPeakDbL{-100.0f};
    std::atomic<float> avgPeakDbR{-100.0f};

    // PHASE 2: Conditional metering flag (default true for backward compat)
    std::atomic<bool> lufsEnabled{true};

    // K-weighting filter state (biquad coefficients)
    // Stage 1: High shelf (+4dB at high frequencies)
    // Stage 2: High-pass (removes DC/subsonic)
    struct BiquadState
    {
        float z1 = 0.0f;
        float z2 = 0.0f;
    };
    std::array<BiquadState, 2> kWeightStateL;  // 2 stages
    std::array<BiquadState, 2> kWeightStateR;

    // Biquad coefficients for K-weighting
    struct BiquadCoeffs
    {
        float b0 = 1.0f, b1 = 0.0f, b2 = 0.0f;
        float a1 = 0.0f, a2 = 0.0f;
    };
    std::array<BiquadCoeffs, 2> kWeightCoeffs;

    double sampleRate = 44100.0;
    int samplesPerBlock = 512;

    // Pre-allocated scratch buffers for K-weighting (avoid heap alloc on audio thread)
    std::vector<float> kWeightScratchL;
    std::vector<float> kWeightScratchR;
    int kWeightScratchSize = 0;

    void updateKWeightingCoeffs();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(AudioMeter)
};
