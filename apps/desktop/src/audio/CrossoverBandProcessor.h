#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_dsp/juce_dsp.h>
#include <array>
#include <atomic>
#include <vector>

/**
 * CrossoverBandProcessor - Passes one band of a multiband (crossover) split.
 *
 * Stereo in, stereo out. Band k of N uses Linkwitz-Riley filters:
 * high-pass at every split below it, low-pass at its own top split, and
 * all-pass at every split above that. The all-passes line up the phase, so
 * the N bands add back up to a flat signal.
 */
class CrossoverBandProcessor : public juce::AudioProcessor
{
public:
    static constexpr int kMaxSplits = 7;

    CrossoverBandProcessor(int bandIndex, int numBands);

    // Message thread. Takes numBands - 1 ascending frequencies in Hz.
    void setFrequencies(const std::vector<float>& frequencies);
    float getFrequency(int split) const;
    int getBandIndex() const { return band; }
    int getNumBands() const { return bands; }

    const juce::String getName() const override { return "CrossoverBand"; }
    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    void reset() override;
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override;

    double getTailLengthSeconds() const override { return 0.0; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}
    void getStateInformation(juce::MemoryBlock&) override {}
    void setStateInformation(const void*, int) override {}

private:
    struct Stage
    {
        int split;
        juce::dsp::LinkwitzRileyFilter<float> filter;
    };

    void applyFrequencies();

    const int band, bands;
    std::vector<Stage> stages;
    std::array<std::atomic<float>, kMaxSplits> frequencies;
    double sampleRate = 44100.0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(CrossoverBandProcessor)
};
