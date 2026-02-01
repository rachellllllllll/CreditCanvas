import React, { useState } from 'react';
import CategorySelectOrAdd from './CategorySelectOrAdd';
import type { CategoryDef } from './CategoryManager';
import type { CategoryRule } from '../types';
import './DescriptionCategoriesMappingDialog.css';

type RuleType = 'business' | 'regex' | 'transaction' | 'amount';

interface DescriptionCategoriesMappingDialogProps {
  open: boolean;
  onClose: () => void;
  rules: CategoryRule[];
  categoriesList: CategoryDef[];
  onUpdateRule: (ruleId: string, newCategory: string) => void;
  onDeleteRule: (ruleId: string) => void;
  onAddCategory?: (cat: CategoryDef) => void;
  embedded?: boolean;
}

// Helper to determine rule type
const getRuleType = (rule: CategoryRule): RuleType => {
  if (rule.conditions.transactionId) return 'transaction';
  if (rule.conditions.descriptionRegex) return 'regex';
  // כללים עם מגבלות סכום - לא משנה אם יש גם תיאור
  if (rule.conditions.minAmount !== undefined || rule.conditions.maxAmount !== undefined) {
    return 'amount';
  }
  return 'business';
};

// Helper to format rule description for display
const formatRuleDescription = (rule: CategoryRule): { text: string; subtext?: string } => {
  const c = rule.conditions;
  if (c.transactionId) {
    // ID format: "source|fileName|sheetName|rowIndex|date|amount|description"
    const id = c.transactionId;
    const parts = id.split('|');
    
    if (parts.length >= 7) {
      // Format: source|fileName|sheetName|rowIndex|date|amount|description
      const [, , , , date, amount, description] = parts;
      return { 
        text: description || '(עסקה ספציפית)',
        subtext: `${date} | ${parseFloat(amount).toLocaleString()} ₪`
      };
    }
    
    // Fallback for old format with dashes
    return { 
      text: '(עסקה ספציפית)',
      subtext: id.length > 40 ? id.substring(0, 40) + '...' : id
    };
  }
  if (c.descriptionEquals) return { text: c.descriptionEquals };
  if (c.descriptionRegex) return { text: c.descriptionRegex };
  return { text: '(לא ידוע)' };
};

// Helper to format amount constraints
const formatAmountConstraints = (rule: CategoryRule): string | null => {
  const { minAmount, maxAmount } = rule.conditions;
  if (minAmount !== undefined && maxAmount !== undefined) {
    return `${minAmount.toLocaleString()} - ${maxAmount.toLocaleString()} ₪`;
  }
  if (minAmount !== undefined) {
    return `מעל ${minAmount.toLocaleString()} ₪`;
  }
  if (maxAmount !== undefined) {
    return `עד ${maxAmount.toLocaleString()} ₪`;
  }
  return null;
};

const RULE_TYPE_INFO: Record<RuleType, { icon: string; label: string; description: string }> = {
  business: { icon: '🏪', label: 'בית עסק', description: 'התאמה מדויקת לשם בית עסק' },
  regex: { icon: '🔍', label: 'חיפוש', description: 'התאמה לפי תבנית חיפוש' },
  transaction: { icon: '📝', label: 'עסקה בודדת', description: 'שיוך לעסקה ספציפית' },
  amount: { icon: '💰', label: 'סכום', description: 'התאמה לפי טווח סכומים' },
};

