#include "PluginParameterWatcher.h"

PluginParameterWatcher::PluginParameterWatcher(
    std::function<void(const juce::String& beforeSnapshotBase64)> onSettled)
    : settledCallback(std::move(onSettled))
{
    startTimer(kTimerIntervalMs);
}

PluginParameterWatcher::~PluginParameterWatcher()
{
    stopTimer();
    clearWatches();
}

void PluginParameterWatcher::watchProcessor(juce::AudioProcessor* processor)
{
    if (processor == nullptr) return;

    for (auto* param : processor->getParameters())
    {
        param->addListener(this);
        watchedParams.push_back({processor, param});
    }
}

void PluginParameterWatcher::clearWatches()
{
    for (auto& [proc, param] : watchedParams)
        param->removeListener(this);
    watchedParams.clear();

    // Reset state
    changeDetected.store(false, std::memory_order_relaxed);
    activeGestureCount.store(0, std::memory_order_relaxed);
    waitingForSettle = false;
}

void PluginParameterWatcher::updateStableSnapshot(const juce::String& base64Snapshot)
{
    const juce::ScopedLock lock(snapshotLock);
    lastStableSnapshot = base64Snapshot;

    // Reset detection state since we have a new baseline
    changeDetected.store(false, std::memory_order_relaxed);
    waitingForSettle = false;
}

void PluginParameterWatcher::setSuppressed(bool value)
{
    suppressed.store(value, std::memory_order_relaxed);

    if (value)
    {
        // When suppressing, reset any pending detection
        changeDetected.store(false, std::memory_order_relaxed);
        waitingForSettle = false;
    }
}

// Called on the audio thread — must be lock-free
void PluginParameterWatcher::parameterValueChanged(int /*parameterIndex*/, float /*newValue*/)
{
    if (!suppressed.load(std::memory_order_relaxed))
        changeDetected.store(true, std::memory_order_relaxed);
}

// Called on the audio thread for host-reported gestures
void PluginParameterWatcher::parameterGestureChanged(int /*parameterIndex*/, bool gestureIsStarting)
{
    if (gestureIsStarting)
        activeGestureCount.fetch_add(1, std::memory_order_relaxed);
    else
        activeGestureCount.fetch_sub(1, std::memory_order_relaxed);
}

// Called on the message thread every 100ms
void PluginParameterWatcher::timerCallback()
{
    if (suppressed.load(std::memory_order_relaxed))
        return;

    const bool changed = changeDetected.exchange(false, std::memory_order_relaxed);
    const int gestures = activeGestureCount.load(std::memory_order_relaxed);

    if (changed)
    {
        lastChangeTimeMs = juce::Time::currentTimeMillis();
        waitingForSettle = true;
    }

    if (waitingForSettle && gestures <= 0)
    {
        const int64_t elapsed = juce::Time::currentTimeMillis() - lastChangeTimeMs;
        if (elapsed >= kSettleTimeMs)
        {
            waitingForSettle = false;

            // Fire the settled callback with the "before" snapshot
            juce::String snapshotCopy;
            {
                const juce::ScopedLock lock(snapshotLock);
                snapshotCopy = lastStableSnapshot;
            }

            if (snapshotCopy.isNotEmpty() && settledCallback)
                settledCallback(snapshotCopy);
        }
    }
}
