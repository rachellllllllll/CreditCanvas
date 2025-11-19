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
}

const CategorySelectOrAdd: React.FC<CategorySelectOrAddProps & { forbiddenCategoryName?: string }> = ({ categories, value, onChange, onAddCategory, allowAdd = true, placeholder, forbiddenCategoryName }) => {
  const [input, setInput] = useState(value || '');
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(() => colorPalette[Math.floor(Math.random() * colorPalette.length)]);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [recommendedIcons, setRecommendedIcons] = useState<string[]>([]);

  // Filter categories by input and forbiddenCategoryName
  const filtered = input.trim()
    ? categories.filter(cat => cat.name.includes(input.trim()) && cat.name !== forbiddenCategoryName)
    : categories.filter(cat => cat.name !== forbiddenCategoryName);
  const exists = categories.some(cat => cat.name === input.trim());

  const handleSelect = (catName: string) => {
    setInput(catName);
    onChange(catName);
  };

  const handleAdd = () => {
    if (!input.trim() || exists) return;
    onAddCategory({ name: input.trim(), icon, color });
    onChange(input.trim());
    setShowDropdown(false);
  };

  // Fetch recommended icons when icon picker is opened and input is not empty
  useEffect(() => {
    if (showIconPicker && input.trim()) {
      fetch(`/api/recommend-icons?category=${encodeURIComponent(input.trim())}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data.icons)) setRecommendedIcons(data.icons);
        })
        .catch(() => setRecommendedIcons([]));
    }
  }, [showIconPicker, input]);

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

  // סגירה בלחיצה מחוץ או Escape
  useEffect(() => {
    if (!showDropdown) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (wrapperRef.current.contains(e.target as Node)) return;
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) return;
      setShowDropdown(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDropdown(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showDropdown]);

  return (
    <div
      ref={wrapperRef}
      className='CategorySelectOrAdd'
      tabIndex={-1}
    >
      <div className="CategorySelectOrAdd-input-wrapper">
        <input
          type="text"
          value={input}
          onChange={e => {
            setInput(e.target.value);
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
      {/* Show icon and color picker only if input is not an existing category and not empty */}
      {allowAdd && !exists && input.trim() && (
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
            הוסף
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

// Usage in CategoryAliasesManager (example):
// <CategorySelectOrAdd
//   ...
//   forbiddenCategoryName={otherSelectedCategory}
// />

export default CategorySelectOrAdd;
