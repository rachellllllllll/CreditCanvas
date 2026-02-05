import React, { useState } from 'react';
import CategorySelectOrAdd from './CategorySelectOrAdd';
import type { CategoryDef } from './CategoryManager';
import type { CategoryRule } from '../types';
import './DescriptionCategoriesMappingDialog.css';

type RuleType = 'business' | 'regex' | 'transaction' | 'amount' | 'advanced';

interface DescriptionCategoriesMappingDialogProps {
  open: boolean;
  onClose: () => void;
  rules: CategoryRule[];
  categoriesList: CategoryDef[];
  onUpdateRule: (ruleId: string, newCategory: string) => void;
  onDeleteRule: (ruleId: string) => void;
  onAddCategory?: (cat: CategoryDef) => void;
  embedded?: boolean;
  // חדש: עריכת כלל
  onEditRule?: (rule: CategoryRule) => void;
  // חדש: הפיכת כלל לפעיל/לא פעיל (מחיקה רכה)
  onToggleRule?: (ruleId: string, active: boolean) => void;
}

// Helper to determine rule type
const getRuleType = (rule: CategoryRule): RuleType => {
  if (rule.conditions.transactionId) return 'transaction';
  // כללים עם תנאים מתקדמים (dates)
  const hasAdvanced = rule.conditions.dateFrom || rule.conditions.dateTo;
  if (hasAdvanced) return 'advanced';
  if (rule.conditions.descriptionRegex) return 'regex';
  // כללים עם מגבלות סכום - לא משנה אם יש גם תיאור
  if (rule.conditions.minAmount !== undefined || rule.conditions.maxAmount !== undefined) {
    return 'amount';
  }
  return 'business';
};

