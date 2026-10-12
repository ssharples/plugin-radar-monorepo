# Visual Feedback System - Quick Reference

## State Classes Reference

### Base Classes
```css
.plugin-slot              /* Applied to all slots */
.plugin-slot-wrapper      /* Provides base transitions */
```

### State Classes

#### 1. Bypassed (.plugin-slot-bypassed)
```css
opacity: 0.4
filter: drop-shadow(0 0 4px rgba(239, 68, 68, 0.3))
transition: opacity 300ms ease, filter 300ms ease
```
**Trigger:** `node.bypassed === true`

#### 2. Solo (.plugin-slot-solo)
```css
box-shadow: 0 0 0 2px #89572a, 0 0 12px rgba(137, 87, 42, 0.6)
transition: box-shadow 300ms ease
```
**Trigger:** `node.solo === true`

**Container Class:**
```css
.plugins-soloed .plugin-slot:not(.plugin-slot-solo) {
  opacity: 0.35
}
```

#### 3. Selected (.plugin-slot-selected)
```css
box-shadow: 0 0 0 2px #89572a, 0 0 16px rgba(137, 87, 42, 0.8)
transform: scale(1.02)
transition: box-shadow 300ms ease, transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)
```
**Trigger:** `isSelected === true || isMultiSelected === true`

#### 4. Hover (.plugin-slot-hover)
```css
transform: translateY(-1px)
filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4))
transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), filter 200ms ease
```
**Trigger:** `isHovered === true && !isDragging`

#### 5. Processing (.meter-processing)
```css
animation: meter-processing-pulse 1.5s ease-in-out infinite

@keyframes meter-processing-pulse {
  0%, 100% { opacity: 0.8 }
  50% { opacity: 1.0 }
}
```
**Trigger:** `meterData.peakL > 0.001 || meterData.peakR > 0.001`

### State Stacking

#### Bypassed + Selected
```css
opacity: 0.4
box-shadow: 0 0 0 2px #89572a, 0 0 16px rgba(137, 87, 42, 0.8), 0 0 8px rgba(239, 68, 68, 0.3)
transform: scale(1.02)
```

#### Solo + Selected
```css
box-shadow: 0 0 0 3px #89572a, 0 0 20px rgba(137, 87, 42, 0.9)
transform: scale(1.02)
```

## Color Palette

### Primary Colors
- **Amber Accent:** `#89572a` - Used for selection and solo borders
- **Red Alert:** `rgba(239, 68, 68, ...)` - Used for bypassed state
- **Black Shadow:** `rgba(0, 0, 0, ...)` - Used for elevation

### Opacity Levels
- **Full opacity:** 1.0 - Normal, selected, soloed plugins
- **Medium dim:** 0.4 - Bypassed plugins
- **Heavy dim:** 0.35 - Non-soloed plugins when solo is active
- **Pulse range:** 0.8 → 1.0 - Processing indicator

## Animation Timing

### Transition Durations
- **Standard:** 300ms - Most state changes
- **Quick:** 200ms - Hover effects
- **Slow:** 1500ms - Processing pulse

### Easing Functions
- **ease:** Standard CSS easing - opacity, filter, box-shadow
- **cubic-bezier(0.34, 1.56, 0.64, 1):** Bouncy curve - scale, translate

## Component Integration

### ChainSlot.tsx
```typescript
// State detection
const bypassed = node?.bypassed ?? false;
const isSoloed = node?.solo ?? false;
const isMuted = node?.mute ?? false;

const isProcessing = useMemo(() => {
  if (!meterData || bypassed) return false;
  return (meterData.peakL > 0.001 || meterData.peakR > 0.001);
}, [meterData, bypassed]);

// Class name generation
const slotClasses = useMemo(() => {
  const classes = ['plugin-slot', 'plugin-slot-wrapper', ...];

  if (bypassed) classes.push('plugin-slot-bypassed');
  if (isSoloed) classes.push('plugin-slot-solo');
  if (isSelected || isMultiSelected) classes.push('plugin-slot-selected');
  if (isHovered && !isDragging) classes.push('plugin-slot-hover');
  if (isDragging) classes.push('opacity-30', 'scale-[0.98]');

  return classes.join(' ');
}, [bypassed, isSoloed, isSelected, isMultiSelected, isHovered, isDragging]);
```

