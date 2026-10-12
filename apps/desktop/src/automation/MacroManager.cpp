#include "MacroManager.h"
#include "../core/ChainProcessor.h"
#include <algorithm>
#include <cmath>
#include <thread>

class MacroManager::MacroParameter final : public juce::AudioParameterFloat
{
public:
    MacroParameter(MacroManager& ownerIn, int indexIn)
        : AudioParameterFloat("macro" + juce::String(indexIn + 1), "Macro " + juce::String(indexIn + 1), 0.0f, 1.0f, 0.0f),
          owner(ownerIn), index(indexIn) {}

private:
    void valueChanged(float newValue) override
    {
        if (!owner.suppressApply.load(std::memory_order_acquire)) owner.apply(index, newValue);
    }

    MacroManager& owner;
    const int index;
};

namespace {
juce::String parameterIdOf(juce::AudioProcessorParameter& parameter)
{
    if (auto* hosted = dynamic_cast<juce::HostedAudioProcessorParameter*>(&parameter)) return hosted->getParameterID();
    if (auto* withId = dynamic_cast<juce::AudioProcessorParameterWithID*>(&parameter)) return withId->getParameterID();
    return {};
}

bool validIndex(int index) { return index >= 0 && index < MacroManager::kNumMacros; }
}

float shapeMacroValue(float normalised, float curve) noexcept
{
    const auto x = juce::jlimit(0.0f, 1.0f, normalised);
    if (std::abs(curve) < 1.0e-4f) return x;
    return std::pow(x, std::pow(4.0f, -juce::jlimit(-1.0f, 1.0f, curve)));
}

MacroManager::MacroManager() = default;

MacroManager::~MacroManager()
{
    shutdown();
}

void MacroManager::createAndRegister(juce::AudioProcessor& processor)
{
    for (int i = 0; i < kNumMacros; ++i)
    {
        auto* parameter = new MacroParameter(*this, i);
        parameters[static_cast<size_t>(i)] = parameter;
        processor.addParameter(parameter); // processor takes ownership
    }
}

float MacroManager::getValue(int index) const
{
    if (!validIndex(index) || parameters[static_cast<size_t>(index)] == nullptr) return 0.0f;
    return parameters[static_cast<size_t>(index)]->get();
}

void MacroManager::setValue(int index, float normalised)
{
    if (!validIndex(index)) return;
    auto* parameter = parameters[static_cast<size_t>(index)];
    const auto value = juce::jlimit(0.0f, 1.0f, normalised);
    if (parameter == nullptr) { apply(index, value); return; }
    if (gestureOpen[static_cast<size_t>(index)]) { parameter->setValueNotifyingHost(value); return; }
    parameter->beginChangeGesture();
    parameter->setValueNotifyingHost(value);
    parameter->endChangeGesture();
}

void MacroManager::beginGesture(int index)
{
    if (!validIndex(index) || gestureOpen[static_cast<size_t>(index)]) return;
    auto* parameter = parameters[static_cast<size_t>(index)];
    if (parameter == nullptr) return;
    gestureOpen[static_cast<size_t>(index)] = true;
    parameter->beginChangeGesture();
}

void MacroManager::endGesture(int index)
{
    if (!validIndex(index) || !gestureOpen[static_cast<size_t>(index)]) return;
    gestureOpen[static_cast<size_t>(index)] = false;
    if (auto* parameter = parameters[static_cast<size_t>(index)]) parameter->endChangeGesture();
}

bool MacroManager::addLink(int index, const MacroLink& link)
{
    if (!validIndex(index) || link.pluginId.isEmpty() || (link.parameterId.isEmpty() && link.fallbackIndex < 0)) return false;
    if (!std::isfinite(link.min) || !std::isfinite(link.max)) return false;
    auto clean = link;
    clean.min = juce::jlimit(0.0f, 1.0f, link.min); clean.max = juce::jlimit(0.0f, 1.0f, link.max);
    clean.curve = std::isfinite(link.curve) ? juce::jlimit(-1.0f, 1.0f, link.curve) : 0.0f;
    auto& links = macros[static_cast<size_t>(index)].links;
    for (auto& existing : links)
        if (existing.pluginId == clean.pluginId && existing.parameterId == clean.parameterId
            && (clean.parameterId.isNotEmpty() || existing.fallbackIndex == clean.fallbackIndex))
        { existing.min = clean.min; existing.max = clean.max; resolveAgain(); return true; }
    if (static_cast<int>(links.size()) >= kMaxLinksPerMacro) return false;
    links.push_back(clean);
    resolveAgain();
    return true;
}

