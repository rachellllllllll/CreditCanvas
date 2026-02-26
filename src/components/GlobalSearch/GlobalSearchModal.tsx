import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { CreditDetail, CategoryRule } from '../../types';
import type { CategoryDef } from '../CategoryManager';
import CategorySelectOrAdd from '../CategorySelectOrAdd';
import './GlobalSearch.css';

// פילטרים לשמירה ככלל
export interface SearchFiltersForRule {
  text: string;
  minAmount?: number;
  maxAmount?: number;
  dateFrom?: string;
  dateTo?: string;
}

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  allTransactions: CreditDetail[];
  categoriesList: CategoryDef[];
  onNavigateToTransaction: (tx: CreditDetail, monthKey: string) => void;
  onApplyBulkCategoryChange?: (
    transactions: CreditDetail[],
    newCategory: string,
    filtersForRule: SearchFiltersForRule,
    createRule: boolean,
    includeDatesInRule: boolean
  ) => void;
  onAddCategory?: (cat: CategoryDef) => void;
  initialSearchText?: string;
  dateMode?: 'transaction' | 'charge';
  // מצב עריכת כלל קיים
  ruleToEdit?: CategoryRule | null;
  onUpdateRule?: (
    ruleId: string,
    filtersForRule: SearchFiltersForRule,
    newCategory: string,
    includeDatesInRule: boolean
  ) => void;
}

// פילטרים לחיפוש מתקדם
interface SearchFilters {
  text: string;
  minAmount: string;
  maxAmount: string;
  dateFrom: string;
  dateTo: string;
}

const initialFilters: SearchFilters = {
  text: '',
  minAmount: '',
  maxAmount: '',
  dateFrom: '',
  dateTo: '',
};

// Helper: המרת תאריך מ-DD/MM/YYYY ל-Date object
const parseDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length < 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000;
  return new Date(year, month, day);
};

// Helper: המרת תאריך מ-YYYY-MM-DD (input date) ל-Date object
const parseInputDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
};