### ChainNodeList.tsx
```typescript
// Recursive solo detection
const hasSoloedPlugin = useMemo(() => {
  const checkSolo = (nodeList: ChainNodeUI[]): boolean => {
    for (const node of nodeList) {
      if (node.type === 'plugin' && node.solo) return true;
      if (node.type === 'group' && checkSolo(node.children)) return true;
    }
    return false;
  };
  return checkSolo(nodes);
}, [nodes]);

// Apply container class
<div className={`space-y-0 ${hasSoloedPlugin ? 'plugins-soloed' : ''}`}>
```

## Browser Compatibility

All CSS features used are well-supported:
- ✅ CSS Transitions - 98%+ browser support
- ✅ CSS Animations - 98%+ browser support
- ✅ Transform - 98%+ browser support
- ✅ Box Shadow - 98%+ browser support
- ✅ Filter: drop-shadow - 97%+ browser support

## Performance Notes

### GPU Acceleration
These properties trigger GPU acceleration:
- `transform: scale()`
- `transform: translateY()`
- `opacity`

### CPU-Bound Properties
These are CPU-bound but acceptable for small elements:
- `filter: drop-shadow()` - Used sparingly
- `box-shadow` - Multiple shadows combine additively

### Optimization Strategies
1. **useMemo:** Class names generated once per state change
2. **CSS containment:** Each slot is self-contained
3. **Will-change:** Could be added for better performance
4. **Threshold:** 0.001 for processing detection (minimal CPU)

## Debugging

### DevTools Inspection
```javascript
// Check if classes are applied
document.querySelector('.plugin-slot').classList

// Check computed styles
getComputedStyle(document.querySelector('.plugin-slot'))

// Monitor state changes
// Add console.log in slotClasses useMemo
```

### Common Issues
1. **No hover effect:** Check if `isDragging` is false
2. **No solo dimming:** Verify `plugins-soloed` class on container
3. **No processing pulse:** Check meter data threshold (> 0.001)
4. **Transitions not smooth:** Verify base transition class is applied

## Visual Hierarchy

State importance (highest to lowest):
1. **Bypassed** - Overrides all visual prominence (40% opacity)
2. **Selected** - Highest visual prominence when active
3. **Solo** - Clear distinction from other plugins
4. **Hover** - Subtle feedback for interactivity
5. **Processing** - Ambient indicator, non-distracting

## Keyboard Shortcuts Integration

States that should respond to keyboard:
- **Selection:** Arrow keys, Tab
- **Bypass:** B key
- **Solo:** S key
- **Multi-select:** Shift + Click, Cmd/Ctrl + Click

## Accessibility Considerations

### ARIA Labels (Future Enhancement)
```html
<div
  role="button"
  aria-pressed={isSoloed}
  aria-disabled={bypassed}
  aria-selected={isSelected}
>
```

### Motion Preferences
```css
@media (prefers-reduced-motion: reduce) {
  .plugin-slot-wrapper {
    transition: none !important;
    animation: none !important;
  }
}
```

### Color Contrast
- Amber on dark background: ✅ Passes WCAG AA
- Red glow on dark background: ✅ Passes WCAG AA
- 40% opacity text: ⚠️ Consider higher contrast for critical info

## Testing Checklist

- [ ] Bypass plugin → 40% opacity + red glow
- [ ] Solo plugin → amber border + others dim
- [ ] Select plugin → scale up + amber glow
- [ ] Hover plugin → lift up + shadow
- [ ] Process audio → meter pulses
- [ ] Bypass + Select → combined effects
- [ ] Solo + Select → enhanced glow
- [ ] Multiple states → smooth transitions
- [ ] Drag plugin → hover disabled
- [ ] Theme consistency → matches Propane colors
