#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <vector>
#include <functional>
#include "AutomationBinding.h"
#include "../core/ChainNode.h"

class ProxyParameter;
class ChainProcessor;

class ParameterProxyPool
{
public:
    static constexpr int kMaxSlots = 16;
    static constexpr int kMaxParamsPerSlot = 128;

    ParameterProxyPool() = default;

    void createAndRegister(juce::AudioProcessor& processor);

    void bindSlot(int slotIndex, juce::AudioProcessor* childProcessor);
    void unbindSlot(int slotIndex);
    void rebindAll(ChainProcessor& chain);
    // Testable/core seam: resolves a flat leaf index to its currently hosted processor.
    void rebindBindings(const std::vector<PluginLeaf*>& plugins,
                        const std::function<juce::AudioProcessor*(int)>& resolveProcessor);

    AutomationBindingManager& bindings() noexcept { return bindingManager; }
    const AutomationBindingManager& bindings() const noexcept { return bindingManager; }
    const AutomationBinding& getBinding(int hostParameter) const noexcept { return bindingManager.getBinding(hostParameter); }
    bool assignBinding(int hostParameter, const juce::String& pluginId, const juce::String& parameterId,
                       int fallbackParameterIndex = -1)
    { return bindingManager.assign(hostParameter, pluginId, parameterId, fallbackParameterIndex); }
    bool unassignBinding(int hostParameter) { return bindingManager.unassign(hostParameter); }
    juce::XmlElement serializeBindings() const { return bindingManager.toXml(); }
    bool restoreBindings(const juce::XmlElement& xml, AutomationBindingManager::RestoreMode mode = AutomationBindingManager::RestoreMode::Replace)
    { return bindingManager.restoreFromXml(xml, mode); }
    ProxyParameter* getProxy(int hostParameter) noexcept;
    void unbindAffected(const juce::String& pluginPersistentId);
    bool isQuiescent() const noexcept;
    void shutdown();

private:
    std::vector<ProxyParameter*> proxies; // raw ptrs, owned by AudioProcessor
    AutomationBindingManager bindingManager;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ParameterProxyPool)
};
