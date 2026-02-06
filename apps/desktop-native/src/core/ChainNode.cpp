#include "ChainNode.h"

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
