import React, { useState } from 'react';
import DescriptionCategoriesMappingDialog from './DescriptionCategoriesMappingDialog';
import CategoryManager, { type CategoryDef } from './CategoryManager';
import CategoryAliasesManager from './CategoryAliasesManager';
import type { CreditDetail, CategoryRule } from '../types';

type ActivePanel = 'main' | 'categories' | 'aliases' | 'businessMapping';

interface SettingsMenuProps {
  open: boolean;
  onClose: () => void;
  dirHandle: FileSystemDirectoryHandle;
  categoryRules: CategoryRule[];
  categoriesList: CategoryDef[];
  onUpdateRule: (ruleId: string, newCategory: string) => void;
  onDeleteRule: (ruleId: string) => void;
  onAddCategory?: (cat: CategoryDef) => void;
  // Props needed for CategoryManager
  onCategoriesChange: (cats: CategoryDef[]) => void;
  categoriesCount?: Record<string, number>;
  transactionsByCategory?: Record<string, CreditDetail[]>;
  // Props needed for CategoryAliasesManager
  categoryAliases?: Record<string, string>;
  onAliasesChange?: (aliases: Record<string, string>) => void;
  // חדש: עריכת כלל (פתיחת GlobalSearchModal במצב עריכה)
  onEditRule?: (rule: CategoryRule) => void;
  // חדש: הפעלה/השבתה של כלל (מחיקה רכה)
  onToggleRule?: (ruleId: string, active: boolean) => void;
}

const SettingsMenu: React.FC<SettingsMenuProps> = ({ 
  open, 
  onClose, 
  dirHandle, 
  categoryRules = [], 
  categoriesList, 
  onUpdateRule,
  onDeleteRule,
  onAddCategory,
  onCategoriesChange,
  categoriesCount = {},
  transactionsByCategory = {},
  categoryAliases = {},
  onAliasesChange,
  onEditRule,
  onToggleRule
}) => {
  const [activePanel, setActivePanel] = useState<ActivePanel>('main');
  
  if (!open || !dirHandle) return null;

  const handleBack = () => {
    setActivePanel('main');
  };

  const handleClose = () => {
    setActivePanel('main');
    onClose();
  };

  // Header component for sub-panels
  const SubPanelHeader = ({ title, icon }: { title: string; icon: string }) => (
    <div className="settings-menu-header settings-subpanel-header">
      <button onClick={handleBack} className="settings-back-btn" title="חזרה">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
      <div className="settings-menu-title">
        <span>{icon}</span>
        <span>{title}</span>
      </div>
      <button onClick={handleClose} className="settings-menu-close" title="סגור">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
  
  return (
    <>
      {/* Overlay */}
      <div className="settings-menu-overlay" onClick={handleClose} />
      
      {/* Container for panels */}
      <div className="settings-panels-container">
        {/* Main Panel */}
        <div className={`settings-panel settings-panel-main ${activePanel === 'main' ? 'active' : 'hidden-right'}`}>
          <div className="settings-menu-header">
            <div className="settings-menu-title">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
              </svg>
              <span>הגדרות מתקדמות</span>
            </div>
            <button onClick={handleClose} className="settings-menu-close" title="סגור">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          
          <div className="settings-menu-content">
            <div className="settings-section">
              <div className="settings-section-title">ניהול קטגוריות</div>
              
              <button
                onClick={() => setActivePanel('categories')}
                className="settings-menu-btn"
              >
                <span className="settings-btn-icon">🏷️</span>
                <div className="settings-btn-content">
                  <span className="settings-btn-label">ניהול קטגוריות</span>
                  <span className="settings-btn-desc">הוספה, עריכה ומחיקה של קטגוריות</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="settings-btn-arrow">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
              
              <button
                onClick={() => setActivePanel('aliases')}
                className="settings-menu-btn"
              >
                <span className="settings-btn-icon">🔄</span>
                <div className="settings-btn-content">
                  <span className="settings-btn-label">כללי החלפת קטגוריות</span>
                  <span className="settings-btn-desc">הגדרת כללים אוטומטיים להחלפה</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="settings-btn-arrow">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
              
              <button
                onClick={() => setActivePanel('businessMapping')}
                className="settings-menu-btn"
              >
                <span className="settings-btn-icon">🏪</span>
                <div className="settings-btn-content">
                  <span className="settings-btn-label">שיוך בית עסק לקטגוריה</span>
                  <span className="settings-btn-desc">קישור בתי עסק לקטגוריות קבועות</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="settings-btn-arrow">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Categories Panel */}
        <div className={`settings-panel settings-panel-sub ${activePanel === 'categories' ? 'active' : 'hidden-left'}`}>
          <SubPanelHeader title="ניהול קטגוריות" icon="🏷️" />
          <div className="settings-panel-content">
            <CategoryManager
              categories={categoriesList}
              onChange={onCategoriesChange}
              onClose={handleBack}
              categoriesCount={categoriesCount}
              transactionsByCategory={transactionsByCategory}
              embedded={true}
            />
          </div>
        </div>

        {/* Aliases Panel */}
        <div className={`settings-panel settings-panel-sub ${activePanel === 'aliases' ? 'active' : 'hidden-left'}`}>
          <SubPanelHeader title="כללי החלפת קטגוריות" icon="🔄" />
          <div className="settings-panel-content">
            <CategoryAliasesManager
              aliases={categoryAliases}
              categories={categoriesList}
              onChange={onAliasesChange || (() => {})}
              onClose={handleBack}
              embedded={true}
            />
          </div>
        </div>

        {/* Business Mapping Panel */}
        <div className={`settings-panel settings-panel-sub ${activePanel === 'businessMapping' ? 'active' : 'hidden-left'}`}>
          <SubPanelHeader title="שיוך בית עסק לקטגוריה" icon="🏪" />
          <div className="settings-panel-content">
            <DescriptionCategoriesMappingDialog
              open={true}
              onClose={handleBack}
              rules={categoryRules}
              categoriesList={categoriesList}
              onUpdateRule={onUpdateRule}
              onDeleteRule={onDeleteRule}
              onAddCategory={onAddCategory}
              embedded={true}
              onEditRule={onEditRule}
              onToggleRule={onToggleRule}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default SettingsMenu;
