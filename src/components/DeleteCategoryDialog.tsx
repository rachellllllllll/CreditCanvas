import React, { useState, useEffect } from 'react';
import CategorySelectOrAdd from './CategorySelectOrAdd';
import type { CategoryDef } from './CategoryManager';
import './EditCategoryDialog.css';

interface DeleteCategoryDialogProps {
  categoryName: string;
  transactionsCount: number;
  rulesCount: number;
  categories: CategoryDef[];
  onConfirm: (targetCategory: string) => void;
  onCancel: () => void;
  onAddCategory: (cat: CategoryDef) => void;
  isLoading?: boolean;
}

const DeleteCategoryDialog: React.FC<DeleteCategoryDialogProps> = ({
  categoryName,
  transactionsCount,
  rulesCount,
  categories,
  onConfirm,
  onCancel,
  onAddCategory,
  isLoading = false,
}) => {
  const [targetCategory, setTargetCategory] = useState<string>('');

  // Escape key to close (unless loading)
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onCancel();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onCancel, isLoading]);

  // Prevent body scroll when dialog is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const availableCategories = categories.filter(c => c.name !== categoryName);
  const hasNoAlternatives = availableCategories.length === 0 && !targetCategory;
  const canConfirm = !!targetCategory && !isLoading;

  return (
    <div className="edit-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-cat-dialog-title">
      <div className="edit-dialog-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        {/* Close button */}
        <button
          className="edit-dialog-close-btn"
          onClick={onCancel}
          disabled={isLoading}
          aria-label="סגור דיאלוג (Escape)"
          title="סגור (Esc)"
        >
          ✕
        </button>

        <h3 id="delete-cat-dialog-title" style={{ color: '#dc2626' }}>
          🗑️ מחיקת קטגוריה: {categoryName}
        </h3>

        {/* Warning */}
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 8,
          padding: '12px 16px',
          margin: '12px 0',
          fontSize: 14,
          color: '#991b1b',
          direction: 'rtl',
        }}>
          ⚠️ {transactionsCount > 0 || rulesCount > 0 ? (
            <>
              <strong>{transactionsCount}</strong> עסקאות ו-<strong>{rulesCount}</strong> כללים יועברו לקטגוריה שתבחר
            </>
          ) : (
            <>הקטגוריה תימחק וכל התלויות שלה יועברו לקטגוריה שתבחר</>
          )}
        </div>

        {/* Single category warning */}
        {hasNoAlternatives && (
          <div style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 8,
            padding: '12px 16px',
            margin: '12px 0',
            fontSize: 14,
            color: '#92400e',
            direction: 'rtl',
          }}>
            💡 אין קטגוריות נוספות. צור קטגוריה חדשה כדי להעביר את העסקאות
          </div>
        )}

        {/* Category selector */}
        <div className="edit-dialog-category-section" style={{ margin: '16px 0' }}>
          <label className="edit-dialog-category-label-main">
            🏷️ קטגוריה יעד:
          </label>
          <CategorySelectOrAdd
            categories={categories}
            value={targetCategory || null}
            onChange={(catName) => setTargetCategory(catName)}
            onAddCategory={(cat) => {
              onAddCategory(cat);
              setTargetCategory(cat.name);
            }}
            allowAdd={true}
            placeholder="בחר קטגוריה יעד..."
            forbiddenCategoryName={categoryName}
          />
        </div>

        {/* Action buttons */}
        <div className="edit-dialog-actions">
          <button
            onClick={onCancel}
            className="edit-dialog-cancel-btn"
            disabled={isLoading}
          >
            ביטול
          </button>
          <button
            onClick={() => canConfirm && onConfirm(targetCategory)}
            className="edit-dialog-save-btn delete-btn-danger"
            disabled={!canConfirm}
            title={!targetCategory ? 'בחר קטגוריה יעד להפעלת הכפתור' : ''}
            style={{
              background: canConfirm ? '#dc2626' : '#fca5a5',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
            }}
          >
            {isLoading ? '⏳ מוחק...' : '🗑️ מחק והעבר'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteCategoryDialog;
