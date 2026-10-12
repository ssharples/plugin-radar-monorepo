# ReactFlow Chain Editor — Full Rewrite Design

**Date**: 2026-03-04
**Status**: Approved
**Scope**: Replace dnd-kit chain editor with ReactFlow canvas + floating AI chat

## Overview

Replace the current list-based chain editor (dnd-kit, ~1700 lines) with an interactive ReactFlow node graph. The canvas shows signal flow top-to-bottom within the existing 500x750 ProChain plugin frame. A floating AI chat overlay lets users build and modify chains conversationally, with AI suggestions appearing as ghost nodes on the canvas.

## Architecture

### Chain Tree → ReactFlow Mapping

The existing chain tree model (`ChainNode` with `std::variant<PluginLeaf, GroupData>`) maps to ReactFlow:

**Node Types:**
| Type | Purpose | Size |
|------|---------|------|
| `PluginNode` | Single plugin slot | ~200x60px |
| `GroupHeaderNode` | Serial/parallel group label | ~220x40px |
| `GroupMergeNode` | Parallel branch merge point | ~40x20px |
| `AddNode` | `+` button between nodes (hover reveal) | ~30x30px |

**Edge Types:**
| Type | Purpose |
|------|---------|
| `SignalEdge` | Audio signal connection (animated dots when active) |
| `BranchEdge` | Parallel group fan-out/fan-in |
| `GhostEdge` | AI preview connection (dashed, semi-transparent) |

### Layout

- **Direction**: Top-to-bottom (dagre `rankdir: TB`) — fits 500x750 frame
- **Auto-layout**: Dagre recalculates on structural changes (debounced 150ms)
- **Node separation**: `nodesep: 40`, `ranksep: 60` (compact for small viewport)
- **Scroll**: Vertical pan, pinch-zoom for complex chains
- `fitView` on chain load

### Visual Layout

```
     ┌──────────┐
     │ De-Esser │
     │  Weiss   │
     └────┬─────┘
          │
       [  +  ]        ← AddNode (hover reveal)
          │
     ┌────┴─────┐
     │  Pro-Q 4 │
     │FabFilter │
     └────┬─────┘
          │
    ╔═════╧═════╗     ← GroupHeaderNode (parallel)
    ║  Par Comp  ║
    ╚═╤═══════╤═╝
      │       │
  ┌───┴──┐ ┌──┴───┐   ← Branches side-by-side
  │ 1176 │ │ LA2A │
  │ UAD  │ │ UAD  │
  └───┬──┘ └──┬───┘
      │       │
    ╔═╧═══════╧═╗     ← GroupMergeNode
    ╚═════╤═════╝
          │
     ┌────┴─────┐
     │ Limiter  │
     │   L2     │
     └──────────┘
```

### State Bridge

- `chainStore` (Zustand) remains the **source of truth**
- New `useChainToReactFlow()` hook converts chain tree → ReactFlow nodes/edges
- User interactions on canvas call the same `juceBridge` actions as the current editor
- Chain state changes: C++ → chainStore → ReactFlow nodes/edges (reactive)

```
chainStore.nodes (tree) ──→ useChainToReactFlow() ──→ ReactFlow nodes/edges
        ↑                                                     │
        │                                                     ↓
   juceBridge ←──────── user interactions on canvas ──────────┘
```

## Node Interactions

### Click
- **Click plugin node** → Selects it (cyan glow), transitions to inline editor view with toolbar wrappers. Bottom footer shows parameter sliders.
- **Click group header** → Selects group, shows group controls (bypass, dissolve, etc.)
- **Shift+click** → Open external plugin window
- **Ctrl/Cmd+click** → Multi-select toggle

### Drag
- **Drag node** → Reorder within signal flow (changes chain position)
- **Drag onto another node** → Create parallel group
- **Drag out of parallel group** → Extract from group

### Context Menu (Right-click)
- Plugin node: Swap Plugin, Duplicate, Bypass, Mute, Remove, Open Editor
- Group node: Add Plugin, Toggle Bypass, Dissolve, Collapse, Save Template, Delete
- Canvas background: Add Plugin, Import Chain

### Add Plugin
- `+` button appears on hover between any two nodes (AddNode)
- Click opens inline plugin search as a floating panel
- Drag plugin from mini browser onto canvas to add

### Delete
- Backspace/Delete removes selected node(s)
- Multi-select with Shift+click, then batch delete
- Auto-dissolve empty groups after deletion

### Keyboard Shortcuts (Preserved)
| Key | Action |
|-----|--------|
| `Cmd+Z` / `Ctrl+Z` | Undo |
| `Cmd+Shift+Z` | Redo |
| `B` | Bypass selected |
| `I` | Mute selected |
| `Cmd+G` | Create serial group |
| `Cmd+Shift+G` | Create parallel group |
| `Cmd+0` | Return to canvas from inline editor |
| `Cmd+1..9` | Jump to Nth plugin |

### Parallel Groups
- Visual split/merge with branch lanes (side-by-side columns)
- Per-branch gain badge (existing `BranchGainBadge`)
- "Add Branch" button on parallel group header
- Drag node between branches to move

## Floating AI Chat

### Overlay
- **Position**: Bottom-right corner of the canvas
- **Collapsed**: Small pill — AI icon + last status ("Chain built", "Ready")
- **Expanded**: ~300x400px chat panel overlaying the canvas with semi-transparent backdrop

### AI → Canvas Integration
- AI chain actions create **ghost nodes** (semi-transparent, dashed border, pulsing animation) on the canvas
- User reviews the preview, then clicks **"Apply"** in the chat to commit
- On apply: ghost nodes become solid, edges connect, parameters are set
- AI `build_chain` → ghost nodes animate into position on canvas
- AI `modify_chain` → affected nodes highlight, modifications shown as ghosts
- AI `set_parameters` → parameter values shown as floating labels near the node

