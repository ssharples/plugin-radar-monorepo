#include "ChainProcessor.h"
#include "HostRestoreAdapter.h"
#include <cmath>
#include <stdexcept>

struct ChainProcessor::PreparedRestore
{
    ChainNode tree;
    ChainNodeId nextId = 1;
    bool allowPartial = false, addition = false;
    ChainNodeId parentId = 0;
    int insertIndex = -1;
    std::vector<PluginLeaf*> leaves;
    std::vector<std::unique_ptr<juce::AudioPluginInstance>> instances;
    size_t nextPlugin = 0;
    RestoreResult result;
    RestoreCompletion completion;
    RestoreProgress progress;
    std::function<void(PluginLeaf&, juce::AudioPluginInstance&)> configureInstance;
};

namespace {
void recordIssue(ChainProcessor::RestoreResult& result, PluginLeaf& leaf, const juce::String& error)
{
    leaf.loadError = error.isNotEmpty() ? error : "The effect could not be created";
    result.missingPlugins.addIfNotAlreadyThere(leaf.description.name);
    auto issue = std::make_unique<juce::DynamicObject>();
    issue->setProperty("pluginId", leaf.persistentId);
    issue->setProperty("pluginName", leaf.description.name);
    issue->setProperty("message", leaf.loadError);
    result.issues.add(juce::var(issue.release()));
}
void restoreVendorState(PluginLeaf& leaf, juce::AudioPluginInstance& instance)
{
    if (leaf.retainedState.isEmpty()) return;
    juce::MemoryBlock state;
    if (!state.fromBase64Encoding(leaf.retainedState)) throw std::runtime_error("Invalid effect state encoding");
    instance.setStateInformation(state.getData(), static_cast<int>(state.getSize()));
}
}

std::unique_ptr<ChainNode> ChainProcessor::parseNode(const juce::XmlElement& xml, ChainNodeId& nextId,
                                                   std::set<int>& ids, std::set<juce::String>& pluginIds)
{
    if (ids.size() >= 1024) throw std::runtime_error("Chain exceeds the supported node count");
    auto node = std::make_unique<ChainNode>();
    node->id = xml.getIntAttribute("id", nextId);
    if (node->id <= 0 || !ids.insert(node->id).second) throw std::runtime_error("Duplicate or invalid chain node identity");
    nextId = juce::jmax(nextId, node->id + 1);
    node->branchGainDb = static_cast<float>(xml.getDoubleAttribute("branchGainDb", 0.0));
    if (!std::isfinite(node->branchGainDb) || node->branchGainDb < -100.0f || node->branchGainDb > 24.0f)
        throw std::runtime_error("Invalid branch gain");
    node->solo = xml.getBoolAttribute("solo"); node->mute = xml.getBoolAttribute("mute");
    node->polarityInverted = xml.getBoolAttribute("polarityInverted");
    const auto type = xml.getStringAttribute("type");
    if (type == "plugin")
    {
        PluginLeaf leaf;
        leaf.persistentId = xml.getStringAttribute("persistentId", leaf.persistentId);
        if (leaf.persistentId.isEmpty() || !pluginIds.insert(leaf.persistentId).second)
            throw std::runtime_error("Duplicate or empty effect identity");
        auto* description = xml.getChildByName("PLUGIN");
        if (!description || !leaf.description.loadFromXml(*description)) throw std::runtime_error("Missing effect description");
        leaf.bypassed = xml.getBoolAttribute("bypassed"); leaf.suspended = xml.getBoolAttribute("suspended");
        leaf.recallSafe = xml.getBoolAttribute("recallSafe"); leaf.ignoreLatency = xml.getBoolAttribute("ignoreLatency");
        leaf.sidechain = xml.getBoolAttribute("sidechain");
        leaf.retainedState = xml.getStringAttribute("state");
        juce::MemoryBlock state;
        if (leaf.retainedState.isNotEmpty() && !state.fromBase64Encoding(leaf.retainedState))
            throw std::runtime_error("Invalid effect state encoding");
        node->name = leaf.description.name; node->data = std::move(leaf);
    }
    else if (type == "group")
    {
        GroupData group;
        if (!parseGroupMode(xml.getStringAttribute("mode", "serial"), group.mode)) throw std::runtime_error("Invalid group mode");
        if (!CrossoverHelpers::fromString(xml.getStringAttribute("crossover"), group.crossoverHz))
            throw std::runtime_error("Invalid crossover frequencies");
        group.dryWetMix = static_cast<float>(xml.getDoubleAttribute("dryWet", 1.0));
        if (!std::isfinite(group.dryWetMix) || group.dryWetMix < 0 || group.dryWetMix > 1)
            throw std::runtime_error("Invalid dry/wet value");
        node->name = xml.getStringAttribute("name", "Group"); node->collapsed = xml.getBoolAttribute("collapsed");
        for (auto* child : xml.getChildWithTagNameIterator("Node"))
            group.children.push_back(parseNode(*child, nextId, ids, pluginIds));
        if (group.mode == GroupMode::Crossover)
        {
            if (static_cast<int>(group.children.size()) > kMaxCrossoverBands) throw std::runtime_error("Too many crossover bands");
            CrossoverHelpers::fitFrequencies(group);
        }
        node->data = std::move(group);
    }
    else throw std::runtime_error("Unrecognised chain node type");
    return node;
}

