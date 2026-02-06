#pragma once

#include <juce_core/juce_core.h>
#include <juce_events/juce_events.h>
#include <functional>
#include <vector>

/**
 * Represents a received chain share from another user.
 */
struct ReceivedChainShare
{
    juce::String shareId;
    juce::String chainName;
    juce::String chainId;
    juce::String senderUsername;
    juce::String senderId;
    juce::String status;
    int64_t sentAt = 0;
};

/**
 * Manages private chain sharing — polls for received chains,
 * sends chains to friends, accepts/rejects incoming shares.
 *
 * Runs a background polling thread at 30-second intervals.
 * All callbacks are dispatched to the message thread via MessageManager::callAsync.
 */
class ChainSharingManager : private juce::Timer
{
public:
    ChainSharingManager();
    ~ChainSharingManager() override;

    // Start/stop polling for received chains
    void startPolling();
    void stopPolling();
    bool isPolling() const { return isTimerRunning(); }

    // Set the session token (required for all API calls)
    void setSessionToken(const juce::String& token);

    // Set the Convex backend URL
    void setConvexUrl(const juce::String& url);

    // Callbacks — all dispatched on message thread
    std::function<void(const std::vector<ReceivedChainShare>&)> onChainsReceived;
    std::function<void(const juce::String& chainData, const juce::String& chainName)> onChainImported;

    // Actions
    void sendChainToUser(const juce::String& recipientIdentifier,
                         const juce::String& chainId);

    void checkForReceivedChains();

    void acceptChain(const juce::String& shareId);

    void rejectChain(const juce::String& shareId);

    // Get the last known pending chains count
    int getPendingCount() const { return pendingCount.load(); }

private:
    void timerCallback() override;

    // HTTP helper for Convex queries/mutations
    juce::var httpPost(const juce::String& path, const juce::var& args);

    juce::String sessionToken;
    juce::String convexUrl { "https://next-frog-231.convex.cloud" };
    std::atomic<int> pendingCount { 0 };

    static constexpr int POLL_INTERVAL_MS = 30000; // 30 seconds

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ChainSharingManager)
};
