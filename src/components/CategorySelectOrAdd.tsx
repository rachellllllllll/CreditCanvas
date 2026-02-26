import React, { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import IconPickerPopup from './IconPickerPopup';
import ColorPalettePicker, { COLOR_PALETTE } from './ColorPalettePicker';
import { ICONS } from './icons';
import type { CategoryDef } from './CategoryManager';
import './CategorySelectOrAdd.css';

// --- Recently-used helpers (localStorage) ---
const RECENT_KEY = 'CategorySelectOrAdd_recent';
const MAX_RECENT = 8;

function getRecentCategories(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function pushRecentCategory(name: string) {
  const list = getRecentCategories().filter(n => n !== name);
  list.unshift(name);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

interface CategorySelectOrAddProps {
  categories: CategoryDef[];
  value: string | null; // שם קטגוריה נבחרת או null
  onChange: (catName: string) => void;
  onAddCategory: (cat: CategoryDef) => void;
  allowAdd?: boolean;
  placeholder?: string;
  forbiddenCategoryName?: string; // Prevent selecting this category
  defaultIcon?: string; // אייקון ברירת מחדל
  defaultColor?: string; // צבע ברירת מחדל
  recommendedIcons?: string[]; // אייקונים מומלצים
  previewVisibility?: 'always' | 'afterAdd'; // שליטה מתי להציג צ'יפ
  showDefaultChipIfProvided?: boolean; // הצג צ'יפ כאשר יש ברירת מחדל
  onDraftChange?: (draft: { name: string; icon: string; color: string } | null) => void; // דיווח טיוטה להורה
  allowEditExisting?: boolean; // Allow editing icon/color of existing categories via chip click (default: true)
}

const CategorySelectOrAdd: React.FC<CategorySelectOrAddProps> = ({ categories, value, onChange, onAddCategory, allowAdd = true, placeholder, forbiddenCategoryName, defaultIcon, defaultColor, recommendedIcons: propRecommendedIcons = [], previewVisibility = 'afterAdd', showDefaultChipIfProvided = false, onDraftChange, allowEditExisting = true }) => {
  const [input, setInput] = useState(value || '');
  const [icon, setIcon] = useState(defaultIcon || ICONS[0]);
  const [color, setColor] = useState(defaultColor || COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)]);
  const initialIconRef = useRef<string>(defaultIcon || ICONS[0]);
  const initialColorRef = useRef<string>(defaultColor || color);
  // ref יציב ל-onDraftChange כדי למנוע לולאה אינסופית כשההורה יוצר פונקציה חדשה בכל רנדר
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [editingMode, setEditingMode] = useState(false);
  const [userTyped, setUserTyped] = useState(false); // מעקב אם המשתמש הקליד
  const [highlightIndex, setHighlightIndex] = useState(-1); // keyboard nav index
  const [recentNames, setRecentNames] = useState<string[]>(getRecentCategories());

  const listboxId = useRef(`catselect-listbox-${Math.random().toString(36).slice(2, 8)}`).current;

  // סנכרון input עם value prop — סינכרוני במהלך render (במקום useEffect אסינכרוני עם deps חסרים)
  const prevValueRef = useRef(value);
  if (value !== prevValueRef.current) {
    prevValueRef.current = value;
    if (!editingMode && !showDropdown) {
      setInput(value || '');
      setUserTyped(false);
    }
  }

  const getReadableTextColor = (hex: string): string => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return '#1f2937';
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 160 ? '#1f2937' : '#ffffff';
  };

  // Filter categories by input and forbiddenCategoryName
  // אם המשתמש הקליד, סנן לפי input. אחרת הצג הכל
  const trimmedInput = input.trim();
  const filtered = useMemo(() => {
    return (trimmedInput && userTyped)
      ? categories.filter(cat => cat.name.includes(trimmedInput) && cat.name !== forbiddenCategoryName)
      : categories.filter(cat => cat.name !== forbiddenCategoryName);
  }, [categories, trimmedInput, userTyped, forbiddenCategoryName]);
  const exists = categories.some(cat => cat.name === trimmedInput);

  const handleSelect = useCallback((catName: string) => {
    setInput(catName);
    setUserTyped(false); // איפוס דגל הקלדה
    setHighlightIndex(-1);
    setEditingMode(false); // חזור למצב chip אחרי בחירה
    pushRecentCategory(catName);
    setRecentNames(getRecentCategories());
    onChange(catName);
    // החזר פוקוס ל-input אחרי בחירה
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [onChange]);

  const handleAdd = () => {
    const name = input.trim();
    if (!name) return;
    onAddCategory({ name, icon, color });
    onChange(name);
    pushRecentCategory(name);
    setRecentNames(getRecentCategories());
    setShowDropdown(false);
    setEditingMode(false);
    if (onDraftChangeRef.current) onDraftChangeRef.current(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleIconSelect = useCallback((ic: string) => {
    setIcon(ic);
    setShowIconPicker(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // דווח טיוטה להורה כאשר יש שינוי בשם/אייקון/צבע ולא אושרה הוספה
  useEffect(() => {
    const cb = onDraftChangeRef.current;
    if (!cb) return;
    const t = (input || '').trim();
    const baselineName = (value || '').trim();
    const isNameEdited = t !== baselineName;
    const isIconEdited = icon !== initialIconRef.current;
    const isColorEdited = color !== initialColorRef.current;
    const touched = (editingMode && allowEditExisting) || isNameEdited || isIconEdited || isColorEdited;
    if (touched) {
      const draftName = t || baselineName;
      if (draftName) cb({ name: draftName, icon: icon || defaultIcon || '', color: color || defaultColor || '' });
      else cb(null);
    } else {
      cb(null);
    }
  }, [input, icon, color, editingMode, value, defaultIcon, defaultColor, allowEditExisting]);

  // עדכן בסיס להשוואה כשמתחלפים ערכי ברירת המחדל (לדוגמה שורה אחרת)
  useEffect(() => {
    initialIconRef.current = defaultIcon || icon;
    initialColorRef.current = defaultColor || color;
    // איפוס טיוטה כשהקונטקסט מתחלף
    if (onDraftChangeRef.current) onDraftChangeRef.current(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultIcon, defaultColor]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  // נשמור מיקום יחסית לימין (right) כדי שיעבוד טוב ב-RTL גם אם left לא משפיע
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number; width: number; maxHeight: number } | null>(null);

  // חשב מיקום דרופדאון כשהוא נפתח
  useLayoutEffect(() => {
    if (showDropdown && wrapperRef.current) {
      const inputEl = wrapperRef.current.querySelector('.CategorySelectOrAdd-input');
      if (inputEl) {
        const rect = (inputEl as HTMLElement).getBoundingClientRect();
        // right = כמה פיקסלים מהקצה הימני של ה-viewport
        const right = window.innerWidth - rect.right;
        const spaceBelow = Math.max(60, window.innerHeight - rect.bottom - 8); // שמור מינימום 60px
        const viewportLimit = Math.round(window.innerHeight * 0.7); // לא יותר מ-70% מסך
        const desiredMax = 420;
        const maxHeight = Math.min(desiredMax, viewportLimit, spaceBelow);
        setDropdownPos({ top: rect.bottom + 4, right, width: rect.width, maxHeight });
      }
    }
  }, [showDropdown, input]);

  // עדכון מיקום על שינוי חלון / גלילה
  useEffect(() => {
    if (!showDropdown) return;
    const handle = () => {
      if (wrapperRef.current) {
        const inputEl = wrapperRef.current.querySelector('.CategorySelectOrAdd-input');
        if (inputEl) {
          const rect = (inputEl as HTMLElement).getBoundingClientRect();
          const right = window.innerWidth - rect.right;
          const spaceBelow = Math.max(60, window.innerHeight - rect.bottom - 8);
          const viewportLimit = Math.round(window.innerHeight * 0.7);
          const desiredMax = 420;
          const maxHeight = Math.min(desiredMax, viewportLimit, spaceBelow);
          setDropdownPos({ top: rect.bottom + 4, right, width: rect.width, maxHeight });
        }
      }
    };
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('resize', handle);
    };
  }, [showDropdown]);

  // סגירה בלחיצה מחוץ או Escape - כולל איפוס מצב עריכה
  useEffect(() => {
    if (!showDropdown && !editingMode) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (wrapperRef.current.contains(e.target as Node)) return;
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) return;
      setShowDropdown(false);
      setEditingMode(false);
      setInput(value || '');
      setUserTyped(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDropdown(false);
        setEditingMode(false);
        setInput(value || '');
        setUserTyped(false);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showDropdown, editingMode, value]);

  // --- Build dropdown items: recent section + filtered ---
  type DropdownItem = { type: 'header' | 'separator' | 'category'; cat?: CategoryDef; label?: string };

  const { dropdownItems, selectableItems } = useMemo(() => {
    const recentFiltered = recentNames
      .filter(n => filtered.some(c => c.name === n)); // only show recent that exist & pass filter
    const nonRecentFiltered = filtered.filter(c => !recentFiltered.includes(c.name));

    const items: DropdownItem[] = [];
    if (recentFiltered.length > 0 && !userTyped) {
      items.push({ type: 'header', label: '🕐 לאחרונה' });
      for (const name of recentFiltered) {
        const cat = categories.find(c => c.name === name);
        if (cat) items.push({ type: 'category', cat });
      }
      if (nonRecentFiltered.length > 0) items.push({ type: 'separator' });
    }
    const mainList = (recentFiltered.length > 0 && !userTyped) ? nonRecentFiltered : filtered;
    for (const cat of mainList) {
      items.push({ type: 'category', cat });
    }
    const selectable = items.filter(it => it.type === 'category');
    return { dropdownItems: items, selectableItems: selectable };
  }, [filtered, recentNames, userTyped, categories]);

  // Keyboard handler for dropdown
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || selectableItems.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => Math.min(prev + 1, selectableItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && highlightIndex >= 0 && highlightIndex < selectableItems.length) {
      e.preventDefault();
      const item = selectableItems[highlightIndex];
      if (item.cat) { handleSelect(item.cat.name); setShowDropdown(false); }
    }
  }, [showDropdown, selectableItems, highlightIndex, handleSelect]);

  // Pre-calc chip visibility when defaults provided vs selection
  const trimmed = trimmedInput;
  const selected = trimmed ? categories.find(c => c.name === trimmed) : undefined;
  const hasDefault = !!defaultIcon || !!defaultColor;
  const shouldShowChip = !editingMode && (
    previewVisibility === 'always'
      ? !!trimmed
      : (!!selected || (showDefaultChipIfProvided && hasDefault))
  );

  return (
    <div
      ref={wrapperRef}
      className='CategorySelectOrAdd'
      tabIndex={-1}
    >
      {!shouldShowChip && (
      <div className="CategorySelectOrAdd-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => {
            const newValue = e.target.value;
            setInput(newValue);
            setUserTyped(true); // סמן שהמשתמש הקליד
            setHighlightIndex(-1);
            // אם הקלדת בדיוק שם קטגוריה קיימת, קרא onChange עם הערך הנכון (לא ריק)
            const trimmed = newValue.trim();
            const categoryExists = categories.some(c => c.name === trimmed);
            onChange(categoryExists ? trimmed : '');
            setShowDropdown(true);
          }}
          placeholder={placeholder || "בחר או הוסף קטגוריה..."}
          className="CategorySelectOrAdd-input"
          role="combobox"
          aria-expanded={showDropdown && dropdownItems.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={highlightIndex >= 0 && selectableItems[highlightIndex]?.cat ? `${listboxId}-opt-${highlightIndex}` : undefined}
          onKeyDown={handleInputKeyDown}
          onMouseDown={e => {
            if (!input && placeholder) {
              setInput(placeholder);
              setTimeout(() => {
                // Move cursor to end
                const el = e.target as HTMLInputElement;
                el.setSelectionRange(el.value.length, el.value.length);
              }, 0);
            }
            setUserTyped(false); // כשפותחים דרופדאון, הצג הכל
            setHighlightIndex(-1);
            setShowDropdown(true);
          }}
        />
        {showDropdown && dropdownItems.length > 0 && dropdownPos && createPortal(
          <div
            ref={dropdownRef}
            className="CategorySelectOrAdd-dropdown portal"
            role="listbox"
            id={listboxId}
            aria-label="קטגוריות"
            style={{ top: dropdownPos.top, right: dropdownPos.right, width: dropdownPos.width, maxHeight: dropdownPos.maxHeight }}
          >
            {(() => {
              let selectableIdx = -1;
              return dropdownItems.map((item, i) => {
                if (item.type === 'header') {
                  return <div key={`hdr-${i}`} className="CategorySelectOrAdd-dropdown-section-title" role="presentation">{item.label}</div>;
                }
                if (item.type === 'separator') {
                  return <div key={`sep-${i}`} className="CategorySelectOrAdd-dropdown-separator" role="separator" />;
                }
                selectableIdx++;
                const cat = item.cat!;
                const idx = selectableIdx;
                const isHighlighted = idx === highlightIndex;
                const isSelected = input === cat.name;
                return (
                  <div
                    key={cat.name}
                    id={`${listboxId}-opt-${idx}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => { handleSelect(cat.name); setShowDropdown(false); }}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    className={
                      'CategorySelectOrAdd-dropdown-option'
                      + (isSelected ? ' selected' : '')
                      + (isHighlighted ? ' highlighted' : '')
                    }
                  >
                    <span
                      className="CategorySelectOrAdd-dropdown-option-dot"
                      style={{ backgroundColor: cat.color || '#e5e7eb' }}
                    >
                      {cat.icon}
                    </span>
                    <span>{cat.name}</span>
                  </div>
                );
              });
            })()}
          </div>,
          document.body
        )}
      </div>
      )}
      {/* Chip preview: afterAdd shows chip רק אחרי הוספה/בחירה; always מציג תמיד */}
      {shouldShowChip && (() => {
        const chipIcon = selected?.icon ?? (defaultIcon || icon);
        const chipColor = selected?.color ?? (defaultColor || color || '#e5e7eb');
        const textColor = getReadableTextColor(chipColor);
        const label = trimmed || placeholder || '';
        return (
          <span
            className="CategorySelectOrAdd-chip final"
            style={{ backgroundColor: chipColor, color: textColor }}
            role="button"
            tabIndex={0}
            title={label}
            aria-label={`קטגוריה: ${label}. ${allowEditExisting ? 'לחץ לעריכה' : 'לחץ לשינוי'}`}
            onClick={() => {
              const sel = categories.find(c => c.name === input.trim());
              if (sel) { setIcon(sel.icon); setColor(sel.color); }
              setEditingMode(true);
            }}
          >
            <span className="CategorySelectOrAdd-chip-icon">{chipIcon}</span>
            <span className="CategorySelectOrAdd-chip-label">{label}</span>
          </span>
        );
      })()}
      {/* Show icon and color picker for new OR editing existing */}
      {allowAdd && trimmed && (!exists || (editingMode && allowEditExisting)) && (editingMode || !shouldShowChip) && (
        <>
          <button
            type="button"
            onClick={() => { setShowIconPicker(true); }}
            className="CategorySelectOrAdd-icon-btn"
            title="בחר אייקון"
            aria-label="בחר אייקון"
          >
            {icon}
          </button>
          <ColorPalettePicker value={color} onChange={setColor} compact showLabel={false} />
          <button
            type="button"
            onClick={handleAdd}
            className="CategorySelectOrAdd-add-btn"
            aria-label={exists ? 'עדכן קטגוריה' : 'הוסף קטגוריה'}
          >
            {exists ? 'עדכן' : 'הוסף'}
          </button>
        </>
      )}
      {/* Icon Picker Popup — Teams-style (extracted component) */}
      <IconPickerPopup
        isOpen={showIconPicker}
        currentIcon={icon}
        previewColor={color}
        recommendedIcons={propRecommendedIcons}
        onSelect={handleIconSelect}
        onClose={() => setShowIconPicker(false)}
      />
    </div>
  );
};

export default CategorySelectOrAdd;