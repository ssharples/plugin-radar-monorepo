#include "ParameterProxyPool.h"
#include "ProxyParameter.h"
#include "../core/ChainProcessor.h"
#include "../core/ChainNode.h"
#include <thread>

void ParameterProxyPool::createAndRegister(juce::AudioProcessor& processor)
{
    proxies.reserve(static_cast<size_t>(kMaxSlots * kMaxParamsPerSlot));

    for (int slot = 0; slot < kMaxSlots; ++slot)
    {
        for (int param = 0; param < kMaxParamsPerSlot; ++param)
        {
            auto* proxy = new ProxyParameter(slot, param);
            proxies.push_back(proxy);
            processor.addParameter(proxy); // processor takes ownership
        }
    }
}

ProxyParameter* ParameterProxyPool::getProxy(int hostParameter) noexcept
{
    if (hostParameter < 0 || hostParameter >= kMaxSlots * kMaxParamsPerSlot) return nullptr;
    return proxies[static_cast<size_t>(hostParameter)];
}

void ParameterProxyPool::bindSlot(int slotIndex, juce::AudioProcessor* childProcessor)
{
    if (slotIndex < 0 || slotIndex >= kMaxSlots)
        return;

    int baseIndex = slotIndex * kMaxParamsPerSlot;

    // Unbind all proxies for this slot first
    for (int i = 0; i < kMaxParamsPerSlot; ++i)
        proxies[static_cast<size_t>(baseIndex + i)]->unbind();

    if (childProcessor == nullptr)
        return;

    auto& childParams = childProcessor->getParameters();
    int numChildParams = juce::jmin(childParams.size(), kMaxParamsPerSlot);

    for (int i = 0; i < numChildParams; ++i)
        proxies[static_cast<size_t>(baseIndex + i)]->bind(childParams[i]);
}

void ParameterProxyPool::unbindSlot(int slotIndex)
{
    bindSlot(slotIndex, nullptr);
}

void ParameterProxyPool::rebindAll(ChainProcessor& chain)
{
    auto plugins = chain.getFlatPluginList();
    rebindBindings(plugins, [&chain](int index) { return chain.getSlotProcessor(index); });
}

void ParameterProxyPool::rebindBindings(const std::vector<PluginLeaf*>& plugins,
                                        const std::function<juce::AudioProcessor*(int)>& resolveProcessor)
{
    std::vector<juce::String> ids;
    ids.reserve(plugins.size());
    for (auto* leaf : plugins) ids.push_back(leaf != nullptr ? leaf->persistentId : juce::String());
    bindingManager.migrateLegacy(ids);

    // A missing instance is a lost target, not permission to retarget the host ID.
    // Keep its assignment as a tombstone until the user explicitly unassigns it.
    for (int hostParameter = 0; hostParameter < kMaxSlots * kMaxParamsPerSlot; ++hostParameter)
    {
        const auto& binding = bindingManager.getBinding(hostParameter);
        if (!binding.isAssigned()) continue;
        bool present = false;
        for (const auto& id : ids)
            if (id == binding.pluginPersistentId) { present = true; break; }
        if (!present) bindingManager.markTargetUnavailable(binding.pluginPersistentId);
    }

    for (int i = 0; i < kMaxSlots; ++i)
    {
        for (int parameterIndex = 0; parameterIndex < kMaxParamsPerSlot; ++parameterIndex)
        {
            const int bindingIndex = i * kMaxParamsPerSlot + parameterIndex;
            const auto& binding = bindingManager.getBinding(bindingIndex);
            juce::AudioProcessorParameter* selected = nullptr;
            if (binding.isAssigned())
            {
                for (int flatIndex = 0; flatIndex < static_cast<int>(plugins.size()); ++flatIndex)
                {
                    auto* leaf = plugins[static_cast<size_t>(flatIndex)];
                    if (leaf == nullptr || leaf->persistentId != binding.pluginPersistentId) continue;
                    auto* processor = resolveProcessor(flatIndex);
                    if (processor == nullptr) break;
                    bindingManager.markTargetAvailable(binding.pluginPersistentId);
                    auto& params = processor->getParameters();
                    if (!binding.parameterId.isEmpty())
                        for (auto* parameter : params)
                            if (auto* hosted = dynamic_cast<juce::HostedAudioProcessorParameter*>(parameter))
                                if (hosted->getParameterID() == binding.parameterId)
                                { selected = parameter; break; }
                    // An index is only a compatibility fallback for records that
                    // were saved without a stable child parameter ID. Never let
                    // a stale ID silently retarget another control.
                    if (selected == nullptr && binding.parameterId.isEmpty()
                        && binding.fallbackParameterIndex >= 0
                        && binding.fallbackParameterIndex < params.size())
                        selected = params[binding.fallbackParameterIndex];
                    break;
                }
            }
            auto* proxy = proxies[static_cast<size_t>(bindingIndex)];
            proxy->bind(selected);
        }
    }
}

void ParameterProxyPool::unbindAffected(const juce::String& pluginPersistentId)
{
    bindingManager.markTargetUnavailable(pluginPersistentId);
    for (int i = 0; i < kMaxSlots * kMaxParamsPerSlot; ++i)
        if (bindingManager.getBinding(i).pluginPersistentId == pluginPersistentId)
            proxies[static_cast<size_t>(i)]->unbind();
}

bool ParameterProxyPool::isQuiescent() const noexcept
{
    for (auto* proxy : proxies) if (proxy != nullptr && !proxy->isQuiescent()) return false;
    return true;
}

void ParameterProxyPool::shutdown()
{
    for (int i = 0; i < kMaxSlots; ++i) unbindSlot(i);
    // Shutdown is a control-thread operation. Retiring owners must not be
    // destroyed until every audio/host reader that entered before unbind has
    // left its guard. This loop never runs from a proxy callback.
    while (!isQuiescent())
        std::this_thread::yield();
}
