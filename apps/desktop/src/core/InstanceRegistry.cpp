#include "InstanceRegistry.h"

InstanceRegistry::~InstanceRegistry()
{
    aliveFlag->store(false, std::memory_order_release);
}

InstanceId InstanceRegistry::registerInstance(juce::AudioProcessor* processor, const juce::String& trackName)
{
    InstanceId id = nextId.fetch_add(1);

    {
        std::lock_guard<std::mutex> lock(mutex);
        InstanceInfo info;
        info.id = id;
        info.trackName = trackName.isEmpty() ? ("Instance #" + juce::String(id)) : trackName;
        info.processor = processor;
        instances.push_back(info);
    }

    notifyListeners();
    return id;
}

void InstanceRegistry::deregisterInstance(InstanceId id)
{
    {
        std::lock_guard<std::mutex> lock(mutex);

        // Remove from mirror groups first
        for (auto it = mirrorGroups.begin(); it != mirrorGroups.end();)
        {
            it->members.erase(id);
            if (it->members.size() <= 1)
            {
                it = mirrorGroups.erase(it);
            }
            else
            {
                // Leader succession
                if (it->leaderId == id && !it->members.empty())
                    it->leaderId = *it->members.begin();
                ++it;
            }
        }

        // Remove any pending deferred reconnection
        deferredReconnections.erase(
            std::remove_if(deferredReconnections.begin(), deferredReconnections.end(),
                [id](const DeferredMirrorReconnection& d) { return d.instanceId == id; }),
            deferredReconnections.end()
        );

        instances.erase(
            std::remove_if(instances.begin(), instances.end(),
                [id](const InstanceInfo& info) { return info.id == id; }),
            instances.end()
        );
    }

    notifyListeners();
}

void InstanceRegistry::updateInstanceInfo(InstanceId id, const InstanceInfo& updatedInfo)
{
    {
        std::lock_guard<std::mutex> lock(mutex);
        for (auto& info : instances)
        {
            if (info.id == id)
            {
                info.trackName = updatedInfo.trackName;
                info.trackColour = updatedInfo.trackColour;
                info.pluginCount = updatedInfo.pluginCount;
                info.pluginNames = updatedInfo.pluginNames;
                // Don't overwrite processor pointer
                break;
            }
        }
    }

    notifyListeners();
}

std::vector<InstanceInfo> InstanceRegistry::getOtherInstances(InstanceId excludeId) const
{
    std::lock_guard<std::mutex> lock(mutex);
    std::vector<InstanceInfo> result;
    for (const auto& info : instances)
    {
        if (info.id != excludeId)
        {
            // Return a copy without the processor pointer (for safety)
            InstanceInfo copy = info;
            copy.processor = nullptr;
            result.push_back(copy);
        }
    }
    return result;
}

void InstanceRegistry::cleanupStaleReconnections()
{
    std::lock_guard<std::mutex> lock(mutex);
    auto now = juce::Time::getCurrentTime();

    deferredReconnections.erase(
        std::remove_if(deferredReconnections.begin(), deferredReconnections.end(),
            [now](const DeferredMirrorReconnection& r) {
                return (now - r.timestamp).inSeconds() > 30;
            }),
        deferredReconnections.end()
    );
}

InstanceInfo InstanceRegistry::getInstanceInfo(InstanceId id) const
{
    std::lock_guard<std::mutex> lock(mutex);
    for (const auto& info : instances)
    {
        if (info.id == id)
            return info;
    }
    return {};
}

int InstanceRegistry::getInstanceCount() const
{
    std::lock_guard<std::mutex> lock(mutex);
    return static_cast<int>(instances.size());
}

void InstanceRegistry::addListener(Listener* listener)
{
    listeners.add(listener);
}

void InstanceRegistry::removeListener(Listener* listener)
{
    listeners.remove(listener);
}

void InstanceRegistry::notifyListeners()
{
    // Dispatch on message thread to avoid callback from audio thread or mutex holder
    std::weak_ptr<std::atomic<bool>> weak = aliveFlag;
    juce::MessageManager::callAsync([this, weak]()
    {
        auto alive = weak.lock();
        if (!alive || !alive->load(std::memory_order_acquire))
            return;  // InstanceRegistry was destroyed
        listeners.call([](Listener& l) { l.instanceRegistryChanged(); });
    });
}

// ============================================
// Mirror group management
// ============================================

int InstanceRegistry::createMirrorGroup(InstanceId initiator, InstanceId partner, InstanceId leaderId)
{
    std::lock_guard<std::mutex> lock(mutex);

    // Check if partner is already in an existing group — join it instead of creating new
    for (auto& group : mirrorGroups)
    {
        if (group.members.count(partner) > 0)
        {
            // Remove initiator from any OTHER group it might be in
            for (auto it = mirrorGroups.begin(); it != mirrorGroups.end();)
            {
                if (it->groupId != group.groupId)
                {
                    it->members.erase(initiator);
                    if (it->members.size() <= 1)
                        it = mirrorGroups.erase(it);
                    else
                        ++it;
                }
                else
                    ++it;
            }
            // Add initiator to partner's existing group, preserve existing leader
            group.members.insert(initiator);
            return group.groupId;
        }
    }

    // Check if initiator is already in an existing group — add partner to it
    for (auto& group : mirrorGroups)
    {
        if (group.members.count(initiator) > 0)
        {
            // Remove partner from any OTHER group
            for (auto it = mirrorGroups.begin(); it != mirrorGroups.end();)
            {
                if (it->groupId != group.groupId)
                {
                    it->members.erase(partner);
                    if (it->members.size() <= 1)
                        it = mirrorGroups.erase(it);
                    else
                        ++it;
                }
                else
                    ++it;
            }
            // Add partner to initiator's existing group, preserve existing leader
            group.members.insert(partner);
            return group.groupId;
        }
    }

    // Neither is in a group — create fresh
    MirrorGroup group;
    group.groupId = nextMirrorGroupId++;
    group.members.insert(initiator);
    group.members.insert(partner);
    group.leaderId = leaderId;
    group.version = 0;
    mirrorGroups.push_back(group);

    return group.groupId;
}

