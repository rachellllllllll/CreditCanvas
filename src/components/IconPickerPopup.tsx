/**
 * IconPickerPopup — Teams-style emoji/icon picker popup.
 * Extracted from CategorySelectOrAdd for reuse across the app.
 * Reuses CSS classes from CategorySelectOrAdd.css.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ICON_CATEGORIES, ICON_SEARCH_MAP, searchIcons } from './icons';
import './CategorySelectOrAdd.css'; // reuse existing icon picker styles

// --- Recently-used icons helpers (localStorage) ---
const RECENT_ICONS_KEY = 'CategorySelectOrAdd_recentIcons';
const MAX_RECENT_ICONS = 24;

function getRecentIcons(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_ICONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function pushRecentIcon(emoji: string) {
  const list = getRecentIcons().filter(e => e !== emoji);
  list.unshift(emoji);
  localStorage.setItem(RECENT_ICONS_KEY, JSON.stringify(list.slice(0, MAX_RECENT_ICONS)));
}

// Split a string into individual emoji graphemes using Intl.Segmenter
function splitEmojis(str: string): string[] {
  const s = str.trim();
  if (!s) return [];
  const emojiPattern = /\p{Emoji_Presentation}|\p{Emoji}\uFE0F/u;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const segmenter = new (Intl as any).Segmenter('he', { granularity: 'grapheme' });
    return [...segmenter.segment(s)]
      .map(seg => seg.segment)
      .filter(seg => emojiPattern.test(seg));
  }
  // Fallback: regex-based split (no character classes with combined chars)
  const fallbackPattern = /(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200d(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*/gu;
  return s.match(fallbackPattern) || [];
}

export interface IconPickerPopupProps {
  isOpen: boolean;
  currentIcon: string;
  previewColor: string;
  recommendedIcons?: string[];
  onSelect: (icon: string) => void;
  onClose: () => void;
}