std::shared_ptr<ChainProcessor::PreparedRestore> ChainProcessor::prepareRestoreSkeleton(const juce::XmlElement& xml, bool partial,
                                                                                   bool reuseUnchanged, bool respectRecallSafe)
{
    auto candidate = std::make_shared<PreparedRestore>();
    candidate->tree.id = 0; candidate->tree.name = "Root"; candidate->tree.data = GroupData{};
    candidate->allowPartial = partial;
    try
    {
        if (!xml.hasTagName("ChainTree") && !xml.hasTagName("ChainState") && !xml.hasTagName("Chain"))
            throw std::runtime_error("Unrecognised chain state");
        std::set<int> ids; std::set<juce::String> pluginIds;
        for (auto* child : xml.getChildWithTagNameIterator("Node"))
            candidate->tree.getGroup().children.push_back(parseNode(*child, candidate->nextId, ids, pluginIds));
        for (auto* slot : xml.getChildWithTagNameIterator("Slot"))
        {
            juce::XmlElement child(*slot); child.setTagName("Node"); child.setAttribute("type", "plugin");
            child.setAttribute("id", candidate->nextId);
            candidate->tree.getGroup().children.push_back(parseNode(child, candidate->nextId, ids, pluginIds));
        }
        if (respectRecallSafe) keepRecallSafeSlots(*candidate);
        ChainNodeHelpers::collectPluginsMut(candidate->tree, candidate->leaves);
        candidate->instances.resize(candidate->leaves.size());
        if (reuseUnchanged)
        {
            auto current = getFlatPluginList();
            for (auto* leaf : candidate->leaves)
                if (leaf->graphNodeId == NodeID()) // recall-safe slots are already kept
                for (auto* existing : current)
                    if (leaf->persistentId == existing->persistentId
                        && leaf->description.createIdentifierString() == existing->description.createIdentifierString()
                        && leaf->description.version == existing->description.version)
                        if (auto* hosted = getHosted(*existing))
                        {
                            juce::MemoryBlock state; hosted->getStateInformation(state);
                            if (state.toBase64Encoding() == leaf->retainedState) leaf->graphNodeId = existing->graphNodeId;
                            break;
                        }
        }
    }
    catch (const std::exception& e) { candidate->result.error = e.what(); }
    return candidate;
}

