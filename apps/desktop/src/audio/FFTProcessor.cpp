#include "FFTProcessor.h"
#include <cmath>

FFTProcessor::FFTProcessor() : forwardFFT(fftOrder), windowFunction(fftSize, juce::dsp::WindowingFunction<float>::hann)
{
    fifo.fill(0.0f); fftWorkBuffer.fill(0.0f); magnitudeBufferA.fill(0.0f); magnitudeBufferB.fill(0.0f);
}

FFTProcessor::~FFTProcessor() { stopWorker(); }

void FFTProcessor::prepareToPlay(double sampleRate, int)
{
    stopWorker(); currentSampleRate = sampleRate; reset();
    workerRunning.store(true, std::memory_order_release);
    worker = std::thread([this] { workerLoop(); });
}

void FFTProcessor::stopWorker()
{
    workerRunning.store(false, std::memory_order_release);
    wakeCondition.notify_one();
    if (worker.joinable()) worker.join();
}

void FFTProcessor::reset()
{
    const bool restart = workerRunning.load(std::memory_order_acquire);
    if (restart)
    {
        // Reset can be requested by an audio callback. Never join there;
        // each owner clears the state it exclusively touches.
        audioResetRequested.store(true, std::memory_order_release);
        workerResetRequested.store(true, std::memory_order_release);
        flushRequested.store(true, std::memory_order_release);
        resetGeneration.fetch_add(1, std::memory_order_acq_rel);
        return;
    }
    fifoIndex = 0; fifo.fill(0.0f); fftWorkBuffer.fill(0.0f);
    magnitudeBufferA.fill(0.0f); magnitudeBufferB.fill(0.0f);
    queueRead.store(0, std::memory_order_relaxed); queueWrite.store(0, std::memory_order_relaxed);
    { std::lock_guard<std::mutex> lock(publicationMutex); published.fill(0.0f); }
    publishedFrame.store(0, std::memory_order_release); newDataReady.store(false, std::memory_order_release);
    audioResetRequested.store(false, std::memory_order_release);
    workerResetRequested.store(false, std::memory_order_release);
    flushRequested.store(false, std::memory_order_release);
    resetGeneration.store(0, std::memory_order_release);
}

void FFTProcessor::setAnalysisEnabled(bool enabled)
{
    analysisEnabled.store(enabled, std::memory_order_release);
    if (!enabled) flushRequested.store(true, std::memory_order_release);
}

void FFTProcessor::process(const juce::AudioBuffer<float>& buffer)
{
    if (audioResetRequested.exchange(false, std::memory_order_acq_rel))
    {
        fifoIndex = 0;
        fifo.fill(0.0f);
    }
    if (!analysisEnabled.load(std::memory_order_acquire) || buffer.getNumChannels() == 0 || buffer.getNumSamples() == 0) return;
    const auto* l = buffer.getReadPointer(0); const auto* r = buffer.getNumChannels() > 1 ? buffer.getReadPointer(1) : l;
    for (int i = 0; i < buffer.getNumSamples(); ++i)
    {
        fifo[static_cast<size_t>(fifoIndex++)] = (l[i] + r[i]) * 0.5f;
        if (fifoIndex == fftSize)
        {
            fifoIndex = 0;
            const unsigned write = queueWrite.load(std::memory_order_relaxed);
            const unsigned read = queueRead.load(std::memory_order_acquire);
            if (write - read < queueCapacity)
            {
                frameQueue[write % queueCapacity].samples = fifo;
                queueWrite.store(write + 1, std::memory_order_release);
                // Worker polls with a bounded wait; the audio callback never
                // performs a blocking wakeup or takes a mutex.
            }
            // A full queue drops this frame immediately; audio never waits.
        }
    }
}

void FFTProcessor::workerLoop()
{
    while (workerRunning.load(std::memory_order_acquire))
    {
        if (workerResetRequested.exchange(false, std::memory_order_acq_rel))
        {
            std::lock_guard<std::mutex> lock(publicationMutex);
            published.fill(0.0f);
            publishedFrame.store(0, std::memory_order_release);
            newDataReady.store(false, std::memory_order_release);
        }
        if (flushRequested.exchange(false, std::memory_order_acq_rel))
            queueRead.store(queueWrite.load(std::memory_order_acquire), std::memory_order_release);
        unsigned read = queueRead.load(std::memory_order_relaxed);
        if (read == queueWrite.load(std::memory_order_acquire))
        {
            std::unique_lock<std::mutex> lock(wakeMutex);
            wakeCondition.wait_for(lock, std::chrono::milliseconds(20));
            continue;
        }
        // Skip queued history when the worker falls behind: publication is
        // intentionally the freshest complete frame available.
        const unsigned write = queueWrite.load(std::memory_order_acquire);
        if (write - read > 1) read = write - 1;
        const auto samples = frameQueue[read % queueCapacity].samples;
        const auto generation = resetGeneration.load(std::memory_order_acquire);
        queueRead.store(write, std::memory_order_release);
        std::copy(samples.begin(), samples.end(), fftWorkBuffer.begin());
        std::fill(fftWorkBuffer.begin() + fftSize, fftWorkBuffer.end(), 0.0f);
        windowFunction.multiplyWithWindowingTable(fftWorkBuffer.data(), fftSize);
        forwardFFT.performRealOnlyForwardTransform(fftWorkBuffer.data());
        std::array<float, numBins> result{};
        for (int bin = 0; bin < numBins; ++bin)
        {
            const float re = fftWorkBuffer[static_cast<size_t>(bin * 2)];
            const float im = fftWorkBuffer[static_cast<size_t>(bin * 2 + 1)];
            result[static_cast<size_t>(bin)] = std::sqrt(re * re + im * im) / static_cast<float>(fftSize) * 2.0f;
        }
        if (generation != resetGeneration.load(std::memory_order_acquire)) continue;
        { std::lock_guard<std::mutex> lock(publicationMutex); published = result; }
        publishedFrame.fetch_add(1, std::memory_order_release); newDataReady.store(true, std::memory_order_release);
    }
}

std::vector<float> FFTProcessor::getMagnitudes() const
{
    std::vector<float> result(numBins);
    std::lock_guard<std::mutex> lock(publicationMutex);
    std::copy(published.begin(), published.end(), result.begin());
    return result;
}
