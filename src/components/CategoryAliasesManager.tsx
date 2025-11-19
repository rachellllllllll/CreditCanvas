import React, { useState, useRef, useEffect } from 'react';
import CategorySelectOrAdd from './CategorySelectOrAdd';
import type { CategoryDef } from './CategoryManager';
import './CategoryAliasesManager.css';

interface CategoryAliasesManagerProps {
  aliases: Record<string, string>;
  categories: CategoryDef[];
  onChange: (newAliases: Record<string, string>) => void;
  onClose: () => void;
  onAliasAdded?: (category: string) => void; // חדש
}

const CategoryAliasesManager: React.FC<CategoryAliasesManagerProps> = ({ aliases, categories, onChange, onClose, onAliasAdded }) => {
  const [localAliases, setLocalAliases] = useState<Record<string, string>>({ ...aliases });
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Helper: get category def by name
  const getCategoryDef = (name: string) => categories.find(c => c.name === name);
  const getTextColor = (bg: string) => {
    // Simple luminance check for contrast
    if (!bg) return '#222';
    const hex = bg.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5 ? '#fff' : '#222';
  };

  // State for adding a new alias
  const [newFrom, setNewFrom] = useState<string>('');
  const [newTo, setNewTo] = useState<string>('');
  const [showAddRow, setShowAddRow] = useState<boolean>(false);
  const [showEditWarning, setShowEditWarning] = useState(false);
  const [showSaveWarning, setShowSaveWarning] = useState(false);
  const addRowRef = useRef<HTMLTableRowElement>(null);

  // Utility: check if there are unsaved edits
  const hasUnsavedEdit = editKey !== null;

  const handleEdit = (key: string) => {
    if (editKey && editKey !== key) {
      setShowEditWarning(true);
      return;
    }
    setEditKey(key);
    setEditValue(localAliases[key] || '');
  };

  const handleSave = () => {
    if (editKey && editValue) {
      setLocalAliases(prev => ({ ...prev, [editKey]: editValue }));
      setEditKey(null);
      setEditValue('');
      setShowEditWarning(false); // Hide edit warning after save
    }
  };

  const handleCancelEdit = () => {
    setEditKey(null);
    setEditValue('');
    setShowEditWarning(false); // Hide edit warning after cancel
  };

  const handleDelete = (key: string) => {
    const updated = { ...localAliases };
    delete updated[key];
    setLocalAliases(updated);
  };

  const handleApply = () => {
    onChange(localAliases);
    onClose();
  };

  const handleAddAlias = () => {
    if (newFrom && newTo && !localAliases[newFrom]) {
      setLocalAliases(prev => ({ ...prev, [newFrom]: newTo }));
      if (onAliasAdded) onAliasAdded(newTo); // חדש
      setNewFrom('');
      setNewTo('');
    }
  };

  useEffect(() => {
    if (showAddRow && addRowRef.current) {
      addRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [showAddRow]);

  return (
    <div className="edit-dialog-overlay category-aliases-overlay">
      <div className="edit-dialog-box category-aliases-box">
        <div className="category-aliases-header">
          <h3>ניהול כללי החלפת קטגוריות</h3>
          <button
            onClick={() => {
              setNewFrom('');
              setNewTo('');
              setShowAddRow(true);
            }}
            className="category-aliases-add-btn"
            title="הוסף כלל חדש"
          >
            <span>＋</span>
          </button>
        </div>
        <div className="category-aliases-table-wrapper">
          <table className="category-aliases-table">
            <thead>
              <tr>
                <th className="category-aliases-th-from">קטגוריה מקורית</th>
                <th className="category-aliases-th-to">החלף לקטגוריה</th>
                <th className="category-aliases-th-actions"></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {showAddRow && (
                <tr ref={addRowRef} className="category-aliases-add-row">
                  <td className="category-aliases-td-from">
                    <CategorySelectOrAdd
                      categories={categories.filter(cat => !localAliases[cat.name])}
                      value={newFrom}
                      onChange={setNewFrom}
                      onAddCategory={() => {}}
                      allowAdd={false}
                      forbiddenCategoryName={newTo}
                    />
                  </td>
                  <td className="category-aliases-td-to">
                    <CategorySelectOrAdd
                      categories={categories}
                      value={newTo}
                      onChange={setNewTo}
                      onAddCategory={() => {}}
                      allowAdd={false}
                      forbiddenCategoryName={newFrom}
                    />
                  </td>
                  <td className="category-aliases-td-actions">
                    <button
                      onClick={() => {
                        handleAddAlias();
                        setShowAddRow(false);
                      }}
                      disabled={!newFrom || !newTo}
                      className="category-aliases-confirm-btn"
                      title="אשר הוספה"
                    >
                      ✔️
                    </button>
                    <button
                      onClick={() => {
                        setShowAddRow(false);
                        setNewFrom('');
                        setNewTo('');
                      }}
                      className="category-aliases-cancel-btn"
                      title="ביטול הוספה"
                    >
                      ✖️
                    </button>
                  </td>
                  <td></td>
                </tr>
              )}
              {Object.entries(localAliases).map(([from, to]) => {
                const toCat = getCategoryDef(to);
                const isEditing = editKey === from;
                return (
                  <tr key={from} style={isEditing ? { background: '#fffbe6' } : {}}>
                    <td className="category-aliases-td-from" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {from}
                    </td>
                    <td className="category-aliases-td-to">
                      {isEditing ? (
                        <CategorySelectOrAdd
                          categories={categories}
                          value={editValue}
                          onChange={setEditValue}
                          onAddCategory={() => {}}
                          allowAdd={false}
                          forbiddenCategoryName={from}
                        />
                      ) : toCat ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          background: toCat.color,
                          color: getTextColor(toCat.color),
                          borderRadius: 6,
                          padding: '2px 8px',
                          gap: 6,
                          fontWeight: 500
                        }}>
                          <span style={{ fontSize: 18 }}>{toCat.icon}</span>
                          {toCat.name}
                        </span>
                      ) : (
                        <span>{to}</span>
                      )}
                    </td>
                    <td className="category-aliases-td-actions">
                      {isEditing ? (
                        <>
                          <button onClick={handleSave} title="שמור" className="category-aliases-confirm-btn">✔️</button>
                          <button onClick={handleCancelEdit} title="ביטול" className="category-aliases-cancel-btn">✖️</button>
                        </>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: 2 }}>
                          <button onClick={() => handleEdit(from)} title="ערוך" className="category-aliases-edit-btn">✏️</button>
                          <button onClick={() => handleDelete(from)} title="מחק" className="category-aliases-delete-btn">🗑️</button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Show warning only after clicking save with unsaved edits */}
        {showSaveWarning && hasUnsavedEdit && (
          <div className="category-aliases-warning">
            יש שינויים שלא אושרו. יש לאשר כל שורה בנפרד (✔️) לפני שמירה.
          </div>
        )}
        {showEditWarning && (
          <div className="category-aliases-warning">
            יש שורה אחרת בעריכה. יש לאשר (✔️) או לבטל (✖️) לפני עריכת שורה נוספת.
            <button onClick={() => setShowEditWarning(false)} className="category-aliases-warning-close">✖️</button>
          </div>
        )}
        <div className="category-aliases-footer">
          <button onClick={onClose}>סגור</button>
          <button
            onClick={() => {
              if (hasUnsavedEdit) {
                setShowSaveWarning(true);
                return;
              }
              handleApply();
            }}
            className="category-aliases-save-btn"
          >
            שמור שינויים
          </button>
        </div>
      </div>
    </div>
  );
};

export default CategoryAliasesManager;
