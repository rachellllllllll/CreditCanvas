import React, { useState, useEffect } from 'react';
import { ICONS } from './icons';
import CategorySelectOrAdd from './CategorySelectOrAdd';
import DeleteCategoryDialog from './DeleteCategoryDialog';
import UndoToast from './UndoToast';
import './CategoryManager.css';

export interface CategoryDef {
  name: string;
  color: string;
  icon: string;
}

import type { CreditDetail } from '../types';

interface CategoryManagerProps {
  categories: CategoryDef[];
  onChange: (cats: CategoryDef[]) => void;
  onClose: () => void;
  categoriesCount?: Record<string, number>; // מיפוי שם קטגוריה לכמות עסקאות
  transactionsByCategory: Record<string, CreditDetail[]>; // מיפוי שם קטגוריה לרשימת עסקאות
  embedded?: boolean; // האם מוטמע בתוך פאנל אחר
  onDeleteCategory?: (categoryName: string, targetCategory?: string) => void;
  onRenameCategory?: (oldName: string, newName: string) => void;
  rulesCountByCategory?: Record<string, number>;
  aliasesCountByCategory?: Record<string, number>;
  isLoading?: boolean;
  onAddCategory?: (cat: CategoryDef) => void;
}

const CategoryManager: React.FC<CategoryManagerProps> = ({ categories, onChange, onClose, categoriesCount = {}, transactionsByCategory, embedded = false, onDeleteCategory, onRenameCategory, rulesCountByCategory = {}, aliasesCountByCategory = {}, isLoading = false, onAddCategory: onAddCategoryProp }) => {
  const [cats, setCats] = useState<CategoryDef[]>(categories);
  
  // סנכרון state מקומי כאשר ה-prop משתנה מבחוץ
  useEffect(() => {
    setCats(categories);
  }, [categories]);

  const [saveStatus, setSaveStatus] = useState<'idle'|'success'|'error'>('idle');
  const [saveMsg, setSaveMsg] = useState('');
  // הצעות לאיחוד/שמות חדשים
  const [suggestions, setSuggestions] = useState<Record<string, any> | null>(null);
  const [showSuggestionsDialog, setShowSuggestionsDialog] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // עטיפת onChange כך שכל שינוי יגרום לאירוע גלובלי (App יאזין וישמור ל-JSON)
  const handleChangeAndNotify = (updated: CategoryDef[]) => {
    onChange(updated);
    window.dispatchEvent(new CustomEvent('categoriesChanged'));
  }

  // State for delete dialogs
  const [deleteDialogState, setDeleteDialogState] = useState<{ idx: number; categoryName: string; isEmpty: boolean } | null>(null);

  // State for undo toast (empty category instant-delete)
  const [undoToast, setUndoToast] = useState<{ categoryName: string; deletedCat: CategoryDef; idx: number } | null>(null);

  // עדכון קטגוריה (שם, אייקון, צבע)
  const handleCategoryUpdate = (idx: number, updatedCat: CategoryDef) => {
    const oldName = cats[idx].name;
    const newName = updatedCat.name;
    const nameChanged = oldName !== newName;

    // Check if renaming to an existing category (merge)
    if (nameChanged) {
      const existingIdx = cats.findIndex(c => c.name === newName && c.name !== oldName);
      if (existingIdx >= 0) {
        // Merge: confirm with user
        if (window.confirm(`הקטגוריה '${newName}' כבר קיימת. לאחד את שתי הקטגוריות?`)) {
          if (onRenameCategory) onRenameCategory(oldName, newName);
          // Remove old definition
          const updated = cats.filter((_, i) => i !== idx);
          setCats(updated);
          handleChangeAndNotify(updated);
        }
        return;
      }
      // Rename: update definition + call onRenameCategory
      const updated = cats.slice();
      updated[idx] = updatedCat;
      setCats(updated);
      handleChangeAndNotify(updated);
      if (onRenameCategory) onRenameCategory(oldName, newName);
      return;
    }

    // Only icon/color changed
    const updated = cats.slice();
    updated[idx] = updatedCat;
    setCats(updated);
    handleChangeAndNotify(updated);
  };

  // מחיקה — לקטגוריה ריקה: מחיקה מיידית + Toast עם Undo. לקטגוריה עם עסקאות: דיאלוג
  const handleDelete = (idx: number) => {
    const categoryName = cats[idx].name;
    const txCount = categoriesCount[categoryName] || 0;
    const rCount = rulesCountByCategory[categoryName] || 0;
    const aCount = aliasesCountByCategory[categoryName] || 0;
    const isEmpty = txCount === 0 && rCount === 0 && aCount === 0;

    if (isEmpty) {
      // מחיקה מיידית + הצגת Toast עם אפשרות ביטול
      // לא קוראים ל-onDeleteCategory כדי למנוע toast כפול מ-App
      const deletedCat = cats[idx];
      const updated = cats.filter((_, i) => i !== idx);
      setCats(updated);
      handleChangeAndNotify(updated);
      setUndoToast({ categoryName, deletedCat, idx });
    } else {
      setDeleteDialogState({ idx, categoryName, isEmpty: false });
    }
  };

  // שחזור קטגוריה שנמחקה (Undo)
  const handleUndoDelete = () => {
    if (!undoToast) return;
    const { deletedCat, idx } = undoToast;
    const updated = [...cats];
    updated.splice(Math.min(idx, updated.length), 0, deletedCat);
    setCats(updated);
    handleChangeAndNotify(updated);
    setUndoToast(null);
  };

  // מחיקה בפועל (אחרי אישור)
  const handleConfirmDelete = (targetCategory?: string) => {
    if (!deleteDialogState) return;
    if (onDeleteCategory) {
      onDeleteCategory(deleteDialogState.categoryName, targetCategory);
    } else {
      // Fallback: direct delete without reassignment
      const updated = cats.filter((_, i) => i !== deleteDialogState.idx);
      setCats(updated);
      handleChangeAndNotify(updated);
    }
    setDeleteDialogState(null);
  };
  // בקשת הצעות מהשרת – לכל קטגוריה בנפרד, הצג תוצאה מידית, דלג על מאוחדות
  const fetchSuggestions = async () => {
    setLoadingSuggestions(true);
    setSuggestions({});
    setShowSuggestionsDialog(true);
    
    // סנן קטגוריות ללא עסקאות כדי להקטין את גודל הבקשה לשרת
    const catsWithTransactions = cats.filter(cat => 
      Array.isArray(transactionsByCategory[cat.name]) && 
      transactionsByCategory[cat.name].length > 0
    );
    
    // בדוק אם יש מספיק נתונים
    if (catsWithTransactions.length === 0) {
      setSuggestions({ error: 'לא נמצאו קטגוריות עם עסקאות להצעת שיפורים' });
      setLoadingSuggestions(false);
      return;
    }
    
    // צור מערך רק של קטגוריות עם עסקאות ועם דוגמאות מצומצמות
    const categoriesWithSamples = catsWithTransactions.map(cat => ({
      name: cat.name,
      icon: cat.icon,
      transactions: Array.isArray(transactionsByCategory[cat.name])
        ? [...new Set(transactionsByCategory[cat.name].map(t=> 
            // לקחת רק את התיאור ולקצר אותו במידת הצורך
            t.description?.substring(0, 50) || ''))]
          .slice(0, 3) // קח רק עד 3 דוגמאות
        : []
    }));
    
    const mergedWith = new Set<string>(); // שמות שאוחדו
    for (let i = 0; i < catsWithTransactions.length; i++) {
      const cat = catsWithTransactions[i];
      if (mergedWith.has(cat.name)) continue; // דלג אם כבר אוחד
      
      // מצא את הקטגוריה המתאימה במערך הדגימות
      const catSample = categoriesWithSamples.find(c => c.name === cat.name);
      if (!catSample) continue;
      
      try {
        // נסה קודם עם בקשה מצומצמת - רק קבוצה קטנה של קטגוריות דומות
        const similarCategories = categoriesWithSamples
          .filter(c => c.name === cat.name || 
                     // בחר רק עד 5 קטגוריות נוספות
                     categoriesWithSamples.indexOf(c) < 6)
          .slice(0, 6); // הגבל לכמות קטנה של קטגוריות
        
        const res = await fetch('/api/category-suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            allCategories: similarCategories,
            targetCategory: catSample
          }),
        });
        
        if (!res.ok) {
          // אם נכשל, נסה עם עוד פחות קטגוריות
          console.warn(`שגיאה בבקשה לקטגוריה ${cat.name}, מנסה עם פחות נתונים`);
          
          const minimalRequest = {
            allCategories: [catSample],
            targetCategory: catSample
          };
          
          const retryRes = await fetch('/api/category-suggestions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(minimalRequest),
          });
          
          if (!retryRes.ok) {
            throw new Error(`נכשל גם בבקשה מינימלית: ${retryRes.status}`);
          }
          
          const retryData = await retryRes.json();
          setSuggestions(prev => ({
            ...(prev || {}),
            [cat.name]: {
              ...retryData,
              limited: true // סמן שזו תוצאה מוגבלת
            }
          }));
        } else {
          const data = await res.json();
          setSuggestions(prev => {
            const next = { ...(prev || {}) };
            next[cat.name] = data;
            // אם יש הצעת איחוד, דלג על הקטגוריה השנייה
            if (data.mergeSuggestions && Array.isArray(data.mergeSuggestions)) {
              data.mergeSuggestions.forEach((merge: any) => {
                merge.categories.forEach((mergeCat: string) => {
                  if (mergeCat !== cat.name) mergedWith.add(mergeCat);
                });
              });
            }
            return next;
          });
        }
      } catch (error) {
        console.error(`שגיאה בקבלת הצעות עבור ${cat.name}:`, error);
        setSuggestions(prev => ({ 
          ...(prev || {}), 
          [cat.name]: { 
            error: 'שגיאה בקבלת הצעות. ייתכן שגודל הבקשה גדול מדי.' 
          } 
        }));
      }
    }
    setLoadingSuggestions(false);
  };

  // פונקציה להוספת קטגוריה חדשה עם דיאלוג
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const handleAddNewCategory = () => {
    if (!newCatName.trim()) return;
    const newCategory: CategoryDef = { 
      name: newCatName.trim(), 
      color: '#6366f1', 
      icon: ICONS[Math.floor(Math.random() * ICONS.length)] 
    };
    const updated = [...cats, newCategory];
    setCats(updated);
    setNewCatName('');
    setShowAddDialog(false);
    handleChangeAndNotify(updated);
  };

  const content = (
    <div className={`edit-dialog-box category-manager-box ${embedded ? 'embedded' : ''}`}>
      {/* Header */}
      <div className="category-manager-header">
        <h3>ניהול קטגוריות</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="category-manager-add-btn" onClick={() => setShowAddDialog(true)}>+ הוסף קטגוריה</button>
          {cats.length > 0 && (
            <button 
              className="category-manager-suggest-btn" 
              onClick={fetchSuggestions} 
              disabled={loadingSuggestions}
            >
              {loadingSuggestions ? '⏳ טוען...' : '✨ הצעות חכמות'}
            </button>
          )}
        </div>
      </div>
      
      {/* Add Category Dialog */}
      {showAddDialog && (
        <div className="category-manager-iconpicker-backdrop" onClick={() => setShowAddDialog(false)}>
          <div className="category-manager-iconpicker-popup" onClick={e => e.stopPropagation()} style={{ minWidth: 320 }}>
            <div className="category-manager-iconpicker-title">הוספת קטגוריה חדשה</div>
            <input
              type="text"
              placeholder="שם הקטגוריה..."
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddNewCategory(); }}
              autoFocus
              className="category-manager-name-input"
              style={{ width: '100%', marginBottom: 16, padding: '10px 14px', fontSize: 15 }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button 
                className="category-manager-add-btn" 
                onClick={handleAddNewCategory}
                disabled={!newCatName.trim()}
                style={{ opacity: newCatName.trim() ? 1 : 0.5 }}
              >
                הוסף
              </button>
              <button className="category-manager-iconpicker-cancel" onClick={() => setShowAddDialog(false)}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content (scrollable) */}
      <div className="category-manager-content">
        {/* Empty State */}
        {cats.length === 0 ? (
          <div className="category-manager-empty">
            <div className="category-manager-empty-icon">🏷️</div>
            <div className="category-manager-empty-title">אין קטגוריות עדיין</div>
            <div className="category-manager-empty-desc">
              צור קטגוריות כדי לארגן את העסקאות שלך לפי נושאים - מזון, תחבורה, בילויים ועוד
            </div>
            <button className="category-manager-empty-btn" onClick={() => setShowAddDialog(true)}>
              + הוסף קטגוריה ראשונה
            </button>
          </div>
        ) : (
          <div className="category-manager-table-wrapper">
            <table className="category-manager-table">
              <thead>
                <tr>
                  <th>קטגוריה</th>
                  <th>עסקאות</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cats.map((cat, idx) => (
                  <tr key={cat.name+idx}>
                    <td className="category-manager-chip-cell">
                      <CategorySelectOrAdd
                        categories={cats}
                        value={cat.name}
                        onChange={(newName) => {
                          // If the name changed via selection
                          if (newName !== cat.name) {
                            handleCategoryUpdate(idx, { ...cat, name: newName });
                          }
                        }}
                        onAddCategory={(updatedCat) => handleCategoryUpdate(idx, updatedCat)}
                        allowAdd={true}
                        defaultIcon={cat.icon}
                        defaultColor={cat.color}
                        previewVisibility="always"
                        showDefaultChipIfProvided={true}
                      />
                    </td>
                    <td className="category-manager-count-cell">
                      {categoriesCount[cat.name] || 0}
                    </td>
                    <td>
                      <button className="category-manager-delete-btn" onClick={() => handleDelete(idx)} title="מחק קטגוריה">🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* דיאלוג הצעות - עיצוב משופר */}
        {showSuggestionsDialog && (
          <div className="category-manager-suggestions-dialog">
            <div className="category-manager-suggestions-box">
              <h4>
                🔍 הצעות לאיחוד וייעול הקטגוריות
                {loadingSuggestions && <span style={{ fontSize: '0.8em', color: '#0d47a1', marginRight: '8px' }}>⏳ טוען...</span>}
              </h4>
              
              {/* כשאין הצעות ועדיין טוען */}
              {loadingSuggestions && Object.keys(suggestions || {}).length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: '24px', marginBottom: '10px' }}>⏳</div>
                  <div>מאתר הצעות מתאימות...</div>
                </div>
              )}
              
              {/* הודעת שגיאה */}
              {suggestions?.error && (
                <div className="category-manager-suggestions-error">
                  <span style={{ fontSize: '20px', marginLeft: '8px' }}>⚠️</span>
                  {suggestions.error}
                  {suggestions.error.includes('גודל') && (
                    <p style={{ fontSize: '0.9em', marginTop: '8px' }}>
                      נסה שוב עם פחות קטגוריות או הסר קטגוריות ללא עסקאות.
                    </p>
                  )}
                </div>
              )}
              
              {/* יש הצעות - מציג גם אם עדיין טוען */}
              {suggestions && !suggestions.error && Object.keys(suggestions).length > 0 && (
                <div className="category-manager-suggestions-content">
                  {/* אינדיקטור טעינה */}
                  {loadingSuggestions && (
                    <div style={{ textAlign: 'right', padding: '5px 10px', fontSize: '0.9em', color: '#0d47a1', background: '#e3f2fd', borderRadius: '6px', marginBottom: '10px' }}>
                      <span style={{ marginLeft: '5px' }}>⏳</span>
                      טוען הצעות נוספות...
                    </div>
                  )}
                  
                  {/* הצעות שכבר הגיעו */}
                  {Object.entries(suggestions).map(([catName, sug]: [string, any]) => (
                    <div key={catName} className="category-manager-suggestion-group">
                      <div className="category-manager-suggestion-title">
                        {sug.mergeSuggestions?.length > 0 || sug.renameSuggestions?.length > 0 ? '✨' : '🔍'} 
                        <b> קטגוריה:</b> {catName}
                        {sug.limited && <span style={{fontSize: '0.8em', color: '#7986cb', marginRight: '5px'}}> (מידע מוגבל)</span>}
                      </div>
                      
                      {sug.mergeSuggestions?.length > 0 && (
                        <div>
                          <b style={{ color: '#0d47a1', display: 'block', margin: '12px 0 8px', fontSize: '15px' }}>
                            🔀 הצעות לאיחוד קטגוריות:
                          </b>
                          <ul>
                            {sug.mergeSuggestions.map((s: any, i: number) => (
                              <li key={i}>
                                <span style={{ fontWeight: 500 }}>
                                  איחוד: {s.categories.join(', ')} → <b style={{ color: '#0d47a1' }}>{s.mergedName}</b>
                                </span>
                                <br />
                                <span style={{ fontSize: '0.92em', color: '#555', display: 'block', margin: '4px 0' }}>
                                  {s.reason}
                                </span>
                                <button className="category-manager-action-btn" onClick={() => {
                                  // בצע איחוד בפועל
                                  const updated = cats.filter(cat => !s.categories.includes(cat.name));
                                  updated.push({ name: s.mergedName, color: '#36A2EB', icon: ICONS[0] });
                                  setCats(updated);
                                  setShowSuggestionsDialog(false);
                                  handleChangeAndNotify(updated);
                                }}>✅ בצע איחוד קטגוריות</button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {sug.renameSuggestions?.length > 0 && (
                        <div>
                          <b style={{ color: '#0d47a1', display: 'block', margin: '12px 0 8px', fontSize: '15px' }}>
                            🏷️ הצעות לשינוי שמות:
                          </b>
                          <ul>
                            {sug.renameSuggestions.map((s: any, i: number) => (
                              <li key={i}>
                                <span style={{ fontWeight: 500 }}>
                                  החלף <b>{s.oldName}</b> ל-<b style={{ color: '#0d47a1' }}>{s.newName}</b>
                                </span>
                                <br />
                                <span style={{ fontSize: '0.92em', color: '#555', display: 'block', margin: '4px 0' }}>
                                  {s.reason}
                                </span>
                                <button className="category-manager-action-btn" onClick={() => {
                                  // בצע שינוי שם בפועל
                                  const updated = cats.map(cat => cat.name === s.oldName ? { ...cat, name: s.newName } : cat);
                                  setCats(updated);
                                  setShowSuggestionsDialog(false);
                                  handleChangeAndNotify(updated);
                                }}>✅ שנה שם קטגוריה</button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {(!sug.mergeSuggestions?.length && !sug.renameSuggestions?.length) && (
                        <div style={{ color: '#777', fontSize: '0.95em', padding: '8px 10px', background: '#f1f3f5', borderRadius: '6px', margin: '8px 0' }}>
                          <span style={{ marginLeft: '5px' }}>ℹ️</span>
                          לא נמצאו הצעות רלוונטיות עבור קטגוריה זו.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {/* מצב שיש הצעות שנטענו אבל הן ריקות */}
              {suggestions && !suggestions.error && Object.keys(suggestions).length === 0 && !loadingSuggestions && (
                <div style={{ color: '#555', fontSize: '0.95em', padding: '16px', background: '#f8f9fa', borderRadius: '8px', textAlign: 'center', margin: '20px 0' }}>
                  <span style={{ fontSize: '24px', display: 'block', margin: '0 0 10px' }}>🔍</span>
                  לא נמצאו הצעות לאף קטגוריה. הקטגוריות הנוכחיות נראות מאורגנות היטב.
                </div>
              )}
              
              <button className="category-manager-close-btn" onClick={() => setShowSuggestionsDialog(false)}>
                סגור
              </button>
            </div>
          </div>
        )}
        {/* Footer (sticky) */}
        <div className="category-manager-footer">
          <button onClick={onClose}>סגור</button>
          <button
            className="category-manager-save-btn"
            onClick={() => {
              try {
                handleChangeAndNotify(cats);
                setSaveStatus('success');
                setSaveMsg('הקטגוריות נשמרו בהצלחה!');
                setTimeout(() => setSaveStatus('idle'), 2000);
              } catch {
                setSaveStatus('error');
                setSaveMsg('אירעה שגיאה בשמירה');
              }
            }}
          >שמור שינויים</button>
        </div>
        {saveStatus !== 'idle' && (
          <div className={saveStatus === 'success' ? 'category-manager-save-success' : 'category-manager-save-error'}>
            {saveMsg}
          </div>
        )}
      </div>
  );

  // If embedded, don't show overlay
  if (embedded) {
    return (
      <>
        {content}
        {deleteDialogState && (
          <DeleteCategoryDialog
            categoryName={deleteDialogState.categoryName}
            transactionsCount={categoriesCount[deleteDialogState.categoryName] || 0}
            rulesCount={rulesCountByCategory[deleteDialogState.categoryName] || 0}
            categories={cats}
            onConfirm={(target) => handleConfirmDelete(target)}
            onCancel={() => setDeleteDialogState(null)}
            onAddCategory={(cat) => {
              if (onAddCategoryProp) onAddCategoryProp(cat);
              const updated = [...cats, cat];
              setCats(updated);
              handleChangeAndNotify(updated);
            }}
            isLoading={isLoading}
          />
        )}
        {undoToast && (
          <UndoToast
            message={<>הקטגוריה <strong>'{undoToast.categoryName}'</strong> נמחקה</>}
            onUndo={handleUndoDelete}
            onDismiss={() => setUndoToast(null)}
          />
        )}
      </>
    );
  }

  return (
    <div className="edit-dialog-overlay category-manager-overlay">
      {content}
      {deleteDialogState && (
        <DeleteCategoryDialog
          categoryName={deleteDialogState.categoryName}
          transactionsCount={categoriesCount[deleteDialogState.categoryName] || 0}
          rulesCount={rulesCountByCategory[deleteDialogState.categoryName] || 0}
          categories={cats}
          onConfirm={(target) => handleConfirmDelete(target)}
          onCancel={() => setDeleteDialogState(null)}
          onAddCategory={(cat) => {
            if (onAddCategoryProp) onAddCategoryProp(cat);
            const updated = [...cats, cat];
            setCats(updated);
            handleChangeAndNotify(updated);
          }}
          isLoading={isLoading}
        />
      )}
      {undoToast && (
        <UndoToast
          message={<>הקטגוריה <strong>'{undoToast.categoryName}'</strong> נמחקה</>}
          onUndo={handleUndoDelete}
          onDismiss={() => setUndoToast(null)}
        />
      )}
    </div>
  );
};

export default CategoryManager;