bool MacroManager::removeLink(int index, int linkIndex)
{
    if (!validIndex(index)) return false;
    auto& links = macros[static_cast<size_t>(index)].links;
    if (linkIndex < 0 || linkIndex >= static_cast<int>(links.size())) return false;
    links.erase(links.begin() + linkIndex);
    resolveAgain();
    return true;
}

bool MacroManager::setLinkRange(int index, int linkIndex, float min, float max)
{
    if (!validIndex(index) || !std::isfinite(min) || !std::isfinite(max)) return false;
    auto& links = macros[static_cast<size_t>(index)].links;
    if (linkIndex < 0 || linkIndex >= static_cast<int>(links.size())) return false;
    links[static_cast<size_t>(linkIndex)].min = juce::jlimit(0.0f, 1.0f, min);
    links[static_cast<size_t>(linkIndex)].max = juce::jlimit(0.0f, 1.0f, max);
    resolveAgain();
    return true;
}

bool MacroManager::setLinkCurve(int index, int linkIndex, float curve)
{
    if (!validIndex(index) || !std::isfinite(curve)) return false;
    auto& links = macros[static_cast<size_t>(index)].links;
    if (linkIndex < 0 || linkIndex >= static_cast<int>(links.size())) return false;
    links[static_cast<size_t>(linkIndex)].curve = juce::jlimit(-1.0f, 1.0f, curve);
    resolveAgain();
    return true;
}

bool MacroManager::rename(int index, const juce::String& name)
{
    if (!validIndex(index)) return false;
    macros[static_cast<size_t>(index)].name = name.substring(0, 32);
    return true;
}

bool MacroManager::isLinkAvailable(int index, int linkIndex) const
{
    if (!validIndex(index)) return false;
    const auto& flags = available[static_cast<size_t>(index)];
    return linkIndex >= 0 && linkIndex < static_cast<int>(flags.size()) && flags[static_cast<size_t>(linkIndex)];
}

void MacroManager::clear()
{
    for (auto& macro : macros) macro = Macro{};
    suppressApply.store(true, std::memory_order_release);
    for (auto* parameter : parameters) if (parameter != nullptr) parameter->setValueNotifyingHost(0.0f);
    suppressApply.store(false, std::memory_order_release);
    resolveAgain();
}

void MacroManager::rebind(ChainProcessor& chain)
{
    boundChain = &chain;
    auto next = std::make_unique<Resolved>();
    auto plugins = chain.getFlatPluginList();
    for (int m = 0; m < kNumMacros; ++m)
    {
        const auto& links = macros[static_cast<size_t>(m)].links;
        auto& flags = available[static_cast<size_t>(m)];
        flags.assign(links.size(), false);
        for (size_t l = 0; l < links.size(); ++l)
        {
            const auto& link = links[l];
            for (int flat = 0; flat < static_cast<int>(plugins.size()); ++flat)
            {
                if (plugins[static_cast<size_t>(flat)]->persistentId != link.pluginId) continue;
                auto* processor = chain.getSlotProcessor(flat);
                if (processor == nullptr) break;
                auto& params = processor->getParameters();
                juce::AudioProcessorParameter* selected = nullptr;
                if (link.parameterId.isNotEmpty())
                {
                    for (auto* parameter : params)
                        if (parameterIdOf(*parameter) == link.parameterId) { selected = parameter; break; }
                }
                else if (link.fallbackIndex < params.size()) selected = params[link.fallbackIndex];
                if (selected != nullptr)
                {
                    flags[l] = true;
                    (*next)[static_cast<size_t>(m)].push_back({ link.pluginId, selected, link.min, link.max, link.curve });
                }
                break;
            }
        }
    }
    publish(std::move(next));
}

void MacroManager::unbindAffected(const juce::String& pluginId)
{
    auto* current = resolved.load(std::memory_order_seq_cst);
    if (current == nullptr) return;
    auto next = std::make_unique<Resolved>(*current);
    bool changed = false;
    for (int m = 0; m < kNumMacros; ++m)
    {
        auto& targets = (*next)[static_cast<size_t>(m)];
        const auto before = targets.size();
        targets.erase(std::remove_if(targets.begin(), targets.end(),
                                     [&](const Target& t) { return t.pluginId == pluginId; }), targets.end());
        changed |= targets.size() != before;
        const auto& links = macros[static_cast<size_t>(m)].links;
        auto& flags = available[static_cast<size_t>(m)];
        for (size_t l = 0; l < links.size() && l < flags.size(); ++l)
            if (links[l].pluginId == pluginId) flags[l] = false;
    }
    if (changed) publish(std::move(next));
}

void MacroManager::shutdown()
{
    publish(nullptr);
}

