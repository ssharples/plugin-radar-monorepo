#include "FFTProcessor.h"
#include "FastMath.h"
#include <cmath>

FFTProcessor::FFTProcessor()
    : forwardFFT(fftOrder),
      windowFunction(fftSize, juce::dsp::WindowingFunction<float>::hann)
{
    fifoL.fill(0.0f);
    fifoR.fill(0.0f);
    fftWorkBuffer.fill(0.0f);
    magnitudeLBufferA.fill(0.0f);
    magnitudeLBufferB.fill(0.0f);
    magnitudeRBufferA.fill(0.0f);
    magnitudeRBufferB.fill(0.0f);
    monoAverageBuffer.fill(0.0f);
}

void FFTProcessor::prepareToPlay(double sampleRate, int /*samplesPerBlock*/)
{
    currentSampleRate = sampleRate;
    reset();
}

void FFTProcessor::reset()
{
    writePosL = 0;
    writePosR = 0;
    samplesInFifo = 0;
    fifoL.fill(0.0f);
    fifoR.fill(0.0f);
    fftWorkBuffer.fill(0.0f);
    magnitudeLBufferA.fill(0.0f);
    magnitudeLBufferB.fill(0.0f);
    magnitudeRBufferA.fill(0.0f);
    magnitudeRBufferB.fill(0.0f);
    monoAverageBuffer.fill(0.0f);
    activeReadBufferL.store(0, std::memory_order_relaxed);
    activeReadBufferR.store(0, std::memory_order_relaxed);
    newDataReady.store(false, std::memory_order_relaxed);
}

void FFTProcessor::computeFFT(const std::array<float, fftSize>& channelFifo, int channelWritePos,
                               std::array<float, numBins>& targetBufferA,
                               std::array<float, numBins>& targetBufferB,
                               std::atomic<int>& activeRead)
{
    // Copy FIFO data into the work buffer (properly ordered from ring buffer)
    for (int j = 0; j < fftSize; ++j)
    {
        int readIdx = (channelWritePos + j) % fftSize;
        fftWorkBuffer[j] = channelFifo[readIdx];
    }
    // Zero the second half (imaginary part for real-only transform)
    std::fill(fftWorkBuffer.begin() + fftSize, fftWorkBuffer.end(), 0.0f);

    // Apply Hann window
    windowFunction.multiplyWithWindowingTable(fftWorkBuffer.data(), static_cast<size_t>(fftSize));

    // Perform forward FFT (real-only, in-place)
    forwardFFT.performRealOnlyForwardTransform(fftWorkBuffer.data());

    // Compute magnitudes and write to the inactive buffer
    int readBuf = activeRead.load(std::memory_order_acquire);
    auto& writeBuffer = (readBuf == 0) ? targetBufferB : targetBufferA;

    // Vectorized magnitude calculation
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
    activeRead.store(readBuf == 0 ? 1 : 0, std::memory_order_release);
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
        fifoL[writePosL] = leftChannel[i];
        fifoR[writePosR] = rightChannel[i];
        writePosL = (writePosL + 1) % fftSize;
        writePosR = (writePosR + 1) % fftSize;

        samplesInFifo++;

        if (samplesInFifo >= fftSize)
        {
            // Compute FFT for L channel
            computeFFT(fifoL, writePosL, magnitudeLBufferA, magnitudeLBufferB, activeReadBufferL);

            // Compute FFT for R channel (reuses fftWorkBuffer — sequential, not concurrent)
            computeFFT(fifoR, writePosR, magnitudeRBufferA, magnitudeRBufferB, activeReadBufferR);

            newDataReady.store(true, std::memory_order_release);
            samplesInFifo = 0;
        }
    }
}

const std::array<float, FFTProcessor::numBins>& FFTProcessor::getMagnitudesL() const
{
    int readBuf = activeReadBufferL.load(std::memory_order_acquire);
    return (readBuf == 0) ? magnitudeLBufferA : magnitudeLBufferB;
}

const std::array<float, FFTProcessor::numBins>& FFTProcessor::getMagnitudesR() const
{
    int readBuf = activeReadBufferR.load(std::memory_order_acquire);
    return (readBuf == 0) ? magnitudeRBufferA : magnitudeRBufferB;
}

const std::array<float, FFTProcessor::numBins>& FFTProcessor::getMagnitudes() const
{
    const auto& L = getMagnitudesL();
    const auto& R = getMagnitudesR();
    for (int i = 0; i < numBins; ++i)
        monoAverageBuffer[i] = (L[i] + R[i]) * 0.5f;
    return monoAverageBuffer;
}
