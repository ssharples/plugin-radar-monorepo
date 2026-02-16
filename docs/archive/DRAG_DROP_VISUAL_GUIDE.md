# Drag & Drop Visual Feedback Guide

## State-Based Visual Feedback System

### State 1: Idle (No Drag)
```
┌─────────────────────┐
│ Plugin A            │ ← 100% opacity, normal state
├─────────────────────┤
│                     │ ← Invisible drop zone (h-0)
├─────────────────────┤
│ Plugin B            │ ← 100% opacity, normal state
├─────────────────────┤
│                     │ ← Invisible drop zone (h-0)
└─────────────────────┘
```

### State 2: Dragging Plugin A (not hovering)
```
┌─────────────────────┐
│ 👆 Plugin A (ghost) │ ← Follows cursor with breathing glow
└─────────────────────┘

┌─────────────────────┐
│ [dimmed]            │ ← Plugin B at 30% opacity + brightness(0.7)
├─────────────────────┤
│ ━━━━━━━━━━━━━━━━━━━ │ ← Drop zone line pulsing (0.5px → 0.5px, 50-100% opacity)
├─────────────────────┤
│ [dimmed]            │ ← Plugin C at 30% opacity
├─────────────────────┤
│ ━━━━━━━━━━━━━━━━━━━ │ ← Drop zone line pulsing
└─────────────────────┘
```

**Visual Cues:**
- Dragged item removed from list (shows as overlay at cursor)
- All other plugins dimmed to 30%
- Drop zone lines pulse rhythmically at 0.5px height
- Serial zones use white color, parallel zones use green

### State 3: Dragging + Hovering Over Valid Drop Zone
```
┌─────────────────────┐
│ 👆 Plugin A (ghost) │ ← Follows cursor with breathing glow
└─────────────────────┘

┌─────────────────────┐
│ [dimmed]            │ ← Plugin B at 30% opacity
├─────────────────────┤
│ ┏━━━━━━━━━━━━━━━━━┓ │ ← BRIGHT 1.5px line with magnetic snap
│ ┃                 ┃ │ ← Ghost preview box (dashed, 12px tall, 30% opacity)
│ ┗━━━━━━━━━━━━━━━━━┛ │
├─────────────────────┤
│ [dimmed]            │ ← Plugin C at 30% opacity
└─────────────────────┘
```

**Visual Cues:**
- Drop zone line thickens from 0.5px → 1.5px instantly
- Magnetic snap animation plays (scaleY: 1 → 1.4 → 1.2)
- Semi-transparent ghost preview appears at drop location
- Ghost preview shows exact size and position where plugin will land

### State 4: Dropping (Animation Sequence)
```
Frame 1 (0ms):
┌─────────────────────┐
│ Plugin B            │ ← Still dimmed
├─────────────────────┤
│ ┏━━━━━━━━━━━━━━━━━┓ │ ← Bright line + ghost
├─────────────────────┤

Frame 2 (100ms):
┌─────────────────────┐
│ Plugin B            │ ← Opacity returning (60%)
├─────────────────────┤
│ [Plugin A fading in]│ ← Scaling from 0.92x back to 1x
├─────────────────────┤

Frame 3 (200ms):
┌─────────────────────┐
│ Plugin B            │ ← 100% opacity
├─────────────────────┤
│ Plugin A            │ ← Fully inserted, 100% opacity
├─────────────────────┤
│ Plugin C            │ ← 100% opacity
└─────────────────────┘
```

**Animation Timeline:**
- 0-200ms: Dragged item scales from 1x → 0.92x and fades to 0
- 0-200ms: All plugins un-dim from 30% → 100%
- 0-150ms: Drop zone line shrinks and fades out
- 0-200ms: Ghost preview fades out

### State 5: Hovering Over Disabled Drop Zone (Self-Drop Prevention)
```
┌─────────────────────┐
│ 👆 Group A (ghost)  │ ← Dragging a group
└─────────────────────┘

┌─────────────────────┐
│ ╔═ Group A ═══════╗ │ ← Cannot drop into own subtree
│ ║ [dimmed]         ║ │
│ ║ ─────────────── ║ │ ← Disabled zone (20% opacity, no pulse, no snap)
│ ║ [dimmed]         ║ │
│ ╚══════════════════╝ │
└─────────────────────┘
```

