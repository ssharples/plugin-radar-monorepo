#include "MirrorManager.h"
#include "../PluginProcessor.h"
#include "../utils/ProChainLogger.h"
#include "ChainProcessor.h"
#include "ChainNode.h"

MirrorManager::MirrorManager(PluginChainManagerProcessor& proc, InstanceRegistry& reg)
    : processor(proc)
    , registry(reg)
{
    registry.addListener(this);
}

MirrorManager::~MirrorManager() noexcept
{
    // Signal to all pending async callbacks that this object is destroyed
    aliveFlag->store(false, std::memory_order_release);

    registry.removeListener(this);
    stopTimer();

    // Inline leave logic to avoid callAsync in leaveMirrorGroup during destruction
    if (isMirrored())
    {
        registry.leaveMirrorGroup(processor.getInstanceId());
    }
}

int MirrorManager::startMirror(InstanceId partnerId)
{
    auto myId = processor.getInstanceId();

    PCLOG("MirrorManager::startMirror — myId=" + juce::String(myId) + " partnerId=" + juce::String(partnerId));

    // Determine which instance has the "better" chain (more plugins).
    // If we're empty and the partner has plugins, pull from the partner
    // instead of pushing our empty chain to them.
    auto& localChain = processor.getChainProcessor();
    auto localPlugins = localChain.getFlatPluginList();
    int localCount = static_cast<int>(localPlugins.size());

    int partnerCount = 0;
    auto partnerInfo = registry.getInstanceInfo(partnerId);
    if (partnerInfo.processor != nullptr)
    {
        auto* partnerProcessor = dynamic_cast<PluginChainManagerProcessor*>(partnerInfo.processor);
        if (partnerProcessor)
            partnerCount = static_cast<int>(partnerProcessor->getChainProcessor().getFlatPluginList().size());
    }

    // Determine leader: the instance with content becomes leader.
    // If partner is already in a group, createMirrorGroup will preserve its existing leader.
    InstanceId leaderId = (localCount == 0 && partnerCount > 0) ? partnerId : myId;

    // Create mirror group in the shared registry (or join partner's existing group)
    int groupId = registry.createMirrorGroup(myId, partnerId, leaderId);
    if (groupId < 0)
    {
        PCLOG("MirrorManager::startMirror — createMirrorGroup failed");
        return -1;
    }

    PCLOG("MirrorManager::startMirror — localPlugins=" + juce::String(localCount)
          + " partnerPlugins=" + juce::String(partnerCount));

    // Start param diff timer at 15Hz
    startTimerHz(15);

    if (localCount == 0 && partnerCount > 0)
    {
        // Partner has the chain we want — pull from them
        PCLOG("MirrorManager::startMirror — pulling chain from partner (partner has plugins, we're empty)");

        if (auto* partnerProcessor = dynamic_cast<PluginChainManagerProcessor*>(partnerInfo.processor))
        {
            auto chainData = partnerProcessor->getChainProcessor().exportChainWithPresets();
            uint64_t version = registry.incrementMirrorGroupVersion(myId);
            lastAppliedVersion = version;

            // Suppress re-propagation while we import.
            // Clear via callAsync so it runs AFTER the queued onChainChanged callback.
            suppressLocalNotification.store(true, std::memory_order_release);
            localChain.importChainWithPresets(chainData);

            std::weak_ptr<std::atomic<bool>> weakStart = aliveFlag;
            juce::MessageManager::callAsync([this, weakStart]() {
                if (auto alive = weakStart.lock(); alive && alive->load(std::memory_order_acquire))
                    suppressLocalNotification.store(false, std::memory_order_release);
            });
        }
    }
    else
    {
        // We have plugins (or both empty) — push our chain to partner
        PCLOG("MirrorManager::startMirror — pushing our chain to partner");
        propagateChainToPartners();
    }

    // Take initial parameter snapshot and structural fingerprint (after any import)
    previousParamSnapshot = captureParameterSnapshot();
    lastPropagatedFingerprint = computeStructuralFingerprint();

    // Notify listeners
    std::weak_ptr<std::atomic<bool>> weak = aliveFlag;
    juce::MessageManager::callAsync([this, weak]() {
        if (auto alive = weak.lock(); alive && alive->load(std::memory_order_acquire))
            listeners.call([](Listener& l) { l.mirrorStateChanged(); });
    });

    return groupId;
}

void MirrorManager::leaveMirrorGroup()
{
    if (!isMirrored())
        return;

    stopTimer();
    registry.leaveMirrorGroup(processor.getInstanceId());
    lastAppliedVersion = 0;
    previousParamSnapshot.clear();
    lastPropagatedFingerprint.clear();

    std::weak_ptr<std::atomic<bool>> weak = aliveFlag;
    juce::MessageManager::callAsync([this, weak]() {
        if (auto alive = weak.lock(); alive && alive->load(std::memory_order_acquire))
            listeners.call([](Listener& l) { l.mirrorStateChanged(); });
    });
}