// Helper to format rule description for display
const formatRuleDescription = (rule: CategoryRule): { text: string; subtext?: string; badges?: string[] } => {
  const c = rule.conditions;
  const badges: string[] = [];
  
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
  
  // Build badges for advanced conditions
  if (c.dateFrom || c.dateTo) {
    const fromStr = c.dateFrom ? c.dateFrom.split('-').reverse().join('/') : '';
    const toStr = c.dateTo ? c.dateTo.split('-').reverse().join('/') : '';
    if (fromStr && toStr) {
      badges.push(`📅 ${fromStr} - ${toStr}`);
    } else if (fromStr) {
      badges.push(`📅 מ-${fromStr}`);
    } else if (toStr) {
      badges.push(`📅 עד ${toStr}`);
    }
  }
  
  let text = '';
  if (c.descriptionEquals) {
    text = c.descriptionEquals;
  } else if (c.descriptionRegex) {
    text = `"${c.descriptionRegex}"`;
  } else if (badges.length > 0) {
    text = '(תנאים מתקדמים)';
  } else {
    text = '(לא ידוע)';
  }
  
  return { text, badges: badges.length > 0 ? badges : undefined };
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
  advanced: { icon: '⚙️', label: 'מתקדם', description: 'כלל עם תנאים מתקדמים (מקור, כיוון, תאריכים)' },
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
  onEditRule,
  onToggleRule,
}) => {
  const [filterType, setFilterType] = useState<RuleType | 'all'>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'category' | 'condition'>('category');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  
  if (!open) return null;

  // Filter active and inactive rules
  const activeRules = rules.filter(r => r.active);
  const inactiveRules = rules.filter(r => !r.active);
  
  // פונקציית סינון לפי חיפוש
  const filterBySearch = (rulesToFilter: CategoryRule[]) => {
    if (!searchQuery.trim()) return rulesToFilter;
    const query = searchQuery.toLowerCase();
    return rulesToFilter.filter(rule => {
      const desc = formatRuleDescription(rule);
      const matchesCondition = desc.text.toLowerCase().includes(query) || 
                               (desc.subtext && desc.subtext.toLowerCase().includes(query));
      const matchesCategory = rule.category.toLowerCase().includes(query);
      return matchesCondition || matchesCategory;
    });
  };
  
  // פונקציה להדגשת טקסט חיפוש בתוצאות
  const highlightText = (text: string): React.ReactNode => {
    if (!searchQuery.trim()) return text;
    const query = searchQuery.toLowerCase();
    const index = text.toLowerCase().indexOf(query);
    if (index === -1) return text;
    
    const before = text.substring(0, index);
    const match = text.substring(index, index + searchQuery.length);
    const after = text.substring(index + searchQuery.length);
    
    return (
      <>
        {before}
        <mark className="desc-mapping-highlight">{match}</mark>
        {after}
      </>
    );
  };
  
  // בדיקה האם הקטגוריה תואמת לחיפוש
  const categoryMatchesSearch = (category: string): boolean => {
    if (!searchQuery.trim()) return false;
    return category.toLowerCase().includes(searchQuery.toLowerCase());
  };
  
  // Get rules to display based on filter type and showInactive
  let displayRules: CategoryRule[];
  const baseRules = showInactive ? inactiveRules : activeRules;
  if (filterType === 'all') {
    displayRules = filterBySearch(baseRules);
  } else {
    const filteredByType = baseRules.filter(r => getRuleType(r) === filterType);
    displayRules = filterBySearch(filteredByType);
  }
  
  // ספירה לפי סוג ל-dropdown
  const getTypeCount = (type: RuleType | 'all'): number => {
    const rules = showInactive ? inactiveRules : activeRules;
    if (type === 'all') return rules.length;
    return rules.filter(r => getRuleType(r) === type).length;
  };
  
  // פונקציה להחלפת מיון
  const handleSort = (column: 'category' | 'condition') => {
    if (sortBy === column) {
      // אותה עמודה - הפוך כיוון
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      // עמודה חדשה - התחל עולה
      setSortBy(column);
      setSortDir('asc');
    }
  };
  
  // מיון התוצאות
  const sortedRules = [...displayRules].sort((a, b) => {
    let compareA: string;
    let compareB: string;
    
    if (sortBy === 'category') {
      compareA = a.category.toLowerCase();
      compareB = b.category.toLowerCase();
    } else {
      compareA = formatRuleDescription(a).text.toLowerCase();
      compareB = formatRuleDescription(b).text.toLowerCase();
    }
    
    const result = compareA.localeCompare(compareB, 'he');
    return sortDir === 'asc' ? result : -result;
  });

  const content = (
    <div className={`desc-mapping-box ${embedded ? 'embedded' : ''}`}>
      {!embedded && (
        <div className="desc-mapping-header">
          <h3>כללי שיוך קטגוריות</h3>
        </div>
      )}
      
      {/* Search box */}
      <div className="desc-mapping-search-wrapper">
        <input
          type="text"
          className="desc-mapping-search-input"
          placeholder="🔍 חיפוש לפי תנאי או קטגוריה..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button 
            className="desc-mapping-search-clear"
            onClick={() => setSearchQuery('')}
            title="נקה חיפוש"
          >
            ✕
          </button>
        )}
      </div>
      
      {/* Filter bar: Dropdown + Toggle */}
      <div className="desc-mapping-filter-bar">
        <div className="desc-mapping-filter-type">
          <label className="desc-mapping-filter-label">סוג:</label>
          <select
            className="desc-mapping-filter-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as RuleType | 'all')}
          >
            <option value="all">הכל ({getTypeCount('all')})</option>
            {(Object.keys(RULE_TYPE_INFO) as RuleType[]).map(type => {
              const count = getTypeCount(type);
              if (count === 0) return null;
              return (
                <option key={type} value={type}>
                  {RULE_TYPE_INFO[type].icon} {RULE_TYPE_INFO[type].label} ({count})
                </option>
              );
            })}
          </select>
        </div>
        
        {inactiveRules.length > 0 && (
          <label className="desc-mapping-inactive-toggle">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            <span className="desc-mapping-toggle-label">
              🚫 לא פעילים ({inactiveRules.length})
            </span>
          </label>
        )}
      </div>
      
      <div className="desc-mapping-content">
        {/* Empty State */}
        {displayRules.length === 0 ? (
          <div className="desc-mapping-empty">
            {searchQuery.trim() ? (
              // אין תוצאות חיפוש
              <>
                <div className="desc-mapping-empty-icon">🔍</div>
                <div className="desc-mapping-empty-title">לא נמצאו תוצאות</div>
                <div className="desc-mapping-empty-desc">
                  אין כללים התואמים לחיפוש "<strong>{searchQuery}</strong>"
                </div>
                <button 
                  className="desc-mapping-clear-search-btn"
                  onClick={() => setSearchQuery('')}
                >
                  נקה חיפוש
                </button>
              </>
            ) : (
              // אין שיוכים בכלל
              <>
                <div className="desc-mapping-empty-icon">🏪</div>
                <div className="desc-mapping-empty-title">אין שיוכים עדיין</div>
                <div className="desc-mapping-empty-desc">
                  שייך עסקאות לקטגוריות מטבלת העסקאות - השיוך יישמר אוטומטית לכל העסקאות עם אותו בית עסק
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="desc-mapping-table-wrapper">
            <table className="desc-mapping-table">
              <thead>
                <tr>
                  <th className="desc-mapping-th-type">סוג</th>
                  <th 
                    className={`desc-mapping-th-desc desc-mapping-th-sortable ${sortBy === 'condition' ? 'sorted' : ''}`}
                    onClick={() => handleSort('condition')}
                    title="לחץ למיון"
                  >
                    תנאי
                    <span className="desc-mapping-sort-icon">
                      {sortBy === 'condition' ? (sortDir === 'asc' ? '▲' : '▼') : '▼'}
                    </span>
                  </th>
                  <th 
                    className={`desc-mapping-th-cat desc-mapping-th-sortable ${sortBy === 'category' ? 'sorted' : ''}`}
                    onClick={() => handleSort('category')}
                    title="לחץ למיון"
                  >
                    קטגוריה
                    <span className="desc-mapping-sort-icon">
                      {sortBy === 'category' ? (sortDir === 'asc' ? '▲' : '▼') : '▼'}
                    </span>
                  </th>
                  <th className="desc-mapping-th-actions"></th>
                </tr>
              </thead>
              <tbody>
                {sortedRules.map(rule => {
                  const ruleType = getRuleType(rule);
                  const typeInfo = RULE_TYPE_INFO[ruleType];
                  const cat = rule.category;
                  const amountConstraints = formatAmountConstraints(rule);
                  const ruleDesc = formatRuleDescription(rule);
                  
                  return (
                    <tr key={rule.id} className={`desc-mapping-row-${ruleType} ${!rule.active ? 'desc-mapping-row-inactive' : ''}`}>
                      <td className="desc-mapping-td-type" title={typeInfo.description}>
                        <span className="desc-mapping-type-badge">
                          {typeInfo.icon}
                        </span>
                      </td>
                      <td className="desc-mapping-td-desc">
                        <div className="desc-mapping-condition">
                          <span className="desc-mapping-condition-text">
                            {highlightText(ruleDesc.text)}
                          </span>
                          {ruleDesc.subtext && (
                            <span className="desc-mapping-subtext">
                              {highlightText(ruleDesc.subtext)}
                            </span>
                          )}
                          {amountConstraints && (
                            <span className="desc-mapping-amount-badge">
                              {amountConstraints}
                            </span>
                          )}
                          {ruleDesc.badges && ruleDesc.badges.map((badge, idx) => (
                            <span key={idx} className="desc-mapping-advanced-badge">
                              {badge}
                            </span>
                          ))}
                          {ruleType === 'regex' && (
                            <span className="desc-mapping-regex-badge">regex</span>
                          )}
                        </div>
                      </td>
                      <td className={`desc-mapping-td-cat ${categoryMatchesSearch(cat) ? 'category-match' : ''}`}>
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
                        {/* כפתור עריכה - רק לכללים שלא עסקה בודדת */}
                        {onEditRule && ruleType !== 'transaction' && rule.active && (
                          <button
                            onClick={() => onEditRule(rule)}
                            className="desc-mapping-edit-btn"
                            title="ערוך כלל"
                          >
                            ✏️
                          </button>
                        )}
                        {/* כפתור השבתה/שחזור */}
                        {onToggleRule ? (
                          <button
                            onClick={() => onToggleRule(rule.id, !rule.active)}
                            className={rule.active ? 'desc-mapping-disable-btn' : 'desc-mapping-restore-btn'}
                            title={rule.active ? 'השבת כלל (ניתן לשחזר)' : 'שחזר כלל'}
                          >
                            {rule.active ? '🚫' : '♻️'}
                          </button>
                        ) : (
                          <button
                            onClick={() => onDeleteRule(rule.id)}
                            className="desc-mapping-delete-btn"
                            title="מחק"
                          >
                            🗑️
                          </button>
                        )}
                        {/* כפתור מחיקה סופית - רק לכללים לא פעילים */}
                        {!rule.active && (
                          <button
                            onClick={() => onDeleteRule(rule.id)}
                            className="desc-mapping-delete-btn"
                            title="מחק לצמיתות"
                          >
                            🗑️
                          </button>
                        )}
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