**Visual Cues:**
- Disabled drop zones at 20% opacity (vs 50% for valid zones)
- No pulse animation on disabled zones
- No magnetic snap on hover
- No ghost preview appears

## Color Scheme

### Serial Context (Default)
- Line color: `#ffffff` (white)
- Ghost preview border: `rgba(255, 255, 255, 0.4)`
- Ghost preview background: `rgba(255, 255, 255, 0.05)`

### Parallel Context
- Line color: `#5a7842` (green)
- Ghost preview border: `rgba(90, 120, 66, 0.4)`
- Ghost preview background: `rgba(90, 120, 66, 0.05)`

## Animation Curves

```
Drop Zone Pulse (1.5s infinite):
  Opacity: 0.5 ──▲─▼── 1.0 ──▲─▼── 0.5
  ScaleY:  1.0 ──▲─▼── 1.2 ──▲─▼── 1.0

Magnetic Snap (300ms once):
  ScaleY: 1.0 ──▲── 1.4 ──▼── 1.2 ──■

Ghost Preview (200ms once):
  Opacity: 0.0 ──────▲──────── 0.3
  Scale:   0.95 ─────▲──────── 1.0

Dim/Brighten (200ms):
  Opacity: 1.0 ──▼── 0.3 ──▲── 1.0
  Filter:  brightness(1) ──▼── brightness(0.7) ──▲── brightness(1)
```

## Edge Cases Handled

### Empty Chain
```
┌─────────────────────┐
│ + Add plugin        │ ← Clickable empty state
└─────────────────────┘

[Dragging from plugin browser] →

┌─────────────────────┐
│ ━━━━━━━━━━━━━━━━━━━ │ ← Pulses to invite drop
│ + Drop here         │ ← Changes text on hover
└─────────────────────┘
```

### Empty Group
```
┌─────────────────────┐
│ [≡ Serial Group    ]│ ← Group header
├─────────────────────┤
│ Drop a plugin here  │ ← Empty zone pulses when dragging
└─────────────────────┘
```

### Nested Groups
```
┌─────────────────────┐
│ [≡ Outer Group     ]│
├─────────────────────┤
│ │ [dimmed]          │ ← Nested items also dimmed
│ │ ─────────────────│ ← Nested drop zones also pulse
│ │ [dimmed]          │
└─────────────────────┘
```

### Parallel Branches
```
┌─────────────────────┐
│ [⑂ Parallel Group  ]│
├──┬────────────────┬─┤
│ │Branch 1        │ │ ← Each branch has own drop zones
│ ├────────────────┤ │
│ │Branch 2        │ │ ← Independent pulse animations
└──┴────────────────┴─┘
```

## Performance Characteristics

| Animation | FPS | GPU | Triggers Reflow |
|-----------|-----|-----|-----------------|
| Pulse | 60 | ✓ (transform) | ✗ |
| Snap | 60 | ✓ (transform) | ✗ |
| Dim/Brighten | 60 | ✓ (opacity/filter) | ✗ |
| Ghost Fade | 60 | ✓ (opacity/transform) | ✗ |
| Drag Preview Glow | 60 | ✓ (filter: drop-shadow) | ✗ |

**Total CPU Impact:** Minimal — all animations use composite-only properties

## Accessibility

### Motion Sensitivity
```css
@media (prefers-reduced-motion: reduce) {
  /* Tailwind automatically disables all animate-* classes */
  /* Transitions reduced to 0ms */
  /* Only opacity changes remain, no movement */
}
```

### Keyboard Navigation
- Arrow keys: Move selection
- Ctrl+Up/Down: Reorder selected plugin
- Escape: Cancel drag operation
- All visual feedback works identically for keyboard-initiated drags

### Screen Readers
- Drop zones announce "Drop target, insert before [Plugin Name]"
- Dimmed items remain in DOM (not removed), still navigable
- Drag state announced: "Dragging [Plugin Name]"

---

**Last Updated:** 2026-02-11
**Design System:** Propane UI (Monochrome/Amber)
