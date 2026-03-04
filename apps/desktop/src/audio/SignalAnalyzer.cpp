#include "SignalAnalyzer.h"
#include <cmath>

void SignalAnalyzer::prepare(double sampleRate, int samplesPerBlock)
{
    juce::ignoreUnused(samplesPerBlock);
    currentSampleRate.store(sampleRate, std::memory_order_relaxed);

    // EMA coefficient for ~2s RMS window:
    // coeff = exp(-1 / (timeConstant * sampleRate / blockSize))
    // Approximation: for block-rate updates, timeConstant ~= 2s
    // Assuming ~512 sample blocks at 44100 Hz = ~86 blocks/sec
    // coeff = exp(-1 / (2 * 86)) ≈ 0.9942
    const double blocksPerSec = sampleRate / static_cast<double>(juce::jmax(1, samplesPerBlock));
    rmsCoeff = static_cast<float>(std::exp(-1.0 / (2.0 * blocksPerSec)));

    // Peak decay: ~300ms
    peakDecayCoeff = static_cast<float>(std::exp(-1.0 / (0.3 * blocksPerSec)));

    // Peak hold decay: ~10s (very slow)
    peakHoldDecayCoeff = static_cast<float>(std::exp(-1.0 / (10.0 * blocksPerSec)));

    // RMS min rise: ~10s (very slow)
    rmsMinRiseCoeff = static_cast<float>(std::exp(-1.0 / (10.0 * blocksPerSec)));

    reset();
}

void SignalAnalyzer::reset()
{
    peakLinear.store(0.0f, std::memory_order_relaxed);
    rmsLinear.store(0.0f, std::memory_order_relaxed);
    rmsAccum = 0.0f;
    peakHoldLinear.store(0.0f, std::memory_order_relaxed);
    rmsMinLinear.store(1.0f, std::memory_order_relaxed);
    centroid.store(0.0f, std::memory_order_relaxed);
    fftFillIndex = 0;
    fftData.fill(0.0f);
}

void SignalAnalyzer::process(const juce::AudioBuffer<float>& buffer)
{
    const int numSamples = buffer.getNumSamples();
    if (numSamples == 0 || buffer.getNumChannels() < 1)
        return;

    // --- Peak (max of all channels) ---
    float blockPeak = 0.0f;
    for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
    {
        float chMag = buffer.getMagnitude(ch, 0, numSamples);
        if (chMag > blockPeak)
            blockPeak = chMag;
    }

    // Decaying peak envelope
    float currentPeak = peakLinear.load(std::memory_order_relaxed);
    if (blockPeak > currentPeak)
        currentPeak = blockPeak;
    else
        currentPeak = currentPeak * peakDecayCoeff;
    peakLinear.store(currentPeak, std::memory_order_relaxed);

    // Peak hold (very slow decay)
    float hold = peakHoldLinear.load(std::memory_order_relaxed);
    if (blockPeak > hold)
        hold = blockPeak;
    else
        hold = hold * peakHoldDecayCoeff;
    peakHoldLinear.store(hold, std::memory_order_relaxed);

    // --- RMS (sum across channels, EMA) ---
    float blockRmsSquared = 0.0f;
    for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
    {
        float chRms = buffer.getRMSLevel(ch, 0, numSamples);
        blockRmsSquared += chRms * chRms;
    }
    float blockRms = std::sqrt(blockRmsSquared / static_cast<float>(buffer.getNumChannels()));

    // EMA update
    rmsAccum = rmsAccum * rmsCoeff + blockRms * (1.0f - rmsCoeff);
    rmsLinear.store(rmsAccum, std::memory_order_relaxed);

    // RMS min tracking (slow rise toward current RMS)
    float rmsMin = rmsMinLinear.load(std::memory_order_relaxed);
    if (rmsAccum < rmsMin)
        rmsMin = rmsAccum;
    else
        rmsMin = rmsMin + (rmsAccum - rmsMin) * (1.0f - rmsMinRiseCoeff);
    rmsMinLinear.store(rmsMin, std::memory_order_relaxed);

    // --- Spectral Centroid (feed mono mix into FFT FIFO) ---
    const int numChannels = buffer.getNumChannels();
    for (int i = 0; i < numSamples; ++i)
    {
        // Mono mixdown
        float sample = 0.0f;
        for (int ch = 0; ch < numChannels; ++ch)
            sample += buffer.getReadPointer(ch)[i];
        sample /= static_cast<float>(numChannels);

        fftData[static_cast<size_t>(fftFillIndex)] = sample;
        ++fftFillIndex;

        if (fftFillIndex >= fftSize)
        {
            fftFillIndex = 0;

            // Apply Hann window
            window.multiplyWithWindowingTable(fftData.data(), static_cast<size_t>(fftSize));

            // Perform FFT (in-place, real→complex interleaved)
            fft.performRealOnlyForwardTransform(fftData.data());

            // Compute spectral centroid = sum(freq * mag) / sum(mag)
            const double sr = currentSampleRate.load(std::memory_order_relaxed);
            const double binWidth = sr / static_cast<double>(fftSize);
            double weightedSum = 0.0;
            double magSum = 0.0;

            const int numBins = fftSize / 2;
            for (int bin = 1; bin < numBins; ++bin)
            {
                const float re = fftData[static_cast<size_t>(bin * 2)];
                const float im = fftData[static_cast<size_t>(bin * 2 + 1)];
                const double mag = std::sqrt(static_cast<double>(re * re + im * im));
                const double freq = static_cast<double>(bin) * binWidth;
                weightedSum += freq * mag;
                magSum += mag;
            }

            float newCentroid = (magSum > 1e-10)
                ? static_cast<float>(weightedSum / magSum)
                : 0.0f;
            centroid.store(newCentroid, std::memory_order_relaxed);
        }
    }
}

SignalAnalyzer::Snapshot SignalAnalyzer::getSnapshot() const
{
    Snapshot s;
    const float peak = peakLinear.load(std::memory_order_relaxed);
    const float rms = rmsLinear.load(std::memory_order_relaxed);

    // Convert to dB (with floor at -100 dB)
    s.inputPeakDb = (peak > 1e-10f)
        ? 20.0f * std::log10(peak)
        : -100.0f;
    s.inputRmsDb = (rms > 1e-10f)
        ? 20.0f * std::log10(rms)
        : -100.0f;

    s.spectralCentroid = centroid.load(std::memory_order_relaxed);
    s.crestFactor = s.inputPeakDb - s.inputRmsDb;

    // Dynamic range = peak hold (dB) - RMS min (dB)
    const float holdLin = peakHoldLinear.load(std::memory_order_relaxed);
    const float rmsMinLin = rmsMinLinear.load(std::memory_order_relaxed);
    const float holdDb = (holdLin > 1e-10f) ? 20.0f * std::log10(holdLin) : -100.0f;
    const float rmsMinDb = (rmsMinLin > 1e-10f) ? 20.0f * std::log10(rmsMinLin) : -100.0f;
    s.dynamicRangeDb = holdDb - rmsMinDb;

    s.sampleRate = currentSampleRate.load(std::memory_order_relaxed);

    return s;
}
