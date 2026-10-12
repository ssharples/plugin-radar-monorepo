#include "ChainNode.h"
#include <cmath>

const char* groupModeName(GroupMode mode)
{
    switch (mode)
    {
        case GroupMode::Parallel: return "parallel";
        case GroupMode::Crossover: return "crossover";
        case GroupMode::Serial: break;
    }
    return "serial";
}

bool parseGroupMode(const juce::String& text, GroupMode& mode)
{
    if (text == "serial") { mode = GroupMode::Serial; return true; }
    if (text == "parallel") { mode = GroupMode::Parallel; return true; }
    if (text == "crossover") { mode = GroupMode::Crossover; return true; }
    return false;
}

namespace CrossoverHelpers
{
std::vector<float> defaultFrequencies(int numBands)
{
    switch (numBands)
    {
        case 0: case 1: return {};
        case 2: return { 1000.0f };
        case 3: return { 200.0f, 2500.0f };
        case 4: return { 120.0f, 1000.0f, 5000.0f };
        default: break;
    }
    // Spread evenly on a log scale between 80 Hz and 8 kHz
    std::vector<float> result;
    const int splits = numBands - 1;
    for (int s = 0; s < splits; ++s)
        result.push_back(static_cast<float>(80.0 * std::pow(100.0, s / static_cast<double>(splits - 1))));
    return result;
}

static bool valid(const std::vector<float>& frequencies)
{
    for (size_t i = 0; i < frequencies.size(); ++i)
    {
        const auto f = frequencies[i];
        if (!std::isfinite(f) || f < 20.0f || f > 20000.0f) return false;
        if (i > 0 && f <= frequencies[i - 1]) return false;
    }
    return true;
}

void fitFrequencies(GroupData& group)
{
    const auto splits = group.children.empty() ? size_t { 0 } : group.children.size() - 1;
    if (group.crossoverHz.size() == splits && valid(group.crossoverHz)) return;
    group.crossoverHz = defaultFrequencies(static_cast<int>(group.children.size()));
}

juce::String toString(const std::vector<float>& frequencies)
{
    juce::StringArray parts;
    for (auto f : frequencies) parts.add(juce::String(f, 2));
    return parts.joinIntoString(",");
}

bool fromString(const juce::String& text, std::vector<float>& frequencies)
{
    frequencies.clear();
    if (text.trim().isEmpty()) return true;
    for (auto& part : juce::StringArray::fromTokens(text, ",", ""))
    {
        if (!part.trim().containsOnly("0123456789.")) return false;
        frequencies.push_back(part.trim().getFloatValue());
    }
    return valid(frequencies);
}
}

namespace ChainNodeHelpers
{

ChainNode* findById(ChainNode& root, ChainNodeId id)
{
    if (root.id == id)
        return &root;

    if (root.isGroup())
    {
        for (auto& child : root.getGroup().children)
        {
            if (auto* found = findById(*child, id))
                return found;
        }
    }

    return nullptr;
}

const ChainNode* findById(const ChainNode& root, ChainNodeId id)
{
    if (root.id == id)
        return &root;

    if (root.isGroup())
    {
        for (const auto& child : root.getGroup().children)
        {
            if (auto* found = findById(*child, id))
                return found;
        }
    }

    return nullptr;
}

ChainNode* findParent(ChainNode& root, ChainNodeId childId)
{
    if (!root.isGroup())
        return nullptr;

    for (const auto& child : root.getGroup().children)
    {
        if (child->id == childId)
            return &root;

        if (child->isGroup())
        {
            if (auto* found = findParent(*child, childId))
                return found;
        }
    }

    return nullptr;
}

void collectPlugins(const ChainNode& node, std::vector<const PluginLeaf*>& result)
{
    if (node.isPlugin())
    {
        result.push_back(&node.getPlugin());
    }
    else if (node.isGroup())
    {
        for (const auto& child : node.getGroup().children)
            collectPlugins(*child, result);
    }
}

void collectPluginsMut(ChainNode& node, std::vector<PluginLeaf*>& result)
{
    if (node.isPlugin())
    {
        result.push_back(&node.getPlugin());
    }
    else if (node.isGroup())
    {
        for (auto& child : node.getGroup().children)
            collectPluginsMut(*child, result);
    }
}

int countPlugins(const ChainNode& node)
{
    if (node.isPlugin())
        return 1;

    int count = 0;
    if (node.isGroup())
    {
        for (const auto& child : node.getGroup().children)
            count += countPlugins(*child);
    }
    return count;
}

int findChildIndex(const ChainNode& parent, ChainNodeId childId)
{
    if (!parent.isGroup())
        return -1;

    const auto& children = parent.getGroup().children;
    for (int i = 0; i < static_cast<int>(children.size()); ++i)
    {
        if (children[static_cast<size_t>(i)]->id == childId)
            return i;
    }
    return -1;
}

bool isDescendant(const ChainNode& ancestor, ChainNodeId descendantId)
{
    if (ancestor.id == descendantId)
        return true;

    if (ancestor.isGroup())
    {
        for (const auto& child : ancestor.getGroup().children)
        {
            if (isDescendant(*child, descendantId))
                return true;
        }
    }
    return false;
}

} // namespace ChainNodeHelpers
