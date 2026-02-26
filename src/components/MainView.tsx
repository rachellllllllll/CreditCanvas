import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import TransactionsTable from './TransactionsTable';
import DateNavigator from './DateNavigator';
import CategoryDonutChart from './CategoryDonutChart';
import MiniMonthsChart from './MiniMonthsChart';
import YearlyMonthsChart from './YearlyMonthsChart';
import MissingDataAlert from './MissingDataAlert';
import MissingCreditDetailAlert from './MissingCreditDetailAlert';
import MissingBankDetailAlert from './MissingBankDetailAlert';
import DuplicateFilesAlert from './DuplicateFilesAlert';
import type { UnmatchedCreditCharge, UnmatchedBankStatement } from '../utils/creditChargePatterns';
import type { DuplicateFilesInfo } from '../utils/duplicateDetection';
import { GlobalSearchModal, type SearchFiltersForRule } from './GlobalSearch';
import type { CreditDetail, AnalysisResult, CategoryRule } from '../types';
import type { CategoryDef } from './CategoryManager';
import './MainView.css';
import SourceFilter from './filters/SourceFilter';

interface MainViewProps {
  analysis: AnalysisResult;
  selectedMonth: string; // פורמט 'MM/YYYY'
  setSelectedMonth: (month: string) => void;
  months: string[];
  sortedMonths: string[];
  currentMonthIdx: number;
  diff: number | null;
  percent: number | null;
  filteredDetails: CreditDetail[];
  filteredTotal: number;
  view: 'monthly' | 'yearly';
  setView: (view: 'monthly' | 'yearly') => void;
  monthTotals: Record<string, number>;
  yearlySummary: Record<string, number>;
  handleOpenEditCategory: (tx: CreditDetail) => void;
  handleBulkEditCategory?: (transactions: CreditDetail[], searchTerm: string) => void;
  categoriesList: CategoryDef[];
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  // חדשים – בקרי סינון מצב תצוגה והסתרת תשלומי כרטיס
  displayMode: 'all' | 'expense' | 'income';
  setDisplayMode: (mode: 'all' | 'expense' | 'income') => void;
  // חדשים: מצב תאריך (עסקה / חיוב)
  dateMode: 'transaction' | 'charge';
  setDateMode: (m: 'transaction' | 'charge') => void;
  // חדשים: תיקיה נבחרת + פעולות
  selectedFolder: string | null;
  onPickDirectory: () => void;
  onRefreshDirectory: () => void;
  dirHandle?: FileSystemDirectoryHandle;
  // פתיחת הגדרות מתקדמות
  onOpenAdvancedSettings?: () => void;
  // מעקב פיצ'רים
  onTrackFeature?: (feature: string) => void;
  // ניהול מקורות הכנסה
  incomeSourceRules?: import('../types').IncomeSourceRule[];
  onMarkAsIncomeSource?: (description: string, sourceType: 'business' | 'category') => void;
  onMarkAsNotIncomeSource?: (description: string, sourceType: 'business' | 'category') => void;
  // חדש: סימון עסקה בודדת כהכנסה/הוצאה
  onMarkTransactionAsIncomeSource?: (transactionId: string, isIncome: boolean) => void;
  // חדש: ניווט לעסקה ספציפית (מחיפוש גלובלי)
  onNavigateToTransaction?: (tx: CreditDetail, monthKey: string) => void;
  // חדש: עסקה מודגשת (להדגשה בטבלה אחרי ניווט)
  highlightedTransactionId?: string | null;
  // חדש: שינוי קטגוריה מרוכז מחיפוש גלובלי (inline)
  onApplyBulkCategoryChange?: (
    transactions: CreditDetail[],
    newCategory: string,
    filtersForRule: SearchFiltersForRule,
    createRule: boolean,
    includeDatesInRule: boolean
  ) => void;
  // הוספת קטגוריה חדשה
  onAddCategory?: (cat: CategoryDef) => void;
  // עריכת כלל קיים
  onUpdateRule?: (
    ruleId: string,
    filtersForRule: SearchFiltersForRule,
    newCategory: string,
    includeDatesInRule: boolean
  ) => void;
  // כלל לעריכה (נפתח מחוץ ל-MainView, למשל מ-SettingsMenu)
  externalRuleToEdit?: CategoryRule | null;
  onClearExternalRuleToEdit?: () => void;
  // חיובי אשראי ללא פירוט (שזוהו לפי תיאור בלבד)
  unmatchedCreditCharges?: UnmatchedCreditCharge[];
  // מחזורי אשראי ללא עסקת בנק תואמת (חסר דף בנק)
  unmatchedBankStatements?: UnmatchedBankStatement[];
  // קבצים כפולים / חופפים
  duplicateFilesInfo?: DuplicateFilesInfo | null;
  // עריכת הגדרת קטגוריה מתפריט ימני
  onEditCategoryDefinition?: (categoryName: string) => void;
}