ChainProcessor::RestoreResult ChainProcessor::commitRestore(const std::shared_ptr<PreparedRestore>& candidate,
                                                            RestoreCompletion completion)
{
    auto result = candidate->result;
    if (result.error.isNotEmpty()) return result;
    if (!candidate->allowPartial && !result.missingPlugins.isEmpty())
    { result.error = "Current chain retained. Some effects could not be loaded."; return result; }
    std::vector<NodeID> added;
    for (size_t i = 0; i < candidate->leaves.size(); ++i)
    {
        auto& leaf = *candidate->leaves[i];
        if (!candidate->instances[i]) continue;
        juce::String error;
        auto graphNode = addHostedInstance(std::move(candidate->instances[i]), leaf.bypassed, leaf.suspended, error);
        if (!graphNode)
        {
            recordIssue(result, leaf, error);
            if (!candidate->allowPartial)
            {
                for (auto id : added) { AudioProcessorGraph::removeNode(id, UpdateKind::none); preparedNodes.erase(id); }
                result.error = "Current chain retained. " + error; return result;
            }
        }
        else { leaf.graphNodeId = graphNode->nodeID; added.push_back(graphNode->nodeID); }
    }
    auto previous = std::move(rootNode);
    rootNode = std::move(candidate->tree);
    rebuildGraph();
    if (lastError.isNotEmpty())
    {
        auto error = lastError; candidate->tree = std::move(rootNode); rootNode = std::move(previous);
        for (auto id : added) { AudioProcessorGraph::removeNode(id, UpdateKind::none); preparedNodes.erase(id); }
        // The active rendering graph has not changed. Recreate only the control registry's wiring.
        rebuildGraph(); result.error = "Current chain retained. " + error; return result;
    }
    std::set<NodeID> retained;
    for (auto* leaf : candidate->leaves) if (leaf->graphNodeId != NodeID()) retained.insert(leaf->graphNodeId);
    std::vector<PluginLeaf*> oldLeaves; ChainNodeHelpers::collectPluginsMut(previous, oldLeaves);
    for (auto* leaf : oldLeaves)
        if (retained.count(leaf->graphNodeId) == 0) retirePlugin(*leaf);
    closeRetiredPluginWindows(previous, retained);
    nextNodeId = candidate->nextId; cachedSlotsDirty = true;
    result.success = true; result.status = result.missingPlugins.isEmpty() ? "committed" : "partial";
    if (completion)
    {
        const auto version = renderRevision;
        commitCallbacks.emplace(version, [this, version, completion = std::move(completion), result]() mutable {
            // A newer graph may replace a pending graph before the audio callback takes it.
            if (activeRevision.load() > version || (activeRevision.load() != version && notifiedRevision > version))
            { result.success = false; result.status = "superseded"; }
            completion(result);
        });
    }
    notifyChainChanged();
    return result;
}

ChainProcessor::RestoreResult ChainProcessor::restoreChainFromXml(const juce::XmlElement& xml, bool allowPartial)
{
    // DAW restore is synchronous and never enters the UI browsing queue.
    if (!juce::MessageManager::getInstance()->isThisTheMessageThread())
    {
        RestoreResult result;
        onHostControlThread([&] { result = restoreChainFromXml(xml, allowPartial); });
        return result;
    }
    cancelPendingLoads();
    auto candidate = prepareRestoreSkeleton(xml, allowPartial);
    if (candidate->result.error.isNotEmpty()) return candidate->result;
    for (size_t i = 0; i < candidate->leaves.size(); ++i)
    {
        auto& leaf = *candidate->leaves[i]; juce::String error;
        try
        {
            if (leaf.description.isInstrument) throw std::runtime_error("This release supports stereo effects, not instruments");
            auto instance = pluginManager.createPluginInstance(leaf.description, currentSampleRate, currentBlockSize, error);
            if (instance) { restoreVendorState(leaf, *instance); candidate->instances[i] = std::move(instance); }
            else recordIssue(candidate->result, leaf, error);
        }
        catch (const std::exception& e) { recordIssue(candidate->result, leaf, e.what()); }
    }
    auto result = commitRestore(candidate);
    if (!result.success) lastError = result.error;
    return result;
}

void ChainProcessor::finishLoad(const std::shared_ptr<PreparedRestore>& candidate, RestoreResult result)
{
    if (loadingRestore == candidate) loadingRestore.reset();
    if (candidate->completion) candidate->completion(std::move(result));
    if (!loadingRestore && queuedRestore)
    { loadingRestore = std::move(queuedRestore); prepareNextPlugin(loadingRestore); }
}