bool InstanceRegistry::joinMirrorGroup(int groupId, InstanceId id)
{
    std::lock_guard<std::mutex> lock(mutex);
    for (auto& group : mirrorGroups)
    {
        if (group.groupId == groupId)
        {
            group.members.insert(id);
            return true;
        }
    }
    return false;
}

void InstanceRegistry::leaveMirrorGroup(InstanceId id)
{
    std::lock_guard<std::mutex> lock(mutex);
    for (auto it = mirrorGroups.begin(); it != mirrorGroups.end();)
    {
        it->members.erase(id);
        if (it->members.size() <= 1)
        {
            it = mirrorGroups.erase(it);
        }
        else
        {
            // Leader succession: if the departing member was leader, promote lowest ID
            if (it->leaderId == id && !it->members.empty())
                it->leaderId = *it->members.begin();  // std::set is sorted, lowest ID first
            ++it;
        }
    }
}

std::optional<InstanceRegistry::MirrorGroup> InstanceRegistry::getMirrorGroupForInstance(InstanceId id) const
{
    std::lock_guard<std::mutex> lock(mutex);
    for (const auto& group : mirrorGroups)
    {
        if (group.members.count(id) > 0)
            return group;  // Return copy
    }
    return std::nullopt;
}

std::optional<InstanceRegistry::MirrorGroup> InstanceRegistry::getMirrorGroupForInstanceMutable(InstanceId id)
{
    std::lock_guard<std::mutex> lock(mutex);
    for (auto& group : mirrorGroups)
    {
        if (group.members.count(id) > 0)
            return group;
    }
    return std::nullopt;
}

uint64_t InstanceRegistry::incrementMirrorGroupVersion(InstanceId id)
{
    std::lock_guard<std::mutex> lock(mutex);
    for (auto& group : mirrorGroups)
    {
        if (group.members.count(id) > 0)
            return ++group.version;
    }
    return 0;
}

std::optional<InstanceRegistry::MirrorGroup> InstanceRegistry::getMirrorGroup(int groupId) const
{
    std::lock_guard<std::mutex> lock(mutex);
    for (const auto& group : mirrorGroups)
    {
        if (group.groupId == groupId)
            return group;  // Return copy
    }
    return std::nullopt;
}

int InstanceRegistry::requestMirrorReconnection(int savedGroupId, InstanceId instanceId,
                                                 bool wasLeader,
                                                 std::function<void(int newGroupId)> callback)
{
    std::function<void(int)> partnerCallback;
    int newGroupId = -1;

    {
        std::lock_guard<std::mutex> lock(mutex);

        // Check if another instance already requested the same saved group
        for (auto it = deferredReconnections.begin(); it != deferredReconnections.end(); ++it)
        {
            if (it->savedGroupId == savedGroupId)
            {
                auto partnerId = it->instanceId;
                bool partnerWasLeader = it->wasLeader;
                partnerCallback = std::move(it->callback);
                deferredReconnections.erase(it);

                // Create mirror group inline (can't call createMirrorGroup — mutex already locked)
                for (auto git = mirrorGroups.begin(); git != mirrorGroups.end();)
                {
                    git->members.erase(instanceId);
                    git->members.erase(partnerId);
                    if (git->members.size() <= 1)
                        git = mirrorGroups.erase(git);
                    else
                        ++git;
                }

                // Determine leader: if exactly one claims leadership, they win.
                // If both or neither, lowest ID wins.
                InstanceId newLeader;
                if (wasLeader && !partnerWasLeader)
                    newLeader = instanceId;
                else if (partnerWasLeader && !wasLeader)
                    newLeader = partnerId;
                else
                    newLeader = std::min(instanceId, partnerId);

                MirrorGroup group;
                group.groupId = nextMirrorGroupId++;
                group.members.insert(instanceId);
                group.members.insert(partnerId);
                group.leaderId = newLeader;
                group.version = 0;
                mirrorGroups.push_back(group);
                newGroupId = group.groupId;
                break;
            }
        }

        if (newGroupId < 0)
            deferredReconnections.push_back({ savedGroupId, instanceId, wasLeader, std::move(callback), juce::Time::getCurrentTime() });
    }

    // Outside lock: invoke callbacks on message thread and notify listeners
    if (newGroupId >= 0)
    {
        if (partnerCallback)
            juce::MessageManager::callAsync([partnerCallback, newGroupId]() { partnerCallback(newGroupId); });
        if (callback)
            juce::MessageManager::callAsync([callback, newGroupId]() { callback(newGroupId); });
        notifyListeners();
    }

    return newGroupId;
}

InstanceId InstanceRegistry::getLeaderForInstance(InstanceId id) const
{
    std::lock_guard<std::mutex> lock(mutex);
    for (const auto& group : mirrorGroups)
    {
        if (group.members.count(id) > 0)
            return group.leaderId;
    }
    return -1;
}

void InstanceRegistry::cancelDeferredReconnection(InstanceId id)
{
    std::lock_guard<std::mutex> lock(mutex);
    deferredReconnections.erase(
        std::remove_if(deferredReconnections.begin(), deferredReconnections.end(),
            [id](const DeferredMirrorReconnection& d) { return d.instanceId == id; }),
        deferredReconnections.end()
    );
}
