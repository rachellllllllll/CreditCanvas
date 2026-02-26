import React, { useEffect } from 'react';
import './EditCategoryDialog.css';

interface ConfirmDeleteEmptyDialogProps {
  categoryName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const ConfirmDeleteEmptyDialog: React.FC<ConfirmDeleteEmptyDialogProps> = ({
  categoryName,
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
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

  return (
    <div className="edit-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-delete-empty-title">
      <div className="edit-dialog-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
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

        <h3 id="confirm-delete-empty-title">🗑️ מחיקת קטגוריה</h3>

        <div style={{
          fontSize: 15,
          color: '#334155',
          margin: '16px 0 24px',
          textAlign: 'center',
          direction: 'rtl',
        }}>
          למחוק את הקטגוריה <strong>'{categoryName}'</strong>?
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
            onClick={onConfirm}
            className="edit-dialog-save-btn delete-btn-danger"
            disabled={isLoading}
            style={{
              background: isLoading ? '#fca5a5' : '#dc2626',
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoading ? '⏳ מוחק...' : '🗑️ מחק'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDeleteEmptyDialog;
