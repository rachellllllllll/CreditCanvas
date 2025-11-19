import React, { useState } from 'react';
import CategorySelectOrAdd from './CategorySelectOrAdd';
import EditCategoryDialog from './EditCategoryDialog';
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

const NewCategoriesTablePrompt: React.FC<NewCategoriesTablePromptProps> = ({ names, categoriesList, onConfirm, onCancel, allDetails = [], handleApplyCategoryChange }) => {
  const [selectedCats, setSelectedCats] = useState<Record<string, CategoryDef | null>>(() => Object.fromEntries(names.map(n => [n, null])));
  const [localCategories, setLocalCategories] = useState<CategoryDef[]>([...categoriesList]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // דיאלוג עריכת קטגוריה לעסקה בודדת
  const [editDialog, setEditDialog] = useState<null | { tx: CreditDetail; onSave: (newCat: string) => void; transaction?: CreditDetail; applyToAll?: boolean; candidates?: CreditDetail[] }>(null);

  // Handle category selection or creation
  const handleCategoryChange = (name: string, catName: string) => {
    const found = localCategories.find(c => c.name === catName);
    if (found) {
      setSelectedCats(prev => ({ ...prev, [name]: found }));
    }
  };
  const handleAddCategory = (name: string, cat: CategoryDef) => {
    setLocalCategories(prev => [...prev, cat]);
    setSelectedCats(prev => ({ ...prev, [name]: cat }));
  };

  const handleConfirm = () => {
    const mapping: Record<string, CategoryDef> = {};
    names.forEach(n => {
      if (selectedCats[n]) mapping[n] = selectedCats[n]!;
    });
    onConfirm(mapping);
  };

  return (
    <div className="edit-dialog-overlay">
      <div className="edit-dialog-box new-cats-dialog-box">
        <h3 className="new-cats-title">
          נמצאו {names.length} קטגוריות חדשות
        </h3>
        <div className="new-cats-table-outer-wrapper">
          <table className="new-cats-table">
            <tbody>
              {names.map(name => (
                <React.Fragment key={name}>
                  <tr>
                    <td className="new-cats-table-name">{name}</td>
                    <td className="new-cats-table-select">
                      <CategorySelectOrAdd
                        categories={localCategories}
                        value={selectedCats[name]?.name || ''}
                        onChange={catName => handleCategoryChange(name, catName)}
                        onAddCategory={cat => handleAddCategory(name, cat)}
                        allowAdd={true}
                        placeholder={name}
                      />
                    </td>
                    <td className="new-cats-table-icon">
                      {selectedCats[name]?.icon && <span className="new-cats-icon">{selectedCats[name]?.icon}</span>}
                    </td>
                    <td className="new-cats-table-color">
                      {selectedCats[name]?.color && <span className="new-cats-color" style={{ background: selectedCats[name]?.color }} />}
                    </td>
                    <td className="new-cats-table-expand">
                      <button className="new-cats-table-expand-btn" onClick={() => setExpanded(e => ({ ...e, [name]: !e[name] }))}>
                        {expanded[name] ? 'הסתר עסקאות' : 'הצג עסקאות'}
                      </button>
                    </td>
                  </tr>
                  {expanded[name] && (
                    <tr>
                      <td colSpan={5} className="new-cats-table-details-cell">
                        <div className="new-cats-table-details-wrapper">
                          <table className="new-cats-table-details">
                            <thead>
                              <tr>
                                <th>תאריך</th>
                                <th>תיאור</th>
                                <th>סכום</th>
                                <th>קטגוריה</th>
                              </tr>
                            </thead>
                            <tbody>
                              {allDetails.filter(d => d.category === name).map((tx, idx) => (
                                <tr key={tx.id + idx}>
                                  <td>{tx.date}</td>
                                  <td>{tx.description}</td>
                                  <td>{tx.amount.toLocaleString()}</td>
                                  <td>
                                    <span>{tx.category}</span>
                                    <button
                                      className="new-cats-table-edit-btn"
                                      onClick={() => {
                                        // Find all candidates with the same description
                                        const candidates = allDetails.filter(d2 => d2.description === tx.description);
                                        setEditDialog({
                                          tx,
                                          transaction: tx,
                                          candidates,
                                          applyToAll: candidates.length > 1,
                                          onSave: (newCat) => {
                                            tx.category = newCat;
                                            setEditDialog(null);
                                          }
                                        });
                                      }}
                                    >שינוי קטגוריה</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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
          <button className="new-cats-cancel-btn" onClick={onCancel}>ביטול</button>
          <button className="new-cats-confirm-btn" onClick={handleConfirm}>אישור</button>
        </div>
        {/* EditCategoryDialog for per-transaction editing */}
        <EditCategoryDialog
          open={!!editDialog}
          editDialog={editDialog}
          categoriesList={localCategories}
          setEditDialog={setEditDialog}
          handleApplyCategoryChange={() => handleApplyCategoryChange(editDialog)}
          onAddCategory={cat => setLocalCategories(prev => [...prev, cat])}
        />
      </div>
    </div>
  );
};

export default NewCategoriesTablePrompt;
