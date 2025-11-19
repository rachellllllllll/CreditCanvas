import React, { useState, useEffect } from 'react';
import './EditCategoryDialog.css';
import CategorySelectOrAdd from './CategorySelectOrAdd';
import type { CreditDetail } from '../types';
import type { CategoryDef } from './CategoryManager';

interface EditCategoryDialogProps {
  open: boolean;
  editDialog: any;
  categoriesList: CategoryDef[];
  setEditDialog: (v: any) => void;
  handleApplyCategoryChange: () => void;
  onAddCategory?: (cat: CategoryDef) => void; // callback for new category
}

const EditCategoryDialog: React.FC<EditCategoryDialogProps> = ({ open, editDialog, categoriesList, setEditDialog, handleApplyCategoryChange, onAddCategory }) => {
  const [inputValue, setInputValue] = useState(editDialog?.newCategory || '');

  useEffect(() => {
    setInputValue(editDialog?.newCategory || '');
  }, [editDialog]);

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

  if (!open || !editDialog) return null;

  // Add default for excludeIds if not present
  const excludeIds: Set<string> = editDialog.excludeIds || new Set();

  return (
    <div className="edit-dialog-overlay">
      <div className="edit-dialog-box">
        <h3>שינוי קטגוריה</h3>
        <div className="edit-dialog-details">
          <b>תאריך:</b> {editDialog.transaction?.date} &nbsp; | &nbsp;
          <b>סכום:</b> {editDialog.transaction?.amount?.toLocaleString()} &nbsp; | &nbsp;
          <b>תיאור:</b> {editDialog.transaction?.description}
        </div>
        {/* אפשרות לבחור האם לשנות לעוד עסקאות */}
        {editDialog.candidates && editDialog.candidates.length > 1 && (
          <div className="edit-dialog-details">
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
        {/* טבלת עסקאות עם אפשרות סימון/הסרה */}
        {editDialog.candidates && editDialog.candidates.length > 1 && (
          <div className="edit-dialog-candidates-table-wrapper">
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
                {editDialog.candidates.map((tx: CreditDetail) => {
                  const cat = categoriesList.find(c => c.name === tx.category);
                  return (
                    <tr key={tx.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!excludeIds.has(tx.id)}
                          onChange={e => {
                            if (!editDialog.applyToAll) return; // מנע שינוי אם לא בחרו "לשנות לכולם"
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
                      <td>{tx.amount.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!editDialog.applyToAll && (
              <div className="edit-dialog-table-disabled-msg">כדי לשנות קטגוריה לעסקאות נוספות, סמן את האפשרות למעלה.</div>
            )}
          </div>
        )}
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
                // הצג הנפשה/הדגשה של שדה הקלט
                const inputEl = document.querySelector('.CategorySelectOrAdd-input') as HTMLElement;
                if (inputEl) {
                  inputEl.classList.add('highlight-required');
                  inputEl.focus();
                  setTimeout(() => inputEl.classList.remove('highlight-required'), 1000);
                }
              } else {
                handleApplyCategoryChange();
              }
            }}
            className="edit-dialog-save-btn"
            // disabled={!inputValue}
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
