#include "CrossoverBandProcessor.h"

CrossoverBandProcessor::CrossoverBandProcessor(int bandIndex, int numBands)
    : AudioProcessor(BusesProperties()
                         .withInput("Input", juce::AudioChannelSet::stereo(), true)
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      band(juce::jlimit(0, kMaxSplits, bandIndex)),
      bands(juce::jlimit(1, kMaxSplits + 1, numBands))
{
    using Type = juce::dsp::LinkwitzRileyFilterType;
    const int splits = bands - 1;
    for (int s = 0; s < splits; ++s)
    {
        if (s > band) continue; // handled by the all-pass loop below
        Stage stage { s, {} };
        stage.filter.setType(s < band ? Type::highpass : Type::lowpass);
        stages.push_back(std::move(stage));
    }
    for (int s = band + 1; s < splits; ++s)
    {
        Stage stage { s, {} };
        stage.filter.setType(Type::allpass);
        stages.push_back(std::move(stage));
    }
    for (int s = 0; s < kMaxSplits; ++s)
        frequencies[static_cast<size_t>(s)].store(1000.0f);
}

void CrossoverBandProcessor::setFrequencies(const std::vector<float>& newFrequencies)
{
    for (int s = 0; s < kMaxSplits && s < static_cast<int>(newFrequencies.size()); ++s)
        frequencies[static_cast<size_t>(s)].store(newFrequencies[static_cast<size_t>(s)], std::memory_order_relaxed);
}

float CrossoverBandProcessor::getFrequency(int split) const
{
    return split >= 0 && split < kMaxSplits ? frequencies[static_cast<size_t>(split)].load(std::memory_order_relaxed) : 0.0f;
}

void CrossoverBandProcessor::prepareToPlay(double newSampleRate, int samplesPerBlock)
{
    sampleRate = newSampleRate > 0 ? newSampleRate : 44100.0;
    const juce::dsp::ProcessSpec spec { sampleRate, static_cast<juce::uint32>(juce::jmax(1, samplesPerBlock)), 2 };
    for (auto& stage : stages) stage.filter.prepare(spec);
    applyFrequencies();
}

void CrossoverBandProcessor::reset()
{
    for (auto& stage : stages) stage.filter.reset();
}

void CrossoverBandProcessor::applyFrequencies()
{
    const auto nyquistLimit = static_cast<float>(sampleRate * 0.45);
    for (auto& stage : stages)
    {
        const auto wanted = juce::jlimit(10.0f, nyquistLimit, frequencies[static_cast<size_t>(stage.split)].load(std::memory_order_relaxed));
        if (wanted != stage.filter.getCutoffFrequency()) stage.filter.setCutoffFrequency(wanted);
    }
}

void CrossoverBandProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    juce::ScopedNoDenormals noDenormals;
    applyFrequencies();
    const int channels = juce::jmin(2, buffer.getNumChannels());
    for (auto& stage : stages)
        for (int c = 0; c < channels; ++c)
        {
            auto* data = buffer.getWritePointer(c);
            for (int i = 0; i < buffer.getNumSamples(); ++i)
                data[i] = stage.filter.processSample(c, data[i]);
        }
    for (auto& stage : stages) stage.filter.snapToZero();
}
