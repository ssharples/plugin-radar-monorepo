#include "WaveformCapture.h"

WaveformCapture::WaveformCapture()
{
    reset();
}

void WaveformCapture::setLatencyCompensation(int samples)
{
    // Convert samples to peaks with rounding (not truncation) to minimize error
    // Example: 8200 samples → 16.01 peaks → round to 16 peaks (error: 8 samples vs 200 if truncated)
    int peaks = (samples + SAMPLES_PER_PEAK / 2) / SAMPLES_PER_PEAK;
    peaks = std::max(0, std::min(peaks, static_cast<int>(MAX_DELAY_PEAKS) - 1));

    int oldPeaks = delayInPeaks.load(std::memory_order_relaxed);

    // Reset delay line when latency changes to prevent stale peaks from
    // causing misalignment (e.g., when FabFilter Pro-Q3 toggles linear phase mode)
    if (peaks != oldPeaks)
    {
        delayLine.fill(0.0f);
        delayWritePos = 0;
        delayReadPos = 0;
        peaksInDelayLine = 0;
    }

    delayInPeaks.store(peaks, std::memory_order_relaxed);
}

void WaveformCapture::pushPreSamples(const juce::AudioBuffer<float>& buffer)
{
    // Compute peak of incoming buffer (across all channels)
    float peak = 0.0f;
    for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
    {
        auto range = juce::FloatVectorOperations::findMinAndMax(
            buffer.getReadPointer(ch), buffer.getNumSamples());
        peak = std::max(peak, std::max(std::abs(range.getStart()), std::abs(range.getEnd())));
    }

    // Just accumulate — don't advance the write index.
    // pushPostSamples controls when peaks are committed.
    preAccumulator = std::max(preAccumulator, peak);
}

void WaveformCapture::pushPostSamples(const juce::AudioBuffer<float>& buffer)
{
    // Compute peak of incoming buffer (across all channels)
    float peak = 0.0f;
    for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
    {
        auto range = juce::FloatVectorOperations::findMinAndMax(
            buffer.getReadPointer(ch), buffer.getNumSamples());
        peak = std::max(peak, std::max(std::abs(range.getStart()), std::abs(range.getEnd())));
    }

    postAccumulator = std::max(postAccumulator, peak);
    sampleCount += buffer.getNumSamples();

    // When we have enough samples for a peak, commit BOTH pre and post together
    while (sampleCount >= SAMPLES_PER_PEAK)
    {
        size_t idx = sharedWriteIndex.load(std::memory_order_relaxed);

        // Commit post peak directly
        postPeaks[idx].store(postAccumulator, std::memory_order_relaxed);

        // Commit pre peak through delay line for latency compensation
        int currentDelay = delayInPeaks.load(std::memory_order_relaxed);

        if (currentDelay > 0)
        {
            // Write current pre peak into delay line
            delayLine[delayWritePos] = preAccumulator;
            delayWritePos = (delayWritePos + 1) % MAX_DELAY_PEAKS;
            peaksInDelayLine++;

            // Read from delay line when we have enough buffered
            if (peaksInDelayLine > static_cast<size_t>(currentDelay))
            {
                float delayedPeak = delayLine[delayReadPos];
                delayReadPos = (delayReadPos + 1) % MAX_DELAY_PEAKS;
                peaksInDelayLine--;
                prePeaks[idx].store(delayedPeak, std::memory_order_relaxed);
            }
            else
            {
                // Delay line still filling — write silence for pre
                prePeaks[idx].store(0.0f, std::memory_order_relaxed);
            }
        }
        else
        {
            // No delay — push pre peak directly
            prePeaks[idx].store(preAccumulator, std::memory_order_relaxed);
        }

        // Advance shared write index (single atomic for both buffers)
        sharedWriteIndex.store((idx + 1) % NUM_PEAKS, std::memory_order_release);

        // Reset accumulators
        preAccumulator = 0.0f;
        postAccumulator = 0.0f;
        sampleCount -= SAMPLES_PER_PEAK;
    }
}

// PHASE 3: Zero-allocation snapshot (single read, no heap churn)
WaveformCapture::PeakSnapshot WaveformCapture::getSnapshot() const
{
    PeakSnapshot snapshot;
    size_t writeIdx = sharedWriteIndex.load(std::memory_order_acquire);

    // Read from oldest to newest for both pre and post in one pass
    for (size_t i = 0; i < NUM_PEAKS; ++i)
    {
        size_t readIdx = (writeIdx + i) % NUM_PEAKS;
        snapshot.prePeaks[i] = prePeaks[readIdx].load(std::memory_order_relaxed);
        snapshot.postPeaks[i] = postPeaks[readIdx].load(std::memory_order_relaxed);
    }

    return snapshot;
}

std::vector<float> WaveformCapture::getPrePeaks() const
{
    std::vector<float> result(NUM_PEAKS);
    size_t writeIdx = sharedWriteIndex.load(std::memory_order_acquire);

    // Read from oldest to newest
    for (size_t i = 0; i < NUM_PEAKS; ++i)
    {
        size_t readIdx = (writeIdx + i) % NUM_PEAKS;
        result[i] = prePeaks[readIdx].load(std::memory_order_relaxed);
    }

    return result;
}

std::vector<float> WaveformCapture::getPostPeaks() const
{
    std::vector<float> result(NUM_PEAKS);
    size_t writeIdx = sharedWriteIndex.load(std::memory_order_acquire);

    // Read from oldest to newest — same index as pre
    for (size_t i = 0; i < NUM_PEAKS; ++i)
    {
        size_t readIdx = (writeIdx + i) % NUM_PEAKS;
        result[i] = postPeaks[readIdx].load(std::memory_order_relaxed);
    }

    return result;
}

void WaveformCapture::reset()
{
    for (auto& p : prePeaks)
        p.store(0.0f, std::memory_order_relaxed);
    for (auto& p : postPeaks)
        p.store(0.0f, std::memory_order_relaxed);
    sharedWriteIndex.store(0, std::memory_order_relaxed);

    // Reset delay line
    delayLine.fill(0.0f);
    delayWritePos = 0;
    delayReadPos = 0;
    peaksInDelayLine = 0;
    preAccumulator = 0.0f;
    postAccumulator = 0.0f;
    sampleCount = 0;
}
