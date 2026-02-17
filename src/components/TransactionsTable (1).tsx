import React from 'react';
import './TransactionsTable.css';
import './TransactionsTable-enhanced.css';
import type { CreditChargeCycleSummary, CreditDetail, IncomeSourceRule } from '../types';
import { signedAmount } from '../utils/money';

interface TransactionsTableProps {
  details: CreditDetail[];
  allDetails?: CreditDetail[]; // כל העסקאות (לספירה מדויקת בתפריט הקשר)
  onEditCategory?: (transaction: CreditDetail) => void;
  onBulkEditCategory?: (transactions: CreditDetail[], searchTerm: string) => void;
  categoriesList?: { name: string; color: string; icon: string }[];
  isYearlyView?: boolean;
  // When in yearly view, allow selecting a month to drill down.
  // Pass full key MM/YYYY instead of numeric index.
  onMonthSelect?: (monthKey: string) => void;
  creditChargeCycles?: CreditChargeCycleSummary[]; // cycle summaries with bankMatchStatus
  setView: (view: 'monthly' | 'yearly') => void;
  // חדש: ניהול מקורות הכנסה
  incomeSourceRules?: IncomeSourceRule[];
  onMarkAsIncomeSource?: (description: string, sourceType: 'business' | 'category') => void;
  onMarkAsNotIncomeSource?: (description: string, sourceType: 'business' | 'category') => void;
  // חדש: סימון עסקה בודדת כהכנסה/הוצאה
  onMarkTransactionAsIncomeSource?: (transactionId: string, isIncome: boolean) => void;
  // חדש: עריכת הגדרות קטגוריה
  onEditCategoryDefinition?: (categoryName: string) => void;
  // חדש: שמות ידידותיים לכרטיסים (מפתח = 4 ספרות אחרונות, ערך = שם)
  cardNames?: Record<string, string>;
  // מצב סינון הכנסות/הוצאות - להצגת אפשרות העברה בתפריט הקשר
  displayMode?: 'all' | 'expense' | 'income';
  // מעקב פיצ'רים
  onTrackFeature?: (feature: string) => void;
  // מצב תאריך (עסקה / חיוב) - לתצוגה שנתית
  dateMode?: 'transaction' | 'charge';
  // חדש: עסקה מודגשת (לאחר ניווט מחיפוש גלובלי)
  highlightedTransactionId?: string | null;
  // חדש: פתיחת חיפוש גלובלי עם טקסט מוגדר מראש
  onOpenGlobalSearch?: (initialText?: string) => void;
}

const formatDate = (dateStr: string) => {
  // Try to extract day/month/year from dd/m/yy or dd/mm/yyyy
  const parts = dateStr.split('/');
  if (parts.length >= 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    let year = parts[2];
    if (year.length === 2) year = '20' + year;
    if (year.length === 4) return `${day}/${month}/${year}`;
  }
  return dateStr;
};

// לוגיקת צבעים לקטגוריה (כמו ב-CategoryPieChart)
const getCategoryColors = (categories: string[]) => {
  const colorPalette = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF', '#B2FF66', '#FF66B2', '#66B2FF',
    '#FFB266', '#66FFB2', '#B266FF', '#FF6666', '#66FF66', '#6666FF', '#FFD966', '#A2EB36', '#CE56FF', '#40FF9F'
  ];
  const map: Record<string, string> = {};
  categories.forEach((cat, i) => {
    map[cat] = colorPalette[i % colorPalette.length];
  });
  return map;
};

// Utility: get readable text color for background
function getReadableTextColor(bgColor: string): string {
  // Remove hash if present
  const color = bgColor.replace('#', '');
  // Parse hex color
  let r = 255, g = 255, b = 255;
  if (color.length === 6) {
    r = parseInt(color.substring(0, 2), 16);
    g = parseInt(color.substring(2, 4), 16);
    b = parseInt(color.substring(4, 6), 16);
  } else if (color.length === 3) {
    r = parseInt(color[0] + color[0], 16);
    g = parseInt(color[1] + color[1], 16);
    b = parseInt(color[2] + color[2], 16);
  }
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#222' : '#fff';
}

