#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <atomic>
#include <vector>

/**
 * GainProcessor - Handles smoothed input/output gain control
 *
 * Uses juce::SmoothedValue for click-free gain changes.
 * Thread-safe: UI thread writes atomic targets, audio thread reads them
 * and drives SmoothedValue exclusively.
 */
class GainProcessor
{
public:
    GainProcessor();
    ~GainProcessor() = default;

    // Range: -60 to +24 dB
    static constexpr float MinGainDB = -60.0f;
    static constexpr float MaxGainDB = 24.0f;
    static constexpr float DefaultGainDB = 0.0f;

    // Setup
    void prepareToPlay(double sampleRate, int samplesPerBlock);
    void reset();

    // Setters (UI thread) - only store to atomics, never touch SmoothedValue
    void setInputGain(float dB);
    void setOutputGain(float dB);
    void setGainMatchEnabled(bool enabled) { gainMatchEnabled.store(enabled, std::memory_order_release); }
    bool isGainMatchEnabled() const { return gainMatchEnabled.load(std::memory_order_acquire); }
    void setGainMatchTargetDB(float dB);
    float getGainMatchTargetDB() const { return gainMatchTargetDB.load(std::memory_order_relaxed); }
    void processGainMatch(juce::AudioBuffer<float>& buffer, float inputRms, float outputRms);

    // Getters (thread-safe for UI)
    float getInputGainDB() const { return inputGainDB.load(std::memory_order_relaxed); }
    float getOutputGainDB() const { return outputGainDB.load(std::memory_order_relaxed); }

    // Processing (audio thread)
    void processInputGain(juce::AudioBuffer<float>& buffer);
    void processOutputGain(juce::AudioBuffer<float>& buffer);

private:
    static float dbToLinear(float dB);
    static float clampGain(float dB);

    // SmoothedValue - ONLY accessed from the audio thread
    juce::SmoothedValue<float, juce::ValueSmoothingTypes::Multiplicative> inputGainSmoothed;
    juce::SmoothedValue<float, juce::ValueSmoothingTypes::Multiplicative> outputGainSmoothed;
    juce::SmoothedValue<float, juce::ValueSmoothingTypes::Multiplicative> gainMatchSmoothed;

    // Atomic targets: UI thread writes, audio thread reads
    std::atomic<float> pendingInputGainLinear{1.0f};
    std::atomic<float> pendingOutputGainLinear{1.0f};
    std::atomic<float> gainMatchTargetDB{0.0f};
    std::atomic<bool> gainMatchEnabled{false};

    // dB values for UI readback
    std::atomic<float> inputGainDB{DefaultGainDB};
    std::atomic<float> outputGainDB{DefaultGainDB};

    // Pre-allocated gain ramp buffer for multi-channel processing
    std::vector<float> gainRampBuffer;
    int maxBlockSize = 0;

    double currentSampleRate = 44100.0;
    static constexpr double smoothingTimeSeconds = 0.05; // 50ms ramp time

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(GainProcessor)
};
