#include "FFTProcessor.h"
#include "FastMath.h"
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
    writePos = 0;
    samplesInFifo = 0;
    fifo.fill(0.0f);
    fftWorkBuffer.fill(0.0f);
    magnitudeBufferA.fill(0.0f);
    magnitudeBufferB.fill(0.0f);
    activeReadBuffer.store(0, std::memory_order_relaxed);
    newDataReady.store(false, std::memory_order_relaxed);
}

void FFTProcessor::process(const juce::AudioBuffer<float>& buffer)
{
    if (!enabled.load(std::memory_order_relaxed))
        return;

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

        fifo[writePos] = monoSample;
        writePos = (writePos + 1) % fftSize;

        samplesInFifo++;

        if (samplesInFifo >= fftSize)
        {
            // Copy FIFO data into the work buffer (properly ordered from ring buffer)
            for (int j = 0; j < fftSize; ++j)
            {
                int readIdx = (writePos + j) % fftSize;
                fftWorkBuffer[j] = fifo[readIdx];
            }
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

            // PHASE 8: Vectorized magnitude calculation (1.5-2x speedup)
            // Compute real^2 + imag^2 for all bins, then vectorized sqrt

            // Temporary buffer for squared magnitudes
            std::array<float, numBins> squaredMags;

            for (int bin = 0; bin < numBins; ++bin)
            {
                float real = fftWorkBuffer[static_cast<size_t>(bin * 2)];
                float imag = fftWorkBuffer[static_cast<size_t>(bin * 2 + 1)];
                squaredMags[static_cast<size_t>(bin)] = real * real + imag * imag;
            }

            // Vectorized sqrt and normalization
            const float normFactor = 2.0f / static_cast<float>(fftSize);
            FastMath::sqrtVector(writeBuffer.data(), squaredMags.data(), numBins);
            juce::FloatVectorOperations::multiply(writeBuffer.data(), normFactor, numBins);

            // Swap: make the write buffer the new read buffer
            activeReadBuffer.store(readBuf == 0 ? 1 : 0, std::memory_order_release);
            newDataReady.store(true, std::memory_order_release);

            samplesInFifo = 0;
            // Don't reset writePos - it keeps advancing
        }
    }
}

const std::array<float, FFTProcessor::numBins>& FFTProcessor::getMagnitudes() const
{
    int readBuf = activeReadBuffer.load(std::memory_order_acquire);
    return (readBuf == 0) ? magnitudeBufferA : magnitudeBufferB;
}
