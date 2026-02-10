#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "InstanceRegistry.h"
#include <vector>
#include <atomic>

class PluginChainManagerProcessor;
class ChainProcessor;

/**
 * Per-instance manager for chain mirroring between PluginChainManager instances.
 * When two instances are mirrored, structural changes (add/remove/move plugin)
 * and parameter changes are synchronized bidirectionally.
 *
 * Structural changes use exportChainWithPresets/importChainWithPresets.
 * Parameter changes use a 15Hz timer to diff and propagate.
 */
class MirrorManager : private juce::Timer, private InstanceRegistry::Listener
{
public:
    MirrorManager(PluginChainManagerProcessor& processor, InstanceRegistry& registry);
    ~MirrorManager() override;

    /** Create a new mirror group with another instance. Returns group ID, or -1 on failure. */
    int startMirror(InstanceId partnerId);

    /** Leave the current mirror group. */
    void leaveMirrorGroup();

    /** Called when a deferred mirror reconnection succeeds (DAW session restore). */
    void rejoinMirror();

    /** Check if this instance is currently mirrored. */
    bool isMirrored() const;

    /** Get the mirror group ID, or -1 if not mirrored. */
    int getMirrorGroupId() const;

    /** Get the IDs of mirror partners (excluding self). */
    std::vector<InstanceId> getPartnerIds() const;

    /**
     * Called when the local chain changes (from onChainChanged callback).
     * If mirrored and not suppressed, propagates the change to partners.
     */
    void onLocalChainChanged();

    /**
     * Called by a remote MirrorManager to apply a mirrored chain update.
     * @param chainData The exported chain data (from exportChainWithPresets)
     * @param version The version number to prevent loops
     */
    void applyMirrorUpdate(const juce::var& chainData, uint64_t version);

    /**
     * Called by a remote MirrorManager to apply parameter diffs.
     * @param paramDiffs Array of {nodeId, paramIndex, value} changes
     */
    void applyParameterDiffs(const std::vector<std::tuple<int, int, float>>& paramDiffs);

    // ============================================
    // Listener for mirror state changes
    // ============================================

    class Listener
    {
    public:
        virtual ~Listener() = default;
        virtual void mirrorStateChanged() = 0;
        virtual void mirrorUpdateApplied() = 0;
    };

    void addListener(Listener* listener);
    void removeListener(Listener* listener);

private:
    void timerCallback() override;
    void instanceRegistryChanged() override;
    void propagateChainToPartners();
    void propagateParameterDiffs();

    /** Take a snapshot of all plugin parameter values for diff comparison. */
    struct ParamSnapshot
    {
        int nodeId;
        int paramIndex;
        float value;
    };
    std::vector<ParamSnapshot> captureParameterSnapshot() const;

    PluginChainManagerProcessor& processor;
    InstanceRegistry& registry;

    // State
    std::atomic<bool> suppressLocalNotification { false };
    uint64_t lastAppliedVersion = 0;

    // Parameter diff state
    std::vector<ParamSnapshot> previousParamSnapshot;

    juce::ListenerList<Listener> listeners;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MirrorManager)
};
