import React, { useState, useEffect } from 'react';
import IconPickerPopup from './IconPickerPopup';
import ColorPalettePicker from './ColorPalettePicker';
import type { CategoryDef } from './CategoryManager';
import './EditCategoryDialog.css';

interface EditCategoryDefDialogProps {
  categoryName: string;
  categoryDef: CategoryDef;
  categories: CategoryDef[];
  onSave: (oldName: string, newDef: CategoryDef) => void;
  onCancel: () => void;
  isLoading?: boolean;
}


const EditCategoryDefDialog: React.FC<EditCategoryDefDialogProps> = ({
  categoryName,
  categoryDef,
  categories,
  onSave,
  onCancel,
  isLoading = false,
}) => {
  const [name, setName] = useState(categoryDef.name);
  const [icon, setIcon] = useState(categoryDef.icon);
  const [color, setColor] = useState(categoryDef.color);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [mergeTargetName, setMergeTargetName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);

  // Escape key to close (unless loading)
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        if (showIconPicker) {
          setShowIconPicker(false);
        } else if (showMergeConfirm) {
          setShowMergeConfirm(false);
        } else {
          onCancel();
        }
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onCancel, isLoading, showIconPicker, showMergeConfirm]);

  // Prevent body scroll when dialog is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const trimmedName = name.trim();
  const nameChanged = trimmedName !== categoryName;
  const existingCategory = nameChanged ? categories.find(c => c.name === trimmedName && c.name !== categoryName) : null;
  const isValid = trimmedName.length > 0 && !isLoading;
  const hasChanges = trimmedName !== categoryDef.name || icon !== categoryDef.icon || color !== categoryDef.color;
  const nameEmpty = nameTouched && trimmedName.length === 0;

  const handleSave = () => {
    if (!isValid) return;
    
    // If renaming to an existing category → show merge confirmation
    if (existingCategory) {
      setMergeTargetName(trimmedName);
      setShowMergeConfirm(true);
      return;
    }

    onSave(categoryName, { name: trimmedName, icon, color });
  };

  const handleMergeConfirm = () => {
    onSave(categoryName, { name: mergeTargetName, icon: existingCategory!.icon, color: existingCategory!.color });
  };

  return (
    <div className="edit-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-catdef-dialog-title">
      <div className="edit-dialog-box ecdd-dialog-box" onClick={e => e.stopPropagation()}>
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

        <h3 id="edit-catdef-dialog-title">✏️ עריכת קטגוריה</h3>

        {/* Merge confirmation */}
        {showMergeConfirm && (
          <div className="ecdd-merge-box" role="alert">
            <div className="ecdd-merge-title">
              ⚠️ הקטגוריה '{mergeTargetName}' כבר קיימת
            </div>
            <div className="ecdd-merge-desc">
              לאחד את שתי הקטגוריות? כל העסקאות, הכללים והכינויים יועברו ל-'{mergeTargetName}'.
            </div>
            <div className="ecdd-merge-actions">
              <button
                onClick={() => setShowMergeConfirm(false)}
                className="edit-dialog-cancel-btn"
                disabled={isLoading}
              >
                ביטול
              </button>
              <button
                onClick={handleMergeConfirm}
                className="edit-dialog-save-btn ecdd-merge-btn"
                disabled={isLoading}
              >
                {isLoading ? '⏳ מאחד...' : '🔀 אחד קטגוריות'}
              </button>
            </div>
          </div>
        )}

        {/* Edit form - hide when merge confirm is shown */}
        {!showMergeConfirm && (
          <>
            {/* Name */}
            <div className="ecdd-field-group">
              <label htmlFor="ecdd-name-input" className="ecdd-label">
                שם הקטגוריה
              </label>
              <input
                id="ecdd-name-input"
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setNameTouched(true); }}
                onBlur={() => setNameTouched(true)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                autoFocus
                className={`ecdd-name-input${nameEmpty ? ' ecdd-input-error' : ''}`}
              />
              {nameEmpty && (
                <div className="ecdd-error-msg" role="alert">
                  שם הקטגוריה לא יכול להיות ריק
                </div>
              )}
              {existingCategory && (
                <div className="ecdd-warning-msg">
                  ⚠️ קטגוריה עם שם זה כבר קיימת — שמירה תאחד את שתי הקטגוריות
                </div>
              )}
            </div>

            {/* Icon + Color */}
            <div className="ecdd-icon-color-row">
              {/* Icon selector */}
              <div className="ecdd-icon-section">
                <label className="ecdd-label-small">
                  אייקון
                </label>
                <button
                  onClick={() => setShowIconPicker(true)}
                  className="ecdd-icon-btn"
                  aria-label={`בחר אייקון — נוכחי: ${icon}`}
                  title="בחר אייקון"
                >
                  <span className="ecdd-icon-circle" style={{ background: color || '#6366f1' }}>
                    {icon}
                  </span>
                </button>
              </div>

              {/* Color picker */}
              <div className="ecdd-color-section">
                <ColorPalettePicker value={color} onChange={setColor} />
              </div>
            </div>

            {/* Rich icon picker popup (Teams-style) */}
            <IconPickerPopup
              isOpen={showIconPicker}
              currentIcon={icon}
              previewColor={color}
              onSelect={setIcon}
              onClose={() => setShowIconPicker(false)}
            />

            {/* Action buttons */}
            <div className="edit-dialog-actions ecdd-actions">
              <button
                onClick={onCancel}
                className="edit-dialog-cancel-btn"
                disabled={isLoading}
              >
                ביטול
              </button>
              <button
                onClick={handleSave}
                className="edit-dialog-save-btn"
                disabled={!isValid || !trimmedName || !hasChanges}
                title={!hasChanges ? 'לא בוצעו שינויים' : ''}
              >
                {isLoading ? '⏳ שומר...' : '💾 שמור'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EditCategoryDefDialog;
