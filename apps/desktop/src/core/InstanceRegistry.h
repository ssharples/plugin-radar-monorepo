#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <vector>
#include <mutex>
#include <atomic>
#include <functional>

using InstanceId = int;

struct InstanceInfo
{
    InstanceId id = -1;
    juce::String trackName;
    juce::Colour trackColour;
    int pluginCount = 0;
    juce::StringArray pluginNames;
    juce::AudioProcessor* processor = nullptr;
};

/**
 * Shared singleton registry of all PluginChainManager instances in the current DAW process.
 * Used via juce::SharedResourcePointer<InstanceRegistry> so the first instance creates it
 * and the last instance to be destroyed cleans it up.
 *
 * All public methods are thread-safe (mutex-protected). All callbacks are dispatched
 * on the message thread via MessageManager::callAsync.
 */
class InstanceRegistry
{
public:
    InstanceRegistry() = default;
    ~InstanceRegistry() = default;

    /** Register a new instance. Returns a unique InstanceId. */
    InstanceId registerInstance(juce::AudioProcessor* processor, const juce::String& trackName = {});

    /** Deregister an instance (called from processor destructor). */
    void deregisterInstance(InstanceId id);

    /** Update info for an existing instance (track name, plugin list, etc.). */
    void updateInstanceInfo(InstanceId id, const InstanceInfo& info);

    /** Get a snapshot of all instances except the one with the given ID. */
    std::vector<InstanceInfo> getOtherInstances(InstanceId excludeId) const;

    /** Get info for a specific instance. Returns empty InstanceInfo if not found. */
    InstanceInfo getInstanceInfo(InstanceId id) const;

    /** Get the total number of registered instances. */
    int getInstanceCount() const;

    // ============================================
    // Listener interface for change notifications
    // ============================================

    class Listener
    {
    public:
        virtual ~Listener() = default;
        /** Called on the message thread when an instance is added, removed, or updated. */
        virtual void instanceRegistryChanged() = 0;
    };

    void addListener(Listener* listener);
    void removeListener(Listener* listener);

    // ============================================
    // Mirror group management (Phase 3)
    // ============================================

    struct MirrorGroup
    {
        int groupId = -1;
        std::set<InstanceId> members;
        uint64_t version = 0;
    };

    /** Create a mirror group between two instances. Returns the group ID. */
    int createMirrorGroup(InstanceId initiator, InstanceId partner);

    /** Add a member to an existing mirror group. */
    bool joinMirrorGroup(int groupId, InstanceId id);

    /** Remove a member from its mirror group. Dissolves group if only 1 member remains. */
    void leaveMirrorGroup(InstanceId id);

    /** Get the mirror group for an instance, or nullptr if not mirrored. */
    const MirrorGroup* getMirrorGroupForInstance(InstanceId id) const;

    /** Get a mutable mirror group (for version increment). */
    MirrorGroup* getMirrorGroupForInstanceMutable(InstanceId id);

    /** Get a mirror group by ID. */
    const MirrorGroup* getMirrorGroup(int groupId) const;

    /**
     * Request reconnection to a mirror group saved in a DAW session.
     * If another instance has already requested the same savedGroupId,
     * creates the actual mirror group and calls both callbacks on the message thread.
     * @return the new group ID, or -1 if deferred (waiting for partner).
     */
    int requestMirrorReconnection(int savedGroupId, InstanceId instanceId,
                                  std::function<void(int newGroupId)> callback = nullptr);

    /** Cancel any pending deferred reconnection for an instance. */
    void cancelDeferredReconnection(InstanceId id);

private:
    mutable std::mutex mutex;
    std::vector<InstanceInfo> instances;
    std::atomic<InstanceId> nextId { 1 };

    // Mirror groups
    std::vector<MirrorGroup> mirrorGroups;
    int nextMirrorGroupId = 1;

    // Deferred mirror reconnections (DAW session restore)
    struct DeferredMirrorReconnection
    {
        int savedGroupId;
        InstanceId instanceId;
        std::function<void(int newGroupId)> callback;
    };
    std::vector<DeferredMirrorReconnection> deferredReconnections;

    juce::ListenerList<Listener> listeners;

    void notifyListeners();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(InstanceRegistry)
};