void ChainProcessor::prepareNextPlugin(const std::shared_ptr<PreparedRestore>& candidate)
{
    if (candidate->result.requestId != latestLoadRequest.load())
    {
        auto result = candidate->result; result.status = "superseded"; result.success = false;
        finishLoad(candidate, std::move(result)); return;
    }
    if (candidate->result.error.isNotEmpty()) { finishLoad(candidate, candidate->result); return; }
    if (candidate->nextPlugin >= candidate->leaves.size())
    {
        if (candidate->addition)
        {
            auto result = candidate->result; juce::String error;
            result.success = addPreparedPlugin(candidate->leaves.front()->description, std::move(candidate->instances.front()),
                                                candidate->parentId, candidate->insertIndex, error);
            result.status = result.success ? "committed" : "failed"; result.error = error;
            if (result.success && notifiedRevision < renderRevision)
            {
                const auto version = renderRevision;
                commitCallbacks.emplace(version, [this, candidate, result] { finishLoad(candidate, result); });
            }
            else finishLoad(candidate, result);
            return;
        }
        auto result = commitRestore(candidate, [this, alive = aliveFlag, candidate](RestoreResult committed) {
            if (*alive) finishLoad(candidate, std::move(committed));
        });
        if (!result.success) finishLoad(candidate, result);
        return;
    }
    const auto index = candidate->nextPlugin++;
    auto& leaf = *candidate->leaves[index];
    if (leaf.graphNodeId != NodeID()) { prepareNextPlugin(candidate); return; }
    if (leaf.description.isInstrument)
    { recordIssue(candidate->result, leaf, "This release supports stereo effects, not instruments"); prepareNextPlugin(candidate); return; }
    if (candidate->progress) candidate->progress(candidate->result.requestId, "creating", static_cast<int>(index),
                                                 static_cast<int>(candidate->leaves.size()), leaf.description.name);
    pluginManager.createPluginInstanceAsync(leaf.description, currentSampleRate, currentBlockSize,
        [this, alive = aliveFlag, candidate, index](std::unique_ptr<juce::AudioPluginInstance> instance, const juce::String& error) {
            if (!*alive) return;
            if (candidate->result.requestId == latestLoadRequest.load())
            {
                auto& leaf = *candidate->leaves[index];
                try
                {
                    if (instance) { restoreVendorState(leaf, *instance); if (candidate->configureInstance) candidate->configureInstance(leaf, *instance); candidate->instances[index] = std::move(instance); }
                    else recordIssue(candidate->result, leaf, error);
                }
                catch (const std::exception& e) { recordIssue(candidate->result, leaf, e.what()); }
            }
            prepareNextPlugin(candidate);
        });
}

void ChainProcessor::enqueueLoad(const std::shared_ptr<PreparedRestore>& candidate)
{
    candidate->result.requestId = ++nextLoadRequest; latestLoadRequest.store(nextLoadRequest);
    candidate->result.status = "failed";
    if (queuedRestore)
    {
        auto old = std::move(queuedRestore); auto result = old->result; result.status = "superseded";
        if (old->completion) old->completion(result);
    }
    if (loadingRestore) queuedRestore = candidate;
    else { loadingRestore = candidate; prepareNextPlugin(candidate); }
}

// A recall-safe slot keeps its current plugin, state and flags when a chain loads.
// It takes the place of the first incoming slot with the same plugin; if there is
// none, it stays in the chain at about the same position.
void ChainProcessor::keepRecallSafeSlots(PreparedRestore& candidate)
{
    auto current = getFlatPluginList();
    std::vector<PluginLeaf*> incoming;
    ChainNodeHelpers::collectPluginsMut(candidate.tree, incoming);
    std::set<PluginLeaf*> claimed;
    for (size_t position = 0; position < current.size(); ++position)
    {
        auto* safe = current[position];
        if (!safe->recallSafe || getHosted(*safe) == nullptr) continue;
        PluginLeaf kept = *safe;
        if (auto* hosted = getHosted(*safe))
        { juce::MemoryBlock state; hosted->getStateInformation(state); kept.retainedState = state.toBase64Encoding(); }
        kept.loadError.clear();
        for (auto* other : incoming) // keep persistent ids unique
            if (other->persistentId == kept.persistentId) other->persistentId = juce::Uuid().toString();
        PluginLeaf* target = nullptr;
        for (auto* leaf : incoming)
            if (claimed.count(leaf) == 0
                && leaf->description.createIdentifierString() == kept.description.createIdentifierString())
            { target = leaf; break; }
        if (target != nullptr) { *target = kept; claimed.insert(target); continue; }
        auto node = std::make_unique<ChainNode>();
        node->id = candidate.nextId++; node->name = kept.description.name; node->data = kept;
        auto& children = candidate.tree.getGroup().children;
        const auto index = juce::jmin(static_cast<int>(position), static_cast<int>(children.size()));
        children.insert(children.begin() + index, std::move(node));
    }
}

