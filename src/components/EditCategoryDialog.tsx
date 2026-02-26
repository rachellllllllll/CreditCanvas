import React, { useState, useEffect, useMemo } from 'react';
import './EditCategoryDialog.css';
import CategorySelectOrAdd from './CategorySelectOrAdd';
import type { CreditDetail } from '../types';
import type { CategoryDef } from './CategoryManager';

// פילטרים לשמירה ככלל (מיובא מהחיפוש הגלובלי)
export interface SearchFiltersForRule {
  text: string;
  minAmount?: number;
  maxAmount?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface EditDialogState {
  open: boolean;
  transaction?: CreditDetail;
  candidates: CreditDetail[];
  newCategory: string;
  applyToAll: boolean;
  excludeIds: Set<string>;
  amountFilter?: {
    minAmount?: number;
    maxAmount?: number;
  };
  searchTerm?: string;
  createAutoRule?: boolean;
  // פילטרים מתקדמים מהחיפוש הגלובלי
  globalSearchFilters?: SearchFiltersForRule;
  includeDatesInRule?: boolean;
}

interface EditCategoryDialogProps {
  open: boolean;
  editDialog: EditDialogState | null;
  categoriesList: CategoryDef[];
  setEditDialog: (v: EditDialogState | null) => void;
  handleApplyCategoryChange: (dialog?: EditDialogState) => void;
  onAddCategory?: (cat: CategoryDef) => void; // callback for new category
}

const EditCategoryDialog: React.FC<EditCategoryDialogProps> = ({ open, editDialog, categoriesList, setEditDialog, handleApplyCategoryChange, onAddCategory }) => {
  const [inputValue, setInputValue] = useState(editDialog?.newCategory || '');
  const [minAmount, setMinAmount] = useState<number | ''>('');
  const [maxAmount, setMaxAmount] = useState<number | ''>('');
  const [createAutoRule, setCreateAutoRule] = useState(true); // צור כלל אוטומטי - ברירת מחדל מופעל
  const [isShaking, setIsShaking] = useState(false); // אנימציית רעידה בלחיצה על הרקע

  // בדיקה אם הגיע מחיפוש גלובלי
  const isFromGlobalSearch = !!editDialog?.globalSearchFilters;
  const globalFilters = editDialog?.globalSearchFilters;

  // עדכון ערך הקלט כשהקטגוריה משתנה מבחוץ
  useEffect(() => {
    if (editDialog?.newCategory !== undefined) {
      setInputValue(editDialog.newCategory);
    }
  }, [editDialog?.newCategory]);

  // איפוס שדות הסינון רק כשנפתח דיאלוג לעסקה חדשה
  const transactionId = editDialog?.transaction?.id;
  useEffect(() => {
    if (transactionId) {
      setMinAmount('');
      setMaxAmount('');
      setInputValue(editDialog?.transaction?.category || '');
    }
  }, [transactionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // קיצורי מקלדת: Escape לסגירה
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') {
        setEditDialog(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, setEditDialog]);

  // Add default for excludeIds if not present
  const excludeIds: Set<string> = useMemo(() => {
    return editDialog?.excludeIds || new Set();
  }, [editDialog?.excludeIds]);

  // משתנה מחושב - האם יש מספר עסקאות להציג
  const hasMultipleCandidates = editDialog?.candidates && editDialog.candidates.length > 1;
  
  // האם מצב "החל על כולם" פעיל (אוטומטי כשמגיעים מחיפוש)
  const isApplyAllActive = editDialog?.applyToAll || !!editDialog?.searchTerm || isFromGlobalSearch;

  // האם יש סינון סכום פעיל
  const hasAmountFilter = minAmount !== '' || maxAmount !== '';

  // האם כל העסקאות נבחרו (לא הוסרה אף אחת)
  const allTransactionsSelected = excludeIds.size === 0;

  // Smart Default: עדכון ברירת המחדל של יצירת כלל לפי הבחירה
  useEffect(() => {
    // אם הסירו עסקאות - כבה את יצירת הכלל כברירת מחדל
    // אם כולם נבחרו - הפעל חזרה
    setCreateAutoRule(allTransactionsSelected);
  }, [allTransactionsSelected]);

  // Reverse Smart Default: אם המשתמש מסמן "צור כלל" → החזר את כל העסקאות לבחירה
  useEffect(() => {
    if (createAutoRule && !allTransactionsSelected && editDialog) {
      // המשתמש סימן "צור כלל" אבל יש עסקאות מוסרות - נחזיר את כולן
      setEditDialog({ ...editDialog, excludeIds: new Set() });
    }
  }, [createAutoRule]); // eslint-disable-line react-hooks/exhaustive-deps

  // סינון עסקאות לפי טווח סכומים (בזמן אמת)
  const filteredCandidates = useMemo(() => {
    if (!editDialog?.candidates) return [];
    if (!hasAmountFilter) return editDialog.candidates;
    
    return editDialog.candidates.filter((tx: CreditDetail) => {
      if (minAmount !== '' && tx.amount < minAmount) return false;
      if (maxAmount !== '' && tx.amount > maxAmount) return false;
      return true;
    });
  }, [editDialog?.candidates, hasAmountFilter, minAmount, maxAmount]);

  // חישוב סיכום דינמי
  const summary = useMemo(() => {
    if (!editDialog?.candidates) return null;
    const total = editDialog.candidates.length;
    const filtered = filteredCandidates.length;
    const selected = filteredCandidates.filter((tx: CreditDetail) => !excludeIds.has(tx.id)).length;
    const totalAmount = filteredCandidates
      .filter((tx: CreditDetail) => !excludeIds.has(tx.id))
      .reduce((sum: number, tx: CreditDetail) => sum + tx.amount, 0);
    
    return { total, filtered, selected, totalAmount };
  }, [editDialog?.candidates, filteredCandidates, excludeIds]);

  // פונקציה להפעלת אנימציית pulse עדינה בלחיצה על הרקע
  const handleOverlayClick = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 350);
  };

