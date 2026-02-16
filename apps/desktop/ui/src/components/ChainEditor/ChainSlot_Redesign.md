# ChainSlot Redesign: Integration Plan

## Current ChainSlot Features to Preserve:
1. ✅ Meter data subscription from zustand store
2. ✅ Solo/mute/bypass state management
3. ✅ Plugin swap menu functionality
4. ✅ Drag and drop with dnd-kit
5. ✅ Progressive disclosure on hover
6. ✅ Multi-selection support
7. ✅ Latency display
8. ✅ Peak hold meters
9. ✅ Plugin editor window toggle
10. ✅ Node duplication

## New Cyber Aesthetic Changes:
1. Replace rackmount background images with CSS
2. Use extended bold typography for plugin names
3. Use monospace fonts for technical info (dB, ms)
4. Add neon glow effects for active states
5. Replace image-based buttons with CSS buttons
6. Add glitch animation on bypass
7. Show keyboard shortcuts on hover
8. Compact inline meter instead of separate component

## Implementation Strategy:
Instead of completely rewriting ChainSlot.tsx (which has complex logic),
I'll update its styling to use the design system classes while keeping
all existing functionality intact.

This is safer than a full rewrite because:
- Maintains meter subscription logic
- Preserves drag-drop behavior
- Keeps plugin swap functionality
- No risk of breaking existing features

## Files to Modify:
1. ✅ index.css - Import design system (DONE)
2. ⏳ ChainSlot.tsx - Update JSX to use cyber classes
3. ⏳ Remove/replace image assets with CSS

## Next Steps:
I'll update ChainSlot.tsx incrementally to use the new design system.