uint64_t ChainProcessor::requestRestore(const juce::XmlElement& xml, bool allowPartial,
                                        RestoreCompletion completion, RestoreProgress progress,
                                        bool respectRecallSafe)
{
    auto candidate = prepareRestoreSkeleton(xml, allowPartial, false, respectRecallSafe);
    candidate->completion = std::move(completion); candidate->progress = std::move(progress);
    enqueueLoad(candidate); return candidate->result.requestId;
}

void ChainProcessor::cancelPendingLoads()
{
    latestLoadRequest.store(++nextLoadRequest);
    if (queuedRestore)
    {
        auto old = std::move(queuedRestore); auto result = old->result; result.status = "superseded";
        if (old->completion && *aliveFlag) old->completion(result);
    }
    // Vendor factory code is allowed to finish; its completion observes the generation change.
}

bool ChainProcessor::addPreparedPlugin(const juce::PluginDescription& desc, std::unique_ptr<juce::AudioPluginInstance> instance,
                                       ChainNodeId parentId, int index, juce::String& error)
{
    auto* parent = ChainNodeHelpers::findById(rootNode, parentId);
    if (!parent || !parent->isGroup()) { error = "The destination group no longer exists"; return false; }
    if (parent->getGroup().mode == GroupMode::Crossover && static_cast<int>(parent->getGroup().children.size()) >= kMaxCrossoverBands)
    { error = "A crossover group has at most " + juce::String(kMaxCrossoverBands) + " bands"; return false; }
    auto graphNode = addHostedInstance(std::move(instance), false, false, error);
    if (!graphNode) return false;
    auto node = std::make_unique<ChainNode>(); node->id = nextNodeId++; node->name = desc.name;
    PluginLeaf leaf; leaf.description = desc; leaf.graphNodeId = graphNode->nodeID; node->data = std::move(leaf);
    auto& children = parent->getGroup().children;
    const auto position = index < 0 ? children.size() : juce::jmin(children.size(), static_cast<size_t>(index));
    children.insert(children.begin() + static_cast<ptrdiff_t>(position), std::move(node));
    rebuildGraph();
    if (lastError.isNotEmpty())
    {
        error = lastError; children.erase(children.begin() + static_cast<ptrdiff_t>(position));
        AudioProcessorGraph::removeNode(graphNode->nodeID, UpdateKind::none); preparedNodes.erase(graphNode->nodeID);
        return false;
    }
    cachedSlotsDirty = true; notifyChainChanged(); return true;
}

void ChainProcessor::addPluginAsync(const juce::PluginDescription& desc, ChainNodeId parentId, int index,
                                   std::function<void(bool, juce::String)> completion)
{
    auto candidate = std::make_shared<PreparedRestore>(); candidate->addition = true;
    candidate->parentId = parentId; candidate->insertIndex = index;
    candidate->tree.data = PluginLeaf{}; candidate->tree.getPlugin().description = desc;
    candidate->leaves.push_back(&candidate->tree.getPlugin()); candidate->instances.resize(1);
    candidate->completion = [completion = std::move(completion)](RestoreResult result) { completion(result.success, result.error); };
    enqueueLoad(candidate);
}

bool ChainProcessor::setNodeSuspended(ChainNodeId id, bool suspended)
{
    auto* node = ChainNodeHelpers::findById(rootNode, id);
    if (!node || !node->isPlugin()) return false;
    node->getPlugin().suspended = suspended;
    if (auto* hosted = getHosted(node->getPlugin())) hosted->setSuspended(suspended);
    cachedTail.store(computeTail(rootNode)); notifyChainChanged(); return true;
}


