import React, { useState } from 'react';
import LoginHistory from './LoginHistory';
import DescriptionCategoriesMappingDialog from './DescriptionCategoriesMappingDialog';
import type { CategoryDef } from './CategoryManager';

interface SettingsMenuProps {
  open: boolean;
  onClose: () => void;
  onOpenCategoryManager: () => void;
  dirHandle: any;
  onOpenCategoryAliasesManager: () => void;
  descToCategory?: Record<string, string>;
  categoriesList: CategoryDef[];
  onChangeMapping: (desc: string, newCategory: string) => void;
  onAddCategory?: (cat: CategoryDef) => void;
}

const SettingsMenu: React.FC<SettingsMenuProps> = ({ open, onClose, onOpenCategoryManager, dirHandle, onOpenCategoryAliasesManager, descToCategory = {}, categoriesList, onChangeMapping, onAddCategory }) => {
  const [showDescCatDialog, setShowDescCatDialog] = useState(false);
  if (!open || !dirHandle) return null;
  return (
    <div className={`settings-menu${open ? ' open' : ''}`}>
      <div className="settings-menu-header">
        <span>הגדרות</span>
        <button onClick={onClose} className="settings-menu-close" title="סגור">✖️</button>
      </div>
      <div className="settings-menu-content">
        <button
          onClick={onOpenCategoryManager}
          className="settings-menu-btn"
        >
          ניהול קטגוריות
        </button>
        <button
          onClick={onOpenCategoryAliasesManager}
          className="settings-menu-btn"
        >
          ניהול כללי החלפת קטגוריות
        </button>
        <button
          onClick={() => setShowDescCatDialog(true)}
          className="settings-menu-btn"
        >
          ניהול שיוך בית עסק לקטגוריה
        </button>
        <div style={{ borderTop: '1px solid #e0e7ef', marginTop: 12, paddingTop: 12 }} />
        <LoginHistory />
        {/* אפשר להוסיף כאן עוד אפשרויות הגדרות בעתיד */}
      </div>
      <DescriptionCategoriesMappingDialog
        open={showDescCatDialog}
        onClose={() => setShowDescCatDialog(false)}
        descToCategory={descToCategory}
        categoriesList={categoriesList}
        onChangeMapping={onChangeMapping}
        onAddCategory={onAddCategory}
      />
    </div>
  );
};

export default SettingsMenu;