const IconPickerPopup: React.FC<IconPickerPopupProps> = ({
  isOpen,
  currentIcon,
  previewColor,
  recommendedIcons = [],
  onSelect,
  onClose,
}) => {
  const [iconSearch, setIconSearch] = useState('');
  const [recentIcons, setRecentIcons] = useState<string[]>(getRecentIcons());
  const [hoveredIcon, setHoveredIcon] = useState<string | null>(null);
  const [visibleCategoryId, setVisibleCategoryId] = useState<string | null>(null);

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iconSearchInputRef = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const onIconHover = useCallback((emoji: string) => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    setHoveredIcon(emoji);
  }, []);

  const onIconLeave = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => setHoveredIcon(null), 120);
  }, []);

  const handleIconSelect = useCallback((ic: string) => {
    pushRecentIcon(ic);
    setRecentIcons(getRecentIcons());
    setIconSearch('');
    onSelect(ic);
    onClose();
  }, [onSelect, onClose]);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setIconSearch('');
      setHoveredIcon(null);
      setRecentIcons(getRecentIcons());
    }
  }, [isOpen]);

  // Scroll tracking: highlight bottom tab matching visible category
  useEffect(() => {
    if (!isOpen || iconSearch) {
      setVisibleCategoryId(null);
      return;
    }
    const container = contentRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const catId = (entry.target as HTMLElement).getAttribute('data-cat-id');
            if (catId) { setVisibleCategoryId(catId); break; }
          }
        }
      },
      { root: container, rootMargin: '-10% 0px -70% 0px', threshold: 0 }
    );

    const timer = setTimeout(() => {
      const groups = container.querySelectorAll('[data-cat-id]');
      groups.forEach(el => observer.observe(el));
    }, 50);

    return () => { clearTimeout(timer); observer.disconnect(); };
  }, [isOpen, iconSearch]);

  // Scroll to category group when clicking a tab
  const scrollToCategory = useCallback((catId: string) => {
    const container = contentRef.current;
    if (!container) return;
    setIconSearch('');
    requestAnimationFrame(() => {
      const el = container.querySelector(`[data-cat-id="${catId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }, []);

  if (!isOpen) return null;

  return (
    <div className="CategorySelectOrAdd-icon-picker-overlay" onClick={e => { if (e.target === e.currentTarget) { onClose(); setIconSearch(''); } }}>
      <div
        className="CategorySelectOrAdd-icon-picker-box"
        tabIndex={-1}
      >
        {/* Top bar: preview + search */}
        <div className="CategorySelectOrAdd-icon-picker-topbar">
          <span className="CategorySelectOrAdd-icon-picker-preview-dot" style={{ backgroundColor: previewColor }}>
            {hoveredIcon || currentIcon}
          </span>
          <div className="CategorySelectOrAdd-icon-picker-search-wrap">
            <input
              ref={iconSearchInputRef}
              type="text"
              className="CategorySelectOrAdd-icon-picker-search"
              placeholder="חפש משהו מהנה"
              value={iconSearch}
              onChange={e => setIconSearch(e.target.value)}
              autoFocus
            />
            {iconSearch && (
              <button
                className="CategorySelectOrAdd-icon-picker-search-clear"
                onClick={() => { setIconSearch(''); iconSearchInputRef.current?.focus(); }}
                aria-label="נקה חיפוש"
              >×</button>
            )}
          </div>
        </div>

        {/* Scrollable content area */}
        <div className="CategorySelectOrAdd-icon-picker-content" ref={contentRef}>
          {/* Search results */}
          {iconSearch ? (
            (() => {
              const results = searchIcons(iconSearch);
              const pastedEmojis = [...new Set(splitEmojis(iconSearch))];
              return (
                <>
                  {pastedEmojis.length > 0 && (
                    <>
                      <div className="CategorySelectOrAdd-icon-picker-section-title">
                        {pastedEmojis.length === 1 ? "אמוג'י שהודבק" : `${pastedEmojis.length} אמוג'ים שהודבקו — בחר אחד`}
                      </div>
                      <div className="CategorySelectOrAdd-icon-picker-grid">
                        {pastedEmojis.map((pe, idx) => (
                          <span
                            key={`pasted-${idx}`}
                            className={'CategorySelectOrAdd-icon-picker-icon' + (pe === currentIcon ? ' selected' : '')}
                            onClick={() => handleIconSelect(pe)}
                            onMouseEnter={() => onIconHover(pe)}
                            onMouseLeave={onIconLeave}
                          >{pe}</span>
                        ))}
                      </div>
                    </>
                  )}
                  {results.length > 0 && (
                    <>
                      <div className="CategorySelectOrAdd-icon-picker-section-title">תוצאות חיפוש</div>
                      <div className="CategorySelectOrAdd-icon-picker-grid">
                        {results.map(ic => {
                          const kw = ICON_SEARCH_MAP[ic] || [];
                          const matched = kw.filter(k => k.includes(iconSearch.toLowerCase()));
                          const tooltip = matched.length > 0 ? matched.join(', ') : kw.slice(0, 3).join(', ');
                          return (
                            <span
                              key={ic}
                              className={'CategorySelectOrAdd-icon-picker-icon' + (ic === currentIcon ? ' selected' : '')}
                              onClick={() => handleIconSelect(ic)}
                              onMouseEnter={() => onIconHover(ic)}
                              onMouseLeave={onIconLeave}
                              title={tooltip}
                            >{ic}</span>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {pastedEmojis.length === 0 && results.length === 0 && (
                    <div className="CategorySelectOrAdd-icon-picker-no-results">לא נמצאו תוצאות עבור "{iconSearch}"</div>
                  )}
                </>
              );
            })()
          ) : (
            <>
              {/* Recent icons */}
              {recentIcons.length > 0 && (
                <div className="CategorySelectOrAdd-icon-picker-category-group" data-cat-id="__recent__">
                  <div className="CategorySelectOrAdd-icon-picker-section-title">לאחרונה</div>
                  <div className="CategorySelectOrAdd-icon-picker-grid">
                    {recentIcons.map(ic => (
                      <span
                        key={`recent-${ic}`}
                        className={'CategorySelectOrAdd-icon-picker-icon' + (ic === currentIcon ? ' selected' : '')}
                        onClick={() => handleIconSelect(ic)}
                        onMouseEnter={() => onIconHover(ic)}
                        onMouseLeave={onIconLeave}
                        title={(ICON_SEARCH_MAP[ic] || []).slice(0, 3).join(', ')}
                      >{ic}</span>
                    ))}
                  </div>
                </div>
              )}
              {/* Recommended icons */}
              {recommendedIcons.length > 0 && (
                <>
                  <div className="CategorySelectOrAdd-icon-picker-section-title">מומלצים</div>
                  <div className="CategorySelectOrAdd-icon-picker-grid">
                    {recommendedIcons.slice(0, 8).map(ic => (
                      <span
                        key={`rec-${ic}`}
                        className={'CategorySelectOrAdd-icon-picker-icon' + (ic === currentIcon ? ' selected' : '')}
                        onClick={() => handleIconSelect(ic)}
                        onMouseEnter={() => onIconHover(ic)}
                        onMouseLeave={onIconLeave}
                        title={(ICON_SEARCH_MAP[ic] || []).slice(0, 3).join(', ')}
                      >{ic}</span>
                    ))}
                  </div>
                </>
              )}
              {/* All icons grouped by category */}
              {ICON_CATEGORIES.map(cat => (
                <div key={cat.id} className="CategorySelectOrAdd-icon-picker-category-group" data-cat-id={cat.id}>
                  <div className="CategorySelectOrAdd-icon-picker-section-title">{cat.label}</div>
                  <div className="CategorySelectOrAdd-icon-picker-grid">
                    {cat.icons.map(entry => (
                      <span
                        key={entry.emoji}
                        className={'CategorySelectOrAdd-icon-picker-icon' + (entry.emoji === currentIcon ? ' selected' : '')}
                        onClick={() => handleIconSelect(entry.emoji)}
                        onMouseEnter={() => onIconHover(entry.emoji)}
                        onMouseLeave={onIconLeave}
                        title={entry.keywords.slice(0, 3).join(', ')}
                      >{entry.emoji}</span>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Bottom tab bar — like Teams */}
        <div className="CategorySelectOrAdd-icon-picker-bottombar">
          {recentIcons.length > 0 && (
            <button
              className={`CategorySelectOrAdd-icon-picker-tab${!iconSearch && visibleCategoryId === '__recent__' ? ' active' : ''}`}
              onClick={() => scrollToCategory('__recent__')}
              title="לאחרונה"
            >🕐</button>
          )}
          {ICON_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`CategorySelectOrAdd-icon-picker-tab${!iconSearch && visibleCategoryId === cat.id ? ' active' : ''}`}
              onClick={() => scrollToCategory(cat.id)}
              title={cat.label}
            >{cat.tabIcon}</button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default IconPickerPopup;