namespace {
juce::XmlElement* findSerializedNode(juce::XmlElement& parent, int nodeId)
{
    for (auto* child : parent.getChildWithTagNameIterator("Node"))
    {
        if (child->getIntAttribute("id", -1) == nodeId) return child;
        if (auto* nested = findSerializedNode(*child, nodeId)) return nested;
    }
    return nullptr;
}
}

void ChainProcessor::requestSlotPresetData(int index, const juce::String& encoded, RestoreCompletion completion)
{
    auto xml = serializeChainToXml();
    auto* target = findSerializedNode(*xml, getNodeIdByFlatIndex(index));
    juce::MemoryBlock state;
    if (!target || encoded.isEmpty() || !state.fromBase64Encoding(encoded))
    { RestoreResult result; result.error = "Invalid effect or state encoding"; completion(result); return; }
    target->setAttribute("state", encoded);
    auto candidate = prepareRestoreSkeleton(*xml, false, true);
    candidate->completion = std::move(completion); enqueueLoad(candidate);
}

void ChainProcessor::replaceNodeAsync(ChainNodeId id, const juce::PluginDescription& description,
                                      const juce::var& translatedParams, RestoreCompletion completion)
{
    auto xml = serializeChainToXml();
    auto* target = findSerializedNode(*xml, id);
    if (!target || target->getStringAttribute("type") != "plugin")
    { RestoreResult result; result.error = "The selected effect no longer exists"; completion(result); return; }
    const auto replacementId = juce::Uuid().toString();
    target->setAttribute("persistentId", replacementId);
    target->setAttribute("state", "");
    if (auto* oldDescription = target->getChildByName("PLUGIN")) target->removeChildElement(oldDescription, true);
    target->addChildElement(description.createXml().release());
    auto candidate = prepareRestoreSkeleton(*xml, false, true);
    candidate->configureInstance = [replacementId, translatedParams](PluginLeaf& leaf, juce::AudioPluginInstance& instance) {
        if (leaf.persistentId != replacementId || !translatedParams.isArray()) return;
        auto& parameters = instance.getParameters();
        for (const auto& item : *translatedParams.getArray())
        {
            const auto index = static_cast<int>(item.getProperty("paramIndex", -1));
            const auto value = static_cast<float>(item.getProperty("value", 0.0f));
            if (index < 0 || index >= parameters.size() || !std::isfinite(value) || value < 0.0f || value > 1.0f)
                throw std::runtime_error("The translated parameter does not match the replacement effect");
            parameters[index]->setValue(value);
        }
    };
    candidate->completion = std::move(completion); enqueueLoad(candidate);
}

void ChainProcessor::duplicateNodeAsync(ChainNodeId id, RestoreCompletion completion)
{
    auto xml = serializeChainToXml();
    auto* source = findSerializedNode(*xml, id);
    if (!source || source->getStringAttribute("type") != "plugin")
    { RestoreResult result; result.error = "The selected effect no longer exists"; completion(result); return; }
    auto copy = std::make_unique<juce::XmlElement>(*source);
    copy->setAttribute("id", nextNodeId);
    copy->setAttribute("persistentId", juce::Uuid().toString());
    auto* parent = xml->findParentElementOf(source);
    if (!parent)
    { RestoreResult result; result.error = "The destination group no longer exists"; completion(result); return; }
    int position = 0;
    for (auto* child = parent->getFirstChildElement(); child != nullptr && child != source; child = child->getNextElement()) ++position;
    parent->insertChildElement(copy.release(), position + 1);
    auto candidate = prepareRestoreSkeleton(*xml, false, true);
    candidate->completion = std::move(completion); enqueueLoad(candidate);
}

bool ChainProcessor::setSlotPresetData(int index, const juce::String& encoded)
{
    cancelPendingLoads();
    auto* leaf = getPluginByFlatIndex(index); if (!leaf) return false;
    auto previous = *leaf; juce::MemoryBlock state;
    if (encoded.isEmpty() || !state.fromBase64Encoding(encoded)) return false;
    juce::String error;
    auto instance = pluginManager.createPluginInstance(leaf->description, currentSampleRate, currentBlockSize, error);
    if (!instance) { lastError = error; return false; }
    instance->setStateInformation(state.getData(), static_cast<int>(state.getSize()));
    auto replacement = addHostedInstance(std::move(instance), leaf->bypassed, leaf->suspended, error);
    if (!replacement) { lastError = error; return false; }
    leaf->graphNodeId = replacement->nodeID; leaf->retainedState = encoded; leaf->loadError.clear();
    rebuildGraph();
    if (lastError.isNotEmpty())
    {
        *leaf = previous; AudioProcessorGraph::removeNode(replacement->nodeID, UpdateKind::none);
        preparedNodes.erase(replacement->nodeID); return false;
    }
    hidePluginWindow(getNodeIdByFlatIndex(index)); retirePlugin(previous);
    cachedSlotsDirty = true; notifyChainChanged(); return true;
}

