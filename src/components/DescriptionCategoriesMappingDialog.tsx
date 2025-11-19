import React, { useState } from 'react';
import CategorySelectOrAdd from './CategorySelectOrAdd';
import type { CategoryDef } from './CategoryManager';

interface DescriptionCategoriesMappingDialogProps {
  open: boolean;
  onClose: () => void;
  descToCategory: Record<string, string>;
  categoriesList: CategoryDef[];
  onChangeMapping: (desc: string, newCategory: string) => void;
  onAddCategory?: (cat: CategoryDef) => void;
}

const DescriptionCategoriesMappingDialog: React.FC<DescriptionCategoriesMappingDialogProps> = ({
  open,
  onClose,
  descToCategory,
  categoriesList,
  onChangeMapping,
  onAddCategory = () => {},
}) => {
  const [editRow, setEditRow] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  if (!open) return null;
  return (
    <div className="edit-dialog-overlay" style={{ zIndex: 3000 }}>
      <div className="edit-dialog-box" style={{ minWidth: 420, maxWidth: 600, maxHeight: '80vh', overflowY: 'auto' }}>
        <h3 style={{ marginBottom: 16 }}>ניהול שיוך בית עסק לקטגוריה</h3>
        <table style={{ width: '100%', marginBottom: 16, fontSize: 15 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'right' }}>תיאור</th>
              <th style={{ textAlign: 'right' }}>קטגוריה</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(descToCategory).length === 0 && (
              <tr><td colSpan={3} style={{ textAlign: 'center', color: '#888' }}>אין מיפויים</td></tr>
            )}
            {Object.entries(descToCategory).map(([desc, cat]) => (
              <tr key={desc}>
                <td style={{ direction: 'rtl', wordBreak: 'break-all' }}>{desc}</td>
                <td style={{ direction: 'rtl', wordBreak: 'break-all' }}>
                  {editRow === desc ? (
                    <CategorySelectOrAdd
                      categories={categoriesList}
                      value={editValue}
                      onChange={setEditValue}
                      onAddCategory={onAddCategory}
                      allowAdd={true}
                    />
                  ) : (
                    cat
                  )}
                </td>
                <td style={{ minWidth: 80 }}>
                  {editRow === desc ? (
                    <>
                      <button
                        onClick={() => {
                          if (editValue) onChangeMapping(desc, editValue);
                          setEditRow(null);
                        }}
                        style={{ marginLeft: 8, padding: '6px 14px', borderRadius: 4, border: 'none', background: '#4CAF50', color: '#fff', fontWeight: 700 }}
                        disabled={!editValue || editValue === cat}
                      >שמור</button>
                      <button
                        onClick={() => setEditRow(null)}
                        style={{ padding: '6px 14px', borderRadius: 4, border: '1.5px solid #7ecbff', background: '#fff', color: '#36A2EB', fontWeight: 700 }}
                      >ביטול</button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setEditRow(desc); setEditValue(cat); }}
                      style={{ padding: '6px 14px', borderRadius: 4, border: '1.5px solid #7ecbff', background: '#fff', color: '#36A2EB', fontWeight: 700 }}
                    >ערוך</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 4, border: '1.5px solid #7ecbff', background: '#fff', color: '#36A2EB', fontWeight: 700, minWidth: 80 }}>סגור</button>
        </div>
      </div>
    </div>
  );
};

export default DescriptionCategoriesMappingDialog;
