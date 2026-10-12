#include "AutomationBinding.h"

AutomationBindingManager::AutomationBindingManager()
{
    for (int i = 0; i < kMaxBindings; ++i)
        bindings[static_cast<size_t>(i)].hostSlot = i;
}

const AutomationBinding& AutomationBindingManager::getBinding(int hostSlot) const noexcept
{
    static const AutomationBinding invalid;
    return hostSlot >= 0 && hostSlot < kMaxBindings ? bindings[static_cast<size_t>(hostSlot)] : invalid;
}

bool AutomationBindingManager::assign(int hostSlot, const juce::String& pluginId,
                                      const juce::String& parameter, int fallbackIndex)
{
    if (hostSlot < 0 || hostSlot >= kMaxBindings || pluginId.isEmpty()
        || (parameter.isEmpty() && fallbackIndex < 0))
        return false;
    auto& b = bindings[static_cast<size_t>(hostSlot)];
    b.pluginPersistentId = pluginId;
    b.parameterId = parameter;
    b.fallbackParameterIndex = fallbackIndex;
    b.tombstone = false;
    legacyMigrationPending = false;
    return true;
}

bool AutomationBindingManager::unassign(int hostSlot)
{
    if (hostSlot < 0 || hostSlot >= kMaxBindings)
        return false;
    auto& b = bindings[static_cast<size_t>(hostSlot)];
    b.pluginPersistentId.clear();
    b.parameterId.clear();
    b.fallbackParameterIndex = -1;
    b.tombstone = false;
    return true;
}

void AutomationBindingManager::markTargetUnavailable(const juce::String& pluginId)
{
    if (pluginId.isEmpty()) return;
    for (auto& b : bindings)
        if (b.pluginPersistentId == pluginId && b.isAssigned()) b.tombstone = true;
}

void AutomationBindingManager::markTargetAvailable(const juce::String& pluginId)
{
    if (pluginId.isEmpty()) return;
    for (auto& b : bindings)
        if (b.pluginPersistentId == pluginId) b.tombstone = false;
}

void AutomationBindingManager::migrateLegacy(const std::vector<juce::String>& pluginIds)
{
    if (!legacyMigrationPending) return;
    for (int slot = 0; slot < kMaxSlots && slot < static_cast<int>(pluginIds.size()); ++slot)
        if (!pluginIds[static_cast<size_t>(slot)].isEmpty())
            for (int parameter = 0; parameter < 128; ++parameter)
                assign(slot * 128 + parameter, pluginIds[static_cast<size_t>(slot)], {}, parameter);
    legacyMigrationPending = false;
}

juce::XmlElement AutomationBindingManager::toXml() const
{
    juce::XmlElement root("AUTOMATION_BINDINGS");
    root.setAttribute("version", 2);
    for (const auto& b : bindings)
    {
        if (!b.isAssigned() && !b.tombstone) continue;
        auto* e = root.createNewChildElement("BINDING");
        e->setAttribute("hostSlot", b.hostSlot);
        e->setAttribute("pluginPersistentId", b.pluginPersistentId);
        e->setAttribute("parameterId", b.parameterId);
        e->setAttribute("fallbackParameterIndex", b.fallbackParameterIndex);
        e->setAttribute("tombstone", b.tombstone);
    }
    return root;
}

bool AutomationBindingManager::restoreFromXml(const juce::XmlElement& xml, RestoreMode mode)
{
    if (xml.getTagName() != "AUTOMATION_BINDINGS") return false;
    if (mode == RestoreMode::Replace)
        for (auto& b : bindings) b = AutomationBinding { b.hostSlot, {}, {}, -1, false };
    forEachXmlChildElementWithTagName(xml, e, "BINDING")
    {
        const int slot = e->getIntAttribute("hostSlot", -1);
        if (slot < 0 || slot >= kMaxBindings || (mode == RestoreMode::PreserveOccupied && getBinding(slot).isAssigned())) continue;
        auto& b = bindings[static_cast<size_t>(slot)];
        b.pluginPersistentId = e->getStringAttribute("pluginPersistentId");
        b.parameterId = e->getStringAttribute("parameterId");
        b.fallbackParameterIndex = e->getIntAttribute("fallbackParameterIndex", -1);
        b.tombstone = e->getBoolAttribute("tombstone", false);
    }
    legacyMigrationPending = false;
    return true;
}
