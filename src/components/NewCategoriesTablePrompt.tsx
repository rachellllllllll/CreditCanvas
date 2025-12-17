import React, { useState } from 'react';
import CategorySelectOrAdd from './CategorySelectOrAdd';
import type { CategoryDef } from './CategoryManager';
import type { CreditDetail } from '../types';
import './NewCategoriesTablePrompt.css';

interface NewCategoriesTablePromptProps {
  names: string[];
  categoriesList: CategoryDef[];
  onConfirm: (mapping: Record<string, CategoryDef>) => void;
  onCancel: () => void;
  // הוסף פרופ חדש: כל העסקאות
  allDetails?: CreditDetail[];
  handleApplyCategoryChange: (...args: any[]) => void;
}

const getDefaultIconAndColor = (categoryName: string): { icon: string; color: string; recommendedIcons?: string[] } | undefined => {
  const lowerName = categoryName.toLowerCase();
  const mappings: Record<string, { icon: string; color: string; recommendedIcons: string[] }> = {
    'אופנה': { icon: '👗', color: '#00a3ad', recommendedIcons: ['👗', '👔', '👠', '👜', '🧣', '👒'] },
    'בידור': { icon: '🎭', color: '#ff7121', recommendedIcons: ['🎭', '🎬', '🎪', '🎨', '🎤', '🎸'] },
    'ביטוח': { icon: '🛡️', color: '#2550ff', recommendedIcons: ['🛡️', '🔒', '📋', '✅', '🏛️', '⚖️', '💼'] },
    'חשמל': { icon: '💡', color: '#ffb300', recommendedIcons: ['💡', '🔌', '⚡', '🌡️', '🔥', '💧'] },
    'כספים': { icon: '💰', color: '#aa82ff', recommendedIcons: ['💰', '💵', '💴', '💶', '🏦', '💳'] },
    'מזון': { icon: '🛒', color: '#ff3f9b', recommendedIcons: ['🛒', '🛍️', '🍎', '🥦', '🍞', '🧴'] },
    'מסעדות': { icon: '🍴', color: '#13e2bf', recommendedIcons: ['🍴', '🍽️', '🍕', '🍔', '🍜', '☕'] },
    'ספורט': { icon: '🏅', color: '#ff7121', recommendedIcons: ['🏅', '⚽', '🏀', '🎾', '🏐', '⛳'] },
    'ספרים': { icon: '📚', color: '#8bc34a', recommendedIcons: ['📚', '📖', '📝', '📓', '📒', '📕'] },
    'עיצוב': { icon: '🎨', color: '#c20017', recommendedIcons: ['🎨', '🖌️', '🖍️', '✏️', '📐', '🖊️'] },
    'עירייה': { icon: '🏛️', color: '#ff6f61', recommendedIcons: ['🏛️', '🏢', '🏙️', '🌆', '📜', '🗳️'] },
    'פנאי': { icon: '🎉', color: '#ff7121', recommendedIcons: ['🎉', '🎊', '🎁', '🎈', '🎪', '🎭'] },
    'קוסמטיקה': { icon: '💄', color: '#ff8dab', recommendedIcons: ['💄', '💅', '🧴', '🪮', '🧼', '✨'] },
    'רפואה': { icon: '💊', color: '#879aff', recommendedIcons: ['💊', '🏥', '⚕️', '🩺', '💉', '🧬'] },
    'שונות': { icon: '🔖', color: '#ecd400', recommendedIcons: ['🔖', '🏷️', '📌', '📍', '🔔', '⚙️'] },
    'תחבורה': { icon: '🚗', color: '#009950', recommendedIcons: ['🚗', '🚙', '🚕', '🛣️', '⛽', '🅿️'] },
    'תקשורת': { icon: '📱', color: '#b6c700', recommendedIcons: ['📱', '📞', '📧', '💬', '📡', '📶'] },
  };
  for (const [key, val] of Object.entries(mappings)) {
    if (lowerName.includes(key)) {
      // בחר איקון רנדומלי מתוך recommendedIcons
      const randomIndex = Math.floor(Math.random() * val.recommendedIcons.length);
      const selectedIcon = val.recommendedIcons[randomIndex];
      // מנוע recommendedIcons שנותר (בלי האיקון שנבחר)
      const remaining = val.recommendedIcons.filter((_, idx) => idx !== randomIndex);
      return { icon: selectedIcon, color: val.color, recommendedIcons: remaining };
    }
  }
  return undefined;
};