std::unique_ptr<juce::XmlElement> ChainProcessor::importXml(const juce::var& data) const
{
    auto* object = data.getDynamicObject(); if (!object) return {};
    juce::XmlElement xml("ChainTree"); xml.setAttribute("version", 2);
    int nextId = 1;
    std::function<bool(const juce::var&, juce::XmlElement&)> convert = [&](const juce::var& value, juce::XmlElement& parent) {
        auto* obj = value.getDynamicObject(); if (!obj) return false;
        auto* node = parent.createNewChildElement("Node");
        const bool group = obj->getProperty("type").toString() == "group";
        node->setAttribute("type", group ? "group" : "plugin");
        node->setAttribute("id", obj->hasProperty("id") ? static_cast<int>(obj->getProperty("id")) : nextId++);
        for (auto key : { "name", "persistentId", "mode", "dryWet", "bypassed", "suspended", "solo", "mute", "branchGainDb", "collapsed",
                          "polarityInverted", "recallSafe", "ignoreLatency", "sidechain", "crossover" })
            if (obj->hasProperty(key)) node->setAttribute(key, obj->getProperty(key).toString());
        if (group)
        {
            auto children = obj->getProperty("children"); if (!children.isArray()) return false;
            for (auto& child : *children.getArray()) if (!convert(child, *node)) return false;
        }
        else
        {
            juce::PluginDescription desc;
            desc.name = obj->getProperty("name").toString(); desc.manufacturerName = obj->getProperty("manufacturer").toString();
            desc.pluginFormatName = obj->getProperty("format").toString(); desc.uniqueId = static_cast<int>(obj->getProperty("uid"));
            desc.fileOrIdentifier = obj->getProperty("fileOrIdentifier").toString(); desc.version = obj->getProperty("version").toString();
            desc.isInstrument = static_cast<bool>(obj->getProperty("isInstrument"));
            desc.numInputChannels = static_cast<int>(obj->getProperty("numInputChannels"));
            desc.numOutputChannels = static_cast<int>(obj->getProperty("numOutputChannels"));
            // State is tied to its vendor format and identity; name matching is not a portable state format.
            for (const auto& known : pluginManager.getKnownPlugins().getTypes())
                if (known.pluginFormatName == desc.pluginFormatName && known.uniqueId == desc.uniqueId
                    && known.manufacturerName == desc.manufacturerName && known.name == desc.name) { desc = known; break; }
            node->addChildElement(desc.createXml().release()); node->setAttribute("state", obj->getProperty("presetData").toString());
        }
        return true;
    };
    auto nodes = object->getProperty(object->hasProperty("nodes") ? "nodes" : "slots");
    if (!nodes.isArray()) return {};
    for (const auto& node : *nodes.getArray()) if (!convert(node, xml)) return {};
    return std::make_unique<juce::XmlElement>(xml);
}

bool ChainProcessor::importChainWithPresets(const juce::var& data)
{
    auto xml = importXml(data);
    return xml && restoreChainFromXml(*xml, false).success;
}

uint64_t ChainProcessor::requestImportChainWithPresets(const juce::var& data, RestoreCompletion completion, bool reuseUnchanged,
                                                      bool respectRecallSafe)
{
    auto xml = importXml(data);
    if (!xml)
    { RestoreResult result; result.error = "Invalid chain data"; if (completion) completion(result); return 0; }
    auto candidate = prepareRestoreSkeleton(*xml, false, reuseUnchanged, respectRecallSafe);
    candidate->completion = std::move(completion);
    enqueueLoad(candidate); return candidate->result.requestId;
}