const MainView: React.FC<MainViewProps> = ({
  selectedMonth, setSelectedMonth, sortedMonths, currentMonthIdx,
  diff, percent, filteredDetails,
  view, setView, yearlySummary,
  handleOpenEditCategory, handleBulkEditCategory, categoriesList, selectedYear, setSelectedYear,
  displayMode, setDisplayMode,
  dateMode, setDateMode, analysis, selectedFolder, onPickDirectory, onRefreshDirectory, dirHandle,
  onOpenAdvancedSettings,
  onTrackFeature,
  incomeSourceRules,
  onMarkAsIncomeSource,
  onMarkAsNotIncomeSource,
  onMarkTransactionAsIncomeSource,
  onNavigateToTransaction,
  highlightedTransactionId,
  onApplyBulkCategoryChange,
  onAddCategory,
  onUpdateRule,
  externalRuleToEdit,
  onClearExternalRuleToEdit,
  unmatchedCreditCharges,
  unmatchedBankStatements,
  duplicateFilesInfo,
  onEditCategoryDefinition
}) => {
  // State לניהול סינון קטגוריה (מגרף הדונאט)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // State לחיפוש גלובלי
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [globalSearchInitialText, setGlobalSearchInitialText] = useState('');
  const [ruleToEdit, setRuleToEdit] = useState<CategoryRule | null>(null);
  const [searchTerm] = useState('');
  const [amountFilter] = useState('all');

  // State לחיפוש חברת אשראי מההתראה
  const [creditSearchTerm, setCreditSearchTerm] = useState('');
  const tableRef = React.useRef<HTMLDivElement>(null);

  const handleSearchCreditCompany = useCallback((companyName: string) => {
    setCreditSearchTerm(companyName);
  }, []);
  
  // פונקציה לפתיחת חיפוש גלובלי עם טקסט התחלתי
  const handleOpenGlobalSearch = useCallback((initialText?: string) => {
    setGlobalSearchInitialText(initialText || '');
    setRuleToEdit(null);
    setIsGlobalSearchOpen(true);
    onTrackFeature?.('global_search_from_context_menu');
  }, [onTrackFeature]);
  
  // פונקציה לפתיחת עריכת כלל
  // const handleEditRule = useCallback((rule: CategoryRule) => {
  //   setRuleToEdit(rule);
  //   setGlobalSearchInitialText('');
  //   setIsGlobalSearchOpen(true);
  //   onTrackFeature?.('edit_rule_from_mapping');
  // }, [onTrackFeature]);
  
  // אפקט לפתיחת עריכת כלל מחוץ ל-MainView (למשל מ-SettingsMenu)
  useEffect(() => {
    if (externalRuleToEdit) {
      setRuleToEdit(externalRuleToEdit);
      setGlobalSearchInitialText('');
      setIsGlobalSearchOpen(true);
      onClearExternalRuleToEdit?.();
    }
  }, [externalRuleToEdit, onClearExternalRuleToEdit]);
  
  // קיצור מקלדת Ctrl+K לפתיחת חיפוש גלובלי
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K או Cmd+K (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setRuleToEdit(null);
        setGlobalSearchInitialText('');
        setIsGlobalSearchOpen(true);
        onTrackFeature?.('global_search_keyboard_shortcut');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onTrackFeature]);
  
  // פונקציה למעקב פיצ'רים עם tracking לתצוגה חודשית/שנתית
  const setViewWithTracking = useCallback((newView: 'monthly' | 'yearly') => {
    setView(newView);
    onTrackFeature?.(newView === 'yearly' ? 'view_yearly' : 'view_monthly');
  }, [setView, onTrackFeature]);
  
  // רפרנס לכותרת העליונה לצורך מעבר למצב מכווץ בגלילה
  const headerRef = useRef<HTMLDivElement | null>(null);

  // State for filter and settings popovers
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  // רשימת כרטיסים זמינים (4 ספרות אחרונות) + תאריך שימוש אחרון לכל כרטיס
  // וכן אינדיקציה האם הכרטיס מופיע בטווח התאריכים המוצג (filteredDetails)
  const { availableCards, lastDateByCard, activeInViewByCard } = useMemo(() => {
    const set = new Set<string>();
    const lastDateMap: Record<string, number> = {};
    const activeMap: Record<string, boolean> = {};

    const parseToTs = (raw: string | undefined) => {
      if (!raw) return 0;
      const parts = raw.split(/[/-]/);
      if (parts.length < 3) return 0;
      const dd = parts[0].padStart(2, '0');
      const mm = parts[1].padStart(2, '0');
      let yyyy = parts[2];
      if (yyyy.length === 2) yyyy = '20' + yyyy;
      const iso = `${yyyy}-${mm}-${dd}`;
      const ts = Date.parse(iso);
      return Number.isNaN(ts) ? 0 : ts;
    };

    for (const d of analysis.details) {
      if (d.source !== 'credit' || !d.cardLast4) continue;
      set.add(d.cardLast4);

      const rawDate = dateMode === 'charge' && d.chargeDate ? d.chargeDate : d.date;
      const ts = parseToTs(rawDate);
      if (!lastDateMap[d.cardLast4] || ts > lastDateMap[d.cardLast4]) {
        lastDateMap[d.cardLast4] = ts;
      }
    }

    // כרטיסים שמופיעים בטווח המסונן כרגע (filteredDetails)
    for (const d of filteredDetails) {
      if (d.source === 'credit' && d.cardLast4) {
        activeMap[d.cardLast4] = true;
      }
    }

    const cards = Array.from(set).sort();
    return { availableCards: cards, lastDateByCard: lastDateMap, activeInViewByCard: activeMap };
  }, [analysis.details, filteredDetails, dateMode]);

  // --- שמירת העדפות סינון ב-localStorage ---
  const FILTER_PREFS_KEY = 'mainViewFilterPreferences';
  const loadFilterPrefs = () => {
    try {
      const saved = localStorage.getItem(FILTER_PREFS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // localStorage may be unavailable (private browsing) or data corrupted
    }
    return {};
  };
  const initialFilterPrefs = useMemo(() => loadFilterPrefs(), []);

  // בחירת הכרטיסים המוצגים (ברירת מחדל: כולם או מה ששמור)
  const [selectedCards, setSelectedCards] = useState<string[]>(() => {
    // אם יש כרטיסים שמורים, השתמש רק באלה שקיימים ב-availableCards
    if (initialFilterPrefs.selectedCards && Array.isArray(initialFilterPrefs.selectedCards)) {
      const savedCards = initialFilterPrefs.selectedCards.filter((c: string) => availableCards.includes(c));
      // אם כל הכרטיסים השמורים עדיין קיימים, החזר אותם
      if (savedCards.length > 0) return savedCards;
    }
    return availableCards;
  });
  // שמירת הכרטיסים הידועים כדי לזהות כרטיסים חדשים באמת
  const knownCardsRef = useRef<Set<string>>(new Set(availableCards));
  // האם להציג עסקאות בנק
  const [includeBank, setIncludeBank] = useState(initialFilterPrefs.includeBank ?? true);

  // שמירת העדפות סינון ב-localStorage בכל שינוי
  React.useEffect(() => {
    const prefs = { selectedCards, includeBank };
    try {
      localStorage.setItem(FILTER_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // localStorage may be unavailable (private browsing, quota exceeded)
    }
  }, [selectedCards, includeBank]);

  // טעינת שמות כרטיסים מקובץ cards-aliases.json
  const [cardNames, setCardNames] = useState<Record<string, string>>({});
  React.useEffect(() => {
    let cancelled = false;
    const loadCardNames = async () => {
      if (!dirHandle) return;
      try {
        const fileName = 'cards-aliases.json';
        const fh = await dirHandle.getFileHandle(fileName);
        const f = await fh.getFile();
        const text = await f.text();
        const parsed = JSON.parse(text);
        if (!cancelled && parsed && typeof parsed === 'object') {
          // תומך בשני פורמטים: {cards: {...}} או {...}
          setCardNames(parsed.cards || parsed);
        }
      } catch {
        // File doesn't exist or can't be read - that's OK
      }
    };
    loadCardNames();
    return () => { cancelled = true; };
  }, [dirHandle]);

  React.useEffect(() => {
    const known = knownCardsRef.current;
    const trulyNewCards = availableCards.filter(c => !known.has(c));

    // עדכן את הידועים
    for (const c of availableCards) known.add(c);

    // הוסף לבחירה רק כרטיסים חדשים באמת
    if (trulyNewCards.length > 0) {
      setSelectedCards(prev => [...prev, ...trulyNewCards]);
    }
  }, [availableCards]);

  const toggleCard = (last4: string) => {
    setSelectedCards(prev => prev.includes(last4)
      ? prev.filter(c => c !== last4)
      : [...prev, last4]);
  };

  const allCardsSelected = selectedCards.length === availableCards.length;
  const clearSelection = () => setSelectedCards([]);
  const selectAllCards = () => setSelectedCards(availableCards);
  // גרפים בוטלו/מוסרים כרגע מהתצוגה
  // const [showBarChart, setShowBarChart] = useState(false);
  // const [showPieChart, setShowPieChart] = useState(false);

  // סיכומי הכנסות/הוצאות/נטו לפי filteredDetails שהתקבלו מההורה
  // משתמש ב-transactionNature לזיהוי הכנסות אמיתיות
  // Helper: בדיקה אם עסקה צריכה להידלג בחישובים (חיוב אשראי עם פירוט, או neutral)
  const shouldSkipInCalculation = (d: CreditDetail): boolean => {
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
  };

  // סינון העסקאות לפי הקטגוריה הנבחרת וחיפוש
  // מועבר למעלה כי summary צריך להתבסס על filteredTransactions
  const filteredTransactions = useMemo(() => {
    let filtered = filteredDetails;

    // סינון לפי מקורות (כרטיסים / בנק)
    filtered = filtered.filter(tx => {
      if (tx.source === 'credit') {
        // אם אין cardLast4 נתייחס כאילו תמיד מוצג
        if (!tx.cardLast4) return true;
        // אם לא נבחר אף כרטיס – לא להציג כרטיסים בכלל
        if (selectedCards.length === 0) return false;
        return selectedCards.includes(tx.cardLast4);
      }
      if (tx.source === 'bank') {
        return includeBank; // האם להציג בנק
      }
      return true;
    });

    // סינון לפי קטגוריה
    if (selectedCategory) {
      filtered = filtered.filter(tx => tx.category === selectedCategory);
    }

    // סינון לפי חיפוש
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(tx =>
        tx.description.toLowerCase().includes(term) ||
        tx.category?.toLowerCase().includes(term)
      );
    }

    // סינון לפי סכום
    if (amountFilter !== 'all') {
      filtered = filtered.filter(tx => {
        const amount = Math.abs(tx.amount);
        switch (amountFilter) {
          case 'low': return amount <= 100;
          case 'medium': return amount > 100 && amount <= 500;
          case 'high': return amount > 500;
          default: return true;
        }
      });
    }

    return filtered;
  }, [filteredDetails, selectedCategory, searchTerm, amountFilter, selectedCards, includeBank]);

  const summary = useMemo(() => {
    // הסיכום מחושב מ-filteredTransactions - אותם נתונים שמוצגים בטבלה
    // filteredDetails כבר מסונן לפי displayMode ב-App.tsx
    
    // חישוב סיכום הטבלה (כמו שהטבלה מחשבת) - זה המספר שצריך להתאים
    const tableSum = filteredTransactions
      .filter(d => !shouldSkipInCalculation(d))
      .reduce((sum, d) => {
        // הטבלה משתמשת בסימן לפי direction
        const signed = d.direction === 'income' ? Math.abs(d.amount) : -Math.abs(d.amount);
        return sum + signed;
      }, 0);
    
    // מה להציג בתמציות לפי מצב התצוגה:
    let income = 0;
    let expense = 0;
    let net = 0;
    
    if (displayMode === 'expense') {
      // במצב הוצאות: הסיכום של הטבלה הוא סה"כ ההוצאות (אחרי החזרים)
      // tableSum שלילי (הוצאות), נהפוך לחיובי לתצוגה
      expense = Math.abs(tableSum);
      income = 0;
      net = tableSum; // שלילי - הוצאות
    } else if (displayMode === 'income') {
      // במצב הכנסות: הסיכום של הטבלה הוא סה"כ ההכנסות
      income = tableSum; // חיובי
      expense = 0;
      net = tableSum;
    } else {
      // במצב "הכל": עקביות עם מצבי הסינון
      // הכנסות = רק הכנסות אמיתיות (transactionNature === 'income')
      // הוצאות = הוצאות נטו (כולל החזרי הוצאות שמקטינים)
      
      // הכנסות אמיתיות בלבד (לא החזרי הוצאות)
      const realIncomeItems = filteredTransactions.filter(d => 
        d.transactionNature === 'income' && !shouldSkipInCalculation(d)
      );
      income = realIncomeItems.reduce((s, d) => s + Math.abs(d.amount), 0);
      
      // הוצאות נטו: כל מה שלא הכנסה אמיתית (הוצאות + החזרי הוצאות)
      // החזרי הוצאות (expense_reversal) מקטינים את ההוצאה
      const expenseItems = filteredTransactions.filter(d => 
        d.transactionNature !== 'income' && !shouldSkipInCalculation(d)
      );
      const expenseNet = expenseItems.reduce((s, d) => {
        // direction = 'expense' -> שלילי, direction = 'income' (החזר) -> חיובי
        const signed = d.direction === 'income' ? Math.abs(d.amount) : -Math.abs(d.amount);
        return s + signed;
      }, 0);
      
      // expenseNet שלילי = הוצאות רגילות, expenseNet חיובי = עודף החזרים
      // בתצוגה: הוצאות מוצגות כערך חיובי אם יש הוצאות, 0 אם יש עודף החזרים
      // עודף החזרים יתווסף להכנסות בחישוב הנטו
      if (expenseNet <= 0) {
        // מקרה רגיל: יש הוצאות נטו
        expense = Math.abs(expenseNet);
        net = income - expense;
      } else {
        // מקרה קצה: החזרים גדולים מההוצאות - "עודף החזרים"
        // נציג הוצאות = 0 (או שלילי לסימון עודף)
        expense = -expenseNet; // שלילי כדי להראות שזה עודף החזרים
        net = income + expenseNet; // מוסיפים את העודף להכנסות
      }
    }
    
    return { income, expense, net };
  }, [filteredTransactions, displayMode]);

  // חישוב קטגוריות לפי direction (הוצאות/הכנסות) - לדונאט ולגרף עמודות
  // זה מבטיח עקביות עם הסיכומים למעלה
  const categoriesByDirection = useMemo(() => {
    const catCounts: Record<string, number> = {};
    
    if (displayMode === 'income') {
      // במצב הכנסות: רק הכנסות אמיתיות (transactionNature === 'income')
      filteredTransactions.forEach(d => {
        if (shouldSkipInCalculation(d)) return;
        if (d.transactionNature !== 'income') return;
        
        const categoryName = d.category || 'לא מסווג';
        catCounts[categoryName] = (catCounts[categoryName] || 0) + Math.abs(d.amount);
      });
    } else if (displayMode === 'expense') {
      // במצב הוצאות: הוצאות נטו לפי קטגוריה (כולל החזרים שמקטינים)
      filteredTransactions.forEach(d => {
        if (shouldSkipInCalculation(d)) return;
        
        const categoryName = d.category || 'לא מסווג';
        // direction = 'expense' -> חיובי (הוצאה), direction = 'income' -> שלילי (החזר)
        const amount = d.direction === 'expense' ? Math.abs(d.amount) : -Math.abs(d.amount);
        catCounts[categoryName] = (catCounts[categoryName] || 0) + amount;
      });
      // הסר קטגוריות עם ערך 0 בלבד - קטגוריות שליליות (עודף החזרים) נשארות
      Object.keys(catCounts).forEach(cat => {
        if (catCounts[cat] === 0) delete catCounts[cat];
      });
    } else {
      // במצב "הכל": הוצאות נטו לפי קטגוריה (רק מה שלא הכנסה אמיתית)
      filteredTransactions.forEach(d => {
        if (shouldSkipInCalculation(d)) return;
        if (d.transactionNature === 'income') return; // דלג על הכנסות אמיתיות
        
        const categoryName = d.category || 'לא מסווג';
        // direction = 'expense' -> חיובי (הוצאה), direction = 'income' -> שלילי (החזר)
        const amount = d.direction === 'expense' ? Math.abs(d.amount) : -Math.abs(d.amount);
        catCounts[categoryName] = (catCounts[categoryName] || 0) + amount;
      });
      // הסר קטגוריות עם ערך 0 בלבד - קטגוריות שליליות (עודף החזרים) נשארות
      Object.keys(catCounts).forEach(cat => {
        if (catCounts[cat] === 0) delete catCounts[cat];
      });
    }
    
    return catCounts;
  }, [filteredTransactions, displayMode]);

  // חישוב הקטגוריה הגדולה ביותר (משתמש ב-categoriesByDirection לעקביות)
  const topCategoryData = useMemo(() => {
    const sortedCategories = Object.entries(categoriesByDirection)
      .sort(([, a], [, b]) => b - a);

    if (sortedCategories.length === 0) return null;

    const [topCategory, topAmount] = sortedCategories[0];
    const total = Object.values(categoriesByDirection).reduce((sum, val) => sum + val, 0);
    const percentage = total > 0 ? ((topAmount / total) * 100).toFixed(1) : '0';

    return { name: topCategory, amount: topAmount, percentage };
  }, [categoriesByDirection]);

  // הפקת צבע ואייקון לקטגוריה מובילה (אם קיימת בהגדרות)
  const topCategoryVisual = useMemo(() => {
    if (!topCategoryData) return null;
    const def = categoriesList.find(c => c.name === topCategoryData.name);
    const baseColor = def?.color || '#6366f1';
    const icon = def?.icon || '🏆';
    // פונקציה לערבוב עם לבן כדי להחליש את הרוויה (ratio = כמה לבן להכניס)
    const blendWithWhite = (hex: string, ratio: number) => {
      const h = hex.replace('#', '');
      const num = parseInt(h, 16);
      const r = (num >> 16) & 255;
      const g = (num >> 8) & 255;
      const b = num & 255;
      const mix = (c: number) => Math.round(c * (1 - ratio) + 255 * ratio);
      return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
    };
    // ערכים עדינים יותר: הרבה יותר לבן => פחות בולט מול שאר הכרטיסים
    const soft1 = blendWithWhite(baseColor, 0.65);
    const soft2 = blendWithWhite(baseColor, 0.82);
    const badgeBg = blendWithWhite(baseColor, 0.75);
    const border = blendWithWhite(baseColor, 0.55);
    return { color: baseColor, icon, soft1, soft2, badgeBg, border };
  }, [topCategoryData, categoriesList]);

  // שינוי אחוזי הוצאות לעומת חודש קודם (לסימן על הכרטיס כמו בדוגמה)
  const expensePrevChange = useMemo(() => {
    if (view !== 'monthly' || currentMonthIdx <= 0) return null;
    const prevMonth = sortedMonths[currentMonthIdx - 1];
    const currMonth = selectedMonth;
    const monthOf = (d: CreditDetail) => {
      const raw = (dateMode === 'charge' && d.chargeDate) ? d.chargeDate : d.date;
      // פורמט צפוי: DD/MM/YYYY או D/M/YY
      const parts = raw.split(/[/-]/);
      if (parts.length < 3) return '';
      const mm = parts[1].padStart(2, '0');
      const yyyy = parts[2].length === 2 ? '20' + parts[2] : parts[2];
      return `${mm}/${yyyy}`;
    };
    let currExpense = 0;
    let prevExpense = 0;
    for (const d of analysis.details) {
      if (d.direction !== 'expense') continue;
      const m = monthOf(d);
      const amt = Math.abs(d.amount);
      if (m == currMonth) currExpense += amt;
      else if (m === prevMonth) prevExpense += amt;
    }
    if (prevExpense <= 0) return null; // אין בסיס להשוואה
    const diffVal = currExpense - prevExpense;
    const percentVal = (diffVal / prevExpense) * 100;
    return { diff: diffVal, percent: percentVal };
  }, [analysis.details, view, currentMonthIdx, selectedMonth, sortedMonths, dateMode]);


  // רשימת שנים זמינות (על בסיס כל העסקאות – דרך yearlySummary או monthTotals אינו כולל אפס חודשים, נחלץ מתוך המפתחות של yearlySummary)
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    Object.keys(yearlySummary).forEach(k => {
      const [y] = k.split('-');
      years.add(y);
    });
    return Array.from(years).sort();
  }, [yearlySummary]);

  // אתחל selectedYear אם חסר או יצא מהטווח
  React.useEffect(() => {
    if (availableYears.length === 0) return;
    if (!selectedYear || !availableYears.includes(selectedYear)) {
      // בחר כברירת מחדל את השנה האחרונה (הכי חדשה)
      setSelectedYear(availableYears[availableYears.length - 1]);
    }
  }, [availableYears, selectedYear, setSelectedYear]);

  // אפקט גלילה עם היסטרזיס + rAF: מונע הבהוב ע"י שני ספים שונים והפחתת Reflow
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    let condensed = false;
    const CONDENSE_ABOVE = 100; // נכנסים למצב מכווץ רק מעל סף גבוה יותר
    const EXPAND_BELOW = 60;    // חוזרים למצב רגיל רק מתחת לסף נמוך יותר
    let ticking = false;
    const apply = () => {
      const y = window.scrollY;
      if (!condensed && y > CONDENSE_ABOVE) {
        el.classList.add('condensed');
        condensed = true;
      } else if (condensed && y < EXPAND_BELOW) {
        el.classList.remove('condensed');
        condensed = false;
      }
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(apply);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    apply(); // בדיקה ראשונית במצב הטעינה
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // מדידה דינמית של גובה הכותרת העליונה לטובת sticky של כותרת הטבלה
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const updateHeaderHeight = () => {
      const h = el.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--main-header-height', `${h}px`);
    };
    updateHeaderHeight();
    const resizeObserver = new ResizeObserver(updateHeaderHeight);
    resizeObserver.observe(el);
    window.addEventListener('resize', updateHeaderHeight);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateHeaderHeight);
    };
  }, []);

  // חישוב מספר הפילטרים הפעילים
  const activeFilterCount = useMemo(() => {
    let count = 0;
    // כרטיסים שלא נבחרו
    if (selectedCards.length < availableCards.length) count++;
    // בנק מוסתר
    if (!includeBank) count++;
    // קטגוריה נבחרת מגרף הדונאט
    if (selectedCategory) count++;
    return count;
  }, [selectedCards, availableCards, includeBank, selectedCategory]);

  // איפוס סינון קטגוריה כשמחליפים חודש/שנה/תצוגה
  useEffect(() => {
    setSelectedCategory(null);
  }, [selectedMonth, selectedYear, view]);

  // Close popovers when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilterPopover(false);
      }
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettingsPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="main-view">
      {/* 1. כותרת ראשית מחודשת - שורה אחת נקייה */}
      <div ref={headerRef} className="header-top header-top-new" role="toolbar" aria-label="סרגל ראשי של סינון וניווט">
        {/* צד ימין: ניווט תאריך + תצוגה */}
        <div className="header-right-group" data-tour="date-navigation">
          <div className="view-toggle">
            <button
              onClick={() => setViewWithTracking('monthly')}
              className={view === 'monthly' ? 'active' : ''}
            >
              חודשי
            </button>
            <button
              onClick={() => setViewWithTracking('yearly')}
              className={view === 'yearly' ? 'active' : ''}
            >
              שנתי
            </button>
          </div>

          <DateNavigator
            view={view}
            sortedMonths={sortedMonths}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            currentMonthIdx={currentMonthIdx}
            selectedYear={selectedYear || ''}
            setSelectedYear={setSelectedYear}
            availableYears={availableYears}
          />
        </div>

        {/* אמצע: סינון הכל/הוצאות/הכנסות */}
        <div className="header-center-group" data-tour="display-mode">
          <div className="display-mode-toggle">
            <button className={`mode-all ${displayMode === 'all' ? 'active' : ''}`} onClick={() => setDisplayMode('all')}>הכל</button>
            <button className={`mode-expense ${displayMode === 'expense' ? 'active' : ''}`} onClick={() => setDisplayMode('expense')}>הוצאות</button>
            <button className={`mode-income ${displayMode === 'income' ? 'active' : ''}`} onClick={() => setDisplayMode('income')}>הכנסות</button>
          </div>
        </div>

        {/* צד שמאל: כפתורי חיפוש, פילטר והגדרות */}
        <div className="header-left-group">
          {/* כפתור חיפוש גלובלי */}
          <div className="header-btn-wrapper">
            <button
              className={`header-icon-btn ${isGlobalSearchOpen ? 'open' : ''}`}
              onClick={() => { 
                setIsGlobalSearchOpen(true); 
                setShowFilterPopover(false); 
                setShowSettingsPopover(false);
                onTrackFeature?.('global_search_open');
              }}
              aria-label="חיפוש מתקדם"
              title="חיפוש מתקדם בכל העסקאות (Ctrl+K)"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </button>
          </div>

          {/* כפתור פילטר */}
          <div className="header-btn-wrapper" ref={filterRef}>
            <button
              className={`header-icon-btn ${activeFilterCount > 0 ? 'has-filter' : ''} ${showFilterPopover ? 'open' : ''}`}
              onClick={() => { setShowFilterPopover(!showFilterPopover); setShowSettingsPopover(false); }}
              aria-label="סינון מקורות"
              aria-expanded={showFilterPopover}
              title="סינון מקורות"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              {activeFilterCount > 0 && (
                <span className="filter-badge">{activeFilterCount}</span>
              )}
            </button>

            {/* Filter popover */}
            {showFilterPopover && (
              <div className="header-popover filter-popover">
                <SourceFilter
                  availableCards={availableCards}
                  lastDateByCard={lastDateByCard}
                  activeInViewByCard={activeInViewByCard}
                  selectedCards={selectedCards}
                  onToggleCard={toggleCard}
                  includeBank={includeBank}
                  onToggleBank={setIncludeBank}
                  allSelected={allCardsSelected}
                  onSelectAll={selectAllCards}
                  onClearSelection={clearSelection}
                  dirHandle={dirHandle}
                  inline={true}
                  onCardNameChange={(last4, newName) => {
                    setCardNames(prev => ({ ...prev, [last4]: newName }));
                  }}
                />
              </div>
            )}
          </div>

          {/* כפתור הגדרות */}
          <div className="header-btn-wrapper" ref={settingsRef}>
            <button
              className={`header-icon-btn ${showSettingsPopover ? 'open' : ''}`}
              onClick={() => { setShowSettingsPopover(!showSettingsPopover); setShowFilterPopover(false); }}
              aria-label="הגדרות"
              aria-expanded={showSettingsPopover}
              title="הגדרות"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" style={{ fill: 'currentColor' }}>
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Settings popover */}
            {showSettingsPopover && (
              <div className="header-popover settings-popover">
                <div className="popover-title">הגדרות</div>

                {/* מצב תאריך */}
                <div className="popover-section">
                  <div className="popover-section-title">מצב תאריך</div>
                  <div className="date-mode-toggle-compact">
                    <button
                      type="button"
                      className={dateMode === 'transaction' ? 'active' : ''}
                      onClick={() => setDateMode('transaction')}
                    >תאריך עסקה</button>
                    <button
                      type="button"
                      className={dateMode === 'charge' ? 'active' : ''}
                      onClick={() => setDateMode('charge')}
                    >תאריך חיוב</button>
                  </div>
                </div>

                {/* תיקיה */}
                <div className="popover-section">
                  <div className="popover-section-title">תיקיית נתונים</div>
                  {selectedFolder && (
                    <div className="folder-display" title={selectedFolder}>
                      📁 {selectedFolder}
                    </div>
                  )}
                  <button onClick={onPickDirectory} className="folder-change-btn">
                    החלפת תיקיה
                  </button>
                  {/* Privacy hint */}
                  <div className="privacy-hint-inline" style={{ marginTop: '8px' }}>
                    הנתונים נשארים במחשב שלך
                  </div>
                </div>

                {/* קישור להגדרות מתקדמות */}
                {onOpenAdvancedSettings && (
                  <div className="popover-section popover-section-link">
                    <button
                      className="advanced-settings-link"
                      onClick={() => {
                        setShowSettingsPopover(false);
                        onOpenAdvancedSettings();
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 20 20" style={{ fill: 'currentColor' }}>
                        <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                      </svg>
                      <span>הגדרות מתקדמות</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="arrow-icon">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* התראה על נתונים חסרים */}
      <MissingDataAlert
        availableMonths={sortedMonths}
        onRefresh={onRefreshDirectory}
        onPickFolder={onPickDirectory}
        folderName={selectedFolder || undefined}
      />

      {/* התראה על קבצים כפולים / חופפים */}
      {duplicateFilesInfo && (duplicateFilesInfo.identicalFiles.length > 0 || duplicateFilesInfo.overlappingRanges.length > 0) && (
        <DuplicateFilesAlert
          duplicateInfo={duplicateFilesInfo}
          onRefresh={onRefreshDirectory}
          folderName={selectedFolder || undefined}
        />
      )}

      {/* התראה על חיובי אשראי ללא פירוט – מסוננת לחודש הנוכחי בתצוגה חודשית */}
      {unmatchedCreditCharges && unmatchedCreditCharges.length > 0 && (() => {
        const filtered = view === 'monthly' && selectedMonth
          ? unmatchedCreditCharges.filter(c => {
              // date format: dd/mm/yy or dd/mm/yyyy  →  selectedMonth format: MM/YYYY
              const parts = c.date.split('/');
              if (parts.length < 3) return false;
              const mm = parts[1].padStart(2, '0');
              const yyyy = parts[2].length === 2 ? '20' + parts[2] : parts[2];
              return `${mm}/${yyyy}` === selectedMonth;
            })
          : view === 'yearly' && selectedYear
          ? unmatchedCreditCharges.filter(c => {
              const parts = c.date.split('/');
              if (parts.length < 3) return false;
              const yyyy = parts[2].length === 2 ? '20' + parts[2] : parts[2];
              return yyyy === selectedYear;
            })
          : unmatchedCreditCharges;
        return filtered.length > 0 ? (
          <MissingCreditDetailAlert
            unmatchedCharges={filtered}
            onRefresh={onRefreshDirectory}
            folderName={selectedFolder || undefined}
            selectedMonth={view === 'monthly' ? selectedMonth : undefined}
            selectedYear={view === 'yearly' ? selectedYear : undefined}
            onSearchCompany={handleSearchCreditCompany}
          />
        ) : null;
      })()}

      {/* התראה על פירוט אשראי ללא דף חשבון בנק – מסוננת לחודש/שנה נבחרים */}
      {unmatchedBankStatements && unmatchedBankStatements.length > 0 && (() => {
        const filtered = view === 'monthly' && selectedMonth
          ? unmatchedBankStatements.filter(s => {
              const parts = s.chargeDate.split('/');
              if (parts.length < 3) return false;
              const mm = parts[1].padStart(2, '0');
              const yyyy = parts[2].length === 2 ? '20' + parts[2] : parts[2];
              return `${mm}/${yyyy}` === selectedMonth;
            })
          : view === 'yearly' && selectedYear
          ? unmatchedBankStatements.filter(s => {
              const parts = s.chargeDate.split('/');
              if (parts.length < 3) return false;
              const yyyy = parts[2].length === 2 ? '20' + parts[2] : parts[2];
              return yyyy === selectedYear;
            })
          : unmatchedBankStatements;
        return filtered.length > 0 ? (
          <MissingBankDetailAlert
            unmatchedStatements={filtered}
            onRefresh={onRefreshDirectory}
            folderName={selectedFolder || undefined}
            cardNames={cardNames}
          />
        ) : null;
      })()}

      {/* מדדים מאוחדים (Pattern A) */}
      <div className="metrics-cards" role="group" aria-label="מדדי מצב">
        <div className={`metric-card net ${summary.net < 0 ? 'neg' : 'pos'}`} aria-label={`נטו ${summary.net.toLocaleString()} ₪`}>
          <div className="mc-header">
            <span className="mc-label">סך הכל נטו</span>
            {view === 'monthly' && percent !== null && diff !== null && (
              <span className={`mc-badge ${percent >= 0 ? 'pos' : 'neg'}`} aria-label={`שינוי נטו מהחודש הקודם ${Math.abs(percent).toFixed(1)}%`}>
                {Math.abs(percent).toFixed(1)}%{percent >= 0 ? '+' : '-'}
              </span>
            )}
          </div>
          <div className="mc-value" title={`נטו בחודש`}>₪{summary.net.toLocaleString()}</div>
          <div className="mc-sub">לעומת החודש הקודם</div>
          {view === 'monthly' && diff !== null && percent !== null && (
            <span className="visually-hidden" aria-live="polite">נטו השתנה ב {Math.abs(diff).toLocaleString()} ₪ ({Math.abs(percent).toFixed(1)}%)</span>
          )}
        </div>
        <div className="metric-card expense" aria-label={`סה"כ הוצאות ${summary.expense.toLocaleString()} ₪`}>
          <div className="mc-header">
            <span className="mc-label">הוצאות</span>
            {expensePrevChange && (
              <span className={`mc-badge ${expensePrevChange.percent >= 0 ? 'pos' : 'neg'}`} aria-label={`שינוי בהוצאות לעומת חודש קודם ${Math.abs(expensePrevChange.percent).toFixed(1)}%`}>
                {Math.abs(expensePrevChange.percent).toFixed(1)}%{expensePrevChange.percent >= 0 ? '+' : '-'}
              </span>
            )}
          </div>
          <div className="mc-value" title={`הוצאות בחודש`}>₪{summary.expense.toLocaleString()}</div>
          <div className="mc-sub">סה"כ עסקאות מחויבות</div>
        </div>
        <div className="metric-card income" aria-label={`סה"כ הכנסות ${summary.income.toLocaleString()} ₪`}>
          <div className="mc-header">
            <span className="mc-label">הכנסות</span>
          </div>
          <div className="mc-value" title={`הכנסות בחודש`}>₪{summary.income.toLocaleString()}</div>
          <div className="mc-sub">כולל כל ההכנסות</div>
        </div>
        <div className="metric-card tx-count" aria-label={`מספר עסקאות ${filteredTransactions.length}`}>
          <div className="mc-header">
            <span className="mc-label">מספר עסקאות</span>
          </div>
          <div className="mc-value" title={`סה"כ עסקאות בחודש`}>{filteredTransactions.length}</div>
          <div className="mc-sub">פעילות החודש</div>
        </div>
        {topCategoryData && topCategoryVisual && (
          <div
            className="metric-card top-cat dynamic"
            aria-label={`קטגוריה מובילה ${topCategoryData.name} אחוז ${topCategoryData.percentage}%`}
            style={{
              background: `linear-gradient(135deg, ${topCategoryVisual.soft1} 0%, ${topCategoryVisual.soft2} 38%, #ffffff 92%)`,
              borderColor: topCategoryVisual.border,
              filter: 'saturate(0.85) brightness(1.02)'
            }}
          >
            <div className="mc-header">
              <span className="mc-label">קטגוריה מובילה</span>
              <span
                className="mc-badge dynamic"
                aria-label={`אחוז מתוך ההוצאות ${topCategoryData.percentage}%`}
                style={{
                  background: topCategoryVisual.badgeBg,
                  color: '#1e293b'
                }}
              >{topCategoryData.percentage}%</span>
            </div>
            <div className="mc-value" title={topCategoryData.name}>
              <span className="mc-icon" aria-hidden="true" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))', marginInlineStart: 4 }}>
                {topCategoryVisual.icon}
              </span>
              {topCategoryData.name}
            </div>
            <div className="mc-sub">מתוך כלל ההוצאות</div>
          </div>
        )}
      </div>

      {/* התצוגה החדשה של ניווט חודש/שנה משולב מחליפה את הבלוק הישן */}

      {/* כרטיסי סיכום בוטלו – הוחלפו בשורת מדדים קומפקטית */}

      {/* 5. תוכן ראשי - גרפים ו/או טבלאות */}
      <div className="main-content">
        {view === 'monthly' ? (
          <>
            {/* Layout היברידי: גרף מעל/בצד (לפי גודל מסך) */}
            <div className="content-with-sidebar">
              {/* גרף Donut - מעל במסך קטן, בצד/Rail במסך גדול */}
              <aside className="chart-sidebar" data-tour="category-chart">
                <CategoryDonutChart
                  categories={categoriesByDirection}
                  categoriesList={categoriesList}
                  onCategoryClick={setSelectedCategory}
                  selectedCategory={selectedCategory}
                  defaultCollapsed={false}
                  minPercentage={3}
                  title={displayMode === 'income' ? 'התפלגות הכנסות' : 'התפלגות הוצאות'}
                  displayMode={displayMode}
                  maxVisibleCategories={6}
                />
                
                {/* מיני גרף עמודות - 6 חודשים אחרונים */}
                {sortedMonths.length > 1 && (
                  <MiniMonthsChart
                    monthTotals={Object.fromEntries(
                      sortedMonths.map(m => {
                        // סנן עסקאות לפי חודש
                        const monthDetails = analysis.details.filter(d => {
                          // דלג על עסקאות שצריך להתעלם מהן
                          if (d.neutral) return false;
                          if (d.source === 'bank' && d.transactionType === 'credit_charge') {
                            if ((d.relatedTransactionIds?.length || 0) > 0) return false;
                          }
                          // סנן לפי חודש
                          const raw = (dateMode === 'charge' && d.chargeDate) ? d.chargeDate : d.date;
                          const parts = raw.split(/[/-]/);
                          if (parts.length < 3) return false;
                          const mm = parts[1].padStart(2, '0');
                          const yyyy = parts[2].length === 2 ? '20' + parts[2] : parts[2];
                          return `${mm}/${yyyy}` === m;
                        });
                        
                        let total = 0;
                        if (displayMode === 'income') {
                          // רק הכנסות אמיתיות
                          total = monthDetails
                            .filter(d => d.transactionNature === 'income')
                            .reduce((sum, d) => sum + Math.abs(d.amount), 0);
                        } else {
                          // הוצאות נטו (כולל החזרים שמקטינים)
                          total = monthDetails
                            .filter(d => d.transactionNature !== 'income')
                            .reduce((sum, d) => {
                              const signed = d.direction === 'expense' ? Math.abs(d.amount) : -Math.abs(d.amount);
                              return sum + signed;
                            }, 0);
                          // לא עושים Math.abs - שומרים ערך שלילי לעודף החזרים
                        }
                        return [m, total];
                      })
                    )}
                    selectedMonth={selectedMonth}
                    sortedMonths={sortedMonths}
                    onMonthSelect={setSelectedMonth}
                    monthsToShow={6}
                    displayMode={displayMode === 'all' ? 'expense' : displayMode}
                  />
                )}
              </aside>

              {/* טבלת עסקאות */}
              <div className="table-section main-table" data-tour="transactions-table" ref={tableRef}>
                <TransactionsTable
                  details={filteredTransactions}
                  allDetails={analysis.details}
                  onEditCategory={handleOpenEditCategory}
                  onBulkEditCategory={handleBulkEditCategory}
                  categoriesList={categoriesList}
                  creditChargeCycles={analysis.creditChargeCycles || []}
                  setView={setView}
                  cardNames={cardNames}
                  displayMode={displayMode}
                  onTrackFeature={onTrackFeature}
                  incomeSourceRules={incomeSourceRules}
                  onMarkAsIncomeSource={onMarkAsIncomeSource}
                  onMarkAsNotIncomeSource={onMarkAsNotIncomeSource}
                  onMarkTransactionAsIncomeSource={onMarkTransactionAsIncomeSource}
                  dateMode={dateMode}
                  highlightedTransactionId={highlightedTransactionId}
                  onOpenGlobalSearch={handleOpenGlobalSearch}
                  externalSearchTerm={creditSearchTerm}
                  onEditCategoryDefinition={onEditCategoryDefinition}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="yearly-view">
            {/* חלק עליון: גרפים מעל הטבלה - עמודות בימין, דונאט בשמאל */}
            <div className="yearly-charts-section">
              {/* גרף עמודות 12 חודשים - הכוכב של תצוגה שנתית (בימין ב-RTL) */}
              <YearlyMonthsChart
                monthTotals={Object.fromEntries(
                  sortedMonths.map(m => {
                    // סנן עסקאות לפי חודש
                    const monthDetails = analysis.details.filter(d => {
                      if (d.neutral) return false;
                      if (d.source === 'bank' && d.transactionType === 'credit_charge') {
                        if ((d.relatedTransactionIds?.length || 0) > 0) return false;
                      }
                      const raw = (dateMode === 'charge' && d.chargeDate) ? d.chargeDate : d.date;
                      const parts = raw.split(/[/-]/);
                      if (parts.length < 3) return false;
                      const mm = parts[1].padStart(2, '0');
                      const yyyy = parts[2].length === 2 ? '20' + parts[2] : parts[2];
                      return `${mm}/${yyyy}` === m;
                    });
                    
                    let total = 0;
                    if (displayMode === 'income') {
                      // רק הכנסות אמיתיות
                      total = monthDetails
                        .filter(d => d.transactionNature === 'income')
                        .reduce((sum, d) => sum + Math.abs(d.amount), 0);
                    } else {
                      // הוצאות נטו (כולל החזרים שמקטינים)
                      total = monthDetails
                        .filter(d => d.transactionNature !== 'income')
                        .reduce((sum, d) => {
                          const signed = d.direction === 'expense' ? Math.abs(d.amount) : -Math.abs(d.amount);
                          return sum + signed;
                        }, 0);
                      // לא עושים Math.abs - שומרים ערך שלילי לעודף החזרים
                    }
                    return [m, total];
                  })
                )}
                selectedYear={selectedYear}
                sortedMonths={sortedMonths}
                onMonthSelect={setSelectedMonth}
                setView={setView}
                displayMode={displayMode === 'all' ? 'expense' : displayMode}
              />
              
              {/* גרף Donut - בצד שמאל (סוף ב-RTL) */}
              <aside className="yearly-donut-sidebar">
                <div className="yearly-donut-wrapper">
                  <CategoryDonutChart
                    categories={categoriesByDirection}
                    categoriesList={categoriesList}
                    onCategoryClick={setSelectedCategory}
                    selectedCategory={selectedCategory}
                    defaultCollapsed={false}
                    minPercentage={2}
                    title={displayMode === 'income' ? 'התפלגות הכנסות' : 'התפלגות הוצאות'}
                    displayMode={displayMode}
                  />
                </div>
              </aside>
            </div>

            {/* חלק תחתון: טבלה ברוחב מלא */}
            <div className="yearly-table-section" ref={tableRef}>
              <TransactionsTable
                details={filteredTransactions}
                allDetails={analysis.details}
                onEditCategory={handleOpenEditCategory}
                categoriesList={categoriesList}
                isYearlyView={true}
                creditChargeCycles={analysis.creditChargeCycles || []}
                onMonthSelect={setSelectedMonth}
                setView={setView}
                cardNames={cardNames}
                onTrackFeature={onTrackFeature}
                incomeSourceRules={incomeSourceRules}
                onMarkAsIncomeSource={onMarkAsIncomeSource}
                onMarkAsNotIncomeSource={onMarkAsNotIncomeSource}
                onMarkTransactionAsIncomeSource={onMarkTransactionAsIncomeSource}
                dateMode={dateMode}
                onOpenGlobalSearch={handleOpenGlobalSearch}
                externalSearchTerm={creditSearchTerm}
                onEditCategoryDefinition={onEditCategoryDefinition}
              />
            </div>
          </div>
        )}
      </div>

      {/* מודל חיפוש גלובלי */}
      <GlobalSearchModal
        isOpen={isGlobalSearchOpen}
        onClose={() => {
          setIsGlobalSearchOpen(false);
          setGlobalSearchInitialText('');
          setRuleToEdit(null);
        }}
        allTransactions={analysis.details}
        categoriesList={categoriesList}
        initialSearchText={globalSearchInitialText}
        dateMode={dateMode}
        ruleToEdit={ruleToEdit}
        onNavigateToTransaction={(tx, monthKey) => {
          if (onNavigateToTransaction) {
            onNavigateToTransaction(tx, monthKey);
          } else {
            // Fallback: פשוט נווט לחודש
            setSelectedMonth(monthKey);
            setView('monthly');
          }
          onTrackFeature?.('global_search_navigate');
        }}
        onApplyBulkCategoryChange={onApplyBulkCategoryChange ? (transactions, newCategory, filters, createRule, includeDates) => {
          onApplyBulkCategoryChange(transactions, newCategory, filters, createRule, includeDates);
          onTrackFeature?.('global_search_bulk_category_change');
        } : undefined}
        onUpdateRule={onUpdateRule ? (ruleId, filters, newCategory, includeDates) => {
          onUpdateRule(ruleId, filters, newCategory, includeDates);
          onTrackFeature?.('update_rule_from_global_search');
        } : undefined}
        onAddCategory={onAddCategory}
      />
    </div>
  );
};

export default MainView;