const NewCategoriesTablePrompt: React.FC<NewCategoriesTablePromptProps> = ({ names, categoriesList, onConfirm, onCancel, allDetails = [], handleApplyCategoryChange }) => {
  const [selectedCats, setSelectedCats] = useState<Record<string, CategoryDef | null>>(() => Object.fromEntries(names.map(n => [n, null])));
  const [localCategories, setLocalCategories] = useState<CategoryDef[]>([...categoriesList]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, CategoryDef | null>>(() => Object.fromEntries(names.map(n => [n, null])));

  // חשב ברירות מחדל לכל קטגוריה חדשה
  const defaultIconsAndColors = React.useMemo(() => {
    const result: Record<string, { icon: string; color: string; recommendedIcons?: string[] }> = {};
    names.forEach(name => {
      result[name] = getDefaultIconAndColor(name) || { icon: '', color: '', recommendedIcons: []};
    });
    return result;
  }, [names]);

  const handleCategoryChange = (name: string, catName: string) => {
    const found = localCategories.find(c => c.name === catName);
    if (found) {
      setSelectedCats(prev => ({ ...prev, [name]: found }));
    }
  };
  const handleAddCategory = (name: string, cat: CategoryDef) => {
    setLocalCategories(prev => {
      const idx = prev.findIndex(c => c.name === cat.name);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = cat;
        return copy;
      }
      return [...prev, cat];
    });
    setSelectedCats(prev => ({ ...prev, [name]: cat }));
  };

  const handleConfirm = () => {
    const mapping: Record<string, CategoryDef> = {};
    names.forEach(n => {
      const chosen = selectedCats[n] || drafts[n];
      if (chosen) {
        mapping[n] = chosen;
      } else {
        const defaults = defaultIconsAndColors[n];
        mapping[n] = { name: n, icon: defaults?.icon, color: defaults?.color };
      }
    });
    onConfirm(mapping);
  };

  // נטרל כפתור אישור אם יש טיוטות פתוחות או קטגוריה ללא ברירת מחדל שלא אושרה
  const disableConfirm = React.useMemo(() => {
    const hasPendingDrafts = names.some(n => !!drafts[n]);
    const hasBlockingNoDefaults = names.some(n => {
      const d = defaultIconsAndColors[n];
      const hasDefaults = !!(d?.icon && d?.color);
      return !hasDefaults && !selectedCats[n];
    });
    return hasPendingDrafts || hasBlockingNoDefaults;
  }, [names, drafts, defaultIconsAndColors, selectedCats]);

  // מונה חסימות: כמה פריטים דורשים אישור (טיוטות + ללא דיפולט)
  const blockingInfo = React.useMemo(() => {
    let draftCount = 0;
    let noDefaultCount = 0;
    names.forEach(n => {
      if (drafts[n]) draftCount += 1;
      const d = defaultIconsAndColors[n];
      const hasDefaults = !!(d?.icon && d?.color);
      if (!hasDefaults && !selectedCats[n]) noDefaultCount += 1;
    });
    return { draftCount, noDefaultCount, total: draftCount + noDefaultCount };
  }, [names, drafts, defaultIconsAndColors, selectedCats]);

  // חשב כמות עסקאות לכל קטגוריה
  const categoryTransactionCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    names.forEach(name => {
      counts[name] = allDetails.filter(d => d.category === name).length;
    });
    return counts;
  }, [names, allDetails]);

  return (
    <div className="new-cats-overlay">
      <div className="new-cats-dialog">
        <h3 className="new-cats-title">
          הגדרת קטגוריות חדשות
        </h3>
        <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '16px' }}>
          נמצאו {names.length} קטגוריות חדשות בקבצי Excel. בחר קטגוריה קיימת או צור חדשה עם אייקון וצבע.
        </p>
        <div className="new-cats-table-outer-wrapper">
          <table className="new-cats-table">
            <thead>
              <tr>
                <th>קטגוריה מ-Excel</th>
                <th>כמות עסקאות</th>
                <th>בחר או צור קטגוריה</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {names.map(name => (
                <React.Fragment key={name}>
                  <tr>
                    <td className="new-cats-table-name">{name}</td>
                    <td className="new-cats-table-count">
                      <span className="transaction-count-badge">{categoryTransactionCounts[name] || 0}</span>
                    </td>
                    <td className="new-cats-table-select">
                      <CategorySelectOrAdd
                        categories={localCategories}
                        value={selectedCats[name]?.name || name}
                        onChange={catName => handleCategoryChange(name, catName)}
                        onAddCategory={cat => handleAddCategory(name, cat)}
                        allowAdd={true}
                        placeholder={name}
                        defaultIcon={defaultIconsAndColors[name]?.icon}
                        defaultColor={defaultIconsAndColors[name]?.color}
                        recommendedIcons={defaultIconsAndColors[name]?.recommendedIcons}
                        previewVisibility="afterAdd"
                        showDefaultChipIfProvided={Boolean(defaultIconsAndColors[name]?.icon || defaultIconsAndColors[name]?.color)}
                        onDraftChange={d => setDrafts(prev => ({ ...prev, [name]: d ? { name: d.name, icon: d.icon, color: d.color } : null }))}
                      />
                    </td>
                    <td className="new-cats-table-expand">
                      <button className="new-cats-table-expand-btn" onClick={() => setExpanded(e => ({ ...e, [name]: !e[name] }))}>
                        {expanded[name] ? '▲' : '▼'}
                      </button>
                    </td>
                  </tr>
                  {expanded[name] && (
                    <tr>
                      <td colSpan={4} className="new-cats-table-details-cell">
                        <div className="new-cats-table-details-wrapper">
                          <div className="details-summary">
                            <strong>{categoryTransactionCounts[name]}</strong> עסקאות בקטגוריה זו
                          </div>
                          <table className="new-cats-table-details">
                            <thead>
                              <tr>
                                <th>תאריך</th>
                                <th>תיאור</th>
                                <th>סכום</th>
                              </tr>
                            </thead>
                            <tbody>
                              {allDetails.filter(d => d.category === name).slice(0, 10).map((tx, idx) => (
                                <tr key={tx.id + idx}>
                                  <td>{tx.date}</td>
                                  <td>{tx.description}</td>
                                  <td>₪{tx.amount.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {categoryTransactionCounts[name] > 10 && (
                            <div className="details-more">
                              ועוד {categoryTransactionCounts[name] - 10} עסקאות...
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="new-cats-btns-row">
          {disableConfirm && blockingInfo.total > 0 && (
            <div className="new-cats-blocking-count" aria-live="polite">
              יש {blockingInfo.total} פריטים שדורשים אישור
            </div>
          )}
          <button className="new-cats-cancel-btn" onClick={onCancel}>דלג לעכשיו</button>
          <button className="new-cats-confirm-btn" onClick={handleConfirm} disabled={disableConfirm} title={disableConfirm ? 'יש שינויים שלא אושרו או קטגוריות ללא ברירת מחדל' : undefined}>אישור והמשך</button>
        </div>
      </div>
    </div>
  );
};

export default NewCategoriesTablePrompt;