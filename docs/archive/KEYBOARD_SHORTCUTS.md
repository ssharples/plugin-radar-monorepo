# Keyboard Shortcuts

## Overlay System

The desktop app features a comprehensive keyboard shortcut discovery system to help users learn and utilize shortcuts efficiently.

### Features

1. **Cmd/Ctrl Hold Indicator**
   - When Cmd (Mac) or Ctrl (Windows/Linux) is held down, a floating hint appears in the bottom-right corner
   - Shows "Keyboard shortcuts active" with a reminder to press ? for the full reference
   - Non-intrusive design that fades in smoothly

2. **Reference Panel (?)**
   - Press `?` to open the full keyboard shortcuts reference panel
   - Organized by category (Editing, Groups, Snapshots, Navigation, Global)
   - Clear typography with visual key indicators
   - Close with Escape, clicking outside, or the X button

3. **Integration**
   - Works seamlessly with the existing `keyboardStore` centralized shortcut manager
   - Priority-based handler execution prevents conflicts
   - Respects input focus (most shortcuts disabled when typing)

## Available Shortcuts

### Editing
- **⌘Z** — Undo
- **⌘⇧Z** — Redo
- **⌘Y** — Redo (alternate)
- **⌫ / Del** — Remove selected plugin

### Groups
- **⌘G** — Create serial group (2+ plugins selected)
- **⌘⇧G** — Create parallel group (2+ plugins selected)

### Snapshots
- **⌘1** — Recall snapshot A
- **⌘2** — Recall snapshot B
- **⌘3** — Recall snapshot C
- **⌘⇧1** — Save snapshot A
- **⌘⇧2** — Save snapshot B
- **⌘⇧3** — Save snapshot C

### Navigation
- **⌘F** — Focus plugin search
- **⌘B** — Open/close plugin browser

### Global
- **?** — Show keyboard shortcuts reference panel

## Implementation Details

### Component: `KeyboardShortcutOverlay`

Located at: `apps/desktop/ui/src/components/KeyboardShortcutOverlay/`

**State Management:**
- Tracks Cmd/Ctrl key state via window-level keydown/keyup listeners
- Uses capture phase to detect modifiers before other handlers
- Automatically cleans up on blur

**Styling:**
- Uses Propane design system (Cutive Mono font, plugin-* color tokens)
- CRT text effect on modal title
- Glass morphism background with backdrop blur
- Smooth fade-in/scale-in animations

**Accessibility:**
- Escape key closes modal
- Click outside to dismiss
- Clear visual hierarchy
- Semantic HTML (kbd elements for key indicators)

### Integration Points

1. **App.tsx**
   - Overlay rendered at root level (outside chain/analyzer/footer)
   - Always visible when onboarding complete
   - z-index 50 for floating hint, 100 for modal

2. **keyboardStore.ts**
   - Centralized shortcut manager with priority-based execution
   - Modal priority (100) > Dropdown (90) > Component (50) > Global (0)
   - Input detection prevents conflicts with text editing

3. **useChainEditorShortcuts.ts**
   - ChainEditor-specific shortcuts (undo/redo/groups/snapshots)
   - All use ShortcutPriority.COMPONENT

4. **useKeyboardShortcuts.ts**
   - Global shortcuts (search focus, delete node)
   - All use ShortcutPriority.GLOBAL

## Design Decisions

### Non-Intrusive Approach
- Hint only appears when Cmd is held (intentional modifier press)
- Small floating indicator in corner (doesn't block UI)
- Modal only appears on explicit request (?)
- No always-visible chrome or badges

### Clear Typography
- Cutive Mono for consistency with Propane design
- CRT text glow on title for brand consistency
- Large, readable key indicators (kbd elements)
- Category grouping for easy scanning

### Helpful for New Users
- Contextual hint guides discovery (? when Cmd held)
- Full reference shows all shortcuts at once
- Descriptions explain what each shortcut does
- Category labels group related actions

### Platform Awareness
- Shows ⌘ symbol for Mac shortcuts
- Handles both metaKey (Mac Cmd) and ctrlKey (Windows/Linux Ctrl)
- Uses system-standard modifier detection

## Testing

Manual testing checklist:
- [ ] Hold Cmd/Ctrl → floating hint appears
- [ ] Release Cmd/Ctrl → hint disappears
- [ ] Press ? → reference panel opens
- [ ] Press Escape → panel closes
- [ ] Click outside modal → panel closes
- [ ] Click X button → panel closes
- [ ] Verify all shortcuts listed in panel
- [ ] Test shortcuts while panel open (most should work)
- [ ] Verify hint doesn't appear when panel open
- [ ] Test with browser open (Cmd+B toggle)
- [ ] Test with text input focused (shortcuts disabled)

## Future Enhancements

Potential improvements:
1. **Contextual hints on hover** — Show shortcut badges on buttons when Cmd held
2. **Learn mode** — Highlight unused shortcuts, track which ones user knows
3. **Custom bindings** — Allow users to remap shortcuts (stored in localStorage)
4. **Search/filter** — Quick search in reference panel for specific actions
5. **Print mode** — Export shortcuts as PDF cheat sheet
6. **Tooltips** — Show shortcuts in button titles/tooltips
7. **Animation** — Pulse effect on elements with active shortcuts when Cmd held