void MirrorManager::rejoinMirror()
{
    if (!isMirrored())
        return;

    // Start parameter diff timer
    startTimerHz(15);
    previousParamSnapshot = captureParameterSnapshot();

    std::weak_ptr<std::atomic<bool>> weak = aliveFlag;
    juce::MessageManager::callAsync([this, weak]() {
        if (auto alive = weak.lock(); alive && alive->load(std::memory_order_acquire))
            listeners.call([](Listener& l) { l.mirrorStateChanged(); });
    });
}

void MirrorManager::instanceRegistryChanged()
{
    bool currentlyMirrored = isMirrored();

    // Detect when we've just been added to a mirror group (by partner's startMirror call).
    // The partner starts its own timer in startMirror(), but we need to start ours too.
    if (currentlyMirrored && !isTimerRunning())
    {
        PCLOG("MirrorManager::instanceRegistryChanged — joined mirror group, starting 15Hz timer");
        startTimerHz(15);
        previousParamSnapshot = captureParameterSnapshot();
        lastPropagatedFingerprint = computeStructuralFingerprint();

        std::weak_ptr<std::atomic<bool>> weak = aliveFlag;
        juce::MessageManager::callAsync([this, weak]() {
            if (auto alive = weak.lock(); alive && alive->load(std::memory_order_acquire))
                listeners.call([](Listener& l) { l.mirrorStateChanged(); });
        });
    }

    // Detect when our mirror group was dissolved (e.g. partner instance destroyed)
    if (!currentlyMirrored && isTimerRunning())
    {
        PCLOG("MirrorManager::instanceRegistryChanged — left mirror group, stopping timer");
        stopTimer();
        lastAppliedVersion = 0;
        previousParamSnapshot.clear();
        lastPropagatedFingerprint.clear();

        listeners.call([](Listener& l) { l.mirrorStateChanged(); });
    }
}

bool MirrorManager::isMirrored() const
{
    return registry.getMirrorGroupForInstance(processor.getInstanceId()).has_value();
}

bool MirrorManager::isLeader() const
{
    return registry.getLeaderForInstance(processor.getInstanceId()) == processor.getInstanceId();
}

int MirrorManager::getMirrorGroupId() const
{
    auto group = registry.getMirrorGroupForInstance(processor.getInstanceId());
    return group.has_value() ? group->groupId : -1;
}

std::vector<InstanceId> MirrorManager::getPartnerIds() const
{
    auto myId = processor.getInstanceId();
    auto group = registry.getMirrorGroupForInstance(myId);
    if (!group.has_value())
        return {};

    std::vector<InstanceId> partners;
    for (auto memberId : group->members)
    {
        if (memberId != myId)
            partners.push_back(memberId);
    }
    return partners;
}

void MirrorManager::onLocalChainChanged()
{
    if (!isMirrored())
        return;

    // If this change came from a mirror update, don't re-propagate
    if (suppressLocalNotification.load(std::memory_order_acquire))
    {
        PCLOG("MirrorManager::onLocalChainChanged — suppressed (from mirror update)");
        return;
    }

    // Only propagate if the chain structure actually changed (plugin add/remove/move).
    // Property changes (bypass, gain, dry/wet) are synced by the 15Hz parameter timer.
    auto currentFp = computeStructuralFingerprint();
    if (currentFp == lastPropagatedFingerprint)
    {
        PCLOG("MirrorManager::onLocalChainChanged — skipped (fingerprint unchanged)");
        return;
    }

    PCLOG("MirrorManager::onLocalChainChanged — structural change detected, propagating");
    lastPropagatedFingerprint = currentFp;
    propagateChainToPartners();
}

void MirrorManager::applyMirrorUpdate(const juce::var& chainData, uint64_t version)
{
    // Drop duplicate or older versions
    if (version <= lastAppliedVersion)
        return;

    PCLOG("MirrorManager::applyMirrorUpdate — version=" + juce::String(version));

    lastAppliedVersion = version;

    // Suppress the onChainChanged callback from re-propagating this change
    suppressLocalNotification.store(true, std::memory_order_release);

    auto& chainProcessor = processor.getChainProcessor();
    chainProcessor.importChainWithPresets(chainData);

    // DO NOT clear suppressLocalNotification synchronously — the onChainChanged callAsync
    // from importChainWithPresets hasn't fired yet. Clear via callAsync so it runs AFTER
    // the queued onChainChanged callback (JUCE message queue is FIFO).
    previousParamSnapshot = captureParameterSnapshot();
    lastPropagatedFingerprint = computeStructuralFingerprint();

    std::weak_ptr<std::atomic<bool>> weak = aliveFlag;
    juce::MessageManager::callAsync([this, weak]() {
        if (auto alive = weak.lock(); alive && alive->load(std::memory_order_acquire))
            suppressLocalNotification.store(false, std::memory_order_release);
    });

    juce::MessageManager::callAsync([this, weak]() {
        if (auto alive = weak.lock(); alive && alive->load(std::memory_order_acquire))
            listeners.call([](Listener& l) { l.mirrorUpdateApplied(); });
    });
}

