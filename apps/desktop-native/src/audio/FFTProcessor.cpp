#include "FFTProcessor.h"
#include <cmath>

FFTProcessor::FFTProcessor()
    : forwardFFT(fftOrder),
      windowFunction(fftSize, juce::dsp::WindowingFunction<float>::hann)
{
    fifo.fill(0.0f);
    fftWorkBuffer.fill(0.0f);
    magnitudeBufferA.fill(0.0f);
    magnitudeBufferB.fill(0.0f);
}

void FFTProcessor::prepareToPlay(double sampleRate, int /*samplesPerBlock*/)
{
    currentSampleRate = sampleRate;
    reset();
}

void FFTProcessor::reset()
{
    fifoIndex = 0;
    fifo.fill(0.0f);
    fftWorkBuffer.fill(0.0f);
    magnitudeBufferA.fill(0.0f);
    magnitudeBufferB.fill(0.0f);
    activeReadBuffer.store(0, std::memory_order_relaxed);
    newDataReady.store(false, std::memory_order_relaxed);
}

void FFTProcessor::process(const juce::AudioBuffer<float>& buffer)
{
    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();

    if (numChannels == 0 || numSamples == 0)
        return;

    const float* leftChannel = buffer.getReadPointer(0);
    const float* rightChannel = numChannels > 1 ? buffer.getReadPointer(1) : leftChannel;

    for (int i = 0; i < numSamples; ++i)
    {
        // Downmix stereo to mono
        float monoSample = (leftChannel[i] + rightChannel[i]) * 0.5f;
        fifo[static_cast<size_t>(fifoIndex)] = monoSample;
        ++fifoIndex;

        if (fifoIndex >= fftSize)
        {
            fifoIndex = 0;

            // Copy FIFO data into the work buffer
            std::copy(fifo.begin(), fifo.end(), fftWorkBuffer.begin());
            // Zero the second half (imaginary part for real-only transform)
            std::fill(fftWorkBuffer.begin() + fftSize, fftWorkBuffer.end(), 0.0f);

            // Apply Hann window
            windowFunction.multiplyWithWindowingTable(fftWorkBuffer.data(), static_cast<size_t>(fftSize));

            // Perform forward FFT (real-only, in-place)
            forwardFFT.performRealOnlyForwardTransform(fftWorkBuffer.data());

            // Compute magnitudes and write to the inactive buffer
            // activeReadBuffer: 0 means A is readable, so write to B
            //                   1 means B is readable, so write to A
            int readBuf = activeReadBuffer.load(std::memory_order_acquire);
            auto& writeBuffer = (readBuf == 0) ? magnitudeBufferB : magnitudeBufferA;

            for (int bin = 0; bin < numBins; ++bin)
            {
                float real = fftWorkBuffer[static_cast<size_t>(bin * 2)];
                float imag = fftWorkBuffer[static_cast<size_t>(bin * 2 + 1)];
                float magnitude = std::sqrt(real * real + imag * imag);

                // Normalize by FFT size and apply factor of 2 for single-sided spectrum
                magnitude = (magnitude / static_cast<float>(fftSize)) * 2.0f;

                writeBuffer[static_cast<size_t>(bin)] = magnitude;
            }

            // Swap: make the write buffer the new read buffer
            activeReadBuffer.store(readBuf == 0 ? 1 : 0, std::memory_order_release);
            newDataReady.store(true, std::memory_order_release);
        }
    }
}

std::vector<float> FFTProcessor::getMagnitudes() const
{
    std::vector<float> result(numBins);

    int readBuf = activeReadBuffer.load(std::memory_order_acquire);
    const auto& readBuffer = (readBuf == 0) ? magnitudeBufferA : magnitudeBufferB;

    // Return linear magnitudes (frontend converts to dB)
    for (int i = 0; i < numBins; ++i)
    {
        result[static_cast<size_t>(i)] = readBuffer[static_cast<size_t>(i)];
    }

    return result;
}
