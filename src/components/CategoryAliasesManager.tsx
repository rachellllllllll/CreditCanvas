import React, { useState, useRef, useEffect } from 'react';
import CategorySelectOrAdd from './CategorySelectOrAdd';
import type { CategoryDef } from './CategoryManager';
import './CategoryAliasesManager.css';

interface CategoryAliasesManagerProps {
  aliases: Record<string, string>;
  categories: CategoryDef[];
  onChange: (newAliases: Record<string, string>) => void;
  onClose: () => void;
  onAliasAdded?: (category: string) => void;
  embedded?: boolean;
}

const CategoryAliasesManager: React.FC<CategoryAliasesManagerProps> = ({ aliases, categories, onChange, onClose, onAliasAdded, embedded = false }) => {
  // Helper: get category def by name
  const getCategoryDef = (name: string) => categories.find(c => c.name === name);

  // State for adding a new alias
  const [newFrom, setNewFrom] = useState<string>('');
  const [newTo, setNewTo] = useState<string>('');
  const [showAddRow, setShowAddRow] = useState<boolean>(false);
  const addRowRef = useRef<HTMLTableRowElement>(null);

  // Update alias value directly (auto-save)
  const handleUpdateAlias = (from: string, newTo: string) => {
    if (newTo && newTo !== from) {
      onChange({ ...aliases, [from]: newTo });
    }
  };

  const handleDelete = (key: string) => {
    const updated = { ...aliases };
    delete updated[key];
    onChange(updated);
  };

  const handleAddAlias = () => {
    if (newFrom && newTo && !aliases[newFrom]) {
      onChange({ ...aliases, [newFrom]: newTo });
      if (onAliasAdded) onAliasAdded(newTo);
      setNewFrom('');
      setNewTo('');
    }
  };

  useEffect(() => {
    if (showAddRow && addRowRef.current) {
      addRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [showAddRow]);

  const content = (
    <div className={`edit-dialog-box category-aliases-box ${embedded ? 'embedded' : ''}`}>
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
        
        <div className="category-aliases-content">
          {/* Empty State */}
          {Object.keys(aliases).length === 0 && !showAddRow ? (
            <div className="category-aliases-empty">
              <div className="category-aliases-empty-icon">🔄</div>
              <div className="category-aliases-empty-title">אין כללי החלפה עדיין</div>
              <div className="category-aliases-empty-desc">
                הגדר כללים להחלפה אוטומטית של קטגוריות - לדוגמה, החלף את "מזון" ל"סופר"
              </div>
              <button className="category-aliases-empty-btn" onClick={() => {
                setNewFrom('');
                setNewTo('');
                setShowAddRow(true);
              }}>
                + הוסף כלל ראשון
              </button>
            </div>
          ) : (
            <div className="category-aliases-table-wrapper">
              <table className="category-aliases-table">
                <thead>
                  <tr>
                    <th className="category-aliases-th-from">קטגוריה מקורית</th>
                    <th className="category-aliases-th-to">החלף לקטגוריה</th>
                    <th className="category-aliases-th-actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {showAddRow && (
                    <tr ref={addRowRef} className="category-aliases-add-row">
                      <td className="category-aliases-td-from">
                        <CategorySelectOrAdd
                          categories={categories.filter(cat => !aliases[cat.name])}
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
                    </tr>
                  )}
                  {Object.entries(aliases).map(([from, to]) => {
                    const toCat = getCategoryDef(to);
                    return (
                      <tr key={from}>
                        <td className="category-aliases-td-from" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {from}
                        </td>
                        <td className="category-aliases-td-to">
                          <CategorySelectOrAdd
                            categories={categories}
                            value={to}
                            onChange={(newTo) => handleUpdateAlias(from, newTo)}
                            onAddCategory={() => {}}
                            allowAdd={false}
                            forbiddenCategoryName={from}
                            defaultIcon={toCat?.icon}
                            defaultColor={toCat?.color}
                          />
                        </td>
                        <td className="category-aliases-td-actions">
                          <button onClick={() => handleDelete(from)} title="מחק" className="category-aliases-delete-btn">🗑️</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {!embedded && (
          <div className="category-aliases-footer">
            <button onClick={onClose} className="category-aliases-close-btn">סגור</button>
          </div>
        )}
      </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="edit-dialog-overlay category-aliases-overlay">
      {content}
    </div>
  );
};

export default CategoryAliasesManager;
