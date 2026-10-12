#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <array>
#include <atomic>
#include <memory>
#include <vector>

class ChainProcessor;

/** One parameter a macro drives. min and max are the normalised (0-1) values
    the parameter takes when the macro is at 0 and at 1. */
struct MacroLink
{
    juce::String pluginId;      // PluginLeaf::persistentId
    juce::String parameterId;   // the plugin's own stable parameter ID
    int fallbackIndex = -1;     // used only when the plugin reports no ID
    float min = 0.0f;
    float max = 1.0f;
    float curve = 0.0f;         // -1..1: 0 is a straight line; above 0 moves fast early, below 0 moves fast late
};

// Bends a 0-1 macro position by a link's curve
float shapeMacroValue(float normalised, float curve) noexcept;

/** Eight host-automatable macro knobs. Each one sweeps any number of parameters
    across the hosted plugins, each over its own range.

    Links are kept when their plugin is missing (for example a shared chain
    loaded without one of its plugins) and come back when the plugin does. */
class MacroManager
{
public:
    static constexpr int kNumMacros = 8;
    static constexpr int kMaxLinksPerMacro = 64;

    struct Macro
    {
        juce::String name;
        std::vector<MacroLink> links;
    };

    MacroManager();
    ~MacroManager();

    // Adds the 8 host parameters. Call once, from the wrapper's constructor,
    // after every other parameter so existing parameter indices don't move.
    void createAndRegister(juce::AudioProcessor& processor);

    // Control thread
    const Macro& getMacro(int index) const { return macros[static_cast<size_t>(juce::jlimit(0, kNumMacros - 1, index))]; }
    float getValue(int index) const;
    void setValue(int index, float normalised); // notifies the host and moves the linked parameters
    bool addLink(int index, const MacroLink& link); // updates the range if the parameter is already linked
    bool removeLink(int index, int linkIndex);
    bool setLinkRange(int index, int linkIndex, float min, float max);
    bool setLinkCurve(int index, int linkIndex, float curve);
    bool rename(int index, const juce::String& name);
    bool isLinkAvailable(int index, int linkIndex) const;
    void clear();

    // Resolves every link to the chain's current plugin instances.
    void rebind(ChainProcessor& chain);
    void unbindAffected(const juce::String& pluginId);
    bool isQuiescent() const noexcept { return activeReaders.load(std::memory_order_seq_cst) == 0; }
    void shutdown();

    juce::XmlElement toXml() const;
    bool restoreFromXml(const juce::XmlElement& xml); // sets values without moving the linked parameters

    // Any thread: moves the linked parameters to match the macro value.
    void apply(int index, float normalised) noexcept;

private:
    class MacroParameter;

    struct Target
    {
        juce::String pluginId;
        juce::AudioProcessorParameter* parameter = nullptr;
        float min = 0.0f, max = 1.0f, curve = 0.0f;
    };
    using Resolved = std::array<std::vector<Target>, kNumMacros>;

    void publish(std::unique_ptr<Resolved> next);
    void resolveAgain();

    std::array<MacroParameter*, kNumMacros> parameters {}; // owned by the AudioProcessor
    std::array<Macro, kNumMacros> macros;
    std::array<std::vector<bool>, kNumMacros> available;
    ChainProcessor* boundChain = nullptr;

    std::atomic<Resolved*> resolved { nullptr };
    std::atomic<bool> retiring { false };
    mutable std::atomic<unsigned int> activeReaders { 0 };
    std::atomic<bool> suppressApply { false };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MacroManager)
};
