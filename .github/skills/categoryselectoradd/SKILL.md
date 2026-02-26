---
name: categoryselectoradd
description: Use the existing CategorySelectOrAdd component whenever you need a UI for selecting an existing category or creating a new one. Keywords: category, select, add, picker, dropdown, combo, קטגוריה, בחירה, הוספה.
---

# CategorySelectOrAdd — Reusable Category Selector Component

## What Is It?

`CategorySelectOrAdd` is the **single source of truth** component for choosing or creating a category anywhere in the app. It provides:

- **Dropdown** of existing categories (filterable by typing)
- **Recently-used** categories section (persisted in localStorage)
- **Inline "add new category"** flow with icon picker + color picker
- **Chip preview** showing the selected category with its icon & color
- **Keyboard navigation** (arrow keys, Enter, Escape)
- **Portal-based dropdown** that renders correctly inside modals, tables, and scrollable containers
- **RTL/Hebrew** support out of the box

## When To Use

Use `CategorySelectOrAdd` **every time** you need a user to:
- Pick a category from the existing list
- Create a new category on-the-fly
- Map a description/merchant to a category
- Reassign a transaction to a different category
- Bulk-change categories

**Do NOT** build a custom `<select>`, `<input>` + dropdown, or any other category-picking UI. Always use this component.

## Import

```tsx
import CategorySelectOrAdd from './CategorySelectOrAdd';
// or from the relevant relative path
import type { CategoryDef } from './CategoryManager';
```

## Props Reference

```ts
interface CategorySelectOrAddProps {
  // ── Required ──────────────────────────────────────────────
  categories: CategoryDef[];           // Full list of available categories
  value: string | null;                // Currently selected category name, or null
  onChange: (catName: string) => void;  // Called when user selects an existing category
  onAddCategory: (cat: CategoryDef) => void; // Called when user creates a new category

  // ── Optional ──────────────────────────────────────────────
  allowAdd?: boolean;                  // Allow creating new categories (default: true)
  allowEditExisting?: boolean;         // Allow editing icon/color of existing categories via chip click (default: true). Set to false to only show pickers for new categories.
  placeholder?: string;               // Input placeholder text
  forbiddenCategoryName?: string;      // Category name to exclude from the list
  defaultIcon?: string;               // Pre-selected emoji icon
  defaultColor?: string;              // Pre-selected hex color
  recommendedIcons?: string[];        // Suggested icons shown at top of icon picker
  previewVisibility?: 'always' | 'afterAdd'; // When to show the chip (default: 'afterAdd')
  showDefaultChipIfProvided?: boolean; // Show chip when defaultIcon/defaultColor exist (default: false)
  onDraftChange?: (draft: { name: string; icon: string; color: string } | null) => void;
                                       // Report unsaved draft state to parent
}
```

Where `CategoryDef` is:

```ts
interface CategoryDef {
  name: string;   // Category display name
  color: string;  // Hex color, e.g. '#36A2EB'
  icon: string;   // Emoji string, e.g. '🍔'
}
```

## Usage Patterns

### 1. Basic — Select only (no add)

Use when the user must pick from an existing list and creation is not allowed.

```tsx
<CategorySelectOrAdd
  categories={categories}
  value={selectedCategory}
  onChange={setSelectedCategory}
  onAddCategory={() => {}}
  allowAdd={false}
/>
```

### 2. Select or Add

The most common usage — user can pick an existing category or create a new one.

```tsx
<CategorySelectOrAdd
  categories={categories}
  value={selectedCategory}
  onChange={setSelectedCategory}
  onAddCategory={(newCat) => {
    setCategories(prev => [...prev, newCat]);
    setSelectedCategory(newCat.name);
  }}
  allowAdd={true}
  placeholder="בחר קטגוריה..."
/>
```

### 3. With forbidden category (e.g. alias mapping — prevent self-reference)

```tsx
<CategorySelectOrAdd
  categories={categories}
  value={targetCategory}
  onChange={setTargetCategory}
  onAddCategory={() => {}}
  allowAdd={false}
  forbiddenCategoryName={sourceCategory}
/>
```

### 4. With default icon/color and chip preview (e.g. in table rows)

```tsx
<CategorySelectOrAdd
  categories={categories}
  value={cat.name}
  onChange={handleCategoryChange}
  onAddCategory={handleAddCategory}
  allowAdd={true}
  defaultIcon={cat.icon}
  defaultColor={cat.color}
  previewVisibility="always"
  showDefaultChipIfProvided={true}
/>
```

### 5. Full-featured with draft tracking and recommended icons

```tsx
<CategorySelectOrAdd
  key={`category-select-${rowId}`}
  categories={allCategories}
  value={selectedName}
  onChange={catName => handleChange(rowId, catName)}
  onAddCategory={cat => handleAdd(rowId, cat)}
  allowAdd={true}
  placeholder={defaultName}
  defaultIcon={defaults.icon}
  defaultColor={defaults.color}
  recommendedIcons={defaults.recommendedIcons}
  previewVisibility="afterAdd"
  showDefaultChipIfProvided={Boolean(defaults.icon || defaults.color)}
  onDraftChange={draft => setDrafts(prev => ({ ...prev, [rowId]: draft }))}
/>
```

## Important Implementation Notes

1. **Always pass `onAddCategory`** even when `allowAdd={false}` — use a no-op `() => {}`.
2. **Use `key` prop** when rendering inside a list/table to ensure correct state isolation per row.
3. **`onChange` fires on selecting an existing category**; `onAddCategory` fires when creating a new one. After `onAddCategory`, the component also calls `onChange` with the new name automatically.
4. **`onDraftChange`** reports intermediate edits (name/icon/color typed but not yet confirmed). Use it when you need to capture unsaved state, e.g. for a "save all" button.
5. **`previewVisibility="always"`** shows the colored chip even before any user interaction. Use for table rows where the category is already assigned.
6. **CSS file**: The component imports `CategorySelectOrAdd.css`. No additional styling is needed.
7. **Portal rendering**: The dropdown renders via `createPortal` to `document.body`, so it works correctly inside scrollable containers and modals.

## Files

| File | Role |
|------|------|
| `src/components/CategorySelectOrAdd.tsx` | Component implementation |
| `src/components/CategorySelectOrAdd.css` | Component styles |
| `src/components/icons.ts` | Icon data (ICONS, ICON_CATEGORIES, searchIcons) |
| `src/components/CategoryManager.tsx` | Exports `CategoryDef` type |

## Existing Usages In The Codebase

The component is already used in 6 different places:

| File | Context |
|------|---------|
| `CategoryAliasesManager.tsx` | From/To alias mapping (3 instances, `allowAdd=false`) |
| `CategoryManager.tsx` | Category list table row |
| `DescriptionCategoriesMappingDialog.tsx` | Rule → category mapping |
| `EditCategoryDialog.tsx` | Reassign transaction category |
| `GlobalSearch/GlobalSearchModal.tsx` | Bulk category change |
| `NewCategoriesTablePrompt.tsx` | New category table + uncategorized merchants (2 instances) |

When adding a new feature that involves category selection, **reuse this component** instead of building custom UI.