void MirrorManager::applyParameterDiffs(const std::vector<std::tuple<int, int, float>>& paramDiffs)
{
    if (paramDiffs.empty())
        return;

    auto& chainProcessor = processor.getChainProcessor();

    // Suppress to prevent re-propagation (setters call notifyChainChanged → onLocalChainChanged)
    suppressLocalNotification.store(true, std::memory_order_release);

    // Get ChainNodeIds for slot-level control setter methods
    auto nodeIds = chainProcessor.getFlatPluginNodeIds();

    for (const auto& [slotIndex, paramIndex, value] : paramDiffs)
    {
        if (paramIndex >= 0)
        {
            // Hosted plugin parameter — setValue + notify listeners so plugin editor UI updates
            auto* proc = chainProcessor.getSlotProcessor(slotIndex);
            if (!proc)
                continue;

            auto& params = proc->getParameters();
            if (paramIndex < params.size())
            {
                params[paramIndex]->setValue(value);
                params[paramIndex]->sendValueChangedMessageToListeners(value);
            }
        }
        else if (slotIndex >= 0 && slotIndex < static_cast<int>(nodeIds.size()))
        {
            // Slot-level control — use ChainProcessor setters (updates leaf + DSP node + UI)
            auto nodeId = nodeIds[static_cast<size_t>(slotIndex)];
            PCLOG("MirrorManager::applyParameterDiffs — slot control: slot=" + juce::String(slotIndex)
                  + " paramIndex=" + juce::String(paramIndex) + " value=" + juce::String(value)
                  + " nodeId=" + juce::String(nodeId));
            switch (paramIndex)
            {
                case -1: chainProcessor.setNodeBypassed(nodeId, value > 0.5f); break;
                case -2: chainProcessor.setNodeInputGain(nodeId, value); break;
                case -3: chainProcessor.setNodeOutputGain(nodeId, value); break;
                case -4: chainProcessor.setNodeDryWet(nodeId, value); break;
                default: break;
            }
        }
    }

    // Update our snapshot to include received changes
    previousParamSnapshot = captureParameterSnapshot();

    // Clear suppress flag via callAsync — runs AFTER any queued onChainChanged callbacks (FIFO)
    std::weak_ptr<std::atomic<bool>> weak = aliveFlag;
    juce::MessageManager::callAsync([this, weak]() {
        if (auto alive = weak.lock(); alive && alive->load(std::memory_order_acquire))
            suppressLocalNotification.store(false, std::memory_order_release);
    });
}

void MirrorManager::addListener(Listener* listener)
{
    listeners.add(listener);
}

void MirrorManager::removeListener(Listener* listener)
{
    listeners.remove(listener);
}

void MirrorManager::timerCallback()
{
    if (!isMirrored())
        return;

    propagateParameterDiffs();
}

juce::String MirrorManager::computeStructuralFingerprint() const
{
    auto& chainProcessor = processor.getChainProcessor();
    const auto& flatPlugins = chainProcessor.getFlatPluginList();
    juce::String fp;
    fp.preallocateBytes(flatPlugins.size() * 64);
    for (const auto* leaf : flatPlugins)
        fp << leaf->description.fileOrIdentifier << "|";
    return fp;
}

void MirrorManager::propagateChainToPartners()
{
    auto myId = processor.getInstanceId();

    // Safely increment version in the mirror group (returns 0 if not mirrored)
    uint64_t version = registry.incrementMirrorGroupVersion(myId);
    if (version == 0)
        return;

    lastAppliedVersion = version;

    PCLOG("MirrorManager::propagateChainToPartners — version=" + juce::String(version)
          + " partners=" + juce::String(static_cast<int>(getPartnerIds().size())));

    // Dispatch to message thread to safely export chain and access partner processors.
    // CRITICAL: exportChainWithPresets() reads rootNode which can be modified on the message thread,
    // so we must call it on the message thread to avoid data races.
    // Use weak pointer pattern: capture weak_ptr to aliveFlag and check before using `this`.
    std::weak_ptr<std::atomic<bool>> weak = aliveFlag;
    juce::MessageManager::callAsync([this, weak, myId, version]()
    {
        auto alive = weak.lock();
        if (!alive || !alive->load(std::memory_order_acquire))
            return;  // MirrorManager was destroyed

        // Re-validate that this instance still exists before accessing processor
        auto myInfo = registry.getInstanceInfo(myId);
        if (myInfo.processor == nullptr)
            return;  // Instance was destroyed

        auto& chainProcessor = processor.getChainProcessor();
        auto chainData = chainProcessor.exportChainWithPresets();

        auto partners = getPartnerIds();
        for (auto partnerId : partners)
        {
            auto partnerInfo = registry.getInstanceInfo(partnerId);
            if (partnerInfo.processor != nullptr)
            {
                auto* partnerProcessor = dynamic_cast<PluginChainManagerProcessor*>(partnerInfo.processor);
                if (partnerProcessor)
                    partnerProcessor->getMirrorManager().applyMirrorUpdate(chainData, version);
            }
        }
    });
}

