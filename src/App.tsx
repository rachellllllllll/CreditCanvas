import React, { useState, useEffect, useCallback } from 'react';
import { readXLSX, readXLS, isXLSFile, sheetToArray } from './utils/xlsxMinimal';
import { 
  getSheetType, 
  askUserSheetType, 
  loadSheetTypeOverridesFromDir, 
  saveSheetTypeOverridesToDir,
  type SheetTypeOverrides 
} from './utils/sheetType';
import { parseBankStatementFromSheet } from './utils/bankParser';
import type { CreditDetail, AnalysisResult } from './types';
import { type CategoryDef } from './components/CategoryManager';
import SettingsMenu from './components/SettingsMenu';
import EditCategoryDialog, { type EditDialogState, type SearchFiltersForRule } from './components/EditCategoryDialog';
import Footer from './components/Footer';
import './App.css';
import './index.css';
import MainView from './components/MainView';
import NewCategoriesTablePrompt from './components/NewCategoriesTablePrompt';
import TermsModal from './components/TermsModal';
import OnboardingTour from './components/OnboardingTour';
import OnboardingScreen from './components/OnboardingScreen';
import FeedbackPopup from './components/FeedbackPopup';
import { useFeedbackPopup } from './components/useFeedbackPopup';
import ErrorBoundary from './components/ErrorBoundary';
import {
  type UserProfile,
  type UnknownCategoryInfo,
  type CategoryMapping,
  getOrCreateUserProfile,
  saveUserProfile,
  trackEvent,
  trackSessionStart,
  trackFilesLoaded,
  trackCategoryAssigned,
  trackFeatureUsage,
  trackFileError,
  trackConsoleError,
  trackPreviousSessionDuration,
  trackUnknownCreditChargeDescriptions,
  markConsentAsked,
  updateLastActivity,
  saveSessionDurationForLater
} from './utils/analytics';
import { signedAmount } from './utils/money';
import { processCreditChargeMatching, detectUnmatchedCreditCharges, detectMissingBankStatements, isKnownCreditChargeDescription } from './utils/creditChargePatterns';
import type { UnmatchedCreditCharge, UnmatchedBankStatement } from './utils/creditChargePatterns';
import { findOverlappingDateRanges, type DuplicateFilesInfo } from './utils/duplicateDetection';
import { loadCategoryRules, applyCategoryRules, addDescriptionEqualsRule, addDescriptionContainsRule, addTransactionCategoryRule, addRuleWithAmountRange, addAdvancedRule, updateCategoryRule, saveCategoryRules, createRule, type RuleChangeResult } from './utils/categoryRules';
import type { CategoryRule, IncomeSourceRule } from './types';
import { loadDirectionOverridesFromDir, applyDirectionOverrides } from './utils/directionOverrides';
import {
  loadIncomeSourceRules,
  saveIncomeSourceRules,
  detectAutoIncomeSources,
  applyIncomeSourceRules,
  addIncomeSourceRule,
  addCategoryIncomeSourceRule,
  removeIncomeSourceRule,
  markAsNotIncomeSource
} from './utils/incomeSourceRules';

// Helpers for categories and aliases persistence + application
async function loadCategoriesFromDir(dirHandle: FileSystemDirectoryHandle): Promise<CategoryDef[] | null> {
  try {
    const fh = await dirHandle.getFileHandle('categories.json');
    const f = await fh.getFile();
    const data = JSON.parse(await f.text());
    if (Array.isArray(data)) return data as CategoryDef[];
    return null;
  } catch {
    return null;
  }
}
async function saveCategoriesToDir(dirHandle: FileSystemDirectoryHandle, categories: CategoryDef[]): Promise<void> {
  try {
    const fh = await dirHandle.getFileHandle('categories.json', { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(categories, null, 2));
    await w.close();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'SecurityError') {
      console.warn('אין רשאות לשמור categories.json');
      return;
    }
    throw err;
  }
}

type AliasType = 'category' | 'description';
async function loadAliasesFromDir(dirHandle: FileSystemDirectoryHandle, type: AliasType): Promise<Record<string, string>> {
  const fileName = type === 'category' ? 'categories-aliases.json' : 'description-categories.json';
  try {
    const fh = await dirHandle.getFileHandle(fileName);
    const f = await fh.getFile();
    const data = JSON.parse(await f.text());
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}
async function saveAliasesToDir(dirHandle: FileSystemDirectoryHandle, aliases: Record<string, string>, type: AliasType): Promise<void> {
  const fileName = type === 'category' ? 'categories-aliases.json' : 'description-categories.json';
  try {
    const fh = await dirHandle.getFileHandle(fileName, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(aliases, null, 2));
    await w.close();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'SecurityError') {
      console.warn(`אין רשאות לשמור ${fileName}`);
      return;
    }
    throw err;
  }
}
function applyAliases(details: CreditDetail[], categoryAliases: Record<string, string> = {}, descToCategory: Record<string, string> = {}): CreditDetail[] {
  return details.map(d => {
    let category = d.category || '';
    if (category && categoryAliases[category]) category = categoryAliases[category];
    if (!category && descToCategory[d.description]) category = descToCategory[d.description];
    return { ...d, category: category || d.category };
  });
}

