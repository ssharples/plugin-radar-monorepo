#include "WaveformCapture.h"

WaveformCapture::WaveformCapture()
{
    reset();
}

void WaveformCapture::setLatencyCompensation(int samples)
{
    // Convert samples to peaks and clamp
    int peaks = samples / SAMPLES_PER_PEAK;
    peaks = std::max(0, std::min(peaks, static_cast<int>(MAX_DELAY_PEAKS) - 1));
    delayInPeaks.store(peaks, std::memory_order_relaxed);
}

void WaveformCapture::pushPreSamples(const juce::AudioBuffer<float>& buffer)
{
    // Compute peak of incoming buffer
    float peak = 0.0f;
    for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
    {
        auto range = juce::FloatVectorOperations::findMinAndMax(
            buffer.getReadPointer(ch), buffer.getNumSamples());
        peak = std::max(peak, std::max(std::abs(range.getStart()), std::abs(range.getEnd())));
    }

    // Accumulate samples
    preAccumulator = std::max(preAccumulator, peak);
    preSampleCount += buffer.getNumSamples();

    // When we have enough samples for a peak
    while (preSampleCount >= SAMPLES_PER_PEAK)
    {
        int currentDelay = delayInPeaks.load(std::memory_order_relaxed);

        if (currentDelay > 0)
        {
            // Write to delay line
            delayLine[delayWritePos] = preAccumulator;
            delayWritePos = (delayWritePos + 1) % MAX_DELAY_PEAKS;

            // Calculate how many peaks are in the delay line
            size_t peaksInBuffer = (delayWritePos >= delayReadPos)
                ? (delayWritePos - delayReadPos)
                : (MAX_DELAY_PEAKS - delayReadPos + delayWritePos);

            // Read from delay line when we have enough buffered
            if (peaksInBuffer > static_cast<size_t>(currentDelay))
            {
                float delayedPeak = delayLine[delayReadPos];
                delayReadPos = (delayReadPos + 1) % MAX_DELAY_PEAKS;

                // Push to the actual peak buffer
                size_t idx = preBuffer.writeIndex.load(std::memory_order_relaxed);
                preBuffer.peaks[idx].store(delayedPeak, std::memory_order_relaxed);
                preBuffer.writeIndex.store((idx + 1) % NUM_PEAKS, std::memory_order_release);
            }
        }
        else
        {
            // No delay - push directly
            size_t idx = preBuffer.writeIndex.load(std::memory_order_relaxed);
            preBuffer.peaks[idx].store(preAccumulator, std::memory_order_relaxed);
            preBuffer.writeIndex.store((idx + 1) % NUM_PEAKS, std::memory_order_release);
        }

        preAccumulator = 0.0f;
        preSampleCount -= SAMPLES_PER_PEAK;
    }
}

void WaveformCapture::pushPostSamples(const juce::AudioBuffer<float>& buffer)
{
    postBuffer.pushSamples(buffer);
}

std::vector<float> WaveformCapture::getPrePeaks() const
{
    return preBuffer.getPeaks();
}

std::vector<float> WaveformCapture::getPostPeaks() const
{
    return postBuffer.getPeaks();
}

void WaveformCapture::reset()
{
    preBuffer.reset();
    postBuffer.reset();

    // Reset delay line
    delayLine.fill(0.0f);
    delayWritePos = 0;
    delayReadPos = 0;
    preAccumulator = 0.0f;
    preSampleCount = 0;
}