  if (!open || !editDialog) return null;

  return (
    <div 
      className="edit-dialog-overlay" 
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-dialog-title"
    >
      <div className={`edit-dialog-box ${isShaking ? 'shake' : ''}`} onClick={e => e.stopPropagation()}>
        {/* כפתור X לסגירה */}
        <button 
          className="edit-dialog-close-btn" 
          onClick={() => setEditDialog(null)}
          aria-label="סגור דיאלוג (Escape)"
          title="סגור (Esc)"
        >
          ✕
        </button>
        
        <h3 id="edit-dialog-title">שינוי קטגוריה</h3>

        {/* הודעה על חיפוש גלובלי עם פילטרים */}
        {isFromGlobalSearch && globalFilters && (
          <div className="edit-dialog-global-search-banner">
            <div className="edit-dialog-global-search-title">
              🔍 תוצאות חיפוש מתקדם ({editDialog.candidates?.length || 0} עסקאות)
            </div>
            <div className="edit-dialog-global-search-filters">
              {globalFilters.text && (
                <span className="edit-dialog-filter-chip">
                  <span className="edit-dialog-filter-icon">🔤</span>
                  מכיל: "{globalFilters.text}"
                </span>
              )}
              {(globalFilters.minAmount !== undefined || globalFilters.maxAmount !== undefined) && (
                <span className="edit-dialog-filter-chip">
                  <span className="edit-dialog-filter-icon">💰</span>
                  סכום: {globalFilters.minAmount !== undefined ? `${globalFilters.minAmount.toLocaleString()}` : '0'}
                  {' - '}
                  {globalFilters.maxAmount !== undefined ? `${globalFilters.maxAmount.toLocaleString()}` : '∞'} ₪
                </span>
              )}
              {(globalFilters.dateFrom || globalFilters.dateTo) && (
                <span className="edit-dialog-filter-chip edit-dialog-filter-chip-date">
                  <span className="edit-dialog-filter-icon">📅</span>
                  {globalFilters.dateFrom || '...'} עד {globalFilters.dateTo || '...'}
                </span>
              )}
            </div>
          </div>
        )}

        {/* הודעה על חיפוש מרוכז רגיל (מהטבלה) */}
        {editDialog.searchTerm && !isFromGlobalSearch && (
          <div className="edit-dialog-search-banner">
            🔍 תוצאות חיפוש: "<strong>{editDialog.searchTerm}</strong>" ({editDialog.candidates?.length || 0} עסקאות)
          </div>
        )}
        
        {/* פרטי העסקה - מוצג רק אם אין חיפוש מרוכז */}
        {!editDialog.searchTerm && (
          <div className="edit-dialog-details">
            <b>תאריך:</b> {editDialog.transaction?.date} &nbsp; | &nbsp;
            <b>סכום:</b> {editDialog.transaction?.amount?.toLocaleString()} ₪ &nbsp; | &nbsp;
            <b>תיאור:</b> {editDialog.transaction?.description}
          </div>
        )}

        {/* אפשרות לבחור האם לשנות לעוד עסקאות - לא מוצג אם נפתח מחיפוש (כי כבר כל העסקאות בחוץ) */}
        {!editDialog.searchTerm && !isFromGlobalSearch && hasMultipleCandidates && (
          <div className="edit-dialog-apply-all-section">
            <label className="edit-dialog-checkbox-label">
              <input
                type="checkbox"
                checked={editDialog.applyToAll}
                onChange={e => setEditDialog({ ...editDialog, applyToAll: e.target.checked })}
                className="edit-dialog-checkbox"
                aria-describedby="apply-all-hint"
              />
              שנה לכל העסקאות עם אותם פרטי עסקה ({editDialog.candidates?.length})
            </label>
            <span id="apply-all-hint" className="visually-hidden">סמן כדי להחיל את השינוי על כל העסקאות הדומות</span>
          </div>
        )}

        {/* סינון לפי סכום - שדות פשוטים תמיד נראים */}
        {hasMultipleCandidates && isApplyAllActive && (
          <div className="edit-dialog-amount-filter-simple">
            <span className="edit-dialog-amount-label">סכום (₪):</span>
            <input
              type="number"
              value={minAmount}
              onChange={e => setMinAmount(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="מ..."
              className="edit-dialog-amount-input-simple"
              aria-label="סכום מינימלי"
            />
            <span className="edit-dialog-amount-separator">─</span>
            <input
              type="number"
              value={maxAmount}
              onChange={e => setMaxAmount(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="עד..."
              className="edit-dialog-amount-input-simple"
              aria-label="סכום מקסימלי"
            />
          </div>
        )}

        {/* סיכום דינמי */}
        {hasMultipleCandidates && summary && (
          <div className={`edit-dialog-summary ${isApplyAllActive ? 'visible' : 'hidden'}`} role="status" aria-live="polite">
            <span className="edit-dialog-summary-count">
              {hasAmountFilter && summary.filtered !== summary.total ? (
                <>נבחרו <strong>{summary.selected}</strong> מתוך <strong>{summary.filtered}</strong> עסקאות מסוננות (מתוך {summary.total} סה"כ)</>
              ) : (
                <>נבחרו <strong>{summary.selected}</strong> מתוך <strong>{summary.total}</strong> עסקאות</>
              )}
            </span>
            <span className="edit-dialog-summary-amount">
              סה"כ: <strong>{summary.totalAmount.toLocaleString()}</strong> ₪
            </span>
          </div>
        )}

        {/* טבלת עסקאות מסוננת */}
        {hasMultipleCandidates && (
          <div className={`edit-dialog-candidates-table-wrapper ${isApplyAllActive ? 'expanded' : 'collapsed'}`}>
            <table className={"edit-dialog-candidates-table" + (isApplyAllActive ? '' : ' disabled')} aria-label="רשימת עסקאות לשינוי קטגוריה">
              <thead>
                <tr>
                  <th></th>
                  <th>קטגוריה נוכחית</th>
                  <th>תאריך</th>
                  <th>תיאור</th>
                  <th>סכום</th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.map((tx: CreditDetail) => {
                  const cat = categoriesList.find(c => c.name === tx.category);
                  const isExcluded = excludeIds.has(tx.id);
                  return (
                    <tr key={tx.id} className={isExcluded ? 'excluded-row' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!isExcluded}
                          onChange={e => {
                            if (!isApplyAllActive) return;
                            const newSet = new Set(excludeIds);
                            if (e.target.checked) newSet.delete(tx.id);
                            else newSet.add(tx.id);
                            setEditDialog({ ...editDialog, excludeIds: newSet });
                          }}
                          disabled={!isApplyAllActive}
                          aria-label={`${isExcluded ? 'סמן' : 'בטל סימון'} עסקה ${tx.description}`}
                        />
                      </td>
                      <td className="edit-dialog-current-category">
                        {cat?.icon && <span className="edit-dialog-category-icon">{cat.icon}</span>}
                        {tx.category || <span className="edit-dialog-no-category">ללא</span>}
                      </td>
                      <td>{tx.date}</td>
                      <td>{tx.description}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{tx.amount.toLocaleString()} ₪</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredCandidates.length === 0 && hasAmountFilter && (
              <div className="edit-dialog-no-results" role="alert">אין עסקאות התואמות את טווח הסכומים שנבחר</div>
            )}
            {!isApplyAllActive && (
              <div className="edit-dialog-table-disabled-msg">כדי לשנות קטגוריה לעסקאות נוספות, סמן את האפשרות למעלה.</div>
            )}
          </div>
        )}

        {/* בחירת קטגוריה חדשה - מודגש */}
        <div className="edit-dialog-category-section">
          <label className="edit-dialog-category-label-main">
            🏷️ קטגוריה חדשה:
          </label>
          <CategorySelectOrAdd
            categories={categoriesList}
            value={inputValue}
            onChange={catName => {
              setInputValue(catName);
              setEditDialog({ ...editDialog, newCategory: catName });
            }}
            onAddCategory={cat => {
              if (onAddCategory) onAddCategory(cat);
              setEditDialog({ ...editDialog, newCategory: cat.name });
            }}
            allowAdd={true}
            allowEditExisting={false}
            placeholder={editDialog.transaction?.category}
          />
          {!inputValue && (
            <div className="edit-dialog-help-message">
              <span className="edit-dialog-required-marker">*</span> יש לבחור קטגוריה מהרשימה או להוסיף קטגוריה חדשה
            </div>
          )}
        </div>

        {/* אפשרות ליצירת כלל אוטומטי - שורה עדינה */}
        {isApplyAllActive && hasMultipleCandidates && inputValue && (
          <label className="edit-dialog-auto-rule-line">
            <input
              type="checkbox"
              checked={createAutoRule}
              onChange={e => setCreateAutoRule(e.target.checked)}
              className="edit-dialog-checkbox-small"
            />
            <span className="edit-dialog-auto-rule-text-subtle">
              עסקאות עתידיות עם "{editDialog.searchTerm || globalFilters?.text || editDialog.transaction?.description}" יסווגו אוטומטית ל{inputValue}
            </span>
          </label>
        )}

        {/* כפתורי פעולה */}
        <div className="edit-dialog-actions">
          <button
            onClick={() => setEditDialog(null)}
            className="edit-dialog-cancel-btn"
          >
            ביטול
          </button>
          <button
            onClick={() => {
              if (!inputValue) {
                const inputEl = document.querySelector('.CategorySelectOrAdd-input') as HTMLElement;
                if (inputEl) {
                  inputEl.classList.add('highlight-required');
                  inputEl.focus();
                  setTimeout(() => inputEl.classList.remove('highlight-required'), 1000);
                }
              } else {
                // העבר מידע על סינון סכום, כלל אוטומטי ותאריכים לפני שמירה
                const updatedDialog: EditDialogState = {
                  ...editDialog,
                  newCategory: inputValue,
                  createAutoRule: (editDialog.applyToAll || isFromGlobalSearch) ? createAutoRule : false,
                  amountFilter: hasAmountFilter ? {
                    minAmount: minAmount === '' ? undefined : minAmount,
                    maxAmount: maxAmount === '' ? undefined : maxAmount
                  } : undefined
                };
                setEditDialog(updatedDialog);
                // העבר את הדיאלוג המעודכן ישירות לפונקציה כדי להימנע מ-race condition
                handleApplyCategoryChange(updatedDialog);
              }
            }}
            className="edit-dialog-save-btn"
            disabled={!inputValue}
            title={!inputValue ? "יש לבחור קטגוריה או להוסיף קטגוריה חדשה כדי לשמור" : ""}
          >
            {isApplyAllActive && summary && summary.selected > 1
              ? `שנה ${summary.selected} עסקאות ל${inputValue || '...'}`
              : `שנה ל${inputValue || '...'}`
            }
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditCategoryDialog;