juce::XmlElement MacroManager::toXml() const
{
    juce::XmlElement xml("MACROS");
    xml.setAttribute("version", 1);
    for (int m = 0; m < kNumMacros; ++m)
    {
        const auto& macro = macros[static_cast<size_t>(m)];
        auto* item = xml.createNewChildElement("MACRO");
        item->setAttribute("index", m);
        item->setAttribute("name", macro.name);
        item->setAttribute("value", static_cast<double>(getValue(m)));
        for (const auto& link : macro.links)
        {
            auto* linkXml = item->createNewChildElement("LINK");
            linkXml->setAttribute("pluginId", link.pluginId);
            linkXml->setAttribute("parameterId", link.parameterId);
            linkXml->setAttribute("fallbackIndex", link.fallbackIndex);
            linkXml->setAttribute("min", static_cast<double>(link.min));
            linkXml->setAttribute("max", static_cast<double>(link.max));
            if (link.curve != 0.0f) linkXml->setAttribute("curve", static_cast<double>(link.curve));
        }
    }
    return xml;
}

bool MacroManager::restoreFromXml(const juce::XmlElement& xml)
{
    if (!xml.hasTagName("MACROS")) return false;
    std::array<Macro, kNumMacros> next;
    std::array<float, kNumMacros> values {};
    for (auto* item : xml.getChildWithTagNameIterator("MACRO"))
    {
        const auto index = item->getIntAttribute("index", -1);
        if (!validIndex(index)) return false;
        auto& macro = next[static_cast<size_t>(index)];
        macro.name = item->getStringAttribute("name").substring(0, 32);
        const auto value = static_cast<float>(item->getDoubleAttribute("value", 0.0));
        if (!std::isfinite(value)) return false;
        values[static_cast<size_t>(index)] = juce::jlimit(0.0f, 1.0f, value);
        for (auto* linkXml : item->getChildWithTagNameIterator("LINK"))
        {
            MacroLink link;
            link.pluginId = linkXml->getStringAttribute("pluginId");
            link.parameterId = linkXml->getStringAttribute("parameterId");
            link.fallbackIndex = linkXml->getIntAttribute("fallbackIndex", -1);
            link.min = static_cast<float>(linkXml->getDoubleAttribute("min", 0.0));
            link.max = static_cast<float>(linkXml->getDoubleAttribute("max", 1.0));
            link.curve = static_cast<float>(linkXml->getDoubleAttribute("curve", 0.0));
            if (!std::isfinite(link.curve)) return false;
            link.curve = juce::jlimit(-1.0f, 1.0f, link.curve);
            if (link.pluginId.isEmpty() || !std::isfinite(link.min) || !std::isfinite(link.max)) return false;
            link.min = juce::jlimit(0.0f, 1.0f, link.min); link.max = juce::jlimit(0.0f, 1.0f, link.max);
            if (static_cast<int>(macro.links.size()) < kMaxLinksPerMacro) macro.links.push_back(link);
        }
    }
    macros = std::move(next);
    // The saved plugin states already reflect these values, so don't move the linked parameters.
    suppressApply.store(true, std::memory_order_release);
    for (int m = 0; m < kNumMacros; ++m)
        if (auto* parameter = parameters[static_cast<size_t>(m)]) parameter->setValueNotifyingHost(values[static_cast<size_t>(m)]);
    suppressApply.store(false, std::memory_order_release);
    resolveAgain();
    return true;
}

void MacroManager::apply(int index, float normalised) noexcept
{
    if (!validIndex(index)) return;
    // Same enter-vs-retire ordering as ProxyParameter::ReadGuard.
    activeReaders.fetch_add(1, std::memory_order_seq_cst);
    if (!retiring.load(std::memory_order_seq_cst))
        if (auto* current = resolved.load(std::memory_order_seq_cst))
            for (const auto& target : (*current)[static_cast<size_t>(index)])
                target.parameter->setValue(target.min + shapeMacroValue(normalised, target.curve) * (target.max - target.min));
    activeReaders.fetch_sub(1, std::memory_order_seq_cst);
}

void MacroManager::publish(std::unique_ptr<Resolved> next)
{
    // Control thread only. Readers hold the old targets for one short loop at most.
    retiring.store(true, std::memory_order_seq_cst);
    while (!isQuiescent()) std::this_thread::yield();
    delete resolved.exchange(next.release(), std::memory_order_seq_cst);
    retiring.store(false, std::memory_order_seq_cst);
}

void MacroManager::resolveAgain()
{
    if (boundChain != nullptr) { rebind(*boundChain); return; }
    for (int m = 0; m < kNumMacros; ++m)
        available[static_cast<size_t>(m)].assign(macros[static_cast<size_t>(m)].links.size(), false);
}