const DescriptionCategoriesMappingDialog: React.FC<DescriptionCategoriesMappingDialogProps> = ({
  open,
  onClose,
  rules,
  categoriesList,
  onUpdateRule,
  onDeleteRule,
  onAddCategory = () => {},
  embedded = false,
}) => {
  const [activeTab, setActiveTab] = useState<RuleType | 'all'>('all');
  
  if (!open) return null;

  // Filter active rules
  const activeRules = rules.filter(r => r.active);
  
  // Categorize rules by type
  const rulesByType: Record<RuleType, CategoryRule[]> = {
    business: activeRules.filter(r => getRuleType(r) === 'business'),
    regex: activeRules.filter(r => getRuleType(r) === 'regex'),
    transaction: activeRules.filter(r => getRuleType(r) === 'transaction'),
    amount: activeRules.filter(r => getRuleType(r) === 'amount'),
  };
  
  // Get rules to display based on active tab
  const displayRules = activeTab === 'all' ? activeRules : rulesByType[activeTab];

  const content = (
    <div className={`desc-mapping-box ${embedded ? 'embedded' : ''}`}>
      {!embedded && (
        <div className="desc-mapping-header">
          <h3>כללי שיוך קטגוריות</h3>
        </div>
      )}
      
      {/* Tabs for rule types */}
      <div className="desc-mapping-tabs">
        <button 
          className={`desc-mapping-tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          הכל ({activeRules.length})
        </button>
        {(Object.keys(RULE_TYPE_INFO) as RuleType[]).map(type => (
          rulesByType[type].length > 0 && (
            <button
              key={type}
              className={`desc-mapping-tab ${activeTab === type ? 'active' : ''}`}
              onClick={() => setActiveTab(type)}
              title={RULE_TYPE_INFO[type].description}
            >
              {RULE_TYPE_INFO[type].icon} {RULE_TYPE_INFO[type].label} ({rulesByType[type].length})
            </button>
          )
        ))}
      </div>
      
      <div className="desc-mapping-content">
        {/* Empty State */}
        {displayRules.length === 0 ? (
          <div className="desc-mapping-empty">
            <div className="desc-mapping-empty-icon">🏪</div>
            <div className="desc-mapping-empty-title">אין שיוכים עדיין</div>
            <div className="desc-mapping-empty-desc">
              שייך עסקאות לקטגוריות מטבלת העסקאות - השיוך יישמר אוטומטית לכל העסקאות עם אותו בית עסק
            </div>
          </div>
        ) : (
          <div className="desc-mapping-table-wrapper">
            <table className="desc-mapping-table">
              <thead>
                <tr>
                  <th className="desc-mapping-th-type">סוג</th>
                  <th className="desc-mapping-th-desc">תנאי</th>
                  <th className="desc-mapping-th-cat">קטגוריה</th>
                  <th className="desc-mapping-th-actions"></th>
                </tr>
              </thead>
              <tbody>
                {displayRules.map(rule => {
                  const ruleType = getRuleType(rule);
                  const typeInfo = RULE_TYPE_INFO[ruleType];
                  const cat = rule.category;
                  const amountConstraints = formatAmountConstraints(rule);
                  const ruleDesc = formatRuleDescription(rule);
                  
                  return (
                    <tr key={rule.id} className={`desc-mapping-row-${ruleType}`}>
                      <td className="desc-mapping-td-type" title={typeInfo.description}>
                        <span className="desc-mapping-type-badge">
                          {typeInfo.icon}
                        </span>
                      </td>
                      <td className="desc-mapping-td-desc">
                        <div className="desc-mapping-condition">
                          <span className="desc-mapping-condition-text">
                            {ruleDesc.text}
                          </span>
                          {ruleDesc.subtext && (
                            <span className="desc-mapping-subtext">
                              {ruleDesc.subtext}
                            </span>
                          )}
                          {amountConstraints && (
                            <span className="desc-mapping-amount-badge">
                              {amountConstraints}
                            </span>
                          )}
                          {ruleType === 'regex' && (
                            <span className="desc-mapping-regex-badge">regex</span>
                          )}
                        </div>
                      </td>
                      <td className="desc-mapping-td-cat">
                        <CategorySelectOrAdd
                          categories={categoriesList}
                          value={cat}
                          onChange={(val) => {
                            if (val && val !== cat) {
                              onUpdateRule(rule.id, val);
                            }
                          }}
                          onAddCategory={onAddCategory}
                          allowAdd={true}
                        />
                      </td>
                      <td className="desc-mapping-td-actions">
                        <button
                          onClick={() => onDeleteRule(rule.id)}
                          className="desc-mapping-delete-btn"
                          title="מחק"
                        >
                          🗑️
                        </button>
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
        <div className="desc-mapping-footer">
          <button onClick={onClose}>סגור</button>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="edit-dialog-overlay desc-mapping-overlay">
      {content}
    </div>
  );
};

export default DescriptionCategoriesMappingDialog;
