import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ICONS } from './icons';
import type { CategoryDef } from './CategoryManager';
import './CategorySelectOrAdd.css';

const colorPalette = [
  '#36A2EB', '#FF6384', '#FFD966', '#4BC0C0', '#9966FF', '#FF9F40', '#B2FF66', '#FF66B2', '#66B2FF',
  '#FFB266', '#66FFB2', '#B266FF', '#FF6666', '#66FF66', '#6666FF', '#FFD966', '#A2EB36', '#CE56FF', '#40FF9F'
];

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
}

const CategorySelectOrAdd: React.FC<CategorySelectOrAddProps & { forbiddenCategoryName?: string }> = ({ categories, value, onChange, onAddCategory, allowAdd = true, placeholder, forbiddenCategoryName, defaultIcon, defaultColor, recommendedIcons: propRecommendedIcons = [], previewVisibility = 'afterAdd', showDefaultChipIfProvided = false, onDraftChange }) => {
  const [input, setInput] = useState(value || '');
  const [icon, setIcon] = useState(defaultIcon || ICONS[0]);
  const [color, setColor] = useState(defaultColor || colorPalette[Math.floor(Math.random() * colorPalette.length)]);
  const initialIconRef = useRef<string>(defaultIcon || ICONS[0]);
  const initialColorRef = useRef<string>(defaultColor || color);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [recommendedIcons, setRecommendedIcons] = useState<string[]>(propRecommendedIcons);
  const [editingMode, setEditingMode] = useState(false);
  const [userTyped, setUserTyped] = useState(false); // מעקב אם המשתמש הקליד

  // סנכרון input עם value prop
  useEffect(() => {
    if (value !== input && !editingMode && !showDropdown) {
      setInput(value || '');
      setUserTyped(false);
    }
  }, [value]);

  const getReadableTextColor = (hex: string): string => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return '#1f2937';
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 160 ? '#1f2937' : '#ffffff';
  };

  // Filter categories by input and forbiddenCategoryName
  // אם המשתמש הקליד, סנן לפי input. אחרת הצג הכל
  const filtered = (input.trim() && userTyped)
    ? categories.filter(cat => cat.name.includes(input.trim()) && cat.name !== forbiddenCategoryName)
    : categories.filter(cat => cat.name !== forbiddenCategoryName);
  const exists = categories.some(cat => cat.name === input.trim());

  const handleSelect = (catName: string) => {
    setInput(catName);
    setUserTyped(false); // איפוס דגל הקלדה
    onChange(catName);
  };

  const handleAdd = () => {
    const name = input.trim();
    if (!name) return;
    onAddCategory({ name, icon, color });
    onChange(name);
    setShowDropdown(false);
    setEditingMode(false);
    if (onDraftChange) onDraftChange(null);
  };

  // When a category is selected, load its icon and color for editing
  useEffect(() => {
    if (editingMode && input.trim()) {
      const selected = categories.find(c => c.name === input.trim());
      if (selected) {
        setIcon(selected.icon);
        setColor(selected.color);
      }
    }
  }, [editingMode, input, categories]);

  // Fetch recommended icons when icon picker is opened and input is not empty
  useEffect(() => {
    if (showIconPicker && input.trim()) {
      // אם יש recommendedIcons מ-props, השתמש בהם
      if (propRecommendedIcons.length > 0) {
        setRecommendedIcons(propRecommendedIcons);
      } else {
        // אחרת נסה להשיג מ-API
        // fetch(`/api/recommend-icons?category=${encodeURIComponent(input.trim())}`)
        //   .then(res => res.json())
        //   .then(data => {
        //     if (Array.isArray(data.icons)) setRecommendedIcons(data.icons);
        //   })
        //   .catch(() => setRecommendedIcons([]));
      }
    }
  }, [showIconPicker, input, propRecommendedIcons]);

  // דווח טיוטה להורה כאשר יש שינוי בשם/אייקון/צבע ולא אושרה הוספה
  useEffect(() => {
    if (!onDraftChange) return;
    const t = (input || '').trim();
    const baselineName = (value || '').trim();
    const isNameEdited = t !== baselineName;
    const isIconEdited = icon !== initialIconRef.current;
    const isColorEdited = color !== initialColorRef.current;
    const touched = editingMode || isNameEdited || isIconEdited || isColorEdited;
    if (touched) {
      const draftName = t || baselineName;
      if (draftName) onDraftChange({ name: draftName, icon: icon || defaultIcon || '', color: color || defaultColor || '' });
      else onDraftChange(null);
    } else {
      onDraftChange(null);
    }
  }, [input, icon, color, editingMode, value, defaultIcon, defaultColor]);

  // עדכן בסיס להשוואה כשמתחלפים ערכי ברירת המחדל (לדוגמה שורה אחרת)
  useEffect(() => {
    initialIconRef.current = defaultIcon || icon;
    initialColorRef.current = defaultColor || color;
    // איפוס טיוטה כשהקונטקסט מתחלף
    if (onDraftChange) onDraftChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultIcon, defaultColor]);

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
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showDropdown, editingMode, value]);

  // Pre-calc chip visibility when defaults provided vs selection
  const trimmed = input.trim();
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
          type="text"
          value={input}
          onChange={e => {
            setInput(e.target.value);
            setUserTyped(true); // סמן שהמשתמש הקליד
            onChange('');
            setShowDropdown(true);
          }}
          placeholder={placeholder || "בחר או הוסף קטגוריה..."}
          className="CategorySelectOrAdd-input"
          // onFocus={(e) => setShowDropdown(true)}
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
            setShowDropdown(true);
          }}
        />
        {showDropdown && filtered.length > 0 && dropdownPos && createPortal(
          <div
            ref={dropdownRef}
            className="CategorySelectOrAdd-dropdown portal"
            style={{ top: dropdownPos.top, right: dropdownPos.right, width: dropdownPos.width, maxHeight: dropdownPos.maxHeight }}
          >
            {filtered.map(cat => (
              <div
                key={cat.name}
                onClick={() => { handleSelect(cat.name); setShowDropdown(false); }}
                className={'CategorySelectOrAdd-dropdown-option' + (input === cat.name ? ' selected' : '')}
              >
                <span style={{ fontSize: 18 }}>{cat.icon}</span>
                <span>{cat.name}</span>
              </div>
            ))}
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
            title={label}
            onClick={() => { setEditingMode(true); }}
          >
            <span className="CategorySelectOrAdd-chip-icon">{chipIcon}</span>
            <span className="CategorySelectOrAdd-chip-label">{label}</span>
          </span>
        );
      })()}
      {/* Show icon and color picker for new OR editing existing */}
      {allowAdd && trimmed && (!exists || editingMode) && (editingMode || !shouldShowChip) && (
        <>
          <button
            type="button"
            onClick={() => setShowIconPicker(true)}
            className="CategorySelectOrAdd-icon-btn"
            title="בחר אייקון"
          >
            {icon}
          </button>
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            className="CategorySelectOrAdd-color-input"
            title="בחר צבע"
            style={{ backgroundColor: color }}
          />
          <button
            type="button"
            onClick={handleAdd}
            className="CategorySelectOrAdd-add-btn"
          >
            {exists ? 'עדכן' : 'הוסף'}
          </button>
        </>
      )}
      {/* Icon Picker Popup */}
      {showIconPicker && (
        <div className="CategorySelectOrAdd-icon-picker-overlay">
          <div className="CategorySelectOrAdd-icon-picker-box">
            <h3 className="CategorySelectOrAdd-icon-picker-title">{input.trim() || 'בחר אייקון'}</h3>
            <div className="CategorySelectOrAdd-icon-picker-list">
              {/* Show recommended icons first if available */}
              {recommendedIcons.length > 0 && (
                <>
                  <div className="CategorySelectOrAdd-icon-picker-recommended-title">
                    הנה כמה איקונים שנראים לנו מתאימים:
                  </div>
                  <div className="CategorySelectOrAdd-icon-picker-recommended">
                    {recommendedIcons.slice(0, 5).map(ic => (
                      <span
                        key={ic}
                        className={
                          'CategorySelectOrAdd-icon-picker-icon' + (ic === icon ? ' selected' : '')
                        }
                        onClick={() => { setIcon(ic); setShowIconPicker(false); }}
                        title={ic}
                      >{ic}</span>
                    ))}
                  </div>
                  <div className="CategorySelectOrAdd-icon-picker-all-title">
                    או בחרו כל איקון אחר:
                  </div>
                </>
              )}
              {/* All icons */}
              <div className="CategorySelectOrAdd-icon-picker-all-icons">
                {ICONS.map(ic => (
                  <span
                    key={ic}
                    className={
                      'CategorySelectOrAdd-icon-picker-icon' + (ic === icon ? ' selected' : '')
                    }
            onClick={() => { setIcon(ic); setShowIconPicker(false); }}
            title={ic}
          >{ic}</span>
        ))}
      </div>
    </div>
    <button onClick={() => setShowIconPicker(false)} className="CategorySelectOrAdd-icon-picker-cancel">ביטול</button>
  </div>
</div>
      )}
    </div>
  );
};

export default CategorySelectOrAdd;