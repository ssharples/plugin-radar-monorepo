#include "MirrorManager.h"
#include "../PluginProcessor.h"
#include "ChainProcessor.h"
#include "ChainNode.h"

MirrorManager::MirrorManager(PluginChainManagerProcessor& proc, InstanceRegistry& reg)
    : processor(proc)
    , registry(reg)
{
    registry.addListener(this);
}

MirrorManager::~MirrorManager()
{
    registry.removeListener(this);
    stopTimer();
    leaveMirrorGroup();
}

int MirrorManager::startMirror(InstanceId partnerId)
{
    auto myId = processor.getInstanceId();

    // Create mirror group in the shared registry
    int groupId = registry.createMirrorGroup(myId, partnerId);
    if (groupId < 0)
        return -1;

    // Start param diff timer at 15Hz
    startTimerHz(15);

    // Take initial parameter snapshot
    previousParamSnapshot = captureParameterSnapshot();

    // Propagate our current chain to the partner as the initial state
    propagateChainToPartners();

    // Notify listeners
    juce::MessageManager::callAsync([this]() {
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

    juce::MessageManager::callAsync([this]() {
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

    juce::MessageManager::callAsync([this]() {
        listeners.call([](Listener& l) { l.mirrorStateChanged(); });
    });
}

void MirrorManager::instanceRegistryChanged()
{
    // Detect when our mirror group was dissolved (e.g. partner instance destroyed)
    bool currentlyMirrored = isMirrored();
    if (!currentlyMirrored && isTimerRunning())
    {
        stopTimer();
        lastAppliedVersion = 0;
        previousParamSnapshot.clear();

        listeners.call([](Listener& l) { l.mirrorStateChanged(); });
    }
}

bool MirrorManager::isMirrored() const
{
    return registry.getMirrorGroupForInstance(processor.getInstanceId()) != nullptr;
}

int MirrorManager::getMirrorGroupId() const
{
    auto* group = registry.getMirrorGroupForInstance(processor.getInstanceId());
    return group ? group->groupId : -1;
}

std::vector<InstanceId> MirrorManager::getPartnerIds() const
{
    auto myId = processor.getInstanceId();
    auto* group = registry.getMirrorGroupForInstance(myId);
    if (!group)
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
        return;

    propagateChainToPartners();
}

void MirrorManager::applyMirrorUpdate(const juce::var& chainData, uint64_t version)
{
    // Drop duplicate or older versions
    if (version <= lastAppliedVersion)
        return;

    lastAppliedVersion = version;

    // Suppress the onChainChanged callback from re-propagating this change
    suppressLocalNotification.store(true, std::memory_order_release);

    auto& chainProcessor = processor.getChainProcessor();
    chainProcessor.importChainWithPresets(chainData);

    suppressLocalNotification.store(false, std::memory_order_release);

    // Update parameter snapshot after structural change
    previousParamSnapshot = captureParameterSnapshot();

    juce::MessageManager::callAsync([this]() {
        listeners.call([](Listener& l) { l.mirrorUpdateApplied(); });
    });
}

void MirrorManager::applyParameterDiffs(const std::vector<std::tuple<int, int, float>>& paramDiffs)
{
    auto& chainProcessor = processor.getChainProcessor();

    // Suppress to prevent re-propagation
    suppressLocalNotification.store(true, std::memory_order_release);

    for (const auto& [slotIndex, paramIndex, value] : paramDiffs)
    {
        auto* proc = chainProcessor.getSlotProcessor(slotIndex);
        if (proc)
        {
            auto& params = proc->getParameters();
            if (paramIndex >= 0 && paramIndex < params.size())
                params[paramIndex]->setValue(value);
        }
    }

    suppressLocalNotification.store(false, std::memory_order_release);

    // Update our snapshot to include received changes
    previousParamSnapshot = captureParameterSnapshot();
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

void MirrorManager::propagateChainToPartners()
{
    auto& chainProcessor = processor.getChainProcessor();
    auto chainData = chainProcessor.exportChainWithPresets();
    auto myId = processor.getInstanceId();

    // Increment version in the mirror group
    auto* group = registry.getMirrorGroupForInstanceMutable(myId);
    if (!group)
        return;

    uint64_t version = ++group->version;
    lastAppliedVersion = version;

    // Dispatch on message thread to safely access partner processors.
    // getInstanceInfo() returns the processor pointer (unlike getOtherInstances which strips it).
    juce::MessageManager::callAsync([this, chainData, version]()
    {
        auto partners = getPartnerIds();
        for (auto partnerId : partners)
        {
            auto partnerInfo = registry.getInstanceInfo(partnerId);
            if (partnerInfo.processor)
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

    auto currentSnapshot = captureParameterSnapshot();

    // Build diff
    std::vector<std::tuple<int, int, float>> diffs;

    // Quick diff: compare by index (same order guaranteed since same chain structure)
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

    // Send diffs to partners
    auto partners = getPartnerIds();

    for (auto partnerId : partners)
    {
        auto partnerInfo = registry.getInstanceInfo(partnerId);
        if (partnerInfo.processor)
        {
            auto* partnerProcessor = dynamic_cast<PluginChainManagerProcessor*>(partnerInfo.processor);
            if (partnerProcessor)
            {
                partnerProcessor->getMirrorManager().applyParameterDiffs(diffs);
            }
        }
    }
}

std::vector<MirrorManager::ParamSnapshot> MirrorManager::captureParameterSnapshot() const
{
    std::vector<ParamSnapshot> snapshot;
    auto& chainProcessor = processor.getChainProcessor();
    auto flatPlugins = chainProcessor.getFlatPluginList();

    for (int slotIndex = 0; slotIndex < static_cast<int>(flatPlugins.size()); ++slotIndex)
    {
        auto* proc = chainProcessor.getSlotProcessor(slotIndex);
        if (!proc)
            continue;

        auto& params = proc->getParameters();
        for (int i = 0; i < params.size(); ++i)
        {
            // Use slotIndex as the node identifier (mirrored chains have identical structure)
            snapshot.push_back({ slotIndex, i, params[i]->getValue() });
        }
    }

    return snapshot;
}