// Helper: המרת תאריך מ-YYYY-MM-DD ל-DD/MM/YYYY לתצוגה
const formatInputDateForDisplay = (dateStr: string): string => {
  if (!dateStr) return '';
  // אם כבר בפורמט DD/MM/YYYY
  if (dateStr.includes('/')) return dateStr;
  // המרה מפורמט YYYY-MM-DD
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

// Helper: המרת תאריך מ-DD/MM/YYYY ל-YYYY-MM-DD (לשמירה בכלל)
const formatDateForStorage = (dateStr: string): string => {
  if (!dateStr) return '';
  // אם כבר בפורמט YYYY-MM-DD
  if (dateStr.includes('-')) return dateStr;
  // המרה מפורמט DD/MM/YYYY
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr;
  let year = parts[2];
  if (year.length === 2) year = '20' + year;
  return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
};

// Helper: פרסור תאריך גמיש (DD/MM/YYYY או YYYY-MM-DD) ל-Date
// const parseFlexibleDate = (dateStr: string): Date | null => {
//   if (!dateStr) return null;
//   if (dateStr.includes('/')) {
//     return parseDate(dateStr);
//   } else {
//     return parseInputDate(dateStr);
//   }
// };

// Helper: קבלת מפתח חודש (MM/YYYY) מעסקה – מתחשב ב-dateMode
const getMonthKey = (tx: CreditDetail, dateMode?: 'transaction' | 'charge'): string => {
  const dateStr = (dateMode === 'charge' && tx.chargeDate) ? tx.chargeDate : tx.date;
  const parts = dateStr.split('/');
  if (parts.length < 3) return '';
  const month = parts[1].padStart(2, '0');
  let year = parts[2];
  if (year.length === 2) year = '20' + year;
  return `${month}/${year}`;
};

// Helper: פורמט תאריך לתצוגה
const formatDate = (dateStr: string): string => {
  const parts = dateStr.split('/');
  if (parts.length >= 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    let year = parts[2];
    if (year.length === 2) year = '20' + year;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
};

const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  allTransactions,
  categoriesList,
  onNavigateToTransaction,
  onApplyBulkCategoryChange,
  onAddCategory,
  initialSearchText = '',
  dateMode,
  ruleToEdit,
  onUpdateRule,
}) => {
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  
  // מצב עריכה - האם אנחנו עורכים כלל קיים
  const isEditMode = !!ruleToEdit;
  
  // מצב שינוי קטגוריה inline
  const [showCategoryChange, setShowCategoryChange] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [createRule, setCreateRule] = useState(true);
  const [includeDatesInRule, setIncludeDatesInRule] = useState(false);
  
  // פילטר קטגוריה (לחיפוש בלבד, לא נכנס לכללים)
  const [categoryFilter, setCategoryFilter] = useState<string>('all'); // 'all' | 'uncategorized' | categoryName
  
  // חישוב: האם יש תנאים "אמיתיים" לכלל (לא כולל פילטר קטגוריה)
  const hasRuleConditions = !!(filters.text.trim() || filters.minAmount || filters.maxAmount || filters.dateFrom || filters.dateTo);
  
  // מילוי פילטרים מכלל קיים כשנפתח במצב עריכה
  useEffect(() => {
    if (isOpen && ruleToEdit) {
      const c = ruleToEdit.conditions;
      const newFilters: SearchFilters = {
        text: c.descriptionRegex || c.descriptionEquals || '',
        minAmount: c.minAmount !== undefined ? String(c.minAmount) : '',
        maxAmount: c.maxAmount !== undefined ? String(c.maxAmount) : '',
        dateFrom: c.dateFrom || '',
        dateTo: c.dateTo || '',
      };
      setFilters(newFilters);
      setSelectedCategory(ruleToEdit.category);
      setShowCategoryChange(true);
      setShowAdvanced(true);
      setCreateRule(true); // במצב עריכה תמיד שומרים
      setIncludeDatesInRule(!!(c.dateFrom || c.dateTo));
    }
  }, [isOpen, ruleToEdit]);
  
  // עדכון טקסט התחלתי כשהמודל נפתח (רק אם לא במצב עריכה)
  useEffect(() => {
    if (isOpen && initialSearchText && !ruleToEdit) {
      setFilters(prev => ({ ...prev, text: initialSearchText }));
    }
  }, [isOpen, initialSearchText]);
  
  // Debounce לחיפוש
  const [debouncedText, setDebouncedText] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedText(filters.text);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters.text]);

  // Focus על שדה החיפוש בפתיחה
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen]);
  
  // פונקציה לסגירה עם איפוס
  const handleCloseAndReset = useCallback(() => {
    setFilters(initialFilters);
    setShowAdvanced(false);
    setShowCategoryChange(false);
    setSelectedCategory(null);
    setCreateRule(true);
    setIncludeDatesInRule(false);
    setCategoryFilter('all');
    onClose();
  }, [onClose]);

  // סגירה ב-Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseAndReset();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleCloseAndReset]);

  // סגירה בלחיצה מחוץ למודל
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleCloseAndReset();
  }, [handleCloseAndReset]);

  // סינון העסקאות
  const filteredTransactions = useMemo(() => {
    if (!debouncedText && !showAdvanced) return [];
    
    // דרישת מינימום: טקסט חיפוש או פילטר מתקדם פעיל
    const hasTextFilter = debouncedText.trim().length > 0;
    const hasAdvancedFilter = filters.minAmount || filters.maxAmount || 
      filters.dateFrom || filters.dateTo || categoryFilter !== 'all';
    
    if (!hasTextFilter && !hasAdvancedFilter) return [];

    const textLower = debouncedText.toLowerCase();
    
    return allTransactions.filter(tx => {
      // סינון טקסט
      if (hasTextFilter) {
        const matchText = tx.description?.toLowerCase().includes(textLower);
        if (!matchText) return false;
      }
      
      // סינון סכום
      if (filters.minAmount) {
        const min = parseFloat(filters.minAmount);
        if (!isNaN(min) && Math.abs(tx.amount) < min) return false;
      }
      if (filters.maxAmount) {
        const max = parseFloat(filters.maxAmount);
        if (!isNaN(max) && Math.abs(tx.amount) > max) return false;
      }
      
      // סינון תאריך
      const txDate = parseDate(tx.date);
      if (filters.dateFrom && txDate) {
        const fromDate = parseInputDate(filters.dateFrom);
        if (fromDate && txDate < fromDate) return false;
      }
      if (filters.dateTo && txDate) {
        const toDate = parseInputDate(filters.dateTo);
        if (toDate && txDate > toDate) return false;
      }
      
      // סינון קטגוריה
      if (categoryFilter !== 'all') {
        if (categoryFilter === 'uncategorized') {
          // רק עסקאות ללא קטגוריה
          if (tx.category && tx.category !== 'ללא קטגוריה' && tx.category !== '') return false;
        } else {
          // קטגוריה ספציפית
          if (tx.category !== categoryFilter) return false;
        }
      }
      
      return true;
    });
  }, [allTransactions, debouncedText, filters, showAdvanced, categoryFilter]);

  // מיון לפי תאריך (חדש קודם)
  const sortedResults = useMemo(() => {
    return [...filteredTransactions].sort((a, b) => {
      const dateA = parseDate(a.date);
      const dateB = parseDate(b.date);
      if (!dateA || !dateB) return 0;
      return dateB.getTime() - dateA.getTime();
    });
  }, [filteredTransactions]);

  // סיכומים
  const summary = useMemo(() => {
    const income = sortedResults
      .filter(tx => tx.direction === 'income')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const expense = sortedResults
      .filter(tx => tx.direction === 'expense')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    return {
      count: sortedResults.length,
      income,
      expense,
      net: income - expense,
    };
  }, [sortedResults]);

  // עדכון פילטר
  const updateFilter = useCallback(<K extends keyof SearchFilters>(
    key: K, 
    value: SearchFilters[K]
  ) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  // איפוס פילטרים מתקדמים (לא כולל טקסט החיפוש)
  const resetFilters = useCallback(() => {
    setFilters(prev => ({
      ...initialFilters,
      text: prev.text, // שומר את טקסט החיפוש
    }));
    setCategoryFilter('all');
  }, []);

  // לחיצה על עסקה - ניווט
  const handleRowClick = useCallback((tx: CreditDetail) => {
    const monthKey = getMonthKey(tx, dateMode);
    onNavigateToTransaction(tx, monthKey);
    handleCloseAndReset();
  }, [onNavigateToTransaction, handleCloseAndReset, dateMode]);

  // קבלת צבע קטגוריה
  const getCategoryColor = useCallback((categoryName: string) => {
    const cat = categoriesList.find(c => c.name === categoryName);
    return cat?.color || '#6366f1';
  }, [categoriesList]);

  // קבלת אייקון קטגוריה
  const getCategoryIcon = useCallback((categoryName: string) => {
    const cat = categoriesList.find(c => c.name === categoryName);
    return cat?.icon || '📁';
  }, [categoriesList]);

  // הדגשת טקסט חיפוש
  const highlightText = useCallback((text: string): React.ReactNode => {
    if (!debouncedText.trim()) return text;
    const regex = new RegExp(`(${debouncedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="GlobalSearch-highlight">{part}</mark>
      ) : part
    );
  }, [debouncedText]);

  if (!isOpen) return null;

  return (
    <div className="GlobalSearch-backdrop" onClick={handleBackdropClick}>
      <div className="GlobalSearch-modal" ref={modalRef}>
        {/* כותרת */}
        <div className="GlobalSearch-header">
          <h2 className="GlobalSearch-title">
            {isEditMode ? '✏️ עריכת כלל' : '🔍 חיפוש מתקדם'}
          </h2>
          <button className="GlobalSearch-close-btn" onClick={handleCloseAndReset} aria-label="סגור">
            ✕
          </button>
        </div>

        {/* שדה חיפוש ראשי */}
        <div className="GlobalSearch-search-container">
          <div className="GlobalSearch-search-input-wrapper">
            <span className="GlobalSearch-search-icon">🔍</span>
            <input
              ref={searchInputRef}
              type="text"
              className="GlobalSearch-search-input"
              placeholder="חיפוש לפי תיאור / בית עסק..."
              value={filters.text}
              onChange={(e) => updateFilter('text', e.target.value)}
            />
            {filters.text && (
              <button
                className="GlobalSearch-search-clear"
                onClick={() => updateFilter('text', '')}
                aria-label="נקה"
              >
                ✕
              </button>
            )}
          </div>
          <button
            className={`GlobalSearch-advanced-toggle ${showAdvanced ? 'active' : ''}`}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? '▲ פחות' : '▼ פילטרים מתקדמים'}
          </button>
        </div>

        {/* פילטרים מתקדמים */}
        {showAdvanced && (
          <div className="GlobalSearch-filters">
            {/* שורה 1: סכום + תאריכים */}
            <div className="GlobalSearch-filters-row">
              <div className="GlobalSearch-filter-group">
                <label className="GlobalSearch-filter-label">סכום (₪)</label>
                <div className="GlobalSearch-filter-range">
                  <input
                    type="number"
                    className="GlobalSearch-filter-input"
                    placeholder="מ..."
                    value={filters.minAmount}
                    onChange={(e) => updateFilter('minAmount', e.target.value)}
                  />
                  <span className="GlobalSearch-filter-separator">—</span>
                  <input
                    type="number"
                    className="GlobalSearch-filter-input"
                    placeholder="עד..."
                    value={filters.maxAmount}
                    onChange={(e) => updateFilter('maxAmount', e.target.value)}
                  />
                </div>
              </div>

              <div className="GlobalSearch-filter-group">
                <label className="GlobalSearch-filter-label">תאריך</label>
                <div className="GlobalSearch-filter-range">
                  <div 
                    className="GlobalSearch-date-field"
                    onClick={(e) => {
                      const input = (e.currentTarget as HTMLElement).querySelector('input');
                      if (input && 'showPicker' in input) {
                        (input as HTMLInputElement).showPicker();
                      }
                    }}
                  >
                    <input
                      type="date"
                      className="GlobalSearch-date-hidden"
                      value={filters.dateFrom}
                      onChange={(e) => updateFilter('dateFrom', e.target.value)}
                    />
                    <span className="GlobalSearch-date-value">
                      {filters.dateFrom ? formatInputDateForDisplay(filters.dateFrom) : 'מתאריך'}
                    </span>
                    <span className="GlobalSearch-date-icon">📅</span>
                  </div>
                  <span className="GlobalSearch-filter-separator">—</span>
                  <div 
                    className="GlobalSearch-date-field"
                    onClick={(e) => {
                      const input = (e.currentTarget as HTMLElement).querySelector('input');
                      if (input && 'showPicker' in input) {
                        (input as HTMLInputElement).showPicker();
                      }
                    }}
                  >
                    <input
                      type="date"
                      className="GlobalSearch-date-hidden"
                      value={filters.dateTo}
                      onChange={(e) => updateFilter('dateTo', e.target.value)}
                    />
                    <span className="GlobalSearch-date-value">
                      {filters.dateTo ? formatInputDateForDisplay(filters.dateTo) : 'עד תאריך'}
                    </span>
                    <span className="GlobalSearch-date-icon">📅</span>
                  </div>
                </div>
              </div>
            </div>

            {/* שורה 2: קטגוריה */}
            <div className="GlobalSearch-filters-row">
              <div className="GlobalSearch-filter-group GlobalSearch-filter-group-category">
                <label className="GlobalSearch-filter-label">
                  📁 קטגוריה
                  <span className="GlobalSearch-filter-hint">(לחיפוש בלבד)</span>
                </label>
                <select
                  className="GlobalSearch-filter-select"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="all">הכל</option>
                  <option value="uncategorized">⭐ ללא קטגוריה</option>
                  <optgroup label="קטגוריות">
                    {categoriesList.map(cat => (
                      <option key={cat.name} value={cat.name}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>

            {/* כפתור איפוס */}
            <button className="GlobalSearch-reset-btn" onClick={resetFilters}>
              🔄 איפוס פילטרים
            </button>
          </div>
        )}

        {/* סיכום תוצאות */}
        {sortedResults.length > 0 && (
          <div className="GlobalSearch-summary">
            <div className="GlobalSearch-summary-left">
              <span className="GlobalSearch-summary-count">
                נמצאו <strong>{summary.count}</strong> עסקאות
              </span>
              <span className="GlobalSearch-summary-totals">
                <span className="GlobalSearch-summary-income">
                  +{summary.income.toLocaleString()} ₪
                </span>
                <span className="GlobalSearch-summary-expense">
                  -{summary.expense.toLocaleString()} ₪
                </span>
                <span className={`GlobalSearch-summary-net ${summary.net >= 0 ? 'positive' : 'negative'}`}>
                  = {summary.net.toLocaleString()} ₪
                </span>
              </span>
            </div>
            {/* כפתור פתיחת/סגירת שינוי קטגוריה */}
            {onApplyBulkCategoryChange && sortedResults.length >= 1 && (
              <button
                className={`GlobalSearch-bulk-category-btn ${showCategoryChange ? 'active' : ''}`}
                onClick={() => setShowCategoryChange(!showCategoryChange)}
                title={showCategoryChange ? 'סגור שינוי קטגוריה' : 'שנה קטגוריה לכל תוצאות החיפוש'}
              >
                🏷️ שנה קטגוריה ({sortedResults.length})
              </button>
            )}
          </div>
        )}

        {/* ממשק שינוי קטגוריה inline */}
        {showCategoryChange && onApplyBulkCategoryChange && sortedResults.length >= 1 && (
          <div className="GlobalSearch-category-change-panel">
            <div className="GlobalSearch-category-change-row">
              <label className="GlobalSearch-category-label">קטגוריה חדשה:</label>
              <div className="GlobalSearch-category-select-wrapper">
                <CategorySelectOrAdd
                  categories={categoriesList}
                  value={selectedCategory}
                  onChange={setSelectedCategory}
                  onAddCategory={onAddCategory || (() => {})}
                  allowAdd={!!onAddCategory}
                />
              </div>
            </div>
            
            <div className="GlobalSearch-category-options">
              {/* במצב עריכה - אין צורך בcheckbox יצירת כלל */}
              {/* מציגים רק אם יש תנאים "אמיתיים" לכלל (לא רק פילטר קטגוריה) */}
              {!isEditMode && hasRuleConditions && (
                <label className="GlobalSearch-checkbox-label">
                  <input
                    type="checkbox"
                    checked={createRule}
                    onChange={(e) => setCreateRule(e.target.checked)}
                  />
                  <span>צור כלל אוטומטי לעתיד</span>
                </label>
              )}
              
              {(createRule || isEditMode) && (filters.dateFrom || filters.dateTo) && (
                <label className="GlobalSearch-checkbox-label GlobalSearch-dates-warning">
                  <input
                    type="checkbox"
                    checked={includeDatesInRule}
                    onChange={(e) => setIncludeDatesInRule(e.target.checked)}
                  />
                  <span>
                    כלול תאריכים בכלל
                    <span className="GlobalSearch-warning-icon" title="זהירות: כלל עם תאריכים יחול רק על עסקאות בטווח זה">⚠️</span>
                  </span>
                </label>
              )}
            </div>

            {/* תצוגה מקדימה של הכלל - רק אם יש תנאים */}
            {(createRule || isEditMode) && selectedCategory && hasRuleConditions && (
              <div className="GlobalSearch-rule-preview">
                <span className="GlobalSearch-rule-preview-label">
                  {isEditMode ? 'הכלל המעודכן:' : 'תצוגה מקדימה של הכלל:'}
                </span>
                <div className="GlobalSearch-rule-preview-content">
                  {debouncedText && <span className="GlobalSearch-rule-chip">🔤 "{debouncedText}"</span>}
                  {filters.minAmount && <span className="GlobalSearch-rule-chip">💰 מינימום: ₪{filters.minAmount}</span>}
                  {filters.maxAmount && <span className="GlobalSearch-rule-chip">💰 מקסימום: ₪{filters.maxAmount}</span>}
                  {includeDatesInRule && filters.dateFrom && <span className="GlobalSearch-rule-chip">📅 מ: {formatInputDateForDisplay(filters.dateFrom)}</span>}
                  {includeDatesInRule && filters.dateTo && <span className="GlobalSearch-rule-chip">📅 עד: {formatInputDateForDisplay(filters.dateTo)}</span>}
                  <span className="GlobalSearch-rule-arrow">→</span>
                  <span 
                    className="GlobalSearch-rule-category-chip"
                    style={{ 
                      backgroundColor: categoriesList.find(c => c.name === selectedCategory)?.color || '#6366f1',
                      color: '#fff'
                    }}
                  >
                    {categoriesList.find(c => c.name === selectedCategory)?.icon || '📁'} {selectedCategory}
                  </span>
                </div>
              </div>
            )}

            <button
              className="GlobalSearch-apply-category-btn"
              disabled={!selectedCategory}
              onClick={() => {
                if (!selectedCategory) return;
                const filtersForRule: SearchFiltersForRule = {
                  text: debouncedText,
                  minAmount: filters.minAmount ? parseFloat(filters.minAmount) : undefined,
                  maxAmount: filters.maxAmount ? parseFloat(filters.maxAmount) : undefined,
                  dateFrom: filters.dateFrom ? formatDateForStorage(filters.dateFrom) : undefined,
                  dateTo: filters.dateTo ? formatDateForStorage(filters.dateTo) : undefined,
                };
                
                if (isEditMode && ruleToEdit && onUpdateRule) {
                  // עדכון כלל קיים
                  onUpdateRule(ruleToEdit.id, filtersForRule, selectedCategory, includeDatesInRule);
                } else if (onApplyBulkCategoryChange) {
                  // יצירת כלל חדש ושינוי עסקאות
                  // אם אין תנאים לכלל, לא ניצור כלל גם אם createRule=true
                  const shouldCreateRule = createRule && hasRuleConditions;
                  onApplyBulkCategoryChange(sortedResults, selectedCategory, filtersForRule, shouldCreateRule, includeDatesInRule);
                }
                handleCloseAndReset();
              }}
            >
              {isEditMode 
                ? `✓ שמור שינויים בכלל`
                : `✓ שמור שינויים (${sortedResults.length} עסקאות)`
              }
            </button>
          </div>
        )}

        {/* טבלת תוצאות */}
        <div className="GlobalSearch-results">
          {sortedResults.length === 0 ? (
            <div className="GlobalSearch-empty">
              {debouncedText || showAdvanced ? (
                <>
                  <span className="GlobalSearch-empty-icon">🔍</span>
                  <p>לא נמצאו תוצאות</p>
                  <p className="GlobalSearch-empty-hint">נסה לשנות את מילות החיפוש או הפילטרים</p>
                </>
              ) : (
                <>
                  <span className="GlobalSearch-empty-icon">💡</span>
                  <p>הקלד טקסט לחיפוש</p>
                  <p className="GlobalSearch-empty-hint">או השתמש בפילטרים מתקדמים לחיפוש מדויק</p>
                </>
              )}
            </div>
          ) : (
            <table className="GlobalSearch-table">
              <thead>
                <tr>
                  <th className="GlobalSearch-th GlobalSearch-th-date">תאריך</th>
                  <th className="GlobalSearch-th GlobalSearch-th-desc">תיאור</th>
                  <th className="GlobalSearch-th GlobalSearch-th-cat">קטגוריה</th>
                  <th className="GlobalSearch-th GlobalSearch-th-amount">סכום</th>
                  <th className="GlobalSearch-th GlobalSearch-th-action"></th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.slice(0, 100).map(tx => (
                  <tr
                    key={tx.id}
                    className="GlobalSearch-row"
                    onClick={() => handleRowClick(tx)}
                  >
                    <td className="GlobalSearch-td GlobalSearch-td-date">
                      <span className="GlobalSearch-date">{formatDate(tx.date)}</span>
                      <span className={`GlobalSearch-source-badge ${tx.source === 'bank' ? 'bank' : 'credit'}`}>
                        {tx.source === 'bank' ? '🏦' : '💳'}
                      </span>
                      {tx.transactionType === 'credit_charge' && (
                        <span className="GlobalSearch-credit-charge-badge" title={`חיוב אשראי${tx.matchedCardLast4 ? ` (••••${tx.matchedCardLast4})` : ''}`}>
                          💳 חיוב אשראי{tx.matchedCardLast4 ? ` (${tx.matchedCardLast4})` : ''}
                        </span>
                      )}
                      {tx.transactionType === 'credit_charge_combined' && (
                        <span className="GlobalSearch-credit-combined-badge" title="חיוב בנק מאוחד">
                          🔗 חיוב מאוחד
                        </span>
                      )}
                    </td>
                    <td className="GlobalSearch-td GlobalSearch-td-desc">
                      {highlightText(tx.description)}
                    </td>
                    <td className="GlobalSearch-td GlobalSearch-td-cat">
                      {tx.category && (
                        <span
                          className="GlobalSearch-category-badge"
                          style={{ 
                            backgroundColor: getCategoryColor(tx.category) + '22', 
                            borderColor: getCategoryColor(tx.category),
                            color: getCategoryColor(tx.category)
                          }}
                        >
                          <span className="GlobalSearch-badge-icon">{getCategoryIcon(tx.category)}</span>
                          {tx.category}
                        </span>
                      )}
                    </td>
                    <td className={`GlobalSearch-td GlobalSearch-td-amount ${tx.direction === 'income' ? 'income' : 'expense'}${tx.neutral || (tx.transactionType === 'credit_charge' && (tx.relatedTransactionIds?.length || 0) > 0) || tx.transactionType === 'credit_charge_combined' ? ' neutral' : ''}`}>
                      {tx.direction === 'income' ? '+' : '-'}{Math.abs(tx.amount).toLocaleString()} ₪
                      {(tx.neutral || (tx.transactionType === 'credit_charge' && (tx.relatedTransactionIds?.length || 0) > 0) || tx.transactionType === 'credit_charge_combined') && (
                        <span className="GlobalSearch-not-counted" title="לא נספר – מפורט בעסקאות האשראי">(לא נספר)</span>
                      )}
                    </td>
                    <td className="GlobalSearch-td GlobalSearch-td-action">
                      <span className="GlobalSearch-navigate-icon" title="נווט לעסקה">→</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {sortedResults.length > 100 && (
            <div className="GlobalSearch-more-results">
              מוצגות 100 מתוך {sortedResults.length} תוצאות. צמצם את החיפוש להצגת תוצאות נוספות.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GlobalSearchModal;
