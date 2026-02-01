import React, { useState, useEffect, useMemo } from 'react';
import './EditCategoryDialog.css';
import CategorySelectOrAdd from './CategorySelectOrAdd';
import type { CreditDetail } from '../types';
import type { CategoryDef } from './CategoryManager';

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
  const [useAmountFilter, setUseAmountFilter] = useState(false);
  const [minAmount, setMinAmount] = useState<number | ''>('');
  const [maxAmount, setMaxAmount] = useState<number | ''>('');
  const [createAutoRule, setCreateAutoRule] = useState(true); // צור כלל אוטומטי - ברירת מחדל מופעל

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
      setUseAmountFilter(false);
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

  // Add default for excludeIds if not present
  const excludeIds: Set<string> = useMemo(() => {
    return editDialog?.excludeIds || new Set();
  }, [editDialog?.excludeIds]);

  // סינון עסקאות לפי טווח סכומים (בזמן אמת)
  const filteredCandidates = useMemo(() => {
    if (!editDialog?.candidates) return [];
    if (!useAmountFilter) return editDialog.candidates;
    
    return editDialog.candidates.filter((tx: CreditDetail) => {
      if (minAmount !== '' && tx.amount < minAmount) return false;
      if (maxAmount !== '' && tx.amount > maxAmount) return false;
      return true;
    });
  }, [editDialog?.candidates, useAmountFilter, minAmount, maxAmount]);

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

  if (!open || !editDialog) return null;

  return (
    <div className="edit-dialog-overlay" onClick={() => setEditDialog(null)}>
      <div className="edit-dialog-box" onClick={e => e.stopPropagation()}>
        {/* כפתור X לסגירה */}
        <button 
          className="edit-dialog-close-btn" 
          onClick={() => setEditDialog(null)}
          aria-label="סגור"
        >
          ✕
        </button>
        
        <h3>שינוי קטגוריה</h3>

        {/* הודעה על חיפוש מרוכז */}
        {editDialog.searchTerm && (
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
        {!editDialog.searchTerm && editDialog.candidates && editDialog.candidates.length > 1 && (
          <div className="edit-dialog-apply-all-section">
            <label className="edit-dialog-checkbox-label">
              <input
                type="checkbox"
                checked={editDialog.applyToAll}
                onChange={e => setEditDialog({ ...editDialog, applyToAll: e.target.checked })}
                className="edit-dialog-checkbox"
              />
              שנה לכל העסקאות עם אותם פרטי עסקה ({editDialog.candidates.length})
            </label>
          </div>
        )}

        {/* סינון לפי סכום - לפני הטבלה! */}
        {editDialog.candidates && editDialog.candidates.length > 1 && (
          <div className={`edit-dialog-amount-filter ${editDialog.applyToAll ? 'visible' : 'hidden'}`}>
            <label className="edit-dialog-checkbox-label">
              <input
                type="checkbox"
                checked={useAmountFilter}
                onChange={e => {
                  setUseAmountFilter(e.target.checked);
                  if (!e.target.checked) {
                    setMinAmount('');
                    setMaxAmount('');
                  }
                }}
                className="edit-dialog-checkbox"
                disabled={!editDialog.applyToAll}
              />
              הגבל לפי טווח סכומים
            </label>
            <div className={`edit-dialog-amount-inputs ${useAmountFilter && editDialog.applyToAll ? 'visible' : 'hidden'}`}>
              <div className="edit-dialog-amount-field">
                <label>מינימום:</label>
                <input
                  type="number"
                  value={minAmount}
                  onChange={e => setMinAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="edit-dialog-amount-input"
                />
                <span className="edit-dialog-currency">₪</span>
              </div>
              <div className="edit-dialog-amount-field">
                <label>מקסימום:</label>
                <input
                  type="number"
                  value={maxAmount}
                  onChange={e => setMaxAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="ללא הגבלה"
                  className="edit-dialog-amount-input"
                />
                <span className="edit-dialog-currency">₪</span>
              </div>
            </div>
          </div>
        )}

        {/* סיכום דינמי */}
        {editDialog.candidates && editDialog.candidates.length > 1 && summary && (
          <div className={`edit-dialog-summary ${editDialog.applyToAll ? 'visible' : 'hidden'}`}>
            <span className="edit-dialog-summary-count">
              {useAmountFilter && summary.filtered !== summary.total ? (
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
        {editDialog.candidates && editDialog.candidates.length > 1 && (
          <div className={`edit-dialog-candidates-table-wrapper ${editDialog.applyToAll ? 'expanded' : 'collapsed'}`}>
            <table className={"edit-dialog-candidates-table" + (editDialog.applyToAll ? '' : ' disabled')}>
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
                            if (!editDialog.applyToAll) return;
                            const newSet = new Set(excludeIds);
                            if (e.target.checked) newSet.delete(tx.id);
                            else newSet.add(tx.id);
                            setEditDialog({ ...editDialog, excludeIds: newSet });
                          }}
                          disabled={!editDialog.applyToAll}
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
            {filteredCandidates.length === 0 && useAmountFilter && (
              <div className="edit-dialog-no-results">אין עסקאות התואמות את טווח הסכומים שנבחר</div>
            )}
            {!editDialog.applyToAll && (
              <div className="edit-dialog-table-disabled-msg">כדי לשנות קטגוריה לעסקאות נוספות, סמן את האפשרות למעלה.</div>
            )}
          </div>
        )}

        {/* בחירת קטגוריה חדשה */}
        <div className="edit-dialog-category-input-wrapper">
          <label>
            קטגוריה חדשה:
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
              placeholder={editDialog.transaction?.category}
            />
          </label>
          {!inputValue && (
            <div className="edit-dialog-help-message">
              <span className="edit-dialog-required-marker">*</span> יש לבחור קטגוריה מהרשימה או להוסיף קטגוריה חדשה
            </div>
          )}
        </div>

        {/* אפשרות ליצירת כלל אוטומטי */}
        {(editDialog.applyToAll || editDialog.searchTerm) && editDialog.candidates && editDialog.candidates.length > 1 && (
          <div className="edit-dialog-auto-rule-section">
            <label className="edit-dialog-checkbox-label">
              <input
                type="checkbox"
                checked={createAutoRule}
                onChange={e => setCreateAutoRule(e.target.checked)}
                className="edit-dialog-checkbox"
              />
              <span className="edit-dialog-auto-rule-text">
                📝 צור כלל אוטומטי לעתיד
                <span className="edit-dialog-auto-rule-hint">
                  {editDialog.searchTerm ? (
                    <>(עסקאות חדשות שמכילות "<strong>{editDialog.searchTerm}</strong>" → יקבלו את הקטגוריה)</>
                  ) : (
                    <>(עסקאות חדשות עם "{editDialog.transaction?.description}" → יקבלו את הקטגוריה)</>
                  )}
                </span>
              </span>
            </label>
          </div>
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
                // העבר מידע על סינון סכום וכלל אוטומטי לפני שמירה
                const updatedDialog: EditDialogState = {
                  ...editDialog,
                  newCategory: inputValue,
                  createAutoRule: editDialog.applyToAll ? createAutoRule : false,
                  amountFilter: useAmountFilter ? {
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
            title={!inputValue ? "יש לבחור קטגוריה או להוסיף קטגוריה חדשה כדי לשמור" : ""}
          >
            שמור שינוי קטגוריה
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditCategoryDialog;