const TransactionsTable: React.FC<TransactionsTableProps> = ({
  details,
  allDetails,
  onEditCategory,
  categoriesList,
  setView,
  incomeSourceRules = [],
  onMarkAsIncomeSource,
  onMarkAsNotIncomeSource,
  onMarkTransactionAsIncomeSource,
  onEditCategoryDefinition,
  cardNames = {},
  displayMode = 'all',
  onTrackFeature,
  onMonthSelect,
  dateMode = 'transaction',
  highlightedTransactionId,
  onOpenGlobalSearch,
  ...props
}) => {
  // Constants
  const CATEGORY_COLUMN_WIDTH = 220;
  const BUSINESS_COLUMN_WIDTH = 320;

  // Ref לגלילה לעסקה מודגשת
  const highlightedRowRef = React.useRef<HTMLTableRowElement>(null);

  // Helper: קבל שם תצוגה לכרטיס (שם ידידותי אם קיים, אחרת 4 ספרות)
  const getCardDisplayName = React.useCallback((cardLast4: string | undefined): string | null => {
    if (!cardLast4) return null;
    const friendlyName = cardNames[cardLast4];
    if (friendlyName && friendlyName.trim()) {
      return friendlyName.trim();
    }
    return `••••${cardLast4}`;
  }, [cardNames]);

  // Virtual display category: map bank-without-category to 'תנועות בנק'
  const displayCategoryFor = React.useCallback((d: CreditDetail) => {
    return d.category || (d.source === 'bank' ? 'תנועות בנק' : 'ללא קטגוריה');
  }, []);

  // Helper: בדיקה אם עסקה היא חיוב אשראי עם פירוט (צריך לדלג עליה בחישובים)
  const shouldSkipInCalculation = React.useCallback((d: CreditDetail): boolean => {
    // חיוב אשראי בנקאי עם פירוט - דלג (כבר נספר דרך עסקאות האשראי)
    if (d.source === 'bank' && d.transactionType === 'credit_charge') {
      const hasBreakdown = (d.relatedTransactionIds?.length || 0) > 0;
      if (hasBreakdown) return true;
    }
    // חיוב מאוחד - דלג
    if (d.transactionType === 'credit_charge_combined') {
      return true;
    }
    // עסקה neutral - דלג
    if (d.neutral) return true;
    return false;
  }, []);

  // Helper: קבלת תאריך אפקטיבי לפי מצב התאריך (עסקה/חיוב)
  const getEffectiveDate = React.useCallback((d: CreditDetail): string => {
    if (dateMode === 'charge' && d.chargeDate) return d.chargeDate;
    return d.date || '';
  }, [dateMode]);

  // Types for new toolbar controls
  type GroupByOption = 'category' | 'business' | 'none';
  type TransactionSortOption = 'date-asc' | 'date-desc' | 'amount-asc' | 'amount-desc';
  type GroupSortOption = 'sum-desc' | 'sum-asc' | 'name-asc' | 'name-desc' | 'count-desc' | 'count-asc';

  // LocalStorage key for preferences
  const PREFS_KEY = 'transactionsTablePreferences';

  // Load initial preferences from localStorage
  const loadPrefs = () => {
    try {
      const saved = localStorage.getItem(PREFS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore localStorage errors
    }
    return {};
  };

  const initialPrefs = React.useMemo(() => loadPrefs(), []);

  const [sortBy, setSortBy] = React.useState<'date' | 'amount' | 'description' | 'category'>('date');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({});

  // Search state
  const [searchTerm, setSearchTerm] = React.useState('');
  const searchTrackedRef = React.useRef(false);
  
  // מעקב על חיפוש (פעם אחת לכל סשן חיפוש)
  React.useEffect(() => {
    if (searchTerm.trim() && !searchTrackedRef.current) {
      // שלח tracking רק פעם אחת כשמתחילים לחפש
      const timer = setTimeout(() => {
        onTrackFeature?.('search_transactions');
        searchTrackedRef.current = true;
      }, 1000); // debounce של שנייה
      return () => clearTimeout(timer);
    }
    if (!searchTerm.trim()) {
      searchTrackedRef.current = false; // אפס כשמנקים את החיפוש
    }
  }, [searchTerm, onTrackFeature]);

  // New state for toolbar controls
  const [groupBy, setGroupBy] = React.useState<GroupByOption>(initialPrefs.groupBy ?? 'category');
  const [sortOption, setSortOption] = React.useState<TransactionSortOption | GroupSortOption>(
    initialPrefs.sortOption ?? 'sum-desc'
  );
  const [showSettings, setShowSettings] = React.useState(false);
  const settingsRef = React.useRef<HTMLDivElement>(null);

  const parseDate = (dateStr: string) => {
    // Expects dd/mm/yyyy or dd/m/yy
    const parts = dateStr.split('/');
    if (parts.length >= 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      let year = parts[2];
      if (year.length === 2) year = '20' + year;
      if (year.length === 4) {
        // yyyy-mm-dd for Date parsing
        return new Date(`${year}-${month}-${day}`).getTime();
      }
    }
    return 0; // fallback for invalid date
  };

  // סינון לפי חיפוש - מוגדר ראשון כי displayDetails תלוי בו
  const searchFilteredDetails = React.useMemo(() => {
    if (!searchTerm.trim()) return details;
    const term = searchTerm.toLowerCase();
    return details.filter(d => 
      d.description?.toLowerCase().includes(term)
    );
  }, [details, searchTerm]);

  // סיכום תוצאות חיפוש
  const searchSummary = React.useMemo(() => {
    if (!searchTerm.trim()) return null;
    const filtered = searchFilteredDetails;
    const total = filtered.reduce((sum, d) => {
      if (shouldSkipInCalculation(d)) return sum;
      return sum + signedAmount(d);
    }, 0);
    return { count: filtered.length, total };
  }, [searchTerm, searchFilteredDetails, shouldSkipInCalculation]);

  // פונקציה להדגשת מילת החיפוש בטקסט
  const highlightText = React.useCallback((text: string | undefined): React.ReactNode => {
    if (!text || !searchTerm.trim()) return text || '';
    const term = searchTerm.trim();
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) => 
      regex.test(part) ? (
        <mark key={i} className="TransactionsTable-highlight">{part}</mark>
      ) : part
    );
  }, [searchTerm]);

  // גלילה לעסקה מודגשת + פתיחת הקבוצה שלה
  React.useEffect(() => {
    if (!highlightedTransactionId) return;
    
    // מצא את העסקה
    const tx = details.find(d => d.id === highlightedTransactionId);
    if (!tx) return;
    
    // פתח את הקבוצה שלה (קטגוריה או בית עסק)
    const groupKey = groupBy === 'business' 
      ? (tx.description || 'ללא שם')
      : displayCategoryFor(tx);
    
    setOpenGroups(prev => ({ ...prev, [groupKey]: true }));
    
    // גלול לעסקה אחרי שה-DOM מתעדכן
    setTimeout(() => {
      if (highlightedRowRef.current) {
        highlightedRowRef.current.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }
    }, 100);
  }, [highlightedTransactionId, details, groupBy, displayCategoryFor]);

  // קיבוץ לפי קטגוריה (תצוגה): משתמש ב-displayCategoryFor
  // משתמש ב-searchFilteredDetails כשיש חיפוש פעיל
  const displayDetails = searchTerm.trim() ? searchFilteredDetails : details;
  
  const groupedByCategory = React.useMemo(() => {
    const map: Record<string, CreditDetail[]> = {};
    displayDetails.forEach(d => {
      const cat = displayCategoryFor(d);
      if (!map[cat]) map[cat] = [];
      map[cat].push(d);
    });
    return map;
  }, [displayDetails, displayCategoryFor]);

  // קיבוץ לפי בית עסק (description)
  const groupedByBusiness = React.useMemo(() => {
    const map: Record<string, CreditDetail[]> = {};
    displayDetails.forEach(d => {
      const business = d.description || 'ללא שם';
      if (!map[business]) map[business] = [];
      map[business].push(d);
    });
    return map;
  }, [displayDetails]);

  // Get current grouped data based on groupBy setting
  const grouped = React.useMemo(() => {
    if (groupBy === 'business') return groupedByBusiness;
    return groupedByCategory;
  }, [groupBy, groupedByCategory, groupedByBusiness]);

  const allCategories = React.useMemo(() => Object.keys(grouped), [grouped]);
  const categoryColors = React.useMemo(() => getCategoryColors(allCategories), [allCategories]);

  // סכום כולל לכל קטגוריה (חתום לפי כיוון) - דילוג על חיובי אשראי עם פירוט
  const categoryTotals = React.useMemo(() => {
    const totals: Record<string, number> = {};
    for (const cat in grouped) {
      totals[cat] = grouped[cat].reduce((sum, d) => {
        if (shouldSkipInCalculation(d)) return sum;
        return sum + signedAmount(d);
      }, 0);
    }
    return totals;
  }, [grouped, shouldSkipInCalculation]);

  // חישוב סכום חודשי לכל קבוצה (קטגוריה או בית עסק) (תצוגה)
  const monthlyTotalsByCategory = React.useMemo(() => {
    // { [groupKey]: number[12] }
    const map: Record<string, number[]> = {};
    // Initialize for all groups
    for (const key of allCategories) {
      map[key] = Array(12).fill(0);
    }
    displayDetails.forEach(d => {
      // Get the group key based on current groupBy setting
      const groupKey = groupBy === 'business'
        ? (d.description || 'ללא שם')
        : displayCategoryFor(d);

      // Only process if key exists in our groups
      if (!map[groupKey]) return;

      const effDate = getEffectiveDate(d);
      const parts = effDate.split('/') || [];
      let monthIdx = 0;
      if (parts.length >= 2) {
        monthIdx = Math.max(0, Math.min(11, parseInt(parts[1], 10) - 1));
      }
      if (!shouldSkipInCalculation(d)) {
        map[groupKey][monthIdx] += signedAmount(d);
      }
    });
    return map;
  }, [displayDetails, allCategories, displayCategoryFor, groupBy, shouldSkipInCalculation, getEffectiveDate]);

  // סכומי חודשים לכלל העסקאות + סכום שנתי כולל - דילוג על חיובי אשראי עם פירוט
  const monthlyTotalsAll: number[] = React.useMemo(() => {
    const arr = Array(12).fill(0);
    displayDetails.forEach(d => {
      if (shouldSkipInCalculation(d)) return;
      const effDate = getEffectiveDate(d);
      const parts = effDate.split('/') || [];
      let monthIdx = 0;
      if (parts.length >= 2) {
        monthIdx = Math.max(0, Math.min(11, parseInt(parts[1], 10) - 1));
      }
      arr[monthIdx] += signedAmount(d);
    });
    return arr;
  }, [displayDetails, shouldSkipInCalculation, getEffectiveDate]);

  const grandTotalAll = React.useMemo(() => monthlyTotalsAll.reduce((a, b) => a + b, 0), [monthlyTotalsAll]);

  const handleToggleGroup = (cat: string) => {
    setOpenGroups(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  // Count transactions per group
  const groupCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const key in grouped) {
      counts[key] = grouped[key].length;
    }
    return counts;
  }, [grouped]);

  // חישוב קטגוריה דומיננטית לכל בית עסק (כשמקובצים לפי בית עסק)
  const dominantCategoryByBusiness = React.useMemo(() => {
    if (groupBy !== 'business') return {};
    const result: Record<string, { category: string; count: number; totalCategories: number }> = {};
    
    for (const business in groupedByBusiness) {
      const transactions = groupedByBusiness[business];
      // ספור עסקאות לפי קטגוריה
      const categoryCounts: Record<string, number> = {};
      transactions.forEach(tx => {
        const cat = displayCategoryFor(tx);
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      });
      
      // מצא את הקטגוריה עם הכי הרבה עסקאות
      let maxCategory = '';
      let maxCount = 0;
      for (const cat in categoryCounts) {
        if (categoryCounts[cat] > maxCount) {
          maxCount = categoryCounts[cat];
          maxCategory = cat;
        }
      }
      
      result[business] = {
        category: maxCategory,
        count: maxCount,
        totalCategories: Object.keys(categoryCounts).length
      };
    }
    return result;
  }, [groupBy, groupedByBusiness, displayCategoryFor]);

  // מיון קבוצות (קטגוריות או בתי עסק) לפי sortOption
  // מיון לפי סכום משתמש בערך מוחלט - הסכומים הגדולים ביותר קודם (בלי קשר לכיוון)
  // למשל: הכנסה 5000, הוצאה 4500, הכנסה 1200, הוצאה 500, הכנסה 100, הוצאה 50
  const sortedCategories = React.useMemo(() => {
    const groups = allCategories.slice();
    const [sortField, sortDirection] = (sortOption as string).split('-');
    const dir = sortDirection === 'asc' ? 1 : -1;

    groups.sort((a, b) => {
      switch (sortField) {
        case 'sum':
          // ערך מוחלט - הסכומים הגדולים ביותר קודם
          return (Math.abs(categoryTotals[b]) - Math.abs(categoryTotals[a])) * dir;
        case 'name':
          return a.localeCompare(b, 'he') * dir;
        case 'count':
          return (groupCounts[b] - groupCounts[a]) * dir;
        default:
          return (Math.abs(categoryTotals[b]) - Math.abs(categoryTotals[a])) * dir;
      }
    });
    return groups;
  }, [allCategories, categoryTotals, groupCounts, sortOption]);

  // מיון כל העסקאות (ללא קיבוץ) - based on sortOption
  // מיון לפי סכום משתמש בערך מוחלט - הסכומים הגדולים ביותר קודם (בלי קשר לכיוון)
  const sortedDetails = React.useMemo(() => {
    const sorted = [...displayDetails];
    const [sortField, sortDirection] = (sortOption as string).split('-');
    const dir = sortDirection === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      if (sortField === 'date') {
        const dateA = parseDate(a.date || '');
        const dateB = parseDate(b.date || '');
        return (dateA - dateB) * dir;
      } else if (sortField === 'amount') {
        // ערך מוחלט - הסכומים הגדולים ביותר קודם
        const amountA = Math.abs(signedAmount(a));
        const amountB = Math.abs(signedAmount(b));
        return (amountB - amountA) * dir;
      }
      return 0;
    });
    return sorted;
  }, [displayDetails, sortOption]);

  // (הוסר missingCycles – לא בשימוש לאחר צמצום הלוגיקה)

  const handleSort = (col: 'date' | 'amount' | 'description' | 'category') => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  // Helper: extract year from transaction data if in yearly view
  const getYearFromData = () => {
    if (!isYearlyView || !details.length) return undefined;
    const firstDate = getEffectiveDate(details[0]);
    const parts = firstDate.split('/');
    if (parts.length >= 3) {
      let year = parts[2];
      if (year.length === 2) year = '20' + year;
      return year;
    }
    return undefined;
  };

  // Helper: get category def by name
  const getCategoryDef = (cat: string) => categoriesList?.find(c => c.name === cat);

  // קובע אם להציג תצוגה שנתית (כל החודשים) או רגילה (חודש בודד)
  const isYearlyView = typeof props.isYearlyView === 'boolean' ? props.isYearlyView : false;


  // Add support for displaying chargeDate and card last4 badge (hover vs always visible)
  const [showChargeDate, setShowChargeDate] = React.useState(initialPrefs.showChargeDate ?? false);
  const [showCardLast4, setShowCardLast4] = React.useState(initialPrefs.showCardLast4 ?? false); // when true: always show badge

  // Save preferences to localStorage when they change
  React.useEffect(() => {
    const prefs = { groupBy, sortOption, showChargeDate, showCardLast4 };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore localStorage errors
    }
  }, [groupBy, sortOption, showChargeDate, showCardLast4]);

  // Fallback: if yearly view and groupBy is 'business', reset to 'category'
  React.useEffect(() => {
    if (isYearlyView && groupBy === 'business') {
      setGroupBy('category');
    }
  }, [isYearlyView, groupBy]);

  // Close settings popover when clicking outside
  React.useEffect(() => {
    if (!showSettings) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettings]);

  // Unified context menu state
  type ContextMenuData = {
    x: number;
    y: number;
  } & (
      | { type: 'month'; monthIdx: number; category: string; year?: string; sourceType: 'category' | 'business' }
      | { type: 'group'; groupKey: string; groupType: 'business' | 'category'; isIncome: boolean }
      | { type: 'transaction'; transaction: CreditDetail }
    );

  const [contextMenu, setContextMenu] = React.useState<ContextMenuData | null>(null);
  const contextMenuRef = React.useRef<HTMLDivElement>(null);

  // Toast notification state for undo
  type ToastData = {
    message: string;
    undoAction?: () => void;
    timeout: number;
  };
  const [toast, setToast] = React.useState<ToastData | null>(null);
  const toastTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show toast with optional undo
  const showToast = React.useCallback((message: string, undoAction?: () => void, duration = 5000) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, undoAction, timeout: duration });
    toastTimeoutRef.current = setTimeout(() => setToast(null), duration);
  }, []);

  // Dismiss toast
  const dismissToast = React.useCallback(() => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(null);
  }, []);

  // Adjust context menu position after render to ensure it stays within viewport
  React.useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    
    const menu = contextMenuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 8;
    
    let newLeft = contextMenu.x;
    let newTop = contextMenu.y;
    
    // בדיקה אם התפריט חורג מימין
    if (rect.right > viewportWidth - padding) {
      newLeft = viewportWidth - rect.width - padding;
    }
    // בדיקה אם התפריט חורג משמאל
    if (newLeft < padding) {
      newLeft = padding;
    }
    // בדיקה אם התפריט חורג מלמטה
    if (rect.bottom > viewportHeight - padding) {
      newTop = viewportHeight - rect.height - padding;
    }
    // בדיקה אם התפריט חורג מלמעלה
    if (newTop < padding) {
      newTop = padding;
    }
    
    // עדכן את המיקום רק אם יש שינוי
    if (newLeft !== contextMenu.x || newTop !== contextMenu.y) {
      menu.style.left = `${newLeft}px`;
      menu.style.top = `${newTop}px`;
    }
  }, [contextMenu]);

  // Helper: calculate adjusted position to keep menu within viewport (initial estimate)
  const getAdjustedMenuPosition = React.useCallback((x: number, y: number, menuRef: React.RefObject<HTMLDivElement | null>) => {
    const menuWidth = menuRef.current?.offsetWidth || 200;
    const menuHeight = menuRef.current?.offsetHeight || 150;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 8;

    let adjustedX = x;
    let adjustedY = y;

    // בדיקה אם התפריט חורג מימין
    if (x + menuWidth + padding > viewportWidth) {
      adjustedX = viewportWidth - menuWidth - padding;
    }
    // בדיקה אם התפריט חורג משמאל
    if (adjustedX < padding) {
      adjustedX = padding;
    }
    // בדיקה אם התפריט חורג מלמטה
    if (y + menuHeight + padding > viewportHeight) {
      adjustedY = viewportHeight - menuHeight - padding;
    }
    // בדיקה אם התפריט חורג מלמעלה
    if (adjustedY < padding) {
      adjustedY = padding;
    }

    return { x: adjustedX, y: adjustedY };
  }, []);

  // Helper: check if a business or category is marked as income source
  const isIncomeSource = React.useCallback((description: string, sourceType: 'business' | 'category') => {
    return incomeSourceRules.some(r =>
      r.description === description &&
      r.isIncomeSource &&
      (r.sourceType === sourceType || (!r.sourceType && sourceType === 'business')) // תאימות אחורה
    );
  }, [incomeSourceRules]);

  // Close context menu on click elsewhere or scroll
  React.useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [contextMenu]);

  // ========================================
  // פונקציית עזר מאוחדת לרינדור תפריט הקשר
  // ========================================
  
  // חיתוך טקסט ארוך לתפריט הקשר
  const truncateText = (text: string, maxLength: number = 30): string => {
    if (!text || text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  type ContextMenuConfig = {
    title: string;
    icon: string;
    // עסקה ספציפית (אם רלוונטי)
    transaction?: CreditDetail;
    // שם בית עסק (לשינוי קטגוריה)
    businessName?: string;
    // שם קטגוריה (לעריכת קטגוריה)
    categoryName?: string;
    // סוג הקבוצה (business/category)
    groupType?: 'business' | 'category';
    // מידע חודש (לתצוגה שנתית)
    monthInfo?: { monthIdx: number; year?: string };
    // כמות עסקאות של בית עסק זה
    businessTransactionCount?: number;
  };

  const renderContextMenuContent = React.useCallback((config: ContextMenuConfig) => {
    const {
      title,
      icon,
      transaction,
      businessName,
      categoryName,
      groupType,
      monthInfo,
      businessTransactionCount = 0
    } = config;

    // האם להציג אפשרויות העברה הכנסה/הוצאה
    const showIncomeExpenseToggle = displayMode === 'expense' || displayMode === 'income';
    // האם מדובר בקטגוריה
    const isCategory = groupType === 'category';

    return (
      <>
        {/* כותרת */}
        <div className="TransactionsTable-context-menu-header">
          {icon} {title}{monthInfo ? ` - חודש ${monthInfo.monthIdx + 1}` : ''}
        </div>

        {/* פקודה: פתח חודש (רק בתצוגה שנתית) */}
        {monthInfo && (
          <button
            className="TransactionsTable-context-menu-btn"
            onClick={() => {
              setContextMenu(null);
              if (onMonthSelect) {
                const year = monthInfo.year || new Date().getFullYear().toString();
                const monthKey = `${String(monthInfo.monthIdx + 1).padStart(2, '0')}/${year}`;
                onMonthSelect(monthKey);
                setView('monthly');
              }
            }}
          >
            📅 פתח חודש
          </button>
        )}

        {/* פקודה: עריכת קטגוריה (כשמדובר בקטגוריה) */}
        {isCategory && categoryName && (
          <button
            className="TransactionsTable-context-menu-btn"
            onClick={() => {
              setContextMenu(null);
              if (onEditCategoryDefinition) {
                onEditCategoryDefinition(categoryName);
              } else {
                // TODO: פתיחת דיאלוג עריכת קטגוריה
                console.log('TODO: עריכת קטגוריה:', categoryName);
                alert(`עריכת קטגוריה "${categoryName}" - פיצ'ר בפיתוח`);
              }
            }}
          >
            ✏️ עריכת קטגוריה
          </button>
        )}

        {/* פקודה: שינוי קטגוריה (כשמדובר בבית עסק או עסקה) */}
        {(businessName || transaction) && (
          <button
            className="TransactionsTable-context-menu-btn"
            onClick={() => {
              setContextMenu(null);
              if (onEditCategory) {
                if (transaction) {
                  onEditCategory(transaction);
                } else if (businessName) {
                  const firstTx = details.find(d => d.description === businessName);
                  if (firstTx) onEditCategory(firstTx);
                }
              }
            }}
          >
            🏷️ שינוי קטגוריה
          </button>
        )}

        {/* פקודות נוספות לעסקה בודדת */}
        {transaction && (
          <>
            <hr className="TransactionsTable-context-menu-divider" />
            
            {/* חיפוש עסקאות דומות - פותח חיפוש גלובלי */}
            <button
              className="TransactionsTable-context-menu-btn"
              onClick={() => {
                setContextMenu(null);
                if (onOpenGlobalSearch) {
                  // פותח חיפוש גלובלי עם שם בית העסק
                  onOpenGlobalSearch(transaction.description || '');
                } else {
                  // Fallback: מציב בשדה החיפוש המקומי
                  setSearchTerm(transaction.description || '');
                }
              }}
            >
              🔍 חפש עסקאות דומות
            </button>

            {/* העתקת פרטי עסקה */}
            <button
              className="TransactionsTable-context-menu-btn"
              onClick={() => {
                setContextMenu(null);
                const txInfo = `${transaction.description} | ${formatDate(transaction.date)} | ${Math.abs(transaction.amount).toLocaleString()} ₪`;
                navigator.clipboard.writeText(txInfo).then(() => {
                  // TODO: הצגת הודעה שההעתקה הצליחה
                  console.log('הועתק:', txInfo);
                }).catch(() => {
                  console.error('שגיאה בהעתקה');
                });
              }}
            >
              📋 העתק פרטים
            </button>
          </>
        )}

        {/* פקודות העברה הכנסה/הוצאה - עם קיבוץ ויזואלי */}
        {showIncomeExpenseToggle && (
          <>
            <hr className="TransactionsTable-context-menu-divider" />
            
            {/* כותרת קבוצה */}
            <div className="TransactionsTable-context-menu-group-title">
              {displayMode === 'expense' ? '💰 העבר להכנסות' : '💸 העבר להוצאות'}
            </div>
            
            {displayMode === 'expense' ? (
              <>
                {/* העברת עסקה בודדת - תמיד ראשון */}
                {transaction && onMarkTransactionAsIncomeSource && (
                  <button
                    className="TransactionsTable-context-menu-btn TransactionsTable-context-menu-btn-grouped"
                    onClick={() => {
                      setContextMenu(null);
                      const txDesc = transaction.description || 'עסקה';
                      const txAmount = Math.abs(transaction.amount);
                      onMarkTransactionAsIncomeSource(transaction.id, true);
                      showToast(
                        `עסקה "${truncateText(txDesc, 20)}" (₪${txAmount.toLocaleString()}) הועברה להכנסות`,
                        () => onMarkTransactionAsIncomeSource(transaction.id, false)
                      );
                    }}
                  >
                    <span className="TransactionsTable-context-menu-btn-icon">👤</span>
                    <span className="TransactionsTable-context-menu-btn-text">
                      עסקה זו בלבד
                      <span className="TransactionsTable-context-menu-btn-meta">₪{Math.abs(transaction.amount).toLocaleString()}</span>
                    </span>
                  </button>
                )}

                {/* העברת בית עסק */}
                {businessName && businessTransactionCount > 0 && (
                  <button
                    className="TransactionsTable-context-menu-btn TransactionsTable-context-menu-btn-grouped"
                    onClick={() => {
                      setContextMenu(null);
                      if (onMarkAsIncomeSource) {
                        onMarkAsIncomeSource(businessName, 'business');
                        showToast(
                          `כל העסקאות של "${truncateText(businessName, 20)}" (${businessTransactionCount}) הועברו להכנסות`,
                          () => onMarkAsNotIncomeSource?.(businessName, 'business')
                        );
                      }
                    }}
                    title={businessName.length > 25 ? `העבר כל "${businessName}" להכנסות` : undefined}
                  >
                    <span className="TransactionsTable-context-menu-btn-icon">🏪</span>
                    <span className="TransactionsTable-context-menu-btn-text">
                      כל "{truncateText(businessName, 18)}"
                      <span className="TransactionsTable-context-menu-btn-meta">{businessTransactionCount} עסקאות</span>
                    </span>
                  </button>
                )}

                {/* העברת קטגוריה - מוצג גם לעסקאות */}
                {categoryName && (
                  <button
                    className="TransactionsTable-context-menu-btn TransactionsTable-context-menu-btn-grouped"
                    onClick={() => {
                      setContextMenu(null);
                      if (onMarkAsIncomeSource) {
                        onMarkAsIncomeSource(categoryName, 'category');
                        showToast(
                          `קטגוריה "${categoryName}" הועברה להכנסות`,
                          () => onMarkAsNotIncomeSource?.(categoryName, 'category')
                        );
                      }
                    }}
                  >
                    <span className="TransactionsTable-context-menu-btn-icon">📁</span>
                    <span className="TransactionsTable-context-menu-btn-text">
                      כל קטגוריה "{truncateText(categoryName, 15)}"
                    </span>
                  </button>
                )}
              </>
            ) : (
              <>
                {/* העברת עסקה בודדת */}
                {transaction && onMarkTransactionAsIncomeSource && (
                  <button
                    className="TransactionsTable-context-menu-btn TransactionsTable-context-menu-btn-grouped"
                    onClick={() => {
                      setContextMenu(null);
                      const txDesc = transaction.description || 'עסקה';
                      const txAmount = Math.abs(transaction.amount);
                      onMarkTransactionAsIncomeSource(transaction.id, false);
                      showToast(
                        `עסקה "${truncateText(txDesc, 20)}" (₪${txAmount.toLocaleString()}) הועברה להוצאות`,
                        () => onMarkTransactionAsIncomeSource(transaction.id, true)
                      );
                    }}
                  >
                    <span className="TransactionsTable-context-menu-btn-icon">👤</span>
                    <span className="TransactionsTable-context-menu-btn-text">
                      עסקה זו בלבד
                      <span className="TransactionsTable-context-menu-btn-meta">₪{Math.abs(transaction.amount).toLocaleString()}</span>
                    </span>
                  </button>
                )}

                {/* העברת בית עסק */}
                {businessName && businessTransactionCount > 0 && (
                  <button
                    className="TransactionsTable-context-menu-btn TransactionsTable-context-menu-btn-grouped"
                    onClick={() => {
                      setContextMenu(null);
                      if (onMarkAsNotIncomeSource) {
                        onMarkAsNotIncomeSource(businessName, 'business');
                        showToast(
                          `כל העסקאות של "${truncateText(businessName, 20)}" (${businessTransactionCount}) הועברו להוצאות`,
                          () => onMarkAsIncomeSource?.(businessName, 'business')
                        );
                      }
                    }}
                    title={businessName.length > 25 ? `העבר כל "${businessName}" להוצאות` : undefined}
                  >
                    <span className="TransactionsTable-context-menu-btn-icon">🏪</span>
                    <span className="TransactionsTable-context-menu-btn-text">
                      כל "{truncateText(businessName, 18)}"
                      <span className="TransactionsTable-context-menu-btn-meta">{businessTransactionCount} עסקאות</span>
                    </span>
                  </button>
                )}

                {/* העברת קטגוריה - מוצג גם לעסקאות */}
                {categoryName && (
                  <button
                    className="TransactionsTable-context-menu-btn TransactionsTable-context-menu-btn-grouped"
                    onClick={() => {
                      setContextMenu(null);
                      if (onMarkAsNotIncomeSource) {
                        onMarkAsNotIncomeSource(categoryName, 'category');
                        showToast(
                          `קטגוריה "${categoryName}" הועברה להוצאות`,
                          () => onMarkAsIncomeSource?.(categoryName, 'category')
                        );
                      }
                    }}
                  >
                    <span className="TransactionsTable-context-menu-btn-icon">📁</span>
                    <span className="TransactionsTable-context-menu-btn-text">
                      כל קטגוריה "{truncateText(categoryName, 15)}"
                    </span>
                  </button>
                )}
              </>
            )}
          </>
        )}
      </>
    );
  }, [
    displayMode,
    details,
    onMonthSelect,
    setView,
    onEditCategory,
    onEditCategoryDefinition,
    onMarkAsIncomeSource,
    onMarkAsNotIncomeSource,
    onMarkTransactionAsIncomeSource,
    onOpenGlobalSearch,
    setSearchTerm,
    showToast
  ]);

  // Reusable component for expand/collapse buttons
  const ExpandCollapseButtons = () => (
    <span style={{ marginRight: 4, display: 'flex', gap: 2 }}>
      <button
        className="TransactionsTable-expand-collapse-btn TransactionsTable-expand-collapse-btn-icon"
        title="פתח את כל הקטגוריות"
        aria-label="פתח את כל הקטגוריות"
        onClick={() => {
          const newState: Record<string, boolean> = {};
          sortedCategories.forEach(cat => { newState[cat] = true; });
          setOpenGroups(newState);
        }}
        style={{ padding: 2, background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" stroke="#444" strokeWidth="2" fill="none" /></svg>
      </button>
      <button
        className="TransactionsTable-expand-collapse-btn TransactionsTable-expand-collapse-btn-icon"
        title="סגור את כל הקטגוריות"
        aria-label="סגור את כל הקטגוריות"
        onClick={() => {
          const newState: Record<string, boolean> = {};
          sortedCategories.forEach(cat => { newState[cat] = false; });
          setOpenGroups(newState);
        }}
        style={{ padding: 2, background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M15 12l-5-5-5 5" stroke="#444" strokeWidth="2" fill="none" /></svg>
      </button>
    </span>
  );

  return (
    <div className="TransactionsTable-container">
      {/* {!isYearlyView && missingCycles.length > 0 && (
        <div
          className="TransactionsTable-missing-cycles-banner"
          style={{
            background: '#fff7ed',
            border: '1px solid #fdba74',
            padding: '8px 12px',
            borderRadius: 8,
            marginBottom: 12,
            lineHeight: 1.4
          }}
        >
          <strong>מחזורי חיוב ללא תנועת בנק מזוהה:</strong>
          <ul style={{ margin: '4px 0 0', paddingInlineStart: 20 }}>
            {missingCycles.map(c => (
              <li key={c.cycleKey}>
                {c.chargeDate} {c.cardLast4 ? `(כרטיס ${c.cardLast4})` : '(כל הכרטיסים)'} – נטו {c.netCharge?.toLocaleString()} ₪. ייתכן שחסר דף בנק / פירוט אשראי.
              </li>
            ))}
          </ul>
        </div>
      )} */}
      <div className="TransactionsTable-title-bar TransactionsTable-toolbar">
        {/* Controls on the left */}
        <div className="TransactionsTable-toolbar-controls">

          {/* Settings button */}

          {!isYearlyView && (
            <div className="TransactionsTable-settings-wrapper" ref={settingsRef}>
              <button
                className="TransactionsTable-settings-btn"
                onClick={() => setShowSettings(!showSettings)}
                aria-label="הגדרות תצוגה"
                aria-expanded={showSettings}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" >
                  <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
              </button>

              {/* Settings popover */}
              {showSettings && (
                <div className="TransactionsTable-settings-popover">
                  <div className="TransactionsTable-settings-title">הגדרות תצוגה</div>

                  <label className="TransactionsTable-toggle-row">
                    <span className="TransactionsTable-toggle-label">הצג תאריך חיוב</span>
                    <div className="TransactionsTable-toggle-switch">
                      <input
                        type="checkbox"
                        checked={showChargeDate}
                        onChange={(e) => setShowChargeDate(e.target.checked)}
                      />
                      <span className="TransactionsTable-toggle-slider"></span>
                    </div>
                  </label>

                  <label className="TransactionsTable-toggle-row">
                    <span className="TransactionsTable-toggle-label">תמיד הצג ספרות כרטיס</span>
                    <div className="TransactionsTable-toggle-switch">
                      <input
                        type="checkbox"
                        checked={showCardLast4}
                        onChange={(e) => setShowCardLast4(e.target.checked)}
                      />
                      <span className="TransactionsTable-toggle-slider"></span>
                    </div>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Group dropdown */}
          <div className="TransactionsTable-dropdown-wrapper" title={isYearlyView ? 'בתצוגה שנתית ניתן לקבץ לפי קטגוריה בלבד' : undefined}>
            <label className="TransactionsTable-dropdown-label">קיבוץ:</label>
            <select
              className="TransactionsTable-dropdown"
              value={isYearlyView ? 'category' : groupBy}
              disabled={isYearlyView}
              onChange={(e) => {
                const newGroupBy = e.target.value as GroupByOption;
                setGroupBy(newGroupBy);
                // Reset sort option to appropriate default when changing group mode
                if (newGroupBy === 'none') {
                  setSortOption('date-desc');
                } else {
                  setSortOption('sum-desc');
                }
              }}
            >
              <option value="category">לפי קטגוריה</option>
              {!isYearlyView && <option value="business">לפי בית עסק</option>}
              {!isYearlyView && <option value="none">ללא קיבוץ</option>}
            </select>
          </div>

          {/* Sort dropdown */}
          <div className="TransactionsTable-dropdown-wrapper">
            <label className="TransactionsTable-dropdown-label">מיון:</label>
            <select
              className="TransactionsTable-dropdown"
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as TransactionSortOption | GroupSortOption)}
            >
              {groupBy === 'none' ? (
                <>
                  <option value="amount-asc">סכום (גבוה ← נמוך)</option>
                  <option value="amount-desc">סכום (נמוך ← גבוה)</option>
                  <option value="date-asc">תאריך (ישן ← חדש)</option>
                  <option value="date-desc">תאריך (חדש ← ישן)</option>
                </>
              ) : (
                <>
                  <option value="sum-asc">סכום (גבוה ← נמוך)</option>
                  <option value="sum-desc">סכום (נמוך ← גבוה)</option>
                  <option value="name-asc">שם (א ← ת)</option>
                  <option value="name-desc">שם (ת ← א)</option>
                  <option value="count-desc">כמות (מעט ← רב)</option>
                  <option value="count-asc">כמות (רב ← מעט)</option>
                </>
              )}
            </select>
          </div>

          {/* Search input - visible in both monthly and yearly views */}
          <div className="TransactionsTable-search-wrapper">
            <input
              type="text"
              className="TransactionsTable-search-input"
              placeholder="🔍 חיפוש בתיאור..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button 
                className="TransactionsTable-search-clear" 
                onClick={() => setSearchTerm('')}
                aria-label="נקה חיפוש"
              >
                ✕
              </button>
            )}
          </div>

        </div>

        {/* Title on the right */}
        <h2 className="TransactionsTable-title">פירוט עסקאות</h2>
      </div>

      {/* Search results banner */}
      {searchTerm && searchSummary && (() => {
        // חשב גם סיכום לכל המערכת
        const sourceForAll = allDetails || details;
        const term = searchTerm.toLowerCase();
        const allMatchingTransactions = sourceForAll.filter(d => 
          d.description?.toLowerCase().includes(term)
        );
        const allMatchCount = allMatchingTransactions.length;
        const allMatchTotal = allMatchingTransactions.reduce((sum, d) => {
          if (shouldSkipInCalculation(d)) return sum;
          return sum + signedAmount(d);
        }, 0);
        const hasMoreInSystem = allMatchCount > searchSummary.count;
        
        return (
          <div className="TransactionsTable-search-results-banner">
            <span className="TransactionsTable-search-results-count">
              נמצאו <strong>{searchSummary.count}</strong> עסקאות בחודש זה התואמות "{searchTerm}"
              {hasMoreInSystem && (
                <span className="TransactionsTable-search-all-count">
                  &nbsp;(מתוך <strong>{allMatchCount}</strong> בכל התקופות)
                </span>
              )}
            </span>
            <span className="TransactionsTable-search-results-total">
              סה"כ בחודש: <strong>{searchSummary.total.toLocaleString()}</strong> ₪
              {hasMoreInSystem && (
                <span className="TransactionsTable-search-all-total">
                  &nbsp;| בכל התקופות: <strong>{allMatchTotal.toLocaleString()}</strong> ₪
                </span>
              )}
            </span>
          </div>
        );
      })()}

      {/* Empty state - when no data */}
      {displayDetails.length === 0 && !searchTerm && (
        <div className="TransactionsTable-empty-state">
          <span className="TransactionsTable-empty-icon">📭</span>
          <p className="TransactionsTable-empty-text">אין עסקאות להצגה בחודש זה</p>
        </div>
      )}

      {/* Empty search results */}
      {displayDetails.length === 0 && searchTerm && (
        <div className="TransactionsTable-empty-state">
          <span className="TransactionsTable-empty-icon">🔍</span>
          <p className="TransactionsTable-empty-text">לא נמצאו עסקאות התואמות לחיפוש "{searchTerm}"</p>
        </div>
      )}

      {displayDetails.length > 0 && <table className={
        'TransactionsTable-table' + (isYearlyView ? ' TransactionsTable-yearly-table' : '')
      } style={{ tableLayout: 'fixed' }}>
        <thead className="TransactionsTable-thead">
          <tr>
            {/* דינמי: עמודות לפי מצב */}
            {isYearlyView ? (
              <>
                <th className="TransactionsTable-th TransactionsTable-th-top-right TransactionsTable-category-column" style={{ width: CATEGORY_COLUMN_WIDTH, minWidth: CATEGORY_COLUMN_WIDTH, position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
                    קטגוריה
                    <ExpandCollapseButtons />
                  </div>
                </th>
                {Array.from({ length: 12 }).map((_, i) => (
                  <th className="TransactionsTable-th TransactionsTable-th-amount" key={i}>{i + 1}</th>
                ))}
                <th className="TransactionsTable-th TransactionsTable-th-top-left TransactionsTable-th-amount">סך הכל</th>
              </>
            ) : groupBy !== 'none' ? (
              <>
                <th className="TransactionsTable-th TransactionsTable-th-top-right TransactionsTable-category-column" style={{ width: groupBy === 'business' ? BUSINESS_COLUMN_WIDTH : CATEGORY_COLUMN_WIDTH, minWidth: groupBy === 'business' ? BUSINESS_COLUMN_WIDTH : CATEGORY_COLUMN_WIDTH, position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
                    {groupBy === 'category' ? 'קטגוריה' : 'בית עסק'}
                    <ExpandCollapseButtons />
                  </div>
                </th>
                <th className="TransactionsTable-th TransactionsTable-th-date">תאריך</th>
                  {showChargeDate && <th className="TransactionsTable-th TransactionsTable-th-date" style={{ width: '100px' }}>תאריך חיוב</th>}
                <th className="TransactionsTable-th">תיאור</th>
                {/* עמודת ספרות כרטיס הוסרה; badge מוצג ליד תג אשראי */}
                <th className="TransactionsTable-th TransactionsTable-th-top-left TransactionsTable-th-amount">סכום</th>
              </>
            ) : (
              <>
                <th className="TransactionsTable-th TransactionsTable-th-top-right TransactionsTable-th-date" onClick={() => handleSort('date')}>
                  תאריך {sortBy === 'date' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
                {showChargeDate && <th className="TransactionsTable-th TransactionsTable-th-date" style={{ width: '100px' }}>תאריך חיוב</th>}
                <th className="TransactionsTable-th" onClick={() => handleSort('description')}>
                  תיאור {sortBy === 'description' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th className="TransactionsTable-th" onClick={() => handleSort('category')} style={{ width: CATEGORY_COLUMN_WIDTH, minWidth: CATEGORY_COLUMN_WIDTH }}>
                  קטגוריה {sortBy === 'category' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
                {/* עמודת ספרות כרטיס הוסרה; badge מוצג ליד תג אשראי */}
                <th className="TransactionsTable-th TransactionsTable-th-top-left TransactionsTable-th-amount" onClick={() => handleSort('amount')}>
                  סכום {sortBy === 'amount' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {/* דינמי: שורות לפי מצב */}
          {isYearlyView ? (
            sortedCategories.map(cat => {
              // חישוב סכומים לפי בית עסק לכל חודש
              const businessesByMonth: Record<number, Record<string, number>> = {};
              for (let m = 0; m < 12; m++) businessesByMonth[m] = {};
              (grouped[cat] || []).forEach(tx => {
                const effDate = getEffectiveDate(tx);
                const parts = effDate.split('/') || [];
                let monthIdx = 0;
                if (parts.length >= 2) {
                  monthIdx = Math.max(0, Math.min(11, parseInt(parts[1], 10) - 1));
                }
                const desc = tx.description || '---';
                if (!businessesByMonth[monthIdx][desc]) businessesByMonth[monthIdx][desc] = 0;
                businessesByMonth[monthIdx][desc] += signedAmount(tx);
              });
              const expanded = !!openGroups[cat];
              const categoryBgColor = getCategoryDef(cat)?.color || categoryColors[cat];
              const categoryColor = getReadableTextColor(categoryBgColor);
              const isCategoryIncomeYearly = isIncomeSource(cat, 'category');
              return (
                <React.Fragment key={cat}>
                  <tr
                    className="TransactionsTable-group-row"
                    style={{ background: categoryBgColor + '22', fontWeight: 700 }}
                  >
                    <td
                      className="TransactionsTable-group-toggle TransactionsTable-category-column"
                      onClick={() => handleToggleGroup(cat)}
                      title={expanded ? 'סגור קטגוריה' : 'הצג פירוט בתי עסק'}
                    >
                      <span className={"TransactionsTable-group-toggle-arrow" + (expanded ? ' open' : '')}>
                        {expanded ? '▼' : '►'}
                      </span>
                      <span className="TransactionsTable-group-label" style={{ background: categoryBgColor, color: categoryColor }}>
                        {getCategoryDef(cat)?.icon && <span className="TransactionsTable-category-icon">{getCategoryDef(cat)?.icon}</span>}
                        {isCategoryIncomeYearly && <span className="TransactionsTable-income-icon" title="מקור הכנסה">💰</span>}
                        {cat}
                      </span>
                    </td>
                    {monthlyTotalsByCategory[cat].map((amt, i) => (
                      <td
                        className="TransactionsTable-td TransactionsTable-td-amount"
                        key={i}
                        style={{ cursor: 'pointer', position: 'relative' }}
                        onClick={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          setContextMenu({ type: 'month', x: e.clientX, y: e.clientY, monthIdx: i, category: cat, year: getYearFromData(), sourceType: 'category' });
                        }}
                        onContextMenu={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          setContextMenu({ type: 'month', x: e.clientX, y: e.clientY, monthIdx: i, category: cat, year: getYearFromData(), sourceType: 'category' });
                        }}
                      >
                        {amt ? amt.toLocaleString() : ''}
                      </td>
                    ))}
                    <td className="TransactionsTable-group-total">{categoryTotals[cat].toLocaleString()}</td>
                  </tr>
                  {expanded && (
                    Object.values(businessesByMonth).some(monthObj => Object.keys(monthObj).length > 0) ? (
                      Object.keys(
                        Object.values(businessesByMonth).reduce((acc, monthObj) => ({ ...acc, ...monthObj }), {})
                      ).map(business => {
                        const isBusinessIncome = isIncomeSource(business, 'business');
                        return (
                          <tr
                            key={business}
                            className="TransactionsTable-business-row"
                          >
                            <td
                              className="TransactionsTable-business-label TransactionsTable-category-column"
                              style={{ paddingLeft: 32 }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setContextMenu({
                                  type: 'group',
                                  x: e.clientX,
                                  y: e.clientY,
                                  groupKey: business,
                                  groupType: 'business',
                                  isIncome: isBusinessIncome
                                });
                              }}
                            >
                              {isBusinessIncome && <span className="TransactionsTable-income-icon" title="מקור הכנסה">💰</span>}
                              {highlightText(business)}
                            </td>
                            {Array.from({ length: 12 }).map((_, i) => (
                              <td
                                className="TransactionsTable-td TransactionsTable-td-amount"
                                key={i}
                                style={{ cursor: 'pointer', position: 'relative' }}
                                onClick={e => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setContextMenu({ type: 'month', x: e.clientX, y: e.clientY, monthIdx: i, category: business, year: getYearFromData(), sourceType: 'business' });
                                }}
                                onContextMenu={e => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setContextMenu({ type: 'month', x: e.clientX, y: e.clientY, monthIdx: i, category: business, year: getYearFromData(), sourceType: 'business' });
                                }}
                              >
                                {businessesByMonth[i][business] ? businessesByMonth[i][business].toLocaleString() : ''}
                              </td>
                            ))}
                            <td className="TransactionsTable-group-total">
                              {Object.values(businessesByMonth).reduce((sum, monthObj) => sum + (monthObj[business] || 0), 0).toLocaleString()}
                            </td>
                          </tr>
                        )
                      })
                    ) : null
                  )}
                </React.Fragment>
              );
            })
          ) : groupBy !== 'none' ? (
            sortedCategories.map(cat => {
              // בקיבוץ לפי בית עסק - צבע הרקע לפי הקטגוריה הדומיננטית
              const domCatInfo = groupBy === 'business' ? dominantCategoryByBusiness[cat] : null;
              const categoryBgColor = groupBy === 'business' && domCatInfo
                ? (getCategoryDef(domCatInfo.category)?.color || categoryColors[domCatInfo.category] || '#6366f1')
                : (getCategoryDef(cat)?.color || categoryColors[cat]);
              const categoryColor = getReadableTextColor(categoryBgColor);
              const isBusinessIncome = groupBy === 'business' && isIncomeSource(cat, 'business');
              const isCategoryIncome = groupBy === 'category' && isIncomeSource(cat, 'category');
              const isIncome = isBusinessIncome || isCategoryIncome;
              return (
                <React.Fragment key={cat}>
                  <tr
                    className="TransactionsTable-group-row"
                    style={{ background: categoryBgColor + '22', fontWeight: 700 }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({
                        type: 'group',
                        x: e.clientX,
                        y: e.clientY,
                        groupKey: cat,
                        groupType: groupBy === 'business' ? 'business' : 'category',
                        isIncome
                      });
                    }}
                  >
                    <td
                      className="TransactionsTable-group-toggle TransactionsTable-category-column"
                      onClick={() => handleToggleGroup(cat)}
                      title={openGroups[cat] ? 'סגור קבוצה' : 'פתח קבוצה'}
                    >
                      <span className={"TransactionsTable-group-toggle-arrow" + (openGroups[cat] ? ' open' : '')}>
                        {openGroups[cat] ? '▼' : '►'}
                      </span>
                      {groupBy === 'business' ? (
                        // בית עסק - ללא עיצוב
                        <>
                          {isIncome && <span className="TransactionsTable-income-icon" title="מקור הכנסה">💰</span>}
                          {cat}
                          <span className="TransactionsTable-group-count" style={{ marginRight: 4 }}>({groupCounts[cat]})</span>
                        </>
                      ) : (
                        // קטגוריה - תווית צבעונית
                        <span className="TransactionsTable-group-label" style={{ background: categoryBgColor, color: categoryColor }}>
                          {getCategoryDef(cat)?.icon && <span className="TransactionsTable-category-icon">{getCategoryDef(cat)?.icon}</span>}
                          {isIncome && <span className="TransactionsTable-income-icon" title="מקור הכנסה">💰</span>}
                          {cat}
                          <span className="TransactionsTable-group-count">({groupCounts[cat]})</span>
                        </span>
                      )}
                      {/* הצגת קטגוריה דומיננטית כשמקובצים לפי בית עסק */}
                      {groupBy === 'business' && domCatInfo && (() => {
                        const catDef = getCategoryDef(domCatInfo.category);
                        const catBgColor = catDef?.color || categoryColors[domCatInfo.category] || '#ddd';
                        const catTextColor = getReadableTextColor(catBgColor);
                        return (
                          <span 
                            className="TransactionsTable-business-category-badge"
                            style={{ 
                              background: catBgColor, 
                              color: catTextColor,
                              marginRight: 8,
                              padding: '2px 8px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 500
                            }}
                            title={domCatInfo.totalCategories > 1 
                              ? `קטגוריה עיקרית: ${domCatInfo.category} (${domCatInfo.count} עסקאות מתוך ${groupCounts[cat]}). יש עוד ${domCatInfo.totalCategories - 1} קטגוריות.`
                              : `קטגוריה: ${domCatInfo.category}`
                            }
                          >
                            {catDef?.icon && <span style={{ marginLeft: 4 }}>{catDef.icon}</span>}
                            {domCatInfo.category}
                            {domCatInfo.totalCategories > 1 && (
                              <span style={{ opacity: 0.7, marginRight: 4 }}>+{domCatInfo.totalCategories - 1}</span>
                            )}
                          </span>
                        );
                      })()}
                    </td>
                    <td></td>
                    {showChargeDate && <td></td>}
                    <td></td>
                    <td className="TransactionsTable-group-total">{categoryTotals[cat].toLocaleString()}</td>
                  </tr>
                  {openGroups[cat] && grouped[cat].sort((a, b) => parseDate(b.date) - parseDate(a.date)).map((d, idx) => {
                    const isHighlighted = d.id === highlightedTransactionId;
                    return (
                    <tr
                      key={d.id}
                      ref={isHighlighted ? highlightedRowRef : undefined}
                      className={`${idx % 2 === 0 ? 'TransactionsTable-row-alt' : 'TransactionsTable-row'}${isHighlighted ? ' TransactionsTable-row-highlighted' : ''}`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({
                          type: 'transaction',
                          x: e.clientX,
                          y: e.clientY,
                          transaction: d
                        });
                      }}
                    >
                      <td className="TransactionsTable-td TransactionsTable-category-column">
                        {/* הצגת קטגוריה בשורת עסקה כשמקובצים לפי בית עסק ויש יותר מקטגוריה אחת */}
                        {groupBy === 'business' && domCatInfo && domCatInfo.totalCategories > 1 && (() => {
                          const txCat = displayCategoryFor(d);
                          const txCatDef = getCategoryDef(txCat);
                          const txCatBgColor = txCatDef?.color || categoryColors[txCat] || '#ddd';
                          const txCatTextColor = getReadableTextColor(txCatBgColor);
                          return (
                            <span 
                              style={{ 
                                background: txCatBgColor, 
                                color: txCatTextColor,
                                padding: '2px 8px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 500,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                              title={`קטגוריה: ${txCat}`}
                            >
                              {txCatDef?.icon && <span>{txCatDef.icon}</span>}
                              {txCat}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="TransactionsTable-td TransactionsTable-td-date">
                        {formatDate(d.date)}
                        {/* Source badge + optional card name/last4 badge */}
                        <span
                          className={'source-badge' + (d.source === 'bank' ? ' source-bank' : ' source-credit')}
                          style={{ marginRight: 6, fontSize: 12, padding: '2px 6px', borderRadius: 6, background: d.source === 'bank' ? '#e0f2fe' : '#fce7f3', color: d.source === 'bank' ? '#0369a1' : '#9d174d', display: 'inline-block' }}
                          title={d.source === 'bank' ? undefined : (d.cardLast4 ? `כרטיס ••••${d.cardLast4}` : undefined)}
                        >
                          {d.source === 'bank' ? 'בנק' : 'אשראי'}
                        </span>
                        {d.source !== 'bank' && d.cardLast4 && (
                          <span
                            className={'TransactionsTable-card-badge' + (showCardLast4 ? ' always-visible' : '')}
                            style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, background: '#ececec', color: '#333', fontFamily: cardNames[d.cardLast4] ? 'inherit' : 'monospace', marginRight: 4, display: 'inline-block' }}
                            title={`כרטיס ••••${d.cardLast4}`}
                          >
                            {getCardDisplayName(d.cardLast4)}
                          </span>
                        )}
                        {d.transactionType === 'credit_charge' && (
                          <span style={{
                            marginRight: 4, fontSize: 12, padding: '2px 6px', borderRadius: 6,
                            background: '#d1fae5', color: '#065f46'
                          }} title={`חיוב אשראי – מפורק בעסקאות הכרטיס${d.matchedCardLast4 ? ` (${getCardDisplayName(d.matchedCardLast4)})` : ''}`}>
                            חיוב אשראי {d.matchedCardLast4 ? `(${getCardDisplayName(d.matchedCardLast4)})` : (d.relatedTransactionIds?.length ? `(${d.relatedTransactionIds.length})` : '')}
                          </span>
                        )}
                        {d.transactionType === 'credit_charge_combined' && (
                          <span style={{
                            marginRight: 4, fontSize: 12, padding: '2px 6px', borderRadius: 6,
                            background: '#ede9fe', color: '#5b21b6'
                          }} title={`חיוב בנק מאוחד – משלב ${d.matchedComboSize || (d.matchedCycleKeys?.length || 0)} מחזורים`}>
                            חיוב מאוחד {(() => {
                              const size = d.matchedComboSize || (d.matchedCycleKeys?.length || 0);
                              return size ? `(${size})` : '';
                            })()}
                          </span>
                        )}
                        {d.source === 'bank' && d.transactionType === 'credit_charge' && !d.relatedTransactionIds?.length && (
                          <span style={{
                            marginRight: 4, fontSize: 12, padding: '2px 6px', borderRadius: 6,
                            background: '#fee2e2', color: '#991b1b'
                          }} title="חיוב אשראי ללא פירוט – טען דף פירוט">
                            חסר פירוט אשראי
                          </span>
                        )}
                      </td>
                      {showChargeDate && <td className="TransactionsTable-td TransactionsTable-td-date">{d.chargeDate ? formatDate(d.chargeDate) : ''}</td>}
                      <td className="TransactionsTable-td">{highlightText(d.description)}</td>
                      <td 
                        className="TransactionsTable-td TransactionsTable-td-amount" 
                        style={{ 
                          color: d.direction === 'income' ? '#16a34a' : '#dc2626',
                          opacity: shouldSkipInCalculation(d) ? 0.5 : 1,
                          textDecoration: shouldSkipInCalculation(d) ? 'line-through' : 'none'
                        }}
                        title={d.transactionAmount ? `סכום עסקה מקורי: ${d.transactionAmount.toLocaleString()}${d.transactionCurrency ? ' ' + d.transactionCurrency : ''}` : undefined}
                      >
                        {d.direction === 'income' ? '+' : '-'}{Math.abs(d.amount).toLocaleString()}
                        {d.transactionAmount && (
                          <span style={{ fontSize: 10, color: '#888', marginRight: 4 }}>
                            ({d.transactionAmount.toLocaleString()}{d.transactionCurrency ? ' ' + d.transactionCurrency : ''})
                          </span>
                        )}
                        {shouldSkipInCalculation(d) && (
                          <span style={{ fontSize: 10, color: '#888', marginRight: 4 }} title="לא נספר - מפורט בעסקאות האשראי">
                            (לא נספר)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                  })}
                </React.Fragment>
              )
            })
          ) : (
            sortedDetails.map((d, idx) => {
              const isHighlighted = d.id === highlightedTransactionId;
              return (
                <tr
                  key={d.id}
                  ref={isHighlighted ? highlightedRowRef : undefined}
                  className={`${idx % 2 === 0 ? 'TransactionsTable-row-alt' : 'TransactionsTable-row'}${isHighlighted ? ' TransactionsTable-row-highlighted' : ''}`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({
                      type: 'transaction',
                      x: e.clientX,
                      y: e.clientY,
                      transaction: d
                    });
                  }}
                >
                  <td className="TransactionsTable-td TransactionsTable-td-date">
                    {formatDate(d.date)}
                    <span
                      className={'source-badge' + (d.source === 'bank' ? ' source-bank' : ' source-credit')}
                      style={{ marginRight: 6, fontSize: 12, padding: '2px 6px', borderRadius: 6, background: d.source === 'bank' ? '#e0f2fe' : '#fce7f3', color: d.source === 'bank' ? '#0369a1' : '#9d174d', display: 'inline-block' }}
                      title={d.source === 'bank' ? undefined : (d.cardLast4 ? `כרטיס ••••${d.cardLast4}` : undefined)}
                    >
                      {d.source === 'bank' ? 'בנק' : 'אשראי'}
                    </span>
                    {d.source !== 'bank' && d.cardLast4 && (
                      <span
                        className={'TransactionsTable-card-badge' + (showCardLast4 ? ' always-visible' : '')}
                        style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, background: '#ececec', color: '#333', fontFamily: cardNames[d.cardLast4] ? 'inherit' : 'monospace', marginRight: 4, display: 'inline-block' }}
                        title={`כרטיס ••••${d.cardLast4}`}
                      >
                        {getCardDisplayName(d.cardLast4)}
                      </span>
                    )}
                    {d.transactionType === 'credit_charge' && (
                      <span style={{
                        marginRight: 4, fontSize: 12, padding: '2px 6px', borderRadius: 6,
                        background: '#d1fae5', color: '#065f46'
                      }} title={`חיוב אשראי – מפורק בעסקאות הכרטיס${d.matchedCardLast4 ? ` (${getCardDisplayName(d.matchedCardLast4)})` : ''}`}>
                        חיוב אשראי {d.matchedCardLast4 ? `(${getCardDisplayName(d.matchedCardLast4)})` : (d.relatedTransactionIds?.length ? `(${d.relatedTransactionIds.length})` : '')}
                      </span>
                    )}
                    {d.transactionType === 'credit_charge_combined' && (
                      <span style={{
                        marginRight: 4, fontSize: 12, padding: '2px 6px', borderRadius: 6,
                        background: '#ede9fe', color: '#5b21b6'
                      }} title={`חיוב בנק מאוחד – משלב ${d.matchedComboSize || (d.matchedCycleKeys?.length || 0)} מחזורים`}>
                        חיוב מאוחד {(() => {
                          const size = d.matchedComboSize || (d.matchedCycleKeys?.length || 0);
                          return size ? `(${size})` : '';
                        })()}
                      </span>
                    )}
                    {d.source === 'bank' && d.transactionType === 'credit_charge' && !d.relatedTransactionIds?.length && (
                      <span style={{
                        marginRight: 4, fontSize: 12, padding: '2px 6px', borderRadius: 6,
                        background: '#fee2e2', color: '#991b1b'
                      }} title="חיוב אשראי ללא פירוט – טען דף פירוט">
                        חסר פירוט אשראי
                      </span>
                    )}
                  </td>
                  {showChargeDate && <td className="TransactionsTable-td TransactionsTable-td-date">{d.chargeDate ? formatDate(d.chargeDate) : ''}</td>}
                  <td className="TransactionsTable-td">{highlightText(d.description)}</td>
                  <td className="TransactionsTable-td">
                    {(() => {
                      const dispCat = displayCategoryFor(d);
                      const categoryBgColor = (d.category ? (getCategoryDef(d.category)?.color) : undefined) || categoryColors[dispCat] || '#ddd';
                      const categoryColor = getReadableTextColor(categoryBgColor);
                      return (
                        <span
                          className={
                            'TransactionsTable-category-label' + (onEditCategory ? ' TransactionsTable-category-label-editable' : '')
                          }
                          style={{
                            background: categoryBgColor,
                            color: categoryColor,
                            cursor: onEditCategory ? 'pointer' : undefined,
                            textDecoration: onEditCategory ? 'underline dotted' : undefined
                          }}
                          title={onEditCategory ? 'לחץ כדי לשנות קטגוריה' : undefined}
                          onClick={onEditCategory ? () => onEditCategory(d) : undefined}
                        >
                          {getCategoryDef(d.category || '')?.icon && <span className="TransactionsTable-category-icon">{getCategoryDef(d.category || '')?.icon}</span>}
                          {dispCat}
                        </span>
                      );
                    })()}
                  </td>
                  {/* ספרות כרטיס מוצגות כעת כ-badge בתוך תא התאריך */}
                  <td 
                    className="TransactionsTable-td TransactionsTable-td-amount" 
                    style={{ 
                      color: d.direction === 'income' ? '#16a34a' : '#dc2626',
                      opacity: shouldSkipInCalculation(d) ? 0.5 : 1,
                      textDecoration: shouldSkipInCalculation(d) ? 'line-through' : 'none'
                    }}
                    title={d.transactionAmount ? `סכום עסקה מקורי: ${d.transactionAmount.toLocaleString()}${d.transactionCurrency ? ' ' + d.transactionCurrency : ''}` : undefined}
                  >
                    {d.direction === 'income' ? '+' : '-'}{Math.abs(d.amount).toLocaleString()}
                    {d.transactionAmount && (
                      <span style={{ fontSize: 10, color: '#888', marginRight: 4 }}>
                        ({d.transactionAmount.toLocaleString()}{d.transactionCurrency ? ' ' + d.transactionCurrency : ''})
                      </span>
                    )}
                    {shouldSkipInCalculation(d) && (
                      <span style={{ fontSize: 10, color: '#888', marginRight: 4 }} title="לא נספר - מפורט בעסקאות האשראי">
                        (לא נספר)
                      </span>
                    )}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
        {/* שורת סיכום חודשי לכל הקטגוריות - מוצגת רק בתצוגה שנתית */}
        {isYearlyView && (
          <tfoot>
            <tr className="TransactionsTable-summary-row" style={{ background: '#fafafa', fontWeight: 700 }}>
              <td className="TransactionsTable-category-column">סיכום</td>
              {monthlyTotalsAll.map((amt, i) => (
                <td key={i} className="TransactionsTable-td TransactionsTable-td-amount">{amt ? amt.toLocaleString() : ''}</td>
              ))}
              <td className="TransactionsTable-group-total">{grandTotalAll.toLocaleString()}</td>
            </tr>
          </tfoot>
        )}
        {/* שורת סיכום לתצוגה חודשית */}
        {!isYearlyView && displayDetails.length > 0 && (
          <tfoot>
            <tr className="TransactionsTable-summary-row" style={{ background: '#fafafa', fontWeight: 700 }}>
              {groupBy !== 'none' ? (
                <>
                  <td colSpan={showChargeDate ? 4 : 3} style={{ textAlign: 'right', paddingRight: 16 }}>
                    סיכום ({displayDetails.length} עסקאות)
                  </td>
                  <td className="TransactionsTable-td TransactionsTable-td-amount TransactionsTable-group-total">
                    {displayDetails.reduce((sum, d) => shouldSkipInCalculation(d) ? sum : sum + signedAmount(d), 0).toLocaleString()}
                  </td>
                </>
              ) : (
                <>
                  <td colSpan={showChargeDate ? 3 : 2} style={{ textAlign: 'right', paddingRight: 16 }}>
                    סיכום ({displayDetails.length} עסקאות)
                  </td>
                  <td></td>
                  <td className="TransactionsTable-td TransactionsTable-td-amount TransactionsTable-group-total">
                    {displayDetails.reduce((sum, d) => shouldSkipInCalculation(d) ? sum : sum + signedAmount(d), 0).toLocaleString()}
                  </td>
                </>
              )}
            </tr>
          </tfoot>
        )}
      </table>
      }

      {/* Unified Context Menu - משתמש בפונקציה המאוחדת */}
      {contextMenu && (() => {
        const pos = getAdjustedMenuPosition(contextMenu.x, contextMenu.y, contextMenuRef);
        const sourceForCount = allDetails || details;

        // בניית קונפיגורציה לפי סוג התפריט
        let menuConfig: ContextMenuConfig | null = null;

        if (contextMenu.type === 'month') {
          const isBusinessRow = contextMenu.sourceType === 'business';
          const businessTxCount = isBusinessRow 
            ? sourceForCount.filter(d => d.description === contextMenu.category).length 
            : 0;
          
          menuConfig = {
            title: contextMenu.category,
            icon: isBusinessRow ? '🏪' : '📁',
            groupType: isBusinessRow ? 'business' : 'category',
            categoryName: isBusinessRow ? undefined : contextMenu.category,
            businessName: isBusinessRow ? contextMenu.category : undefined,
            monthInfo: { monthIdx: contextMenu.monthIdx, year: contextMenu.year },
            businessTransactionCount: businessTxCount
          };
        } else if (contextMenu.type === 'group') {
          const isCategory = contextMenu.groupType === 'category';
          const businessTxCount = !isCategory 
            ? sourceForCount.filter(d => d.description === contextMenu.groupKey).length 
            : 0;
          
          menuConfig = {
            title: contextMenu.groupKey,
            icon: isCategory ? '📁' : '🏪',
            groupType: contextMenu.groupType,
            categoryName: isCategory ? contextMenu.groupKey : undefined,
            businessName: isCategory ? undefined : contextMenu.groupKey,
            businessTransactionCount: businessTxCount
          };
        } else if (contextMenu.type === 'transaction') {
          const tx = contextMenu.transaction;
          const businessTxCount = sourceForCount.filter(d => d.description === tx.description).length;
          const txCategory = displayCategoryFor(tx);
          
          menuConfig = {
            title: tx.description || 'עסקה',
            icon: '💳',
            transaction: tx,
            businessName: tx.description,
            categoryName: txCategory, // הוסף קטגוריה לעסקה
            businessTransactionCount: businessTxCount
          };
        }

        if (!menuConfig) return null;

        return (
          <div
            ref={contextMenuRef}
            className="TransactionsTable-context-menu"
            style={{ top: pos.y, left: pos.x }}
            onClick={e => e.stopPropagation()}
          >
            {renderContextMenuContent(menuConfig)}
          </div>
        );
      })()}

      {/* Toast notification with undo */}
      {toast && (
        <div className="TransactionsTable-toast">
          <span className="TransactionsTable-toast-message">{toast.message}</span>
          <div className="TransactionsTable-toast-actions">
            {toast.undoAction && (
              <button 
                className="TransactionsTable-toast-undo"
                onClick={() => {
                  toast.undoAction?.();
                  dismissToast();
                }}
              >
                ביטול
              </button>
            )}
            <button 
              className="TransactionsTable-toast-close"
              onClick={dismissToast}
              aria-label="סגור"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionsTable;
