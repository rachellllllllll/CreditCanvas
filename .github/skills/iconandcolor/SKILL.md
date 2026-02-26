---
name: iconandcolor
description: Use the existing IconPickerPopup and ColorPalettePicker components for icon selection and color picking. Keywords: icon, emoji, color, picker, palette, אייקון, צבע, בוחר, פלטה, אמוג'י.
---

# IconPickerPopup & ColorPalettePicker — Reusable Icon & Color Components

## Overview

The app has **two dedicated, reusable components** for selecting icons and colors. **Always use them** instead of building custom pickers.

| Component | Purpose | Style |
|-----------|---------|-------|
| `IconPickerPopup` | Full-featured emoji picker popup (Teams-style) | Overlay with search, categories, recent, tabs |
| `ColorPalettePicker` | 18-color palette grid + custom color option | Google Calendar / Apple Reminders style |

They are often used together (e.g. editing a category definition), but each works independently.

## IconPickerPopup

### Import

```tsx
import IconPickerPopup from './IconPickerPopup';
```

### Props

```ts
interface IconPickerPopupProps {
  isOpen: boolean;              // Controls visibility
  currentIcon: string;          // Currently selected emoji
  previewColor: string;         // Background color for the preview dot
  recommendedIcons?: string[];  // Suggested icons shown at top (max 8 shown)
  onSelect: (icon: string) => void;  // Called when user picks an icon
  onClose: () => void;          // Called to close the popup
}
```

### Features

- **Search** — Hebrew keyword search across all icons via `searchIcons()` from `icons.ts`
- **Paste emoji** — User can paste any emoji and it's recognized
- **Recently used** — Persisted in `localStorage`, shown at top
- **Category tabs** — Bottom tab bar for quick navigation (like Microsoft Teams)
- **Scroll tracking** — Active tab highlights based on scroll position
- **Keyboard** — Escape closes, search auto-focuses

### Basic Usage

```tsx
const [showIconPicker, setShowIconPicker] = useState(false);
const [icon, setIcon] = useState('🍔');
const [color, setColor] = useState('#E74C3C');

<button onClick={() => setShowIconPicker(true)}>{icon}</button>

<IconPickerPopup
  isOpen={showIconPicker}
  currentIcon={icon}
  previewColor={color}
  onSelect={setIcon}
  onClose={() => setShowIconPicker(false)}
/>
```

### With Recommended Icons

```tsx
<IconPickerPopup
  isOpen={showIconPicker}
  currentIcon={icon}
  previewColor={color}
  recommendedIcons={['🏠', '🚗', '💊', '📚']}
  onSelect={setIcon}
  onClose={() => setShowIconPicker(false)}
/>
```

### CSS

The component imports `CategorySelectOrAdd.css` — no additional CSS file needed. All classes are prefixed with `CategorySelectOrAdd-icon-picker-`.

---

## ColorPalettePicker

### Import

```tsx
import ColorPalettePicker, { COLOR_PALETTE } from './ColorPalettePicker';
```

### Props

```ts
interface ColorPalettePickerProps {
  value: string;               // Current hex color, e.g. '#3498DB'
  onChange: (color: string) => void;  // Called with new hex color
  showLabel?: boolean;         // Show "צבע" label above (default: true)
  label?: string;              // Custom label text (default: 'צבע')
  compact?: boolean;           // Smaller circles, no label (default: false)
}
```

### Color Palette

The 18 preset colors are exported as `COLOR_PALETTE` — a 6×3 grid organized by hue:

| Row | Style | Colors |
|-----|-------|--------|
| 1 | Normal | red, orange, yellow, green, blue, purple |
| 2 | Dark | darker versions of the above |
| 3 | Light | lighter versions of the above |

Plus a "custom color" button that opens the native `<input type="color">` picker.

### Basic Usage

```tsx
const [color, setColor] = useState('#3498DB');

<ColorPalettePicker value={color} onChange={setColor} />
```

### Compact Mode (inline, no label)

```tsx
<ColorPalettePicker value={color} onChange={setColor} compact showLabel={false} />
```

### Custom Label

```tsx
<ColorPalettePicker value={color} onChange={setColor} label="צבע רקע" />
```

### CSS

Imports `ColorPalettePicker.css`. All classes are prefixed with `ColorPalettePicker-`.

---

## Using Both Together

The typical pattern for category editing:

```tsx
const [icon, setIcon] = useState(category.icon);
const [color, setColor] = useState(category.color);
const [showIconPicker, setShowIconPicker] = useState(false);

{/* Icon button — shown as colored circle */}
<button onClick={() => setShowIconPicker(true)}>
  <span style={{ background: color }}>{icon}</span>
</button>

{/* Color palette */}
<ColorPalettePicker value={color} onChange={setColor} />

{/* Icon picker popup */}
<IconPickerPopup
  isOpen={showIconPicker}
  currentIcon={icon}
  previewColor={color}
  onSelect={setIcon}
  onClose={() => setShowIconPicker(false)}
/>
```

---

## icons.ts — Icon Data & Utilities

The icon data module exports:

| Export | Type | Description |
|--------|------|-------------|
| `ICONS` | `string[]` | Flat array of all emoji strings |
| `ICON_CATEGORIES` | `IconCategory[]` | Grouped by category with `id`, `label`, `tabIcon`, and `icons` |
| `ICON_SEARCH_MAP` | `Record<string, string[]>` | Emoji → Hebrew keywords mapping |
| `searchIcons(query)` | `(string) => string[]` | Search icons by Hebrew/English keyword |

```ts
import { ICONS, ICON_CATEGORIES, ICON_SEARCH_MAP, searchIcons } from './icons';
```

Use `ICONS` when you need a random or default icon. Use `searchIcons` for programmatic icon suggestions.

---

## Files

| File | Role |
|------|------|
| `src/components/IconPickerPopup.tsx` | Icon picker popup component |
| `src/components/ColorPalettePicker.tsx` | Color palette component |
| `src/components/ColorPalettePicker.css` | Color palette styles |
| `src/components/CategorySelectOrAdd.css` | Icon picker styles (shared) |
| `src/components/icons.ts` | Icon data, categories, and search |

## Existing Usages

| Component | Used In |
|-----------|---------|
| `IconPickerPopup` | `EditCategoryDefDialog.tsx`, `CategorySelectOrAdd.tsx` |
| `ColorPalettePicker` | `EditCategoryDefDialog.tsx`, `CategorySelectOrAdd.tsx` |
| `icons.ts` | `IconPickerPopup.tsx`, `CategorySelectOrAdd.tsx`, `CategoryManager.tsx` |

**Do NOT** build custom icon grids, color swatches, or emoji pickers. Always reuse these components.
