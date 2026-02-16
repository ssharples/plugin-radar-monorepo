#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <functional>
#include <atomic>
#include <vector>

/**
 * Watches all parameters of registered AudioProcessors and fires a callback
 * when parameters "settle" (no changes for a debounce period).
 *
 * The "before" snapshot (captured before the parameter change began) is
 * provided to the callback so the undo system can push it onto its history stack.
 *
 * Thread safety:
 *  - parameterValueChanged() is called on the audio thread (lock-free).
 *  - Timer callback runs on the message thread.
 *  - Uses atomics for cross-thread communication.
 */
class PluginParameterWatcher : private juce::Timer,
                                private juce::AudioProcessorParameter::Listener
{
public:
    /**
     * @param onSettled  Called on the message thread when parameters have settled.
     *                   Argument is the Base64-encoded snapshot captured *before*
     *                   the parameter changes began.
     */
    explicit PluginParameterWatcher(std::function<void(const juce::String& beforeSnapshotBase64)> onSettled);
    ~PluginParameterWatcher() override;

    /** Register as listener on all parameters of the given processor. */
    void watchProcessor(juce::AudioProcessor* processor);

    /** Remove all parameter listeners. Call before rebuilding the graph. */
    void clearWatches();

    /** Update the "before" reference snapshot (e.g., after graph rebuild or undo/redo). */
    void updateStableSnapshot(const juce::String& base64Snapshot);

    /** Suppress/unsuppress notifications (use during undo/redo restores). */
    void setSuppressed(bool suppressed);

private:
    // juce::AudioProcessorParameter::Listener
    void parameterValueChanged(int parameterIndex, float newValue) override;
    void parameterGestureChanged(int parameterIndex, bool gestureIsStarting) override;

    // juce::Timer
    void timerCallback() override;

    std::function<void(const juce::String&)> settledCallback;

    // All parameters we're listening to (for cleanup)
    std::vector<std::pair<juce::AudioProcessor*, juce::AudioProcessorParameter*>> watchedParams;

    // The snapshot captured before any parameter changes (the "before" state)
    juce::String lastStableSnapshot;
    juce::CriticalSection snapshotLock;

    // Cross-thread atomics
    std::atomic<bool> changeDetected{false};
    std::atomic<int> activeGestureCount{0};
    std::atomic<bool> suppressed{false};

    // Timestamp of last detected change (message-thread only)
    int64_t lastChangeTimeMs = 0;

    // Whether we're in a "dirty" state (changes detected, waiting for settle)
    bool waitingForSettle = false;

    // Debounce period in milliseconds
    static constexpr int64_t kSettleTimeMs = 500;
    // Timer check interval
    static constexpr int kTimerIntervalMs = 100;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginParameterWatcher)
};