### Ghost Node Visual
- `opacity: 0.4`
- Dashed border (`border-style: dashed`)
- Subtle pulse animation (`animate-pulse` at 2s interval)
- Label: "AI Suggestion" badge
- On hover: shows full parameter details

## Visual Design (Propane Design System)

### Colors
| Element | Value |
|---------|-------|
| Canvas background | `#0a0a0a` |
| Node fill | `rgba(15, 15, 15, 0.95)` |
| Node border | `rgba(255, 255, 255, 0.08)` |
| Selected node | `border: var(--color-accent-cyan)` + `box-shadow: 0 0 20px rgba(222, 255, 10, 0.3)` |
| Bypassed node | `opacity: 0.5` |
| Ghost node (AI) | `opacity: 0.4`, dashed border |
| Signal edge | `stroke: rgba(255, 255, 255, 0.15)` |
| Active edge | Animated flowing dots |
| Serial group border | `#c9944a` |
| Parallel group border | `#5a7842` |
| Category badges | Semantic colors (EQ=blue, comp=orange, reverb=purple) — preserved |

### Typography
- Plugin name: Uppercase, `letter-spacing: 0.05em`, Cutive Mono
- Manufacturer: `text-white/50`, smaller
- Category badge: Colored pill, `text-[10px]`

### Animations
- Node enter: `scale(0) → scale(1)` with spring easing
- Ghost node pulse: `opacity: 0.3 ↔ 0.5` at 2s interval
- Edge flow: CSS animated dash-offset
- Node drag: `opacity: 0.7`, `scale(0.95)`
- Layout transition: `300ms ease-out` position interpolation

## View Model

Two views, same as current architecture:

1. **Canvas view** (ReactFlow) — Chain overview, signal flow graph
2. **Inline editor view** — Click a node → plugin UI with toolbar + parameter footer

The ReactFlow canvas replaces only the **chain list view** (ChainEditor + ChainNodeList + ChainSlotCyber). The inline editor (InlineEditorLayout + InlineToolbar + PluginViewer) is unchanged.

## Files Changed

### New Files
| File | Purpose |
|------|---------|
| `components/ChainCanvas/ChainCanvas.tsx` | Main ReactFlow canvas component |
| `components/ChainCanvas/PluginNode.tsx` | Custom plugin node renderer |
| `components/ChainCanvas/GroupHeaderNode.tsx` | Serial/parallel group header node |
| `components/ChainCanvas/GroupMergeNode.tsx` | Parallel merge point node |
| `components/ChainCanvas/AddNode.tsx` | Inline add plugin button node |
| `components/ChainCanvas/SignalEdge.tsx` | Custom animated signal edge |
| `components/ChainCanvas/GhostNode.tsx` | AI preview node (semi-transparent) |
| `components/ChainCanvas/CanvasContextMenu.tsx` | Context menu for nodes/canvas |
| `components/ChainCanvas/FloatingAiChat.tsx` | Floating AI chat overlay |
| `hooks/useChainToReactFlow.ts` | Chain tree → ReactFlow node/edge converter |
| `hooks/useCanvasKeyboard.ts` | Keyboard shortcuts for canvas |
| `hooks/useCanvasLayout.ts` | Dagre auto-layout with debouncing |

### Modified Files
| File | Change |
|------|--------|
| `App.tsx` | Replace `<ChainEditor>` with `<ChainCanvas>` |
| `stores/chainStore.ts` | No changes (remains source of truth) |
| `components/AiAssistant/AiChatView.tsx` | Extract to `FloatingAiChat.tsx` |
| `components/AiAssistant/BuildChainVisual.tsx` | Adapt to create ghost nodes instead of slot list |
| `components/AiAssistant/ChainPreview.tsx` | Adapt apply button to commit ghost nodes |

### Removed Files (after migration)
| File | Reason |
|------|--------|
| `components/ChainEditor/ChainEditor.tsx` | Replaced by ChainCanvas |
| `components/ChainEditor/ChainNodeList.tsx` | Replaced by ReactFlow rendering |
| `components/ChainEditor/ChainSlotCyber.tsx` | Replaced by PluginNode |
| `components/ChainEditor/DropZone.tsx` | Replaced by ReactFlow drop handling |
| `components/ChainEditor/DragPreview.tsx` | Replaced by ReactFlow drag overlay |
| `components/ChainEditor/GroupBreadcrumbs.tsx` | Already deleted |

### Dependencies
| Package | Purpose |
|---------|---------|
| `@xyflow/react` | ReactFlow v12 (peer dep) |
| `dagre` | Auto-layout for graph positioning |

## Technical Constraints

- **IIFE build**: ReactFlow must work with Vite singlefile IIFE output (no dynamic imports)
- **500x750 viewport**: Nodes must be compact, layout tight
- **60fps**: Memoize node components, debounce layout, use `useCallback` for edge handlers
- **Chain tree mapping**: Must handle recursive serial/parallel nesting to arbitrary depth
- **Undo/redo**: Existing `juceBridge.captureSnapshot()` / undo mechanism preserved

## Success Criteria

1. Chain state renders as a connected node graph (top-to-bottom)
2. All current interactions preserved: add, remove, swap, reorder, bypass, mute, group, ungroup
3. Parallel groups show visual branch split/merge
4. AI chain suggestions appear as ghost nodes, confirmable via Apply
5. Click node → opens inline editor (existing behavior)
6. Vite builds as IIFE without errors
7. Performance: smooth 60fps drag/zoom with 20+ node chains
