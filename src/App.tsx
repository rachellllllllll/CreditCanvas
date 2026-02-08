import React, { useState, useEffect, useCallback } from 'react';
import { readXLSX, sheetToArray } from './utils/xlsxMinimal';
import { ensureSheetType } from './utils/sheetType';
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
import TransactionsChat from './components/TransactionsChat';
import TermsModal from './components/TermsModal';
import OnboardingTour from './components/OnboardingTour';
import OnboardingScreen from './components/OnboardingScreen';
import {
  type UserProfile,
  type UnknownCategoryInfo,
  type CategoryMapping,
  getOrCreateUserProfile,
  trackSessionStart,
  trackFilesLoaded,
  trackCategoryAssigned,
  trackFeatureUsage,
  trackFileError,
  markConsentAsked,
  updateLastActivity,
  saveSessionDurationForLater
} from './utils/analytics';
import { signedAmount } from './utils/money';
import { processCreditChargeMatching } from './utils/creditChargePatterns';
import { loadCategoryRules, applyCategoryRules, addDescriptionEqualsRule, addDescriptionContainsRule, addTransactionCategoryRule, addRuleWithAmountRange, addAdvancedRule, updateCategoryRule, saveCategoryRules } from './utils/categoryRules';
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
    const row = json[i].map((cell) => (cell != null ? String(cell) : '').trim());
    // Support Poalim format: header with '\r\n' or '\n' in header names
    // const normalizedRow = row.map((c: string) => c.replace(/"/g, '').replace(/\r?\n/g, '').trim());
    // --- extract charge date and card last 4 from header lines if present ---
    if (!chargeDateFromHeader) {
      const match = row.join(' ').match(/עסקאות לחיוב ב-(\d{2}\/\d{2}\/\d{4})/);
      if (match) chargeDateFromHeader = match[1];
    }
    if (!cardLast4FromHeader) {
      const match = row.join(' ').match(/המסתיים ב-(\d{4})/);
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
  const normalizedHeaders = headers.map(h => h.replace(/"/g, '').replace(/\r?\n/g, '').trim());
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
    const chargeAmountRaw = rowObj['סכום חיוב'] || rowObj['סכוםחיוב'] || '';
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
    let chargeDate = rowObj['תאריך חיוב'] || chargeDateFromHeader || '';
    const cardLast4 = rowObj['4 ספרות אחרונות של כרטיס האשראי'] || rowObj['4 ספרות אחרונות'] || cardLast4FromHeader || '';
    
    // --- זיהוי עסקאות בחיוב מיידי (משיכת מזומן וכד') ---
    const transactionType = rowObj['סוג עסקה'] || rowObj['סוגעסקה'] || '';
    if (transactionType.includes('משיכת מזומן') || transactionType.includes('חיוב מיידי')) {
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
    if (/^\d{1,5}$/.test(date)) {
      // Excel serial date
      const excelEpoch = new Date(1899, 11, 30);
      const serial = parseInt(date, 10);
      if (!isNaN(serial)) {
        const d = new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
        // Format as dd/m/yy
        date = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear().toString().slice(-2)}`;
      }
    } else {
      date = date.replace(/\./g, '/').replace(/-/g, '/');
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
      if (/^\d{1,5}$/.test(chargeDate)) {
        const excelEpoch = new Date(1899, 11, 30);
        const serial = parseInt(chargeDate, 10);
        //if (!isNaN(serial) && serial > 0 && serial < 60000) {
        if (!isNaN(serial)) {
          const d = new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
          chargeDate = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear().toString().slice(-2)}`;
        }
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
  // מצב לפתיחת חלון הצ'אט
  const [chatOpen, setChatOpen] = useState(false);

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
      
      // נקה את סטטוס הקונפליקטים שנדחו - זו תיקייה חדשה
      setDismissedConflictCount(null);
      setInitialPromptShown(false); // אפס את הדגל כדי להציג את הדיאלוג בתיקייה חדשה
      try {
        localStorage.removeItem('dismissedConflictCount');
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

      // עבור על כל הקבצים שנמצאו
      let fileIndex = 0;
      for (const { handle: fileHandle, relativePath } of excelFileEntries) {
        fileIndex++;
        setLoadingState({ 
          step: 'reading', 
          message: `📄 קורא: ${fileHandle.name}`,
          progress: { current: fileIndex, total: excelFileEntries.length }
        });
        // הוצא את הסיומת מהקובץ
        const fileExtension = fileHandle.name.substring(fileHandle.name.lastIndexOf('.')).toLowerCase();
        let retryCount = 0;
        
        try {
          // קרא את הקובץ עם retry mechanism
          const { arrayBuffer, retryCount: attempts } = await readFileWithRetry(fileHandle);
          retryCount = attempts;
          
          // אם הצלחנו אחרי retry - רשום ללוג
          if (retryCount > 0) {
            console.info(`קובץ ${fileHandle.name} נקרא בהצלחה אחרי ${retryCount + 1} ניסיונות`);
          }
          
          // שמור את קובץ האקסל המקורי בזיכרון (עם נתיב יחסי)
          setExcelFiles((prev: Map<string, ArrayBuffer>) => new Map(prev).set(relativePath, arrayBuffer));
          
          // קרא את הקובץ עם Parser המינימלי
          const workbook = await readXLSX(arrayBuffer);
          
          // עבור על כל הגיליונות
          for (const sheet of workbook.sheets) {
            const sheetData = sheetToArray(sheet);
            
            // זיהוי סוג הגיליון (שימוש בשם הקובץ בלבד לשמירת סוג הגיליון)
            const type = await ensureSheetType(dir, fileHandle.name, sheet.name, sheetData);
            
            // דלג על גליונות ריקים
            if (type === null) {
              continue;
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
      }

      // --- Analytics: טיפול בפרופיל משתמש ---
      // שולחים session_start תמיד (לכל המשתמשים)
      try {
        const { profile, isNewUser } = await getOrCreateUserProfile(dir);
        setUserProfile({ ...profile, _isNewUser: isNewUser } as UserProfile & { _isNewUser: boolean });
        
        // שלח session_start תמיד - לכל המשתמשים (גם מי שסירב)
        await trackSessionStart(profile, isNewUser);
        
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
          
          // קבץ עסקאות לפי קטגוריה לא מזוהה
          const unknownCategoriesMap = new Map<string, { count: number; descriptions: Map<string, number> }>();
          
          for (const d of allDetails) {
            const cat = d.category;
            if (cat && !loadedCategoryNames.has(cat) && !loadedAliasNames.has(cat)) {
              // קטגוריה לא מזוהה
              if (!unknownCategoriesMap.has(cat)) {
                unknownCategoriesMap.set(cat, { count: 0, descriptions: new Map() });
              }
              const entry = unknownCategoriesMap.get(cat)!;
              entry.count++;
              // ספור תיאורים
              const desc = d.description || '';
              if (desc) {
                entry.descriptions.set(desc, (entry.descriptions.get(desc) || 0) + 1);
              }
            }
          }
          
          // המר ל-array עם TOP 10 תיאורים לכל קטגוריה
          const unknownCategories: UnknownCategoryInfo[] = Array.from(unknownCategoriesMap.entries()).map(([excelCategory, data]) => ({
            excelCategory,
            count: data.count,
            descriptions: Array.from(data.descriptions.entries())
              .sort((a, b) => b[1] - a[1]) // מיון לפי כמות יורדת
              .slice(0, 10) // TOP 10
              .map(([desc]) => desc)
          }));
          
          await trackFilesLoaded(profile, {
            fileCount: excelFileEntries.length,
            transactionCount: allDetails.length,
            monthCount: uniqueMonths.length,
            categoryCount: uniqueCategories.size,
            sessionId,
            unknownCategories: unknownCategories.length > 0 ? unknownCategories : undefined
          });
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

  const handleOpenChatWithTracking = useCallback(() => {
    setChatOpen(true);
    trackFeature('use_chat');
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
      await addAdvancedRule(dirHandle, filters, newCategory, includeDatesInRule);
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
        // אם נפתח מחיפוש גלובלי - צור כלל עם כל הפילטרים
        if (isFromGlobalSearch && globalSearchFilters) {
          await addAdvancedRule(dirHandle, globalSearchFilters, newCategory, includeDatesInRule);
        }
        // אם נפתח מחיפוש רגיל - צור כלל regex שמכיל את מילת החיפוש
        else if (isFromSearch && searchTerm) {
          await addDescriptionContainsRule(dirHandle, searchTerm, newCategory);
        } else if (transaction?.description) {
          // שינוי רגיל - כלל על תיאור מדויק
          // בדוק אם יש סינון סכום
          if (amountFilter && (amountFilter.minAmount !== undefined || amountFilter.maxAmount !== undefined)) {
            await addRuleWithAmountRange(
              dirHandle,
              transaction.description,
              newCategory,
              amountFilter.minAmount,
              amountFilter.maxAmount
            );
          } else {
            await addDescriptionEqualsRule(dirHandle, transaction.description, newCategory);
          }
        }
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
  const [newCategoriesPrompt, setNewCategoriesPrompt] = useState<null | { names: string[], onConfirm: (mapping: Record<string, CategoryDef>) => void }>(null);

  const [categoryAliases, setCategoryAliases] = useState<Record<string, string>>({});
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_descriptionAliases, _setDescriptionAliases] = useState<Record<string, string>>({});

  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // State לעריכת כלל מ-SettingsMenu
  const [ruleToEditFromSettings, setRuleToEditFromSettings] = useState<CategoryRule | null>(null);

  // --- Category Rules (unified system) ---
  const [categoryRules, setCategoryRules] = useState<CategoryRule[]>([]);

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
        if (c.descriptionRegex) {
          try {
            const regex = new RegExp(c.descriptionRegex, 'i');
            if (regex.test(tx.description)) return true;
          } catch { /* regex invalid */ }
        }
      }
      return false;
    };
    
    const merchantToCategories = new Map<string, Set<string>>();
    for (const tx of details) {
      if (isTransactionCoveredByRule(tx)) continue;
      const merchant = extractMerchantName(tx.description);
      const category = tx.category || '';
      if (!merchant || merchant.length <= 2 || !category) continue;
      if (!merchantToCategories.has(merchant)) {
        merchantToCategories.set(merchant, new Set());
      }
      merchantToCategories.get(merchant)!.add(category);
    }
    
    let conflictCount = 0;
    for (const [, categories] of merchantToCategories.entries()) {
      if (categories.size > 1) conflictCount++;
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
    const conflictCount = detectMerchantConflicts(analysis.details, categoryRules);
    
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
    
    // אשר אוטומטית קטגוריות עם דיפולט
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
      
      // הוסף לרשימת הקטגוריות - רק אם באמת יש מה להוסיף
      const newCatsToAdd = Object.values(autoApprovedMapping).filter(
        catDef => !categoriesList.find(c => c.name === catDef.name)
      );
      
      if (newCatsToAdd.length > 0) {
        const merged = [...categoriesList, ...newCatsToAdd];
        setCategoriesList(merged);
        if (dirHandle) {
          saveCategoriesToDir(dirHandle, merged);
        }
        console.log(`✅ נוספו אוטומטית ${newCatsToAdd.length} קטגוריות:`, newCatsToAdd.map(c => c.name).join(', '));
      }
    }
    
    // הצג דיאלוג אם יש קטגוריות חדשות (עם או בלי דיפולט) או קונפליקטים
    // העבר את כל הקטגוריות מהאקסל - הדיאלוג יציג רק את הרלוונטיות
    const shouldShowDialog = catsWithoutDefaults.length > 0 || conflictCount > 0;
    
    if (shouldShowDialog) {
      // סמן שהדיאלוג הוצג בסשן הזה
      setInitialPromptShown(true);
      
      // אם יש קטגוריות חדשות - העבר אותן, אחרת העבר את כל הקטגוריות מהאקסל (לזיהוי קונפליקטים)
      const namesToPass = catsWithoutDefaults.length > 0 ? catsWithoutDefaults : excelCats as string[];
      setNewCategoriesPrompt({
        names: namesToPass,
        onConfirm: async (mapping: Record<string, CategoryDef>) => {
          const merged = [...categoriesList];
          const newAliases = { ...categoryAliases };
          
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
          
          // --- Analytics: שלח את המיפויים שהמשתמש בחר ---
          if (userProfile?.analyticsConsent === true || termsAccepted) {
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
              const categoryMappings: CategoryMapping[] = Object.entries(mapping).map(([excelName, catDef]) => {
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
                  descriptions: topDescriptions
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

  return (
    <div className="app-container">
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
          />
          {/* אייקון צ'אט בפינה */}
          <button
            className="chat-fab"
            title="שאל שאלה על העסקאות"
            onClick={handleOpenChatWithTracking}
            style={{
              display: chatOpen ? 'none' : 'flex',
            }}
          >
            💬
          </button>
          {/* חלון צ'אט (modal) - תמיד במונט, מוסתר עם CSS */}
          <div
            className={`chat-modal${chatOpen ? '' : ' chat-modal--hidden'}`}
          >
            <div className="chat-modal-header">
              <span>צ'אט עסקאות</span>
              <button onClick={() => setChatOpen(false)} className="chat-modal-close" title="סגור">✖️</button>
            </div>
            <div className="chat-modal-content">
              <TransactionsChat details={analysis.details} showClearChatButton={true} />
            </div>
          </div>
        </>
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
      <Footer />
    </div>
  );
}

export default App;