const parseCreditDetailsFromSheet = async (sheetData: unknown[][], fileName: string): Promise<CreditDetail[]> => {
  // sheetData הוא כבר מערך דו-ממדי (לא sheet של XLSX)
  const json: unknown[][] = sheetData;
  // Find the header row index by searching for a row with known column names
  let headerIdx = -1;
  let headers: string[] = [];
  let chargeDateFromHeader = '';
  let cardLast4FromHeader = '';
  for (let i = 0; i < json.length; i++) {
    // נרמל שבירות שורה (Alt+Enter באקסל) לרווח - חשוב לפורמט כאל ופועלים
    const row = json[i].map((cell) => (cell != null ? String(cell) : '').replace(/\r?\n/g, ' ').trim());
    // --- extract charge date and card last 4 from header lines if present ---
    if (!chargeDateFromHeader) {
      const match = row.join(' ').match(/עסקאות לחיוב ב-(\d{2}\/\d{2}\/\d{4})/);
      if (match) chargeDateFromHeader = match[1];
    }
    if (!cardLast4FromHeader) {
      const joined = row.join(' ');
      // פורמט ישראכרט/מקס: "המסתיים ב-1234"
      // פורמט כאל: "לכרטיס ויזה 1234" או "כאל 123456 לכרטיס ויזה 1234"
      const match = joined.match(/המסתיים ב-(\d{4})/) ||
                    joined.match(/לכרטיס\s+\S+\s+(\d{4})\b/);
      if (match) cardLast4FromHeader = match[1];
    }
    // Look for a row with at least 2 of the expected columns (for Poalim format)
    if (
      (row.some((c: string) => c.includes('תאריך') && c.includes('עסקה')) && row.includes('שם בית עסק'))
    ) {
      headerIdx = i;
      headers = row;
      break;
    }
    // Look for a row with at least 3 of the expected columns
    if (
      (row.includes('תאריך עסקה') && row.includes('שם בית העסק') && row.includes('סכום חיוב')) ||
      (row.includes('"תאריך\nעסקה"') && row.includes('שם בית עסק') && row.some((c: string) => c.includes('סכום'))) // for the second format
    ) {
      headerIdx = i;
      headers = row;
      break;
    }
  }
  if (headerIdx === -1) return [];
  // Map the rest of the rows to CreditDetail
  const details: CreditDetail[] = [];
  // Normalize headers for mapping
  const normalizedHeaders = headers.map(h => h.replace(/"/g, '').replace(/\r?\n/g, ' ').trim());
  for (let i = headerIdx + 1; i < json.length; i++) {
    const row = json[i];
    if (!row || row.length < 3) continue;
    // Map columns by normalized header
    const rowObj: Record<string, string> = {};
    normalizedHeaders.forEach((h, idx) => {
      rowObj[h] = (row[idx] || '').toString().trim();
    });
    // Try to extract fields for all supported formats
    let date = rowObj['תאריך עסקה'] || rowObj['תאריךעסקה'] || rowObj['תאריך'] || '';
    const description = rowObj['שם בית העסק'] || rowObj['שם בית עסק'] || rowObj['בית עסק'] || '';
    // העדפה לסכום חיוב - זה מה שבאמת יורד מהחשבון
    // סכום עסקה נשמר בנפרד להצגה (תשלומים, מט"ח וכו')
    const chargeAmountRaw = rowObj['סכום חיוב'] || rowObj['סכוםחיוב'] || rowObj['סכום בשח'] || '';
    const transactionAmountRaw = rowObj['סכום עסקה'] || rowObj['סכוםעסקה'] || '';
    const transactionCurrency = rowObj['מטבע עסקה'] || rowObj['מטבעעסקה'] || '';
    
    // אם יש סכום חיוב - השתמש בו. אם אין אבל יש סכום עסקה - בדוק אם זו עסקת צבירה
    let amount = chargeAmountRaw;
    if (!chargeAmountRaw && transactionAmountRaw) {
      // בדוק אם זו עסקת צבירת נקודות (סכום עסקה קיים אבל סכום חיוב ריק)
      // const transType = rowObj['סוג עסקה'] || rowObj['סוגעסקה'] || '';
      // if (transType.includes('צבירה') || description.includes('צבירה')) {
      //   // דלג על עסקאות צבירה - הן לא משפיעות על החיוב
      //   continue;
      // }
      // אם זה לא צבירה, השתמש בסכום עסקה כ-fallback
      // amount = transactionAmountRaw;
    }
    const category = rowObj['ענף'] || rowObj['קטגוריה'] || '';
    // --- extract charge date and card last 4 ---
    let chargeDate = rowObj['תאריך חיוב'] || rowObj['מועד חיוב'] || chargeDateFromHeader || '';
    const cardLast4 = rowObj['4 ספרות אחרונות של כרטיס האשראי'] || rowObj['4 ספרות אחרונות'] || cardLast4FromHeader || '';
    
    // --- זיהוי עסקאות בחיוב מיידי (משיכת מזומן וכד') ---
    const transactionType = rowObj['סוג עסקה'] || rowObj['סוגעסקה'] || '';
    const notes = rowObj['הערות'] || '';
    const isImmediateCharge = transactionType.includes('משיכת מזומן') 
      || transactionType.includes('חיוב מיידי')
      || notes.includes('מיידי') || notes.includes('מידי');
    if (isImmediateCharge) {
      // בחיוב מיידי: תאריך החיוב = תאריך העסקה
      chargeDate = date;
    }
    // Special handling for Poalim format: amount may be in the form '₪ 11.68'
    if (amount && amount.includes('₪')) {
      amount = amount.replace('₪', '').trim();
    }
    // Remove currency symbols and spaces
    amount = amount.replace(/[^\d.,-]/g, '').replace(',', '.');
    // Normalize date (support both dd-mm-yyyy and dd/mm/yy and Excel serial numbers)
    // תומך גם בסריאלים עשרוניים מ-XLS (כגון 46059.0004...)
    {
      const numVal = parseFloat(date);
      if (!isNaN(numVal) && numVal > 1 && numVal < 60000 && /^\d+(\.\d+)?$/.test(date)) {
        const excelEpoch = Date.UTC(1899, 11, 30);
        const serial = Math.floor(numVal);
        const d = new Date(excelEpoch + serial * 24 * 60 * 60 * 1000);
        date = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(-2)}`;
      } else {
        date = date.replace(/\./g, '/').replace(/-/g, '/');
      }
    }

    /**
     *     amount = amount.replace(/[^\d.,-]/g, '').replace(',', '.');
    // Normalize date (support both dd-mm-yyyy and dd/mm/yy and Excel serial numbers)
    // בדוק רק אם זה בעמודת תאריך - אם מכיל רק מספרים ודרוש כמספר serial בטווח תאריכים
    // בדוק אם זה בעמודת תאריך ואם כן, המיר אם הערך הוא מספר serial של Excel
    const dateColumnIndex = normalizedHeaders.indexOf('תאריך עסקה');
    const isDateColumn = dateColumnIndex >= 0;
    
    if (isDateColumn && /^\d{1,5}$/.test(date)) {
      // רק בעמודת תאריך: קרא את המספר כ-Excel serial
      const serial = parseInt(date, 10);
      if (!isNaN(serial) && serial > 0 && serial < 60000) {
        const excelEpoch = new Date(1899, 11, 30);
        const d = new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
        // Format as dd/m/yy
        date = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear().toString().slice(-2)}`;
      }
    } else if (date) {
      date = date.replace(/\./g, '/').replace(/-/g, '/');
    }
     */
    // --- normalize chargeDate ---
    if (chargeDate) {
      const numVal = parseFloat(chargeDate);
      if (!isNaN(numVal) && numVal > 1 && numVal < 60000 && /^\d+(\.\d+)?$/.test(chargeDate)) {
        const excelEpoch = Date.UTC(1899, 11, 30);
        const serial = Math.floor(numVal);
        const d = new Date(excelEpoch + serial * 24 * 60 * 60 * 1000);
        chargeDate = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(-2)}`;
      } else {
        chargeDate = chargeDate.replace(/\./g, '/').replace(/-/g, '/');
      }
    }
    if (date && amount && description) {
      // החזר/זיכוי/ביטול יזוהו כהכנסה גם אם המספר חיובי
      // const refundLike = /(זיכוי|החזר|ביטול)/.test(description);
      const raw = parseFloat(amount);
      if (isNaN(raw)) continue;
      const direction: 'income' | 'expense' = raw < 0 ? 'income' : 'expense';
      // if (refundLike) direction = 'income';
      const amountAbs = Math.abs(raw);
      
      // חשב סכום עסקה מקורי (אם שונה מסכום החיוב)
      let origTransactionAmount: number | undefined;
      if (transactionAmountRaw) {
        const cleanTransAmount = transactionAmountRaw.replace(/[^\d.,-]/g, '').replace(',', '.');
        const parsedTransAmount = Math.abs(parseFloat(cleanTransAmount));
        if (!isNaN(parsedTransAmount) && parsedTransAmount !== amountAbs) {
          origTransactionAmount = parsedTransAmount;
        }
      }
      
      details.push({
        id: `${fileName}-${i}-${raw}-${description}`,
        date,
        amount: amountAbs, // סכום חיוב – ערך מוחלט, הכיוון נשמר בשדה direction
        transactionAmount: origTransactionAmount, // סכום עסקה מקורי (רק אם שונה)
        transactionCurrency: transactionCurrency || undefined, // מטבע מקורי (אם קיים)
        description,
        category,
        chargeDate,
        cardLast4,
        fileName,
        rowIndex: i,
        headerIdx,
        source: 'credit',
        direction,
        directionDetected: direction,
        transactionType: 'regular',
      });
    }
  }
  return details;
};

const getMonthYear = (dateStr: string): string => {
  // Try to extract month/year from dd/m/yy or dd/mm/yyyy
  const parts = dateStr.split('/');
  if (parts.length >= 3) {
    const month = parts[1];
    let year = parts[2];
    if (year.length === 2) year = '20' + year;
    return `${month.padStart(2, '0')}/${year}`;
  }
  return '';
};

const App: React.FC = () => {

  // --- שמירת העדפות משתמש ב-localStorage ---
  const APP_PREFS_KEY = 'appPreferences';
  const loadAppPrefs = () => {
    try {
      const saved = localStorage.getItem(APP_PREFS_KEY);
      if (saved) return JSON.parse(saved);
    } catch { /* localStorage may be unavailable */ }
    return {};
  };
  const initialAppPrefs = React.useMemo(() => loadAppPrefs(), []);

  // --- מצב חדש: בחירת בסיס תאריך להצגה ---
  const [dateMode, setDateMode] = useState<'transaction' | 'charge'>(initialAppPrefs.dateMode ?? 'transaction');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // --- מצב טעינה עם שלבים ---
  type LoadingStep = {
    step: 'scanning' | 'reading' | 'processing' | 'categories' | 'finalizing' | 'done';
    message: string;
    progress?: { current: number; total: number };
  };
  const [loadingState, setLoadingState] = useState<LoadingStep | null>(null);
  
  // --- מצב הדרכת משתמש חדש (Tour) ---
  const TOUR_COMPLETED_KEY = 'onboardingTourCompleted';
  const [showTour, setShowTour] = useState(false);
  const [tourPending, setTourPending] = useState(false); // מסמן שיש Tour שממתין להיות מוצג (לפני או במהלך)
  
  // ref למניעת הרצה כפולה של auto-merge (מוגדר כאן כדי שיהיה זמין ל-callbacks של Tour)
  const autoMergeRunRef = React.useRef(false);
  
  // בדוק אם המשתמש כבר סיים את הטור - מבוסס תיקייה
  // אם יש קבצי הגדרות (כמו categories.json) - זה משתמש קיים
  const checkShouldShowTour = useCallback(async (dir: FileSystemDirectoryHandle): Promise<boolean> => {
    // 1. בדוק localStorage (מהיר, למקרה שהמשתמש דילג באותה תיקייה)
    try {
      const completedFolders = localStorage.getItem(TOUR_COMPLETED_KEY);
      if (completedFolders) {
        const folders = JSON.parse(completedFolders) as string[];
        if (folders.includes(dir.name)) return false;
      }
    } catch { /* continue */ }
    
    // 2. בדוק אם יש קבצי הגדרות בתיקייה (משתמש קיים)
    try {
      await dir.getFileHandle('categories.json');
      return false; // יש קובץ = משתמש קיים, לא להציג Tour
    } catch {
      // אין קובץ = משתמש חדש, להציג Tour
      return true;
    }
  }, []);
  
  // selectedMonth unified to string format 'MM/YYYY'
  const formatMonthYear = (date: Date) => `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  const [selectedMonth, setSelectedMonth] = useState<string>(formatMonthYear(new Date()));
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [months, setMonths] = useState<string[]>([]);
  const [view, setView] = useState<'monthly' | 'yearly'>(initialAppPrefs.view ?? 'monthly');
  // Add state to store selected folder path
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  // שמור את קבצי האקסל המקוריים בזיכרון (Map fileName -> ArrayBuffer)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [excelFiles, setExcelFiles] = useState<Map<string, ArrayBuffer>>(new Map());

  // --- חיובי אשראי ללא פירוט (לא neutral, עדיין נספרים כהוצאה) ---
  const [unmatchedCreditCharges, setUnmatchedCreditCharges] = useState<UnmatchedCreditCharge[]>([]);
  // --- מחזורי אשראי ללא עסקת בנק תואמת (חסר דף בנק) ---
  const [unmatchedBankStatements, setUnmatchedBankStatements] = useState<UnmatchedBankStatement[]>([]);
  // --- קבצים כפולים / חופפים ---
  const [duplicateFilesInfo, setDuplicateFilesInfo] = useState<DuplicateFilesInfo | null>(null);

  // --- מצב אנליטיקס ---
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [analyticsSessionId, setAnalyticsSessionId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [analyticsStats, setAnalyticsStats] = useState<{
    fileCount: number;
    transactionCount: number;
    monthCount: number;
    categoryCount: number;
  } | null>(null);

  // --- מצב מקורות הכנסה ---
  const [incomeSourceRules, setIncomeSourceRules] = useState<IncomeSourceRule[]>([]);

  // --- מצב תנאי שימוש ---
  const TERMS_ACCEPTED_KEY = 'termsAccepted';
  const [termsAccepted, setTermsAccepted] = useState(() => {
    return localStorage.getItem(TERMS_ACCEPTED_KEY) === 'true';
  });
  const [showTermsModal, setShowTermsModal] = useState(false);

  const handleTermsChange = (checked: boolean) => {
    setTermsAccepted(checked);
    if (checked) {
      localStorage.setItem(TERMS_ACCEPTED_KEY, 'true');
      // גם לעדכן הסכמה לאנליטיקס
      markConsentAsked();
    }
  };

  // --- מצב הדגשת עסקה (לאחר ניווט מחיפוש גלובלי) ---
  const [highlightedTransactionId, setHighlightedTransactionId] = useState<string | null>(null);

  // --- מעקב זמן שהייה באפליקציה ---
  useEffect(() => {
    // עדכון lastActivity בכל פעולה משמעותית
    const handleActivity = () => updateLastActivity();
    
    // האזנה לאירועי פעילות
    document.addEventListener('click', handleActivity);
    document.addEventListener('keydown', handleActivity);
    document.addEventListener('scroll', handleActivity);
    
    // שמירת משך סשן כשסוגרים את הדף
    const handleBeforeUnload = () => saveSessionDurationForLater();
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      document.removeEventListener('click', handleActivity);
      document.removeEventListener('keydown', handleActivity);
      document.removeEventListener('scroll', handleActivity);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // --- פונקציה למעקב פיצ'רים (רק אם יש פרופיל ואישר) ---
  const trackFeature = useCallback((feature: string) => {
    if (userProfile) {
      trackFeatureUsage(userProfile, feature);
    }
  }, [userProfile]);

  // File System Access API: Directory handle (מוגדר כאן כדי שיהיה זמין ל-callbacks)
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);

  // --- Callbacks להדרכת משתמש חדש (Tour) ---
  const handleTourComplete = useCallback(() => {
    setShowTour(false);
    setTourPending(false); // ה-Tour הסתיים - עכשיו אפשר להציג דיאלוגים אחרים
    autoMergeRunRef.current = false; // אפשר ל-useEffect של הקטגוריות לרוץ אחרי שה-Tour הסתיים
    // שמור את שם התיקייה כדי לא להציג שוב באותה תיקייה
    if (dirHandle) {
      try {
        const existing = localStorage.getItem(TOUR_COMPLETED_KEY);
        const folders: string[] = existing ? JSON.parse(existing) : [];
        if (!folders.includes(dirHandle.name)) {
          folders.push(dirHandle.name);
          localStorage.setItem(TOUR_COMPLETED_KEY, JSON.stringify(folders));
        }
      } catch { /* ignore */ }
    }
    trackFeature('tour_completed');
  }, [trackFeature, dirHandle]);
  
  const handleTourSkip = useCallback(() => {
    setShowTour(false);
    setTourPending(false); // ה-Tour דולג - עכשיו אפשר להציג דיאלוגים אחרים
    autoMergeRunRef.current = false; // אפשר ל-useEffect של הקטגוריות לרוץ אחרי שה-Tour דולג
    // שמור את שם התיקייה גם בדילוג
    if (dirHandle) {
      try {
        const existing = localStorage.getItem(TOUR_COMPLETED_KEY);
        const folders: string[] = existing ? JSON.parse(existing) : [];
        if (!folders.includes(dirHandle.name)) {
          folders.push(dirHandle.name);
          localStorage.setItem(TOUR_COMPLETED_KEY, JSON.stringify(folders));
        }
      } catch { /* ignore */ }
    }
    trackFeature('tour_skipped');
  }, [trackFeature, dirHandle]);

  // CSV תמיכה הוסרה: עבודה עם Excel בלבד

  // רענון התיקייה הנוכחית (קריאה מחדש של הקבצים)
  const handleRefreshDirectory = useCallback(async () => {
    if (!dirHandle) {
      setError('אין תיקייה נבחרת לרענון');
      return;
    }
    try {
      // אפס דגלים כדי לאפשר זיהוי קטגוריות מחדש
      setInitialPromptShown(false);
      await handlePickDirectory_Internal(dirHandle);
    } catch (err) {
      console.error('שגיאה ברענון תיקיה:', err);
      setError('רענון התיקיה נכשל.');
    }
  }, [dirHandle]); // eslint-disable-line react-hooks/exhaustive-deps

  // File System Access API: Pick directory and read Excel files
  const handlePickDirectory = async () => {
    try {
      // @ts-expect-error - showDirectoryPicker is not in all TS libs
      // בקש הרשאת קריאה+כתיבה מיד בבחירת התיקיה - פופאפ אחד במקום שניים
      const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
      
      // --- איפוס פילטרים ומצבים בבחירת תיקייה חדשה ---
      // נקה את סטטוס הקונפליקטים שנדחו - זו תיקייה חדשה
      setDismissedConflictCount(null);
      setInitialPromptShown(false); // אפס את הדגל כדי להציג את הדיאלוג בתיקייה חדשה
      
      // אפס displayMode לברירת מחדל
      setDisplayModeInternal('all');
      
      // נקה פילטרים מ-localStorage (יגרום לאיפוס בקומפוננטות)
      try {
        localStorage.removeItem('dismissedConflictCount');
        localStorage.removeItem('mainViewFilterPreferences'); // selectedCards, includeBank
        localStorage.removeItem('missingDataAlert_dismissed'); // התראות נתונים חסרים
      } catch { /* ignore */ }
      
      await handlePickDirectory_Internal(dir);
    } catch (err) {
      console.error('שגיאה בבחירת תיקיה:', err);
      setError('בחירת התיקיה נכשלה או בוטלה.');
    }
  };

  // פונקציית עזר לקריאת קובץ עם retry
  // מתמודדת עם InvalidStateError שקורה כשהקובץ השתנה
  async function readFileWithRetry(
    fileHandle: FileSystemFileHandle,
    maxRetries: number = 3,
    delayMs: number = 100
  ): Promise<{ arrayBuffer: ArrayBuffer; retryCount: number }> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // קבל reference חדש לקובץ בכל ניסיון
        const file = await fileHandle.getFile();
        const arrayBuffer = await file.arrayBuffer();
        return { arrayBuffer, retryCount: attempt };
      } catch (err) {
        lastError = err as Error;
        
        // אם זו שגיאת InvalidStateError, נסה שוב
        if (lastError.name === 'InvalidStateError' && attempt < maxRetries - 1) {
          // המתן עם exponential backoff
          await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
          continue;
        }
        
        // שגיאה אחרת או נגמרו הניסיונות - זרוק
        throw lastError;
      }
    }
    
    throw lastError;
  }

  // פונקציית עזר לאיסוף קבצי Excel רקורסיבית מכל תת-תיקיות
  // מחזירה רשימת אובייקטים עם FileSystemFileHandle ונתיב יחסי
  type ExcelFileEntry = { handle: FileSystemFileHandle; relativePath: string };
  
  async function collectExcelFilesRecursive(
    dirHandle: FileSystemDirectoryHandle,
    relativePath: string = '',
    depth: number = 0,
    maxDepth: number = 10
  ): Promise<ExcelFileEntry[]> {
    if (depth > maxDepth) return [];
    
    const files: ExcelFileEntry[] = [];
    
    // @ts-expect-error - values() exists on FileSystemDirectoryHandle but not in all TS libs
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        // תמיכה בקריאת קבצי XLSX ישירות
        if (entry.name.endsWith('.xlsx') || entry.name.endsWith('.xls')) {
          const filePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
          files.push({ handle: entry, relativePath: filePath });
        }
      } else if (entry.kind === 'directory') {
        // דלג על תיקיות נסתרות (מתחילות בנקודה)
        if (entry.name.startsWith('.')) continue;
        
        // סרוק תת-תיקייה רקורסיבית
        const subPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        const subFiles = await collectExcelFilesRecursive(entry, subPath, depth + 1, maxDepth);
        files.push(...subFiles);
      }
    }
    
    return files;
  }

  // גרסה פנימית של handlePickDirectory שמקבלת dir כפרמטר
  const handlePickDirectory_Internal = async (dir: FileSystemDirectoryHandle) => {
    setError(null);
    setAnalysis(null);
    setSelectedMonth(formatMonthYear(new Date()));
    setMonths([]);
    setSelectedFolder(null);
    // לא מאפסים קטגוריות/כללים כאן - הן ייטענו מהקובץ בהמשך
    setExcelFiles(new Map());
    // אפס לתצוגה חודשית כדי שה-Tour יעבוד נכון
    setView('monthly');
    
    // אפס את דגל ה-auto-merge כדי שה-useEffect של הקטגוריות יוכל לרוץ מחדש
    autoMergeRunRef.current = false;
    
    // התחל להציג מצב טעינה
    setLoadingState({ step: 'scanning', message: '🔍 סורק תיקיות...' });
    
    try {
      setDirHandle(dir);
      setSelectedFolder(dir.name || '');
      let allDetails: CreditDetail[] = [];

      // איסוף כל קבצי Excel מהתיקייה ומכל תת-תיקיות (עד עומק 10)
      const excelFileEntries = await collectExcelFilesRecursive(dir);
      
      if (excelFileEntries.length === 0) {
        setLoadingState(null);
        setError('לא נמצאו קבצי Excel (XLSX/XLS) בתיקיה או בתת-תיקיות. אנא בחר תיקיה מתאימה.');
        return;
      }
      
      setLoadingState({ 
        step: 'reading', 
        message: `📂 נמצאו ${excelFileEntries.length} קבצים, קורא...`,
        progress: { current: 0, total: excelFileEntries.length }
      });

      // טען את ה-overrides פעם אחת בהתחלה (במקום לקרוא לכל גיליון)
      const sheetTypeOverrides: SheetTypeOverrides = await loadSheetTypeOverridesFromDir(dir);
      let overridesChanged = false;

      // ===== רמה 1: זיהוי קבצים בינאריים זהים =====
      // קרא את כל הקבצים, חשב hash, ודלג על כפולים
      const fileBuffers: Map<string, ArrayBuffer> = new Map();
      const hashToFirstPath: Map<string, string> = new Map(); // hash → first relativePath
      const pathToHash: Map<string, string> = new Map(); // כל path (כולל כפולים) → hash שלו
      const skippedDuplicateFiles: Set<string> = new Set();
      
      for (const { handle, relativePath } of excelFileEntries) {
        try {
          const { arrayBuffer } = await readFileWithRetry(handle);
          const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
          const hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
          pathToHash.set(relativePath, hash);
          
          if (hashToFirstPath.has(hash)) {
            // קובץ כפול – דלג
            skippedDuplicateFiles.add(relativePath);
            console.info(`⏭️ קובץ כפול (זהה ל-${hashToFirstPath.get(hash)}): ${relativePath}`);
          } else {
            hashToFirstPath.set(hash, relativePath);
            fileBuffers.set(relativePath, arrayBuffer);
          }
        } catch {
          // אם הקריאה נכשלה, נטפל בזה בלולאת העיבוד
          fileBuffers.set(relativePath, new ArrayBuffer(0));
        }
      }

      // עבור על כל הקבצים שנמצאו
      let fileIndex = 0;
      for (const { handle: fileHandle, relativePath } of excelFileEntries) {
        fileIndex++;
        
        // דלג על קבצים כפולים שכבר זוהו (רמה 1)
        if (skippedDuplicateFiles.has(relativePath)) {
          continue;
        }
        
        setLoadingState({ 
          step: 'reading', 
          message: `📄 קורא: ${fileHandle.name}`,
          progress: { current: fileIndex, total: excelFileEntries.length }
        });
        // הוצא את הסיומת מהקובץ
        const fileExtension = fileHandle.name.substring(fileHandle.name.lastIndexOf('.')).toLowerCase();
        const retryCount = 0;
        
        try {
          // השתמש ב-buffer שכבר נקרא בשלב ה-hash
          const arrayBuffer = fileBuffers.get(relativePath);
          if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            throw new Error('Empty or missing buffer');
          }
          
          // שמור את קובץ האקסל המקורי בזיכרון (עם נתיב יחסי)
          setExcelFiles((prev: Map<string, ArrayBuffer>) => new Map(prev).set(relativePath, arrayBuffer));
          
          // קרא את הקובץ עם Parser המתאים לסוג הקובץ
          let workbook;
          if (isXLSFile(fileHandle.name)) {
            workbook = await readXLS(arrayBuffer, fileHandle.name);
          } else {
            workbook = await readXLSX(arrayBuffer);
          }
          
          // עבור על כל הגיליונות
          for (const sheet of workbook.sheets) {
            const sheetData = sheetToArray(sheet);
            
            // זיהוי סוג הגיליון - עובד בזיכרון (ללא I/O)
            const result = getSheetType(sheetTypeOverrides, fileHandle.name, sheet.name, sheetData);
            
            // אם צריך קלט מהמשתמש
            if (result.needsUserInput) {
              const chosen = askUserSheetType(fileHandle.name, sheet.name);
              sheetTypeOverrides[result.key] = chosen;
              overridesChanged = true;
              result.type = chosen;
            }
            
            const type = result.type;
            
            // דלג על גליונות ריקים
            if (type === null) {
              continue;
            }
            
            // סמן שה-overrides השתנו (גם אם זיהינו אוטומטית)
            if (!overridesChanged && sheetTypeOverrides[result.key]) {
              overridesChanged = true;
            }
            
            let details: CreditDetail[] = [];
            if (type === 'credit') {
              details = await parseCreditDetailsFromSheet(sheetData, relativePath);
            } else {
              details = await parseBankStatementFromSheet(sheetData, relativePath, sheet.name);
            }
            allDetails = allDetails.concat(details);
          }
        } catch (err) {
          const error = err as Error;
          console.error(`שגיאה בקריאת קובץ ${relativePath}:`, error);
          
          // שלח שגיאה אנונימית ל-Firebase
          trackFileError(userProfile, {
            errorType: error.name === 'InvalidStateError' ? 'file_access_error' : 'file_read_error',
            errorMessage: error.message || 'Unknown error',
            fileExtension,
            retryCount
          }).catch(() => {}); // שקט על שגיאות שליחה
          
          // ממשיך לקובץ הבא
        }
      }

      // שמור את ה-overrides פעם אחת בסוף (במקום לשמור לכל גיליון)
      if (overridesChanged) {
        try {
          await saveSheetTypeOverridesToDir(dir, sheetTypeOverrides);
        } catch (err) {
          console.warn('לא ניתן לשמור sheet type overrides:', err);
        }
      }

      if (allDetails.length === 0) {
        setLoadingState(null);
        setError('לא נמצאו עסקאות בקבצי Excel. ודא שהקבצים מכילים נתוני אשראי או בנק בפורמט נתמך.');
        return;
      }
      
      setLoadingState({ 
        step: 'processing', 
        message: `⚙️ מעבד ${allDetails.length.toLocaleString()} עסקאות...`
      });

      allDetails = applyAliases(allDetails, await loadAliasesFromDir(dir, 'category'), await loadAliasesFromDir(dir, 'description'));
      const loadedCategoryRules = await loadCategoryRules(dir);
      setCategoryRules(loadedCategoryRules); // שמור ב-state
      allDetails = applyCategoryRules(allDetails, loadedCategoryRules);
      const directionOverrides = await loadDirectionOverridesFromDir(dir);
      allDetails = applyDirectionOverrides(allDetails, directionOverrides);
      const { details: finalDetails, creditChargeCycles: finalCycles } = await processCreditChargeMatching(allDetails, dir);
      allDetails = finalDetails;

      // --- זיהוי חיובי אשראי ללא פירוט (לפי תיאור ידוע, לא סומנו neutral) ---
      const unmatched = detectUnmatchedCreditCharges(allDetails);
      setUnmatchedCreditCharges(unmatched);
      
      // --- זיהוי מחזורי אשראי ללא עסקת בנק תואמת (חסר דף בנק) ---
      const missingBank = detectMissingBankStatements(finalCycles, allDetails);
      setUnmatchedBankStatements(missingBank);

      // --- רמה 1+3: בניית מידע כפילויות ---
      {
        // רמה 1: בנה קבוצות קבצים זהים מה-hash pass
        const hashToAllPaths: Map<string, string[]> = new Map();
        for (const [path, hash] of pathToHash) {
          const existing = hashToAllPaths.get(hash);
          if (existing) {
            existing.push(path);
          } else {
            hashToAllPaths.set(hash, [path]);
          }
        }
        const identicalGroups = Array.from(hashToAllPaths.entries())
          .filter(([, paths]) => paths.length > 1)
          .map(([hash, paths]) => ({
            hash,
            paths,
            fileSize: fileBuffers.get(paths[0])?.byteLength ?? 0
          }));

        // רמה 3: זיהוי חפיפת תאריכים
        const overlappingRanges = findOverlappingDateRanges(allDetails, skippedDuplicateFiles);

        setDuplicateFilesInfo({
          identicalFiles: identicalGroups,
          overlappingRanges,
          skippedFiles: Array.from(skippedDuplicateFiles)
        });
      }
      
      // --- Firebase: שלח תיאורים חדשים שזוהו ע"י סכום אבל לא ברשימה הידועה ---
      // מחפש עסקאות שסומנו credit_charge (ע"י סכום+תאריך) אבל התיאור שלהן לא ברשימה
      const unknownDescriptions = allDetails
        .filter(d => d.source === 'bank' && 
          (d.transactionType === 'credit_charge' || d.transactionType === 'credit_charge_combined') &&
          d.neutral === true &&
          !isKnownCreditChargeDescription(d.description))
        .map(d => d.description);

      setLoadingState({ 
        step: 'categories', 
        message: '🏷️ מזהה קטגוריות ומקורות הכנסה...'
      });
      
      // --- טעינת קטגוריות מהקובץ ---
      const loadedCategories = await loadCategoriesFromDir(dir);
      if (loadedCategories) {
        setCategoriesList(loadedCategories);
        // שמור את הקטגוריות המקוריות לבדיקת קטגוריות חדשות
        originalCategoriesRef.current.clear();
        loadedCategories.forEach(c => originalCategoriesRef.current.set(c.name, c.name));
      } else {
        originalCategoriesRef.current.clear();
      }
      
      // טען את כללי alias
      const loadedCategoryAliases = await loadAliasesFromDir(dir, 'category');
      if (loadedCategoryAliases) {
        setCategoryAliases(loadedCategoryAliases);
      }
      
      // --- טעינת וזיהוי מקורות הכנסה ---
      let loadedIncomeRules = await loadIncomeSourceRules(dir);
      
      // זיהוי אוטומטי של מקורות הכנסה חדשים (3+ חודשים ללא יציאות מקבילות)
      const newAutoRules = detectAutoIncomeSources(allDetails, loadedIncomeRules);
      if (newAutoRules.length > 0) {
        loadedIncomeRules = [...loadedIncomeRules, ...newAutoRules];
        await saveIncomeSourceRules(dir, loadedIncomeRules);
      }
      setIncomeSourceRules(loadedIncomeRules);
      
      // החל כללי מקורות הכנסה על העסקאות
      allDetails = applyIncomeSourceRules(allDetails, loadedIncomeRules);

      const uniqueMonths = Array.from(new Set(allDetails.map(d => getMonthYear(d.date)).filter(Boolean)));
      setMonths(uniqueMonths);
      const latest = uniqueMonths.slice().sort((a, b) => {
        const [ma, ya] = a.split('/').map(Number);
        const [mb, yb] = b.split('/').map(Number);
        return ya !== yb ? ya - yb : ma - mb;
      }).pop();
      setSelectedMonth(latest || formatMonthYear(new Date()));

      setLoadingState({ 
        step: 'finalizing', 
        message: '✨ מסיים...'
      });
      
      const totalAmount = allDetails.reduce((sum, d) => sum + signedAmount(d), 0);
      const averageAmount = allDetails.length > 0 ? totalAmount / allDetails.length : 0;
      setAnalysis({ totalAmount, averageAmount, details: allDetails, creditChargeCycles: finalCycles });
      
      // סיום הטעינה
      setLoadingState(null);
      
      // הפעל את ה-Tour למשתמש חדש (אחרי delay קצר לתת לממשק להיטען)
      // סמן מיד שאנחנו בודקים Tour - לחסום דיאלוגים אחרים עד שנדע
      setTourPending(true);
      const shouldShowTour = await checkShouldShowTour(dir);
      if (shouldShowTour) {
        setTimeout(() => setShowTour(true), 500);
      } else {
        // אין צורך ב-Tour - שחרר את החסימה
        setTourPending(false);
        autoMergeRunRef.current = false; // וודא שה-useEffect של הקטגוריות יכול לרוץ
      }

      // --- Analytics: טיפול בפרופיל משתמש ---
      // שולחים session_start תמיד (לכל המשתמשים)
      try {
        const { profile, isNewUser } = await getOrCreateUserProfile(dir);
        setUserProfile({ ...profile, _isNewUser: isNewUser } as UserProfile & { _isNewUser: boolean });
        
        // שלח session_start תמיד - לכל המשתמשים (גם מי שסירב)
        await trackSessionStart(profile, isNewUser);
        
        // שלח את משך הסשן הקודם (אם קיים מהביקור הקודם)
        await trackPreviousSessionDuration(profile);
        
        // שמור סטטיסטיקות לשליחה ברגע ההחלטה
        const uniqueCategories = new Set(allDetails.map(d => d.category).filter(Boolean));
        setAnalyticsStats({
          fileCount: excelFileEntries.length,
          transactionCount: allDetails.length,
          monthCount: uniqueMonths.length,
          categoryCount: uniqueCategories.size
        });
        
        // שלח סטטיסטיקות טעינה (המשתמש כבר אישר בכניסה)
        if (profile.analyticsConsent === true || termsAccepted) {
          // יצירת sessionId ייחודי לקישור בין אירועים
          const sessionId = crypto.randomUUID();
          setAnalyticsSessionId(sessionId);
          
          // חשב קטגוריות לא מזוהות - אלה שבאקסל אבל לא קיימות ב-categories.json
          const loadedCategoryNames = new Set(loadedCategories?.map(c => c.name) || []);
          const loadedAliasNames = new Set(Object.keys(loadedCategoryAliases || {}));
          
          // קבץ עסקאות לפי קטגוריה לא מזוהה (שם + כמות בלבד, ללא תיאורים — פרטיות)
          const unknownCategoriesMap = new Map<string, number>();
          
          for (const d of allDetails) {
            const cat = d.category;
            if (cat && !loadedCategoryNames.has(cat) && !loadedAliasNames.has(cat)) {
              unknownCategoriesMap.set(cat, (unknownCategoriesMap.get(cat) || 0) + 1);
            }
          }
          
          const unknownCategories: UnknownCategoryInfo[] = Array.from(unknownCategoriesMap.entries()).map(([excelCategory, count]) => ({
            excelCategory,
            count,
          }));
          
          await trackFilesLoaded(profile, {
            fileCount: excelFileEntries.length,
            transactionCount: allDetails.length,
            monthCount: uniqueMonths.length,
            categoryCount: uniqueCategories.size,
            sessionId,
            unknownCategories: unknownCategories.length > 0 ? unknownCategories : undefined
          });
          
          // שלח תיאורי חיובי אשראי שזוהו ע"י סכום אבל לא ברשימה הידועה
          if (unknownDescriptions.length > 0) {
            await trackUnknownCreditChargeDescriptions(profile, unknownDescriptions);
          }
        }
      } catch (analyticsError) {
        // אנליטיקס נכשל - לא משפיע על האפליקציה
        console.debug('[Analytics] Error:', analyticsError);
      }
    } catch (err) {
      console.error('שגיאה בבחירת תיקיה:', err);
      setLoadingState(null);
      setError('בחירת התיקיה נכשלה או בוטלה.');
    }
  };

  // מצבי תצוגה/פילטרים חדשים
  const [displayMode, setDisplayModeInternal] = useState<'all' | 'expense' | 'income'>(initialAppPrefs.displayMode ?? 'all');


  const setDisplayMode = useCallback((mode: 'all' | 'expense' | 'income') => {
    setDisplayModeInternal(mode);
    const featureMap = {
      'all': 'filter_all',
      'expense': 'filter_expense',
      'income': 'filter_income'
    };
    trackFeature(featureMap[mode]);
  }, [trackFeature]);

  const setViewWithTracking = useCallback((newView: 'monthly' | 'yearly') => {
    setView(newView);
    trackFeature(newView === 'yearly' ? 'view_yearly' : 'view_monthly');
  }, [trackFeature]);

  const setDateModeWithTracking = useCallback((mode: 'transaction' | 'charge') => {
    setDateMode(mode);
    trackFeature('change_date_mode');
  }, [trackFeature]);

  // שמירת העדפות App ב-localStorage בכל שינוי
  React.useEffect(() => {
    const prefs = { view, displayMode, dateMode };
    try {
      localStorage.setItem(APP_PREFS_KEY, JSON.stringify(prefs));
    } catch { /* localStorage may be unavailable or quota exceeded */ }
  }, [view, displayMode, dateMode]);

  // פונקציית עזר לקבל תאריך אפקטיבי לפי מצב התצוגה
  const getEffectiveDate = (d: CreditDetail): string => {
    if (dateMode === 'charge' && d.chargeDate) return d.chargeDate;
    return d.date;
  };

  // פונקציית עזר לקבל month/year מתאריך אפקטיבי
  const getEffectiveMonthYear = (d: CreditDetail): string => {
    return getMonthYear(getEffectiveDate(d));
  };

  // חישוב מחדש של רשימת החודשים כאשר dateMode או analysis משתנים
  React.useEffect(() => {
    if (!analysis) return;
    const uniqueMonths = Array.from(new Set(analysis.details.map(d => getEffectiveMonthYear(d)).filter(Boolean)));
    // שמור את סדר החודשים כפי שהוא (תאורטי) – או פשוט עדכן
    setMonths(uniqueMonths);
    if (selectedMonth && !uniqueMonths.includes(selectedMonth)) {
      // Fallback: choose closest (latest) month that exists
      const latest = uniqueMonths.slice().sort((a, b) => {
        const [ma, ya] = a.split('/').map(Number);
        const [mb, yb] = b.split('/').map(Number);
        return ya !== yb ? ya - yb : ma - mb;
      }).pop();
      setSelectedMonth(latest || formatMonthYear(new Date()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, dateMode]);

  // Filtered details: בתצוגה חודשית או שנתית לפי מצב תאריך
  const scopedDetails = analysis
    ? view === 'monthly'
      ? analysis.details.filter(d => getEffectiveMonthYear(d) === selectedMonth)
      : analysis.details.filter(d => {
        const effDate = getEffectiveDate(d);
        const parts = effDate.split('/');
        if (parts.length < 3) return false;
        const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
        return year === selectedYear;
      })
    : [];

  // פילטר: הסתר חיובי בנק של כרטיס אשראי רק אם יש להם פירוט (relatedTransactionIds) כדי למנוע כפל.
  // סינון לפי displayMode: 
  // - 'income' = עסקאות שסומנו כמקור הכנסה
  // - 'expense' = עסקאות הוצאה (כולל ביטולי הוצאה שמקטינים את ההוצאה)
  const filteredDetails = scopedDetails.filter(d => {
    if (displayMode === 'all') return true;
    if (displayMode === 'income') {
      // הכנסות (כולל ביטולי הכנסה שמקטינים את ההכנסה)
      return d.transactionNature === 'income';
    }
    if (displayMode === 'expense') {
      // הוצאות + ביטולי הוצאה (החזרים)
      return d.transactionNature === 'expense' || d.transactionNature === 'expense_reversal' || !d.transactionNature;
    }
    return true;
  });

  // סכימה: לא לספור חיובי בנק אשראי עם פירוט (כדי לא לכפול). כן לספור חיוב אשראי בנקאי ללא פירוט (אין פירוט אשראי שנכנס במקומו).
  const filteredTotal = filteredDetails.reduce((sum, d) => {
    if (d.source === 'bank' && d.transactionType === 'credit_charge') {
      const hasBreakdown = (d.relatedTransactionIds?.length || 0) > 0;
      if (hasBreakdown) return sum; // דלג – כבר מופיע דרך פירוט האשראי
      // אין פירוט => מחשיבים כהוצאה
      return sum + signedAmount(d);
    }
    // ברירת מחדל: דלג אם neutral, אחרת הוסף
    if (d.neutral) return sum;
    return sum + signedAmount(d);
  }, 0);
  // --- Monthly comparison logic --- (monthTotals based on effective date)
  const monthTotals: Record<string, number> = {};
  if (analysis) {
    analysis.details.forEach(d => {
      const m = getEffectiveMonthYear(d);
      if (m) monthTotals[m] = (monthTotals[m] || 0) + signedAmount(d);
    });
  }
  // Sort months chronologically (by year, then month, ascending)
  const sortedMonths = months.slice().sort((a, b) => {
    const [ma, ya] = a.split('/').map(Number);
    const [mb, yb] = b.split('/').map(Number);
    return ya !== yb ? ya - yb : ma - mb;
  });
  const currentMonthIdx = sortedMonths.indexOf(selectedMonth);
  const prevMonth = currentMonthIdx > 0 ? sortedMonths[currentMonthIdx - 1] : null;

  const diff = prevMonth ? (monthTotals[selectedMonth] || 0) - monthTotals[prevMonth] : null;
  const percent = prevMonth && monthTotals[prevMonth] !== 0 ? (diff! / monthTotals[prevMonth]) * 100 : null;

  // Smart analysis: categories, vendor stats
  // Extract categories from the category field only
  // משתמשים ב-signedAmount כמו בחישוב filteredTotal לעקביות
  // const categories = (() => {
  //   const catCounts: Record<string, number> = {};
  //   filteredDetails.forEach(d => {
  //     // דלג על חיובי בנק אשראי עם פירוט (כמו בחישוב filteredTotal)
  //     if (d.source === 'bank' && d.transactionType === 'credit_charge') {
  //       const hasBreakdown = (d.relatedTransactionIds?.length || 0) > 0;
  //       if (hasBreakdown) return;
  //     }
  //     if (d.neutral) return;
  //     // השתמש בקטגוריה אם קיימת, אחרת "לא מסווג"
  //     const categoryName = d.category || 'לא מסווג';
  //     catCounts[categoryName] = (catCounts[categoryName] || 0) + signedAmount(d);
  //   });
  //   return catCounts;
  // })();

  // חישוב נתוני סיכום חודשי לכל השנה (עפ"י תאריך אפקטיבי)
  const yearlySummary = React.useMemo(() => {
    const summary: Record<string, number> = {};
    analysis?.details.forEach((d) => {
      const effDate = getEffectiveDate(d);
      const parts = effDate.split('/');
      if (parts.length < 3) return;
      const month = parts[1];
      const yearRaw = parts[2];
      const fullYear = yearRaw.length === 2 ? '20' + yearRaw : yearRaw;
      const key = `${fullYear}-${month.padStart(2, '0')}`;
      summary[key] = (summary[key] || 0) + signedAmount(d);
    });
    return summary;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, dateMode]);

  // הצג עמודה חדשה בטבלת העסקאות: שם קובץ מקור
  // (נדרש גם ב-TransactionsTable.tsx, אך כאן נתחיל מהוספת onEditCategory)
  // הוספת state ודיאלוג לשינוי קטגוריה (כולל קובץ מקור)
  const [editDialog, setEditDialog] = useState<EditDialogState | null>(null);

  const handleOpenEditCategory = (transaction: CreditDetail) => {
    if (!analysis) return;
    // מעקב פיצ'ר
    trackFeature('edit_category');
    // מצא את כל ההוצאות עם אותו תיאור (בכל הקבצים)
    const candidates = analysis.details.filter(d => d.description === transaction.description);
    setEditDialog({
      open: true,
      transaction,
      candidates,
      newCategory: transaction.category || '',
      applyToAll: true,
      excludeIds: new Set(),
    });
  };

  // --- פתיחת דיאלוג לשינוי קטגוריה מרוכז (מחיפוש) ---
  const handleBulkEditCategory = (transactions: CreditDetail[], searchTerm: string) => {
    if (!analysis || transactions.length === 0) return;
    // השתמש בעסקה הראשונה כבסיס, אבל candidates = כל העסקאות מהחיפוש
    const transaction = transactions[0];
    setEditDialog({
      open: true,
      transaction,
      candidates: transactions,
      newCategory: transaction.category || '',
      applyToAll: true,
      excludeIds: new Set(),
      searchTerm, // שמור את מילת החיפוש להצגה בדיאלוג
    });
  };

  // --- שינוי קטגוריה מרוכז מחיפוש גלובלי (inline) ---
  const handleApplyBulkCategoryChange = async (
    transactions: CreditDetail[],
    newCategory: string,
    filters: SearchFiltersForRule,
    createRule: boolean,
    includeDatesInRule: boolean
  ) => {
    if (!analysis || transactions.length === 0 || !newCategory) return;
    
    const idsToUpdate = transactions.map(d => d.id);
    
    // עדכון העסקאות
    const newDetails = analysis.details.map(d => {
      if (idsToUpdate.includes(d.id)) {
        return { ...d, category: newCategory };
      }
      return d;
    });

    // יצירת כלל (אם נבחר)
    if (createRule && dirHandle) {
      const ruleResult = await addAdvancedRule(dirHandle, filters, newCategory, includeDatesInRule);
      showAppToast(ruleResult, newCategory);
      // רענון הכללים
      const updatedRules = await loadCategoryRules(dirHandle);
      setCategoryRules(updatedRules);
    }

    // עדכון ה-state
    setAnalysis({ ...analysis, details: newDetails });
  };

  // --- עדכון כלל קיים מ-GlobalSearchModal ---
  const handleUpdateRuleFromGlobalSearch = async (
    ruleId: string,
    filters: SearchFiltersForRule,
    newCategory: string,
    includeDatesInRule: boolean
  ) => {
    if (!dirHandle || !analysis) return;
    
    // עדכון הכלל בקובץ
    await updateCategoryRule(dirHandle, ruleId, filters, newCategory, includeDatesInRule);
    
    // רענון הכללים
    const updatedRules = await loadCategoryRules(dirHandle);
    setCategoryRules(updatedRules);
    
    // יישום הכללים מחדש על כל העסקאות
    const updatedDetails = applyCategoryRules(analysis.details, updatedRules);
    setAnalysis({ ...analysis, details: updatedDetails });
  };

  // --- פונקציה ליישום שינוי קטגוריה ---
  const handleApplyCategoryChange = async (editDialogParam?: typeof editDialog) => {
    const dialog = editDialogParam || editDialog;
    if (!dialog || !analysis) return;
    const { candidates = [], newCategory = '', applyToAll = false, excludeIds = new Set(), transaction, amountFilter, searchTerm, createAutoRule, globalSearchFilters, includeDatesInRule } = dialog;
    let idsToUpdate: string[];
    
    // אם נפתח מחיפוש, תמיד applyToAll=true בפועל
    const isFromSearch = !!searchTerm;
    const isFromGlobalSearch = !!globalSearchFilters;
    const effectiveApplyToAll = isFromSearch || isFromGlobalSearch || applyToAll;
    
    if (effectiveApplyToAll) {
      idsToUpdate = candidates.filter(d => !excludeIds.has?.(d.id)).map(d => d.id);
    } else {
      idsToUpdate = [transaction?.id].filter(Boolean) as string[];
    }
    const newDetails = analysis.details.map(d => {
      if (idsToUpdate.includes(d.id)) {
        return { ...d, category: newCategory };
      }
      return d;
    });

    // שמירת כלל קטגוריה (רק אם createAutoRule מופעל)
    const shouldCreateRule = createAutoRule !== false; // ברירת מחדל: כן
    
    if (effectiveApplyToAll && newCategory && shouldCreateRule && dirHandle) {
      if (!excludeIds || excludeIds.size === 0) {
        let ruleResult: RuleChangeResult = { action: 'unchanged' };
        // אם נפתח מחיפוש גלובלי - צור כלל עם כל הפילטרים
        if (isFromGlobalSearch && globalSearchFilters) {
          ruleResult = await addAdvancedRule(dirHandle, globalSearchFilters, newCategory, includeDatesInRule);
        }
        // אם נפתח מחיפוש רגיל - צור כלל regex שמכיל את מילת החיפוש
        else if (isFromSearch && searchTerm) {
          ruleResult = await addDescriptionContainsRule(dirHandle, searchTerm, newCategory);
        } else if (transaction?.description) {
          // שינוי רגיל - כלל על תיאור מדויק
          // בדוק אם יש סינון סכום
          if (amountFilter && (amountFilter.minAmount !== undefined || amountFilter.maxAmount !== undefined)) {
            ruleResult = await addRuleWithAmountRange(
              dirHandle,
              transaction.description,
              newCategory,
              amountFilter.minAmount,
              amountFilter.maxAmount
            );
          } else {
            ruleResult = await addDescriptionEqualsRule(dirHandle, transaction.description, newCategory);
          }
        }
        showAppToast(ruleResult, newCategory);
      } else {
        // יש החרגות - שמור כל עסקה מסומנת בנפרד
        for (const id of idsToUpdate) {
          await addTransactionCategoryRule(dirHandle, id, newCategory);
        }
      }
    } else if (!effectiveApplyToAll && transaction?.id && newCategory && dirHandle) {
      // שמירת קטגוריה לעסקה בודדת
      await addTransactionCategoryRule(dirHandle, transaction.id, newCategory);
    }
    // עדכן את קבצי האקסל בזיכרון וגם בתיקיה (אם נבחרה)
    // Note: updateExcelFilesWithCategories is not fully implemented yet
    // const detailsToUpdate = newDetails.filter(d => idsToUpdate.includes(d.id));
    // await updateExcelFilesWithCategories(detailsToUpdate, newCategory);
    // בינתיים updateExcelFilesWithCategories מחזיר אובייקט ריק, אז נדלג על עדכון קבצים
    // setExcelFiles(prev => {
    //   const updated = new Map(prev);
    //   Object.entries(newFiles).forEach(([fileName, blob]) => {
    //     (blob as Blob).arrayBuffer().then((buffer: ArrayBuffer) => {
    //       updated.set(fileName, buffer);
    //       setExcelFiles(new Map(updated));
    //     });
    //   });
    //   return updated;
    // });
    // // אם נבחרה תיקיה עם File System Access API, כתוב את הקבצים ישירות
    // if (dirHandle) {
    //   for (const [fileName, blob] of Object.entries(newFiles)) {
    //     try {
    //       const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    //       const writable = await fileHandle.createWritable();
    //       await writable.write(blob);
    //       await writable.close();
    //     } catch (e) {
    //       // אפשר להציג שגיאה למשתמש אם צריך
    //       console.error('שגיאה בכתיבת קובץ:', fileName, e);
    //     }
    //   }
    // }
    
    // רענון רשימת הכללים מהקובץ אחרי שמירה
    if (dirHandle) {
      const updatedRules = await loadCategoryRules(dirHandle);
      setCategoryRules(updatedRules);
    }
    
    setAnalysis({ ...analysis, details: newDetails });
    setEditDialog(null);
  };

  const [categoriesList, setCategoriesList] = useState<CategoryDef[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  
  // ref שתמיד מחזיק את הערך העדכני של categoriesList — לשימוש בתוך closures (כמו onConfirm)
  const categoriesListRef = React.useRef(categoriesList);
  React.useEffect(() => { categoriesListRef.current = categoriesList; }, [categoriesList]);

  // פונקציה אחידה להוספה/עדכון קטגוריה - מונעת כפילויות
  const upsertCategory = React.useCallback((cat: CategoryDef) => {
    setCategoriesList(prev => {
      const idx = prev.findIndex(c => c.name === cat.name);
      let updated: CategoryDef[];
      if (idx >= 0) {
        // עדכון קטגוריה קיימת
        updated = [...prev];
        updated[idx] = cat;
      } else {
        // הוספת קטגוריה חדשה
        updated = [...prev, cat];
      }
      if (dirHandle) saveCategoriesToDir(dirHandle, updated);
      return updated;
    });
  }, [dirHandle]);

  // State for multi-category prompt
  const [newCategoriesPrompt, setNewCategoriesPrompt] = useState<null | { 
    names: string[], 
    onConfirm: (mapping: Record<string, CategoryDef>) => void,
    onConflictsResolved?: (resolved: Record<string, string>) => void 
  }>(null);

  // --- Feedback Popup ---
  // דוחים את ה-Feedback כשדיאלוג אחר פתוח (קונפליקטים, Tour, עריכת קטגוריה)
  // הטיימר מתאפס כשדיאלוג נסגר, ומתחיל 30 שניות מחדש
  const isFeedbackBlockingDialogOpen = !!newCategoriesPrompt || !!showTour || tourPending || !!editDialog?.open;
  const feedbackPopup = useFeedbackPopup({
    profile: userProfile,
    dirHandle,
    analysisReady: !!analysis,
    isDialogOpen: isFeedbackBlockingDialogOpen,
    saveProfile: saveUserProfile,
    trackEvent,
  });

  const [categoryAliases, setCategoryAliases] = useState<Record<string, string>>({});
  // ref שתמיד מחזיק את הערך העדכני של categoryAliases — לשימוש בתוך closures
  const categoryAliasesRef = React.useRef(categoryAliases);
  React.useEffect(() => { categoryAliasesRef.current = categoryAliases; }, [categoryAliases]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_descriptionAliases, _setDescriptionAliases] = useState<Record<string, string>>({});

  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // State לעריכת כלל מ-SettingsMenu
  const [ruleToEditFromSettings, setRuleToEditFromSettings] = useState<CategoryRule | null>(null);

  // --- Category Rules (unified system) ---
  const [categoryRules, setCategoryRules] = useState<CategoryRule[]>([]);

  // --- App-level toast notification with undo ---
  type AppToastData = { message: string; undoAction?: () => void; };
  const [appToast, setAppToast] = useState<AppToastData | null>(null);
  const appToastTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissAppToast = React.useCallback(() => {
    if (appToastTimeoutRef.current) clearTimeout(appToastTimeoutRef.current);
    setAppToast(null);
  }, []);

  const handleUndoRuleChange = React.useCallback(async (ruleId: string, previousCategory: string) => {
    if (!dirHandle) return;
    const rules = await loadCategoryRules(dirHandle);
    const idx = rules.findIndex(r => r.id === ruleId);
    if (idx === -1) return;
    rules[idx] = { ...rules[idx], category: previousCategory, updatedAt: new Date().toISOString() };
    await saveCategoryRules(dirHandle, rules);
    setCategoryRules(rules);
    if (analysis) {
      setAnalysis(a => a ? { ...a, details: applyCategoryRules(a.details, rules) } : a);
    }
  }, [dirHandle, analysis]);

  const showAppToast = React.useCallback((result: RuleChangeResult, newCategory: string) => {
    if (result.action === 'unchanged') return;
    if (appToastTimeoutRef.current) clearTimeout(appToastTimeoutRef.current);
    const message = result.action === 'updated'
      ? `🔄 כלל קטגוריה עודכן: ${result.previousCategory ?? '?'} → ${newCategory}`
      : `✅ כלל קטגוריה חדש נוצר: → ${newCategory}`;
    const undoAction = result.action === 'updated' && result.ruleId && result.previousCategory
      ? () => handleUndoRuleChange(result.ruleId!, result.previousCategory!)
      : undefined;
    setAppToast({ message, undoAction });
    appToastTimeoutRef.current = setTimeout(() => setAppToast(null), 6000);
  }, [handleUndoRuleChange]);

  // Load category rules from directory
  React.useEffect(() => {
    if (!dirHandle) return;
    (async () => {
      const rules = await loadCategoryRules(dirHandle);
      setCategoryRules(rules);
    })();
  }, [dirHandle]);

  // Update a rule's category
  async function handleUpdateRule(ruleId: string, newCategory: string) {
    if (!dirHandle) return;
    const updated = categoryRules.map(r => 
      r.id === ruleId ? { ...r, category: newCategory } : r
    );
    await saveCategoryRules(dirHandle, updated);
    setCategoryRules(updated);
    // Reapply rules to analysis
    if (analysis) {
      setAnalysis(a => a ? { ...a, details: applyCategoryRules(a.details, updated) } : a);
    }
  }

  // Delete a rule
  async function handleDeleteRule(ruleId: string) {
    if (!dirHandle) return;
    const updated = categoryRules.filter(r => r.id !== ruleId);
    await saveCategoryRules(dirHandle, updated);
    setCategoryRules(updated);
  }

  // Toggle rule active/inactive (soft delete)
  async function handleToggleRule(ruleId: string, active: boolean) {
    if (!dirHandle) return;
    const updated = categoryRules.map(r => 
      r.id === ruleId ? { ...r, active, updatedAt: new Date().toISOString() } : r
    );
    await saveCategoryRules(dirHandle, updated);
    setCategoryRules(updated);
    // Reapply rules to analysis if activating
    if (active && analysis) {
      setAnalysis(a => a ? { ...a, details: applyCategoryRules(a.details, updated) } : a);
    }
  }

  // Legacy support: keep descToCategory derived from rules for backwards compatibility
  // const descToCategory = React.useMemo(() => {
  //   const map: Record<string, string> = {};
  //   categoryRules
  //     .filter(r => r.active && r.conditions.descriptionEquals)
  //     .forEach(r => {
  //       map[r.conditions.descriptionEquals!] = r.category;
  //     });
  //   return map;
  // }, [categoryRules]);

  // Prompt for new categories after both categoriesList and analysis are loaded
  // מיפוי קטגוריות ידועות לברירות מחדל (אייקון + צבע)
  const KNOWN_CATEGORY_DEFAULTS: Record<string, { icon: string; color: string }> = {
    'אופנה': { icon: '👗', color: '#00a3ad' },
    'ביטוח': { icon: '🛡️', color: '#2550ff' },
    'חשמל': { icon: '💡', color: '#ffb300' },
    'כספים': { icon: '💰', color: '#aa82ff' },
    'מזון': { icon: '🛒', color: '#ff3f9b' },
    'מסעדות': { icon: '🍴', color: '#13e2bf' },
    'ספרים': { icon: '📚', color: '#8bc34a' },
    'בית': { icon: '🛋️', color: '#c20017' },
    'עירייה': { icon: '🏛️', color: '#ff6f61' },
    'פנאי': { icon: '🎉', color: '#ff7121' },
    'קוסמטיקה': { icon: '💄', color: '#ff8dab' },
    'רפואה': { icon: '💊', color: '#879aff' },
    'שונות': { icon: '🔖', color: '#ecd400' },
    'תחבורה': { icon: '🚗', color: '#009950' },
    'תקשורת': { icon: '📱', color: '#b6c700' },
    'תיירות': { icon: '✈️', color: '#4a90d9' },
    'תרומות': { icon: '💰', color: '#e57373' },
    'חינוך': { icon: '🎓', color: '#7b68ee' },
    'משרד': { icon: '📋', color: '#607d8b' },
    'מזל': { icon: '🎰', color: '#d4af37' },
  };
  
  // פונקציה לבדוק אם לקטגוריה יש דיפולט
  const getCategoryDefaults = (catName: string): { icon: string; color: string } | null => {
    const lowerName = catName.toLowerCase();
    for (const [key, val] of Object.entries(KNOWN_CATEGORY_DEFAULTS)) {
      if (lowerName.includes(key)) {
        return val;
      }
    }
    return null;
  };
  
  // דגל לזיהוי שהקטגוריות נטענו לפחות פעם אחת
  const [categoriesLoadedOnce, setCategoriesLoadedOnce] = useState(false);
  
  // דגל לזיהוי שדיאלוג הקטגוריות כבר הוצג בסשן הזה (למנוע הצגה חוזרת אחרי מחיקה/עריכה)
  const [initialPromptShown, setInitialPromptShown] = useState(false);
  
  React.useEffect(() => {
    if (!categoriesLoading && dirHandle) {
      setCategoriesLoadedOnce(true);
    }
  }, [categoriesLoading, dirHandle]);
  
  // פונקציה לזיהוי קונפליקטים (בתי עסק בקטגוריות שונות) - דומה ללוגיקה ב-NewCategoriesTablePrompt
  const detectMerchantConflicts = React.useCallback((details: CreditDetail[], rules: CategoryRule[]): number => {
    const extractMerchantName = (description: string): string => {
      if (!description) return '';
      const cleaned = description
        .replace(/\d{1,2}[/\-.]\d{1,2}([/\-.]\d{2,4})?/g, '')
        .replace(/\d{4,}/g, '')
        .replace(/[*#\-_]+/g, ' ')
        .trim();
      const words = cleaned.split(/\s+/).filter(w => w.length > 1);
      return words.slice(0, 3).join(' ').toLowerCase();
    };
    
    const isTransactionCoveredByRule = (tx: CreditDetail): boolean => {
      for (const rule of rules) {
        if (!rule.active) continue;
        const c = rule.conditions;
        if (c.descriptionEquals && tx.description === c.descriptionEquals) return true;
        if (c.descriptionContains) {
          const cleaned = tx.description
            .replace(/\d{1,2}[/\-.]\d{1,2}([/\-.]\d{2,4})?/g, '')
            .replace(/\d{4,}/g, '')
            .replace(/[*#\-_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
          if (cleaned.includes(c.descriptionContains.toLowerCase())) return true;
        }
        if (c.descriptionRegex) {
          try {
            const regex = new RegExp(c.descriptionRegex, 'i');
            if (regex.test(tx.description)) return true;
          } catch { /* regex invalid */ }
        }
      }
      return false;
    };
    
    const merchantToCategories = new Map<string, Map<string, number>>();
    for (const tx of details) {
      if (isTransactionCoveredByRule(tx)) continue;
      const merchant = extractMerchantName(tx.description);
      const category = tx.category || '';
      if (!merchant || merchant.length <= 2 || !category) continue;
      if (!merchantToCategories.has(merchant)) {
        merchantToCategories.set(merchant, new Map());
      }
      const catMap = merchantToCategories.get(merchant)!;
      catMap.set(category, (catMap.get(category) || 0) + 1);
    }
    
    let conflictCount = 0;
    for (const [, catMap] of merchantToCategories.entries()) {
      if (catMap.size <= 1) continue;
      // ספור רק קונפליקטים עם >= 3 עסקאות (בהתאמה ללוגיקה ב-NewCategoriesTablePrompt)
      let total = 0;
      for (const count of catMap.values()) total += count;
      if (total >= 3) conflictCount++;
    }
    return conflictCount;
  }, []);

  // מפתח לזיהוי האם המשתמש כבר דילג על דיאלוג הקונפליקטים
  const [dismissedConflictCount, setDismissedConflictCount] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem('dismissedConflictCount');
      return saved ? parseInt(saved, 10) : null;
    } catch {
      return null;
    }
  });

  React.useEffect(() => {
    // חכה שהקטגוריות יטענו לפחות פעם אחת
    if (!analysis || !categoriesLoadedOnce) return;
    
    // אם הדיאלוג כבר הוצג בסשן הזה - לא מציגים שוב (למנוע הצגה אחרי מחיקת קטגוריה)
    if (initialPromptShown) return;
    
    // אם auto-merge כבר רץ — לא לרוץ שוב (כדי למנוע לולאה מ-setAnalysis/setCategoryAliases)
    if (autoMergeRunRef.current) return;
    
    // 🆕 חכה שה-Tour יסתיים/ידולג לפני הצגת דיאלוג קטגוריות/קונפליקטים
    // אם יש Tour בהמתנה (לפני או במהלך התצוגה) - לא להציג דיאלוג נוסף במקביל
    if (tourPending) return;
    
    // מצא קטגוריות מהאקסל שלא קיימות ב-categoriesList וגם לא ב-categoryAliases (כבר מופו)
    const excelCats = Array.from(new Set(analysis.details.map(d => d.category).filter(Boolean)));
    const missingCats = excelCats.filter(catName => 
      !!catName && 
      !categoriesList.find(c => c.name === catName) &&
      !categoryAliases[catName] // לא להציג קטגוריות שכבר מופו
    ) as string[];
    
    // בדוק גם קונפליקטים בין בתי עסק (גם אם אין קטגוריות חדשות)
    let conflictCount = detectMerchantConflicts(analysis.details, categoryRules);
    
    // אם אין קטגוריות חדשות ואין קונפליקטים - אין צורך בדיאלוג
    if (missingCats.length === 0 && conflictCount === 0) return;
    
    // אם יש רק קונפליקטים (ללא קטגוריות חדשות) והמשתמש כבר דילג עליהם - אל תציג שוב
    // (אלא אם מספר הקונפליקטים השתנה, מה שמעיד על שינוי בנתונים)
    if (missingCats.length === 0 && conflictCount > 0 && dismissedConflictCount === conflictCount) {
      return;
    }
    
    // הפרד בין קטגוריות עם דיפולט לאלו בלי
    const catsWithDefaults: string[] = [];
    const catsWithoutDefaults: string[] = [];
    
    for (const cat of missingCats) {
      if (getCategoryDefaults(cat)) {
        catsWithDefaults.push(cat);
      } else {
        catsWithoutDefaults.push(cat);
      }
    }
    
    // --- שלב א: איחוד אוטומטי של קטגוריות מאותה קבוצה (תמיד, גם כשיש קונפליקטים) ---
    const getGroupKeyForCat = (catName: string): string | null => {
      const lower = catName.toLowerCase();
      let chosen: string | null = null;
      for (const key of Object.keys(KNOWN_CATEGORY_DEFAULTS)) {
        if (lower.includes(key)) {
          if (!chosen || key.length > chosen.length) chosen = key;
        }
      }
      return chosen;
    };
    
    const autoMergedAliases: Record<string, string> = {}; // חדשה → קיימת
    
    // מצא קטגוריות חדשות (עם דיפולט) שיש להן קיימת באותה קבוצה → alias
    for (const cat of catsWithDefaults) {
      const groupKey = getGroupKeyForCat(cat);
      if (!groupKey) continue;
      // חפש קטגוריה קיימת באותה קבוצה
      const existingInGroup = categoriesList.find(existing => {
        const existingKey = getGroupKeyForCat(existing.name);
        return existingKey === groupKey && existing.name !== cat;
      });
      if (existingInGroup) {
        autoMergedAliases[cat] = existingInGroup.name;
      }
    }
    
    // גם בין הקטגוריות החדשות בלבד — אם יש 2+ באותה קבוצה, אחד אותן
    const remainingNew = catsWithDefaults.filter(c => !autoMergedAliases[c]);
    const groupedNew = new Map<string, string[]>();
    for (const cat of remainingNew) {
      const groupKey = getGroupKeyForCat(cat);
      if (!groupKey) continue;
      if (!groupedNew.has(groupKey)) groupedNew.set(groupKey, []);
      groupedNew.get(groupKey)!.push(cat);
    }
    for (const [, members] of groupedNew.entries()) {
      if (members.length < 2) continue;
      const target = members.reduce((a, b) => {
        const countA = analysis.details.filter(d => d.category === a).length;
        const countB = analysis.details.filter(d => d.category === b).length;
        return countA >= countB ? a : b;
      });
      for (const m of members) {
        if (m !== target) {
          autoMergedAliases[m] = target;
        }
      }
    }
    
    // שמור aliases ועדכן עסקאות
    if (Object.keys(autoMergedAliases).length > 0) {
      autoMergeRunRef.current = true; // מנע הרצה חוזרת כש-setAnalysis/setCategoryAliases מעדכנים
      const newAliases = { ...categoryAliases, ...autoMergedAliases };
      setCategoryAliases(newAliases);
      if (dirHandle) {
        saveAliasesToDir(dirHandle, newAliases, 'category');
      }
      setAnalysis(a => a ? ({
        ...a,
        details: a.details.map(d => {
          if (d.category && autoMergedAliases[d.category]) {
            return { ...d, category: autoMergedAliases[d.category] };
          }
          return d;
        })
      }) : a);
      
      // סנן קטגוריות שאוחדו מ-missingCats
      const mergedAwayNames = new Set(Object.keys(autoMergedAliases));
      const filteredMissing = missingCats.filter(c => !mergedAwayNames.has(c));
      missingCats.length = 0;
      missingCats.push(...filteredMissing);
      
      // הסר מ-catsWithDefaults את אלו שאוחדו
      const newCatsWithDefaults = catsWithDefaults.filter(c => !mergedAwayNames.has(c));
      catsWithDefaults.length = 0;
      catsWithDefaults.push(...newCatsWithDefaults);
      
      // חשב מחדש קונפליקטים אחרי האיחוד
      const mergedDetails = analysis.details.map(d => {
        if (d.category && autoMergedAliases[d.category]) {
          return { ...d, category: autoMergedAliases[d.category] };
        }
        return d;
      });
      conflictCount = detectMerchantConflicts(mergedDetails, categoryRules);
    }
    
    // אם אחרי האיחוד אין קטגוריות חדשות ואין קונפליקטים — אין מה להציג
    if (missingCats.length === 0 && conflictCount === 0) return;
    
    // --- שלב ב: אישור אוטומטי של קטגוריות עם דיפולט (תמיד, לא תלוי בקונפליקטים) ---
    // קונפליקטים הם בין בתי עסק, לא בין קיומן של קטגוריות — לכן אפשר לאשר קטגוריות במקביל
    if (catsWithDefaults.length > 0) {
      const autoApprovedMapping: Record<string, CategoryDef> = {};
      for (const cat of catsWithDefaults) {
        const defaults = getCategoryDefaults(cat)!;
        autoApprovedMapping[cat] = {
          name: cat,
          icon: defaults.icon,
          color: defaults.color,
        };
      }
      
      const newCatsToAdd = Object.values(autoApprovedMapping).filter(
        catDef => !categoriesList.find(c => c.name === catDef.name)
      );
      
      if (newCatsToAdd.length > 0) {
        const merged = [...categoriesList, ...newCatsToAdd];
        setCategoriesList(merged);
        if (dirHandle) {
          saveCategoriesToDir(dirHandle, merged);
        }
      }
      
      // סנן קטגוריות שאושרו מ-missingCats — הן כבר לא "חסרות"
      const approvedNames = new Set(catsWithDefaults);
      const stillMissing = missingCats.filter(c => !approvedNames.has(c));
      missingCats.length = 0;
      missingCats.push(...stillMissing);
    }
    
    // אחרי אישור אוטומטי — אם אין קטגוריות חדשות ואין קונפליקטים — אין מה להציג
    if (missingCats.length === 0 && conflictCount === 0) return;
    
    // הצג דיאלוג אם יש קטגוריות חדשות (ללא דיפולט) או קונפליקטים
    // קטגוריות עם דיפולט כבר אושרו אוטומטית למעלה
    const hasNewCats = missingCats.length > 0; // רק קטגוריות שלא אושרו אוטומטית (ללא דיפולט)
    const shouldShowDialog = hasNewCats || conflictCount > 0;
    
    if (shouldShowDialog) {
      // סמן שהדיאלוג הוצג בסשן הזה
      setInitialPromptShown(true);
      
      // missingCats בשלב הזה מכילות רק קטגוריות ללא דיפולט (אלו עם דיפולט כבר אושרו)
      // אם אין קטגוריות חדשות אבל יש קונפליקטים — העבר את כל הקטגוריות מהאקסל (לזיהוי קונפליקטים)
      // סנן קטגוריות שאוחדו אוטומטית — הן כבר לא רלוונטיות
      // categoryAliases עדיין לא מעודכן (state ישתנה ברנדר הבא), לכן בדוק גם autoMergedAliases
      const filteredExcelCats = excelCats.filter(c => c && !categoryAliases[c] && !autoMergedAliases[c]) as string[];
      const namesToPass = missingCats.length > 0 ? missingCats : filteredExcelCats;
      setNewCategoriesPrompt({
        names: namesToPass,
        // טיפול בקונפליקטים שנפתרו - יצירת כללי קטגוריה שישמרו את הבחירות
        onConflictsResolved: async (resolved: Record<string, string>) => {
          if (!dirHandle || Object.keys(resolved).length === 0) return;
          
          // לכל קונפליקט שנפתר, צור כלל קטגוריה שמגדיר את בית העסק לקטגוריה שנבחרה
          // שם בית העסק מופק מתיאור מנוקה (מקפים/כוכביות/קווים הוחלפו ברווחים),
          // לכן יוצרים regex גמיש שמתאים גם לתיאור המקורי (עם מקפים וכו')
          const rules = await loadCategoryRules(dirHandle);
          let rulesChanged = false;
          
          for (const [merchantName, targetCategory] of Object.entries(resolved)) {
            // שמור את שם הסוחר המנוקה כ-descriptionContains (קריא ופשוט)
            const cleanName = merchantName.trim().toLowerCase();
            
            const exists = rules.some(r => r.conditions.descriptionContains === cleanName && r.category === targetCategory);
            if (!exists) {
              rules.push(createRule({ category: targetCategory, conditions: { descriptionContains: cleanName } }));
              rulesChanged = true;
            }
          }
          
          if (rulesChanged) {
            await saveCategoryRules(dirHandle, rules);
          }
          
          // עדכן את ה-state של הכללים
          setCategoryRules([...rules]);
          
          // עדכן את analysis כדי שהקונפליקטים ייעלמו מייד (בלי לחכות לטעינה מחדש)
          setAnalysis(a => a ? ({
            ...a,
            details: applyCategoryRules(a.details, rules)
          }) : a);
          
          // שמור dismissedConflictCount גם ב-confirm (לא רק ב-cancel) כרשת ביטחון
          try {
            localStorage.setItem('dismissedConflictCount', '0');
            setDismissedConflictCount(0);
          } catch { /* ignore */ }
          
        },
        onConfirm: async (mapping: Record<string, CategoryDef>) => {
          // דלג אם ה-mapping ריק (קריאה אוטומטית מ-hasNothingToShow)
          if (Object.keys(mapping).length === 0) {
            setNewCategoriesPrompt(null);
            return;
          }
          // חשוב: להשתמש ב-ref ולא ב-closure כי categoriesList ו-categoryAliases יכולים להיות לא מעודכנים
          const merged = [...categoriesListRef.current];
          const newAliases = { ...categoryAliasesRef.current };
          
          Object.entries(mapping).forEach(([excelName, catDef]) => {
            // אם שם הקטגוריה שונה משם המקור - זה מיפוי/איחוד
            if (excelName !== catDef.name) {
              newAliases[excelName] = catDef.name;
            }
            // הוסף את הקטגוריה לרשימה אם לא קיימת
            if (!merged.find(c => c.name === catDef.name)) {
              merged.push({
                name: catDef.name,
                icon: catDef.icon,
                color: catDef.color,
              });
            }
          });
          
          setCategoriesList(merged);
          setCategoryAliases(newAliases);
          
          if (dirHandle) {
            await saveCategoriesToDir(dirHandle, merged);
            // שמור את המיפויים כדי שלא יציע שוב בפעם הבאה
            if (Object.keys(newAliases).length > 0) {
              await saveAliasesToDir(dirHandle, newAliases, 'category');
            }
          }
          
          setAnalysis(a => a ? ({
            ...a,
            details: a.details.map(d => {
              if (d.category && mapping[d.category]) {
                return { ...d, category: mapping[d.category].name };
              }
              return d;
            })
          }) : a);
          
          // --- Analytics: שלח רק מיפויים חדשים/ידניים ל-Firebase (לא auto_matched) ---
          const newMappings = Object.entries(mapping).map(([excelName, catDef]) => {
            const wasExisting = categoriesListRef.current.find(c => c.name === catDef.name);
            const isSameName = excelName === catDef.name;
            
            let mappingType: 'manual_mapping' | 'auto_matched' | 'new_category';
            if (!wasExisting) {
              mappingType = 'new_category'; // קטגוריה חדשה שנוספה
            } else if (isSameName) {
              mappingType = 'auto_matched'; // זוהה אוטומטית
            } else {
              mappingType = 'manual_mapping'; // מיפוי ידני
            }
            
            return { excelName, catDef, mappingType };
          });
          
          // סנן: שלח ל-Firebase רק קטגוריות חדשות ומיפויים ידניים — לא auto_matched
          const analyticsRelevantMappings = newMappings.filter(m => m.mappingType !== 'auto_matched');
          
          if (analyticsRelevantMappings.length > 0 && (userProfile?.analyticsConsent === true || termsAccepted)) {
            try {
              // אם אין sessionId, צור אחד חדש
              let sessionIdToUse = analyticsSessionId;
              if (!sessionIdToUse) {
                sessionIdToUse = crypto.randomUUID();
                setAnalyticsSessionId(sessionIdToUse);
              }
              
              // וודא שיש profile - אם אין, טען מהתיקיה
              let profileToUse = userProfile;
              if (!profileToUse && dirHandle) {
                const { profile: loadedProfile } = await getOrCreateUserProfile(dirHandle);
                profileToUse = loadedProfile;
                setUserProfile(loadedProfile);
              }
              
              // בנה את רשימת המיפויים עם תיאורי עסקאות
              const categoryMappings: CategoryMapping[] = analyticsRelevantMappings.map(({ excelName, catDef, mappingType }) => {
                // מצא את העסקאות עם הקטגוריה הזו
                const transactionsWithCategory = analysis?.details.filter(d => d.category === excelName) || [];
                // קבץ תיאורים וספור
                const descCounts = new Map<string, number>();
                for (const t of transactionsWithCategory) {
                  const desc = t.description || '';
                  if (desc) {
                    descCounts.set(desc, (descCounts.get(desc) || 0) + 1);
                  }
                }
                // TOP 10 תיאורים
                const topDescriptions = Array.from(descCounts.entries())
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 10)
                  .map(([desc]) => desc);
                
                return {
                  excelCategory: excelName,
                  selectedCategory: catDef.name,
                  count: transactionsWithCategory.length,
                  descriptions: topDescriptions,
                  mappingType
                };
              });
              
              await trackCategoryAssigned(profileToUse, {
                sessionId: sessionIdToUse,
                mappings: categoryMappings
              });
            } catch {
              // Analytics error - silent fail
            }
          }
          
          setNewCategoriesPrompt(null);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, categoriesList, categoriesLoadedOnce, dirHandle, categoryRules, categoryAliases, detectMerchantConflicts, dismissedConflictCount, tourPending]);

  // טען קטגוריות מהתיקיה שנבחרה בכל פעם ש-dirHandle משתנה
  React.useEffect(() => {
    if (!dirHandle) return;
    (async () => {
      setCategoriesLoading(true);
      const loaded = await loadCategoriesFromDir(dirHandle);
      if (loaded) setCategoriesList(loaded);
      setCategoriesLoading(false);
    })();
  }, [dirHandle]);

  // טען את כללי alias מהתיקיה בכל פעם ש-dirHandle משתנה
  React.useEffect(() => {
    if (!dirHandle) return;
    (async () => {
      const loaded = await loadAliasesFromDir(dirHandle, 'category');
      if (loaded) setCategoryAliases(loaded);
    })();
  }, [dirHandle]);

  // חישוב מיפוי קטגוריה -> כמות עסקאות (לכל הקטגוריות בכל העסקאות)
  const categoriesCount: Record<string, number> = React.useMemo(() => {
    const map: Record<string, number> = {};
    if (analysis && analysis.details) {
      analysis.details.forEach(d => {
        if (d.category) map[d.category] = (map[d.category] || 0) + 1;
      });
    }
    return map;
  }, [analysis]);


  // עדכון ושמירה של כללי alias
  const handleCategoryAliasesChange = (newAliases: Record<string, string>) => {
    setCategoryAliases(newAliases);
    if (dirHandle) saveAliasesToDir(dirHandle, newAliases, 'category');
    setAnalysis(a => {
      if (!a) return a;
      // שמור קטגוריה מקורית לכל עסקה (אם לא נשמרה כבר)
      a.details.forEach(d => {
        if (!originalCategoriesRef.current.has(d.id) && d.category) {
          originalCategoriesRef.current.set(d.id, d.category);
        }
      });
      // עדכן קטגוריה לפי המיפוי החדש
      const updatedDetails = a.details.map(d => {
        const origCat = originalCategoriesRef.current.get(d.id) ?? d.category ?? '';
        // אם יש alias חדש, השתמש בו
        if (origCat && newAliases[origCat]) {
          return { ...d, category: newAliases[origCat] };
        }
        // אם ה־alias הוסר, החזר לקטגוריה המקורית
        if (d.category !== origCat) {
          return { ...d, category: origCat };
        }
        return d;
      });
      return { ...a, details: updatedDetails };
    });
  };

  // מאזין חדש לאירוע setDescriptionAlias: יוצר חוק חדש ב-categoryRules
  React.useEffect(() => {
    function handleSetDescriptionAlias(e: Event) {
      const customEvent = e as CustomEvent<{ description: string; category: string }>;
      if (!customEvent?.detail?.description || !customEvent?.detail?.category || !dirHandle) return;
      (async () => {
        // בדוק אם כבר קיים חוק לתיאור הזה
        const existingRuleIndex = categoryRules.findIndex(
          r => r.conditions.descriptionEquals === customEvent.detail.description
        );
        
        let updatedRules: CategoryRule[];
        if (existingRuleIndex >= 0) {
          // עדכן חוק קיים
          updatedRules = categoryRules.map((r, i) => 
            i === existingRuleIndex 
              ? { ...r, category: customEvent.detail.category }
              : r
          );
        } else {
          // צור חוק חדש
          const newRule: CategoryRule = {
            id: crypto.randomUUID(),
            category: customEvent.detail.category,
            active: true,
            createdAt: new Date().toISOString(),
            source: 'user',
            conditions: {
              descriptionEquals: customEvent.detail.description
            }
          };
          updatedRules = [...categoryRules, newRule];
        }
        
        await saveCategoryRules(dirHandle, updatedRules);
        setCategoryRules(updatedRules);
      })();
    }
    window.addEventListener('setDescriptionAlias', handleSetDescriptionAlias);
    return () => window.removeEventListener('setDescriptionAlias', handleSetDescriptionAlias);
  }, [categoryRules, dirHandle]);

  // עדכון כל העסקאות עם תיאור מסוים לקטגוריה חדשה לפי mapping
  // function applyDescToCategory(details: CreditDetail[], mapping: Record<string, string>): CreditDetail[] {
  //   return details.map(d =>
  //     mapping[d.description] ? { ...d, category: mapping[d.description] } : d
  //   );
  // }

  // עדכון סטייט העסקאות כאשר categoryRules משתנה - השתמש ב-applyCategoryRules המלא
  // (הוסר useEffect ישן שהשתמש ב-applyDescToCategory והתעלם מכללי סכום)
  React.useEffect(() => {
    if (!analysis || !categoryRules.length) return;
    setAnalysis(a => a ? { ...a, details: applyCategoryRules(a.details, categoryRules) } : a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryRules]);

  const originalCategoriesRef = React.useRef<Map<string, string>>(new Map());

  // Calculate transactionsByCategory once, outside JSX
  const transactionsByCategory: Record<string, CreditDetail[]> = React.useMemo(() => {
    const map: Record<string, CreditDetail[]> = {};
    if (analysis && analysis.details) {
      analysis.details.forEach(d => {
        if (!d.category) return;
        if (!map[d.category]) map[d.category] = [];
        map[d.category].push(d);
      });
    }
    return map;
  }, [analysis]);

  // סימון עסק או קטגוריה כהכנסה (מתוך טבלת העסקאות)
  const handleMarkAsIncomeSource = async (description: string, sourceType: 'business' | 'category' = 'business') => {
    if (!dirHandle) return;
    
    // בדוק אם כבר קיים כלל
    const existingRule = incomeSourceRules.find(r => 
      r.description === description && 
      (r.sourceType === sourceType || (!r.sourceType && sourceType === 'business'))
    );
    
    if (existingRule && existingRule.isIncomeSource) {
      // כבר מסומן כהכנסה
      return;
    }
    
    // אם יש כלל קיים (שלילי), נמחק אותו קודם
    if (existingRule) {
      await removeIncomeSourceRule(dirHandle, existingRule.id);
    }
    
    // צור כלל חדש
    let newRule: IncomeSourceRule;
    if (sourceType === 'category') {
      newRule = await addCategoryIncomeSourceRule(dirHandle, description);
    } else {
      newRule = await addIncomeSourceRule(dirHandle, description);
    }
    
    const updatedRules = [...incomeSourceRules.filter(r => r.id !== existingRule?.id), newRule];
    setIncomeSourceRules(updatedRules);
    
    // החל מחדש על העסקאות
    if (analysis) {
      const updatedDetails = applyIncomeSourceRules(analysis.details, updatedRules);
      setAnalysis({ ...analysis, details: updatedDetails });
    }
  };

  // סימון עסק או קטגוריה כ-"לא הכנסה" (מתוך טבלת העסקאות)
  // זה יגרום לעסקה להיספר כהוצאה ולא כהכנסה או ביטול הוצאה
  const handleMarkAsNotIncomeSource = async (description: string, sourceType: 'business' | 'category' = 'business') => {
    if (!dirHandle) return;
    
    // מצא ומחק כלל קיים אם יש (כלל חיובי או שלילי)
    const existingRule = incomeSourceRules.find(r => 
      r.description === description && 
      (r.sourceType === sourceType || (!r.sourceType && sourceType === 'business'))
    );
    
    if (existingRule) {
      await removeIncomeSourceRule(dirHandle, existingRule.id);
    }
    
    // צור כלל שלילי חדש - סימון שזה לא מקור הכנסה
    await markAsNotIncomeSource(dirHandle, description, sourceType);
    
    // טען מחדש את הכללים
    const updatedRules = await loadIncomeSourceRules(dirHandle);
    setIncomeSourceRules(updatedRules);
    
    // החל מחדש על העסקאות
    if (analysis) {
      const updatedDetails = applyIncomeSourceRules(analysis.details, updatedRules);
      setAnalysis({ ...analysis, details: updatedDetails });
    }
  };

  // סימון עסקה בודדת כהכנסה או הוצאה (override ברמת עסקה)
  const handleMarkTransactionAsIncomeSource = async (transactionId: string, isIncome: boolean) => {
    if (!dirHandle || !analysis) return;
    
    // מצא את העסקה
    const tx = analysis.details.find(d => d.id === transactionId);
    if (!tx) return;
    
    // בדוק אם כבר יש כלל לעסקה זו
    const existingRule = incomeSourceRules.find(r => 
      r.sourceType === 'transaction' && r.transactionId === transactionId
    );
    
    if (existingRule) {
      await removeIncomeSourceRule(dirHandle, existingRule.id);
    }
    
    // צור כלל חדש לעסקה בודדת
    const newRule: IncomeSourceRule = {
      id: `tx-${transactionId}-${Date.now()}`,
      sourceType: 'transaction',
      description: tx.description || '',
      transactionId,
      matchType: 'equals',
      isIncomeSource: isIncome,
      autoDetected: false,
      confirmedByUser: true,
      createdAt: new Date().toISOString()
    };
    
    // שמור את הכלל
    const updatedRules = [...incomeSourceRules.filter(r => r.id !== existingRule?.id), newRule];
    await saveIncomeSourceRules(dirHandle, updatedRules);
    setIncomeSourceRules(updatedRules);
    
    // החל מחדש את כל הכללים על העסקאות - כולל הכלל החדש
    // זה יעדכן את transactionNature במקום direction
    const updatedDetails = applyIncomeSourceRules(analysis.details, updatedRules);
    setAnalysis({ ...analysis, details: updatedDetails });
  };

  // --- פונקציית ניווט לעסקה ספציפית (מחיפוש גלובלי) ---
  const handleNavigateToTransaction = useCallback((tx: CreditDetail, monthKey: string) => {
    // עבור לתצוגה חודשית
    setView('monthly');
    // עבור לחודש הרלוונטי
    setSelectedMonth(monthKey);
    // סמן את העסקה להדגשה
    setHighlightedTransactionId(tx.id);
    // הסר את ההדגשה אחרי כמה שניות
    setTimeout(() => {
      setHighlightedTransactionId(null);
    }, 3000);
  }, []);

  // --- מעקב על global errors (unhandled rejections וbrower runtime errors) ---
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      trackConsoleError(userProfile, {
        errorType: 'global_error',
        errorName: event.error?.name || 'UnknownError',
        errorMessage: event.error?.message || event.message || 'Unknown error',
        isRecoverable: true,
        timestamp: Date.now(),
      }).catch(() => {}); // שקט על שגיאות analytics
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      const message = error?.message || String(error) || 'Unhandled Promise rejection';
      
      trackConsoleError(userProfile, {
        errorType: 'global_error',
        errorName: error?.name || 'PromiseRejection',
        errorMessage: message,
        isRecoverable: true,
        timestamp: Date.now(),
      }).catch(() => {}); // שקט על שגיאות analytics
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [userProfile]);

  return (
    <ErrorBoundary userProfile={userProfile}>
      <div className={`app-container${!analysis ? ' app-container--onboarding' : ''}`}>
      {/* Onboarding screen: show until analysis is ready */}
      {!analysis && (
        <OnboardingScreen
          termsAccepted={termsAccepted}
          onTermsChange={handleTermsChange}
          onShowTermsModal={() => setShowTermsModal(true)}
          onPickDirectory={handlePickDirectory}
          loadingState={loadingState}
          error={error}
        />
      )}
      {error && (
        <div className="error-msg">{error}</div>
      )}
      {analysis && (
        <>
          <MainView
            analysis={analysis}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            months={months}
            sortedMonths={sortedMonths}
            currentMonthIdx={currentMonthIdx}
            // prevMonth={prevMonth}
            // nextMonth={nextMonth}
            // prevMonthTotal={prevMonthTotal}
            // nextMonthTotal={nextMonthTotal}
            diff={diff}
            percent={percent}
            filteredDetails={filteredDetails}
            filteredTotal={filteredTotal}
            view={view}
            setView={setViewWithTracking}
            monthTotals={monthTotals}
            yearlySummary={yearlySummary}
            handleOpenEditCategory={handleOpenEditCategory}
            handleBulkEditCategory={handleBulkEditCategory}
            categoriesList={categoriesList}
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            // onAddCategory={(cat) => {
            //   setCategoriesList(prev => {
            //     const updated = [...prev, cat];
            //     if (dirHandle) saveCategoriesToDir(dirHandle, updated);
            //     return updated;
            //   });
            // }}
            displayMode={displayMode}
            setDisplayMode={setDisplayMode}
            dateMode={dateMode}
            setDateMode={setDateModeWithTracking}
            selectedFolder={selectedFolder}
            onPickDirectory={handlePickDirectory}
            onRefreshDirectory={handleRefreshDirectory}
            dirHandle={dirHandle ?? undefined}
            onOpenAdvancedSettings={() => {
              setSettingsOpen(true);
              trackFeature('open_settings');
            }}
            incomeSourceRules={incomeSourceRules}
            onMarkAsIncomeSource={handleMarkAsIncomeSource}
            onMarkAsNotIncomeSource={handleMarkAsNotIncomeSource}
            onMarkTransactionAsIncomeSource={handleMarkTransactionAsIncomeSource}
            onTrackFeature={trackFeature}
            onNavigateToTransaction={handleNavigateToTransaction}
            highlightedTransactionId={highlightedTransactionId}
            onApplyBulkCategoryChange={handleApplyBulkCategoryChange}
            onUpdateRule={handleUpdateRuleFromGlobalSearch}
            onAddCategory={upsertCategory}
            externalRuleToEdit={ruleToEditFromSettings}
            onClearExternalRuleToEdit={() => setRuleToEditFromSettings(null)}
            unmatchedCreditCharges={unmatchedCreditCharges}
            unmatchedBankStatements={unmatchedBankStatements}
            duplicateFilesInfo={duplicateFilesInfo}
          />
        </>
      )}
      {/* Feedback Popup — מופיע אוטומטית לפי לוגיקת תזמון, רק כשאין דיאלוג אחר פתוח */}
      {feedbackPopup.showPopup && userProfile && !isFeedbackBlockingDialogOpen && (
        <FeedbackPopup
          profile={userProfile}
          onSubmit={(data) => {
            feedbackPopup.handleSubmit(data);
            // עדכן את ה-profile המקומי כדי שלא יופיע שוב באותו session
            setUserProfile(prev => prev ? {
              ...prev,
              feedback: {
                lastSubmittedAt: new Date().toISOString(),
                lastDismissedAt: prev.feedback?.lastDismissedAt ?? null,
                dismissCount: 0,
                totalSubmissions: (prev.feedback?.totalSubmissions ?? 0) + 1,
              }
            } : prev);
          }}
          onDismiss={feedbackPopup.handleDismiss}
        />
      )}
      <EditCategoryDialog
        open={!!editDialog?.open}
        editDialog={editDialog}
        categoriesList={categoriesList}
        setEditDialog={setEditDialog}
        handleApplyCategoryChange={handleApplyCategoryChange}
        onAddCategory={upsertCategory}
      />
      {newCategoriesPrompt && (
        <NewCategoriesTablePrompt
          names={newCategoriesPrompt.names}
          categoriesList={categoriesList}
          onConfirm={newCategoriesPrompt.onConfirm}
          onConflictsResolved={newCategoriesPrompt.onConflictsResolved}
          onCancel={() => {
            // שמור את מספר הקונפליקטים הנוכחי כדי לא להציג שוב את אותם קונפליקטים
            if (analysis) {
              const conflictCount = detectMerchantConflicts(analysis.details, categoryRules);
              if (conflictCount > 0) {
                setDismissedConflictCount(conflictCount);
                try {
                  localStorage.setItem('dismissedConflictCount', String(conflictCount));
                } catch { /* ignore */ }
              }
            }
            setNewCategoriesPrompt(null);
          }}
          allDetails={analysis?.details || []}
          categoryRules={categoryRules}
        />
      )}
      {settingsOpen && dirHandle && (
        <SettingsMenu
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          dirHandle={dirHandle}
          categoryRules={categoryRules}
          categoriesList={categoriesList}
          onUpdateRule={handleUpdateRule}
          onDeleteRule={handleDeleteRule}
          onAddCategory={upsertCategory}
          onCategoriesChange={(cats) => {
            setCategoriesList(cats);
            if (dirHandle) saveCategoriesToDir(dirHandle, cats);
          }}
          categoriesCount={categoriesCount}
          transactionsByCategory={transactionsByCategory}
          categoryAliases={categoryAliases}
          onAliasesChange={handleCategoryAliasesChange}
          onEditRule={(rule) => {
            setRuleToEditFromSettings(rule);
            setSettingsOpen(false);
          }}
          onToggleRule={handleToggleRule}
        />
      )}
      {/* Terms Modal */}
      <TermsModal 
        isOpen={showTermsModal} 
        onClose={() => setShowTermsModal(false)} 
      />
      {/* Onboarding Tour למשתמש חדש */}
      <OnboardingTour
        isOpen={showTour}
        onComplete={handleTourComplete}
        onSkip={handleTourSkip}
      />
      {/* App-level toast notification */}
      {appToast && (
        <div className="app-toast">
          <span className="app-toast-message">{appToast.message}</span>
          <div className="app-toast-actions">
            {appToast.undoAction && (
              <button
                className="app-toast-undo"
                onClick={() => { appToast.undoAction?.(); dismissAppToast(); }}
              >
                ביטול
              </button>
            )}
            <button className="app-toast-close" onClick={dismissAppToast} aria-label="סגור">✕</button>
          </div>
        </div>
      )}
      <Footer />
    </div>
    </ErrorBoundary>
  );
}

export default App;
