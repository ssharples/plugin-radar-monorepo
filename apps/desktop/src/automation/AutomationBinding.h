#pragma once

#include <juce_core/juce_core.h>
#include <array>
#include <vector>

/** Persistent assignment for one of the host's fixed automation parameters. */
struct AutomationBinding
{
    int hostSlot = -1;
    juce::String pluginPersistentId;
    juce::String parameterId;
    int fallbackParameterIndex = -1;
    bool tombstone = false;

    bool isAssigned() const noexcept { return hostSlot >= 0 && !pluginPersistentId.isEmpty()
                                               && (!parameterId.isEmpty() || fallbackParameterIndex >= 0); }
};

class AutomationBindingManager
{
public:
    static constexpr int kMaxSlots = 16;
    static constexpr int kMaxBindings = kMaxSlots * 128;

    enum class RestoreMode { Replace, PreserveOccupied };

    AutomationBindingManager();

    const AutomationBinding& getBinding(int hostSlot) const noexcept;
    bool assign(int hostSlot, const juce::String& pluginPersistentId,
                const juce::String& parameterId, int fallbackParameterIndex = -1);
    bool unassign(int hostSlot);
    void markTargetUnavailable(const juce::String& pluginPersistentId);
    void markTargetAvailable(const juce::String& pluginPersistentId);

    // Legacy sessions had no identities. This is deliberately one-shot.
    void migrateLegacy(const std::vector<juce::String>& pluginIds);
    void beginNewSession() noexcept { legacyMigrationPending = false; }
    bool isLegacyMigrationPending() const noexcept { return legacyMigrationPending; }

    juce::XmlElement toXml() const;
    bool restoreFromXml(const juce::XmlElement& xml, RestoreMode mode = RestoreMode::Replace);

private:
    std::array<AutomationBinding, kMaxBindings> bindings;
    bool legacyMigrationPending = true;
};
