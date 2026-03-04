#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_dsp/juce_dsp.h>
#include <atomic>
#include <array>

/**
 * SignalAnalyzer - Lock-free rolling signal analysis for on-demand snapshots.
 *
 * Called from the audio thread via process(), read from the message thread
 * via getSnapshot(). All shared state uses std::atomic for thread safety.
 *
 * Computes: peak, RMS (EMA ~2s), spectral centroid (1024-pt FFT), crest factor.
 * LUFS is read from the existing AudioMeter (not recomputed here).
 */
class SignalAnalyzer
{
public:
    struct Snapshot
    {
        float inputPeakDb      = -100.0f;
        float inputRmsDb       = -100.0f;
        float spectralCentroid = 0.0f;   // Hz
        float crestFactor      = 0.0f;   // dB (peak - RMS)
        float dynamicRangeDb   = 0.0f;   // peakHold - rmsMin over window
        double sampleRate      = 44100.0;
    };

    SignalAnalyzer() = default;
    ~SignalAnalyzer() = default;

    void prepare(double sampleRate, int samplesPerBlock);
    void process(const juce::AudioBuffer<float>& buffer);
    Snapshot getSnapshot() const;
    void reset();

private:
    // Rolling peak — exponential decay (~300ms)
    std::atomic<float> peakLinear { 0.0f };

    // Rolling RMS — exponential moving average (~2s window)
    std::atomic<float> rmsLinear { 0.0f };
    float rmsAccum = 0.0f;
    float rmsCoeff = 0.0f;  // EMA coefficient for ~2s window

    // Dynamic range tracking
    std::atomic<float> peakHoldLinear { 0.0f };   // Highest peak seen (slow decay)
    std::atomic<float> rmsMinLinear { 1.0f };     // Lowest RMS seen (slow rise)
    float peakHoldDecayCoeff = 0.0f;  // Very slow decay for peak hold (~10s)
    float rmsMinRiseCoeff = 0.0f;     // Very slow rise for RMS min (~10s)

    // Spectral centroid via lightweight FFT
    static constexpr int fftOrder = 10;  // 1024-point
    static constexpr int fftSize = 1 << fftOrder;
    juce::dsp::FFT fft { fftOrder };
    juce::dsp::WindowingFunction<float> window { static_cast<size_t>(fftSize),
                                                  juce::dsp::WindowingFunction<float>::hann };
    alignas(16) std::array<float, fftSize * 2> fftData {};
    int fftFillIndex = 0;
    std::atomic<float> centroid { 0.0f };

    // Sample rate
    std::atomic<double> currentSampleRate { 44100.0 };

    // Peak decay coefficient (~300ms)
    float peakDecayCoeff = 0.0f;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SignalAnalyzer)
};