void MirrorManager::propagateParameterDiffs()
{
    if (suppressLocalNotification.load(std::memory_order_acquire))
        return;

    // timerCallback already runs on the message thread, so no callAsync needed.
    auto currentSnapshot = captureParameterSnapshot();

    // Build diff: compare by index (same order guaranteed since same chain structure)
    std::vector<std::tuple<int, int, float>> diffs;
    size_t minSize = std::min(currentSnapshot.size(), previousParamSnapshot.size());
    for (size_t i = 0; i < minSize; ++i)
    {
        if (currentSnapshot[i].nodeId == previousParamSnapshot[i].nodeId &&
            currentSnapshot[i].paramIndex == previousParamSnapshot[i].paramIndex &&
            std::abs(currentSnapshot[i].value - previousParamSnapshot[i].value) > 1e-6f)
        {
            diffs.emplace_back(currentSnapshot[i].nodeId, currentSnapshot[i].paramIndex, currentSnapshot[i].value);
        }
    }

    previousParamSnapshot = currentSnapshot;

    if (diffs.empty())
        return;

    // Log diff breakdown
    int slotDiffs = 0;
    for (const auto& [s, p, v] : diffs)
        if (p < 0) ++slotDiffs;
    PCLOG("MirrorManager::propagateParameterDiffs — " + juce::String(static_cast<int>(diffs.size()))
          + " diffs (" + juce::String(slotDiffs) + " slot-level), snapshotSize="
          + juce::String(static_cast<int>(currentSnapshot.size()))
          + " prevSize=" + juce::String(static_cast<int>(previousParamSnapshot.size())));

    // Send diffs to partners
    auto partners = getPartnerIds();
    for (auto partnerId : partners)
    {
        auto partnerInfo = registry.getInstanceInfo(partnerId);
        if (partnerInfo.processor != nullptr)
        {
            auto* partnerProcessor = dynamic_cast<PluginChainManagerProcessor*>(partnerInfo.processor);
            if (partnerProcessor)
                partnerProcessor->getMirrorManager().applyParameterDiffs(diffs);
        }
    }
}

std::vector<MirrorManager::ParamSnapshot> MirrorManager::captureParameterSnapshot() const
{
    std::vector<ParamSnapshot> snapshot;
    auto& chainProcessor = processor.getChainProcessor();
    const auto& flatPlugins = chainProcessor.getFlatPluginList();

    for (int slotIndex = 0; slotIndex < static_cast<int>(flatPlugins.size()); ++slotIndex)
    {
        // Hosted plugin parameters (paramIndex >= 0)
        auto* proc = chainProcessor.getSlotProcessor(slotIndex);
        if (proc)
        {
            auto& params = proc->getParameters();
            for (int i = 0; i < params.size(); ++i)
                snapshot.push_back({ slotIndex, i, params[i]->getValue() });
        }

        // Slot-level controls (paramIndex < 0)
        // These are PluginLeaf properties not exposed as AudioProcessorParameters
        const auto* leaf = flatPlugins[static_cast<size_t>(slotIndex)];
        snapshot.push_back({ slotIndex, -1, leaf->bypassed ? 1.0f : 0.0f });
        snapshot.push_back({ slotIndex, -2, leaf->inputGainDb });
        snapshot.push_back({ slotIndex, -3, leaf->outputGainDb });
        snapshot.push_back({ slotIndex, -4, leaf->dryWetMix });
    }

    return snapshot;
}

bool MirrorManager::validateMirrorStructure(const std::vector<ParamSnapshot>& incoming) const
{
    auto local = captureParameterSnapshot();
    if (incoming.size() != local.size())
        return false;

    // Compare plugin types at each slot
    for (size_t i = 0; i < incoming.size(); ++i)
    {
        if (incoming[i].nodeId != local[i].nodeId)
            return false;  // Structure mismatch
    }
    return true;
}
