import { useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import Auth from './components/Auth';
import React, { useState } from 'react';
import { readXLSX, sheetToArray, type Workbook, type Sheet } from './utils/xlsxMinimal';
import { ensureSheetType, ensureCsvType, detectSheetTypeFromSheet, detectSheetTypeFromCSV, saveSheetTypeOverridesToDir } from './utils/sheetType';
import { parseBankStatementFromSheet, parseBankStatementFromCSV } from './utils/bankParser';
import type { CreditDetail, AnalysisResult } from './types';
import CategoryManager, { type CategoryDef } from './components/CategoryManager';
import SettingsMenu from './components/SettingsMenu';
import EditCategoryDialog from './components/EditCategoryDialog';
import Footer from './components/Footer';
import './App.css';
import './index.css';
import MainView from './components/MainView';
import NewCategoriesTablePrompt from './components/NewCategoriesTablePrompt';
import CategoryAliasesManager from './components/CategoryAliasesManager';
import TransactionsChat from './components/TransactionsChat';
import { signedAmount } from './utils/money';
import { processCreditChargeMatching } from './utils/creditChargePatterns';
import { loadCategoryRules, applyCategoryRules, addDescriptionEqualsRule } from './utils/categoryRules';
import { loadDirectionOverridesFromDir, applyDirectionOverrides } from './utils/directionOverrides';

// Helpers for categories and aliases persistence + application
async function loadCategoriesFromDir(dirHandle: any): Promise<CategoryDef[] | null> {
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
async function saveCategoriesToDir(dirHandle: any, categories: CategoryDef[]): Promise<void> {
  try {
    const fh = await dirHandle.getFileHandle('categories.json', { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(categories, null, 2));
    await w.close();
  } catch (err: any) {
    if (err.name === 'SecurityError') {
      console.warn('אין רשאות לשמור categories.json');
      return;
    }
    throw err;
  }
}

type AliasType = 'category' | 'description';
async function loadAliasesFromDir(dirHandle: any, type: AliasType): Promise<Record<string, string>> {
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
async function saveAliasesToDir(dirHandle: any, aliases: Record<string, string>, type: AliasType): Promise<void> {
  const fileName = type === 'category' ? 'categories-aliases.json' : 'description-categories.json';
  try {
    const fh = await dirHandle.getFileHandle(fileName, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(aliases, null, 2));
    await w.close();
  } catch (err: any) {
    if (err.name === 'SecurityError') {
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

const parseCreditDetailsFromSheet = async (sheetData: any[][], fileName: string): Promise<CreditDetail[]> => {
  // sheetData הוא כבר מערך דו-ממדי (לא sheet של XLSX)
  const json: any[][] = sheetData;
  // Find the header row index by searching for a row with known column names
  let headerIdx = -1;
  let headers: string[] = [];
  let chargeDateFromHeader = '';
  let cardLast4FromHeader = '';
  for (let i = 0; i < json.length; i++) {
    const row = json[i].map((cell: string) => (cell || '').toString().trim());
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
    let description = rowObj['שם בית העסק'] || rowObj['שם בית עסק'] || rowObj['בית עסק'] || '';
    let amount = rowObj['סכום חיוב'] || rowObj['סכום עסקה'] || rowObj['סכוםחיוב'] || rowObj['סכוםעסקה'] || '';
    let category = rowObj['ענף'] || rowObj['קטגוריה'] || '';
    // --- extract charge date and card last 4 ---
    let chargeDate = rowObj['תאריך חיוב'] || chargeDateFromHeader || '';
    let cardLast4 = rowObj['4 ספרות אחרונות של כרטיס האשראי'] || rowObj['4 ספרות אחרונות'] || cardLast4FromHeader || '';
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
      let direction: 'income' | 'expense' = raw < 0 ? 'income' : 'expense';
      // if (refundLike) direction = 'income';
      const amountAbs = Math.abs(raw);
      details.push({
        id: `${date}-${raw}-${description}`,
        date,
        amount: amountAbs, // ערך מוחלט – הכיוון נשמר בשדה direction
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
    let month = parts[1];
    let year = parts[2];
    if (year.length === 2) year = '20' + year;
    return `${month.padStart(2, '0')}/${year}`;
  }
  return '';
};

const App: React.FC = () => {
  // מצב לפתיחת חלון הצ'אט
  const [chatOpen, setChatOpen] = useState(false);
  // --- מצב חדש: בחירת בסיס תאריך להצגה ---
  const [dateMode, setDateMode] = useState<'transaction' | 'charge'>('transaction');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // selectedMonth unified to string format 'MM/YYYY'
  const formatMonthYear = (date: Date) => `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  const [selectedMonth, setSelectedMonth] = useState<string>(formatMonthYear(new Date()));
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [months, setMonths] = useState<string[]>([]);
  const [view, setView] = useState<'monthly' | 'yearly'>('monthly');
  // Add state to store selected folder path
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  // שמור את קבצי האקסל המקוריים בזיכרון (Map fileName -> ArrayBuffer)
  const [excelFiles, setExcelFiles] = useState<Map<string, ArrayBuffer>>(new Map());
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);


  // File System Access API: Directory handle
  const [dirHandle, setDirHandle] = useState<any>(null);
  // שמור את ה-dirHandle אם נתקלנו בתיקיה עם Excel בלבד
  const [pendingDirHandle, setPendingDirHandle] = useState<any>(null);

  // שמע לשינויים באימות
  useEffect(() => {
    // בדוק session נוכחי
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    // האזן לשינויים
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);

      if (_event === 'SIGNED_IN' && session?.user) {
        await supabase.from('user_logins').insert({
          user_id: session.user.id,
          email: session.user.email
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);



  function parseCSV(text: string): string[][] {
    // Robust CSV parsing: supports quoted fields with commas and CRLF
    const rows: string[][] = [];
    let i = 0;
    const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    while (i < s.length) {
      const row: string[] = [];
      let field = '';
      let inQuotes = false;
      for (; i < s.length; i++) {
        const ch = s[i];
        if (inQuotes) {
          if (ch === '"') {
            if (s[i + 1] === '"') { // escaped quote
              field += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            field += ch;
          }
        } else {
          if (ch === '"') {
            inQuotes = true;
          } else if (ch === ',') {
            row.push(field.trim());
            field = '';
          } else if (ch === '\n') {
            row.push(field.trim());
            field = '';
            i++;
            break;
          } else {
            field += ch;
          }
        }
      }
      // push last field if line ended by EOF
      if (field.length > 0 || (row.length > 0 && s[i - 1] === ',')) {
        row.push(field.trim());
      }
      if (row.length > 0) rows.push(row);
    }
    return rows;
  }

  // פונקציה שממירה שורות CSV ל־CreditDetail[]
  function parseCreditDetailsFromCSV(rows: string[][], fileName: string): CreditDetail[] {
    if (!rows.length) return [];
    // זיהוי דינאמי של שורת הכותרות, בדומה ללוגיקת XLSX
    let headerIdx = -1;
    let headers: string[] = [];
    let chargeDateFromHeader = '';
    let cardLast4FromHeader = '';
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].map((cell: string) => (cell || '').toString().trim());
      // חילוץ תאריך חיוב ומספר 4 ספרות אחרונות מתוך שורות טקסט בכותרת (אם קיימות)
      if (!chargeDateFromHeader) {
        const match = row.join(' ').match(/עסקאות לחיוב ב-(\d{2}\/\d{2}\/\d{4})/);
        if (match) chargeDateFromHeader = match[1];
      }
      if (!cardLast4FromHeader) {
        const match = row.join(' ').match(/המסתיים ב-(\d{4})/);
        if (match) cardLast4FromHeader = match[1];
      }
      // פורמט פועלים: שורה עם "תאריך"+"עסקה" ושדה "שם בית עסק"
      if ((row.some((c: string) => c.includes('תאריך') && c.includes('עסקה')) && row.includes('שם בית עסק'))) {
        headerIdx = i;
        headers = row;
        break;
      }
      // פורמט סטנדרטי: לפחות שלושה עמודות ידועות
      if (
        (row.includes('תאריך עסקה') && row.includes('שם בית העסק') && row.includes('סכום חיוב')) ||
        (row.includes('תאריךעסקה') && row.includes('שם בית עסק') && row.some((c: string) => c.includes('סכום')))
      ) {
        headerIdx = i;
        headers = row;
        break;
      }
    }
    if (headerIdx === -1) {
      // אם לא נמצאה שורת כותרות בצורה חכמה, נניח שהשורה הראשונה היא הכותרת
      headerIdx = 0;
      headers = rows[0].map(h => h.replace(/"/g, '').replace(/\r?\n/g, '').trim());
    }
    const normalizedHeaders = headers.map(h => h.replace(/"/g, '').replace(/\r?\n/g, '').trim());
    const details: CreditDetail[] = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 3) continue;
      const rowObj: Record<string, string> = {};
      normalizedHeaders.forEach((h, idx) => {
        rowObj[h] = (row[idx] || '').toString().trim();
      });
      let date = rowObj['תאריך עסקה'] || rowObj['תאריךעסקה'] || rowObj['תאריך'] || '';
      let description = rowObj['שם בית העסק'] || rowObj['שם בית עסק'] || rowObj['בית עסק'] || '';
      let amount = rowObj['סכום חיוב'] || rowObj['סכום עסקה'] || rowObj['סכוםחיוב'] || rowObj['סכוםעסקה'] || '';
      let category = rowObj['ענף'] || rowObj['קטגוריה'] || '';
      let chargeDate = rowObj['תאריך חיוב'] || rowObj['תאריךחיוב'] || chargeDateFromHeader || '';
      let cardLast4 = rowObj['4 ספרות אחרונות של כרטיס האשראי'] || rowObj['4 ספרות אחרונות'] || cardLast4FromHeader || '';
      // נרמול סכום
      if (amount && amount.includes('₪')) amount = amount.replace('₪', '').trim();
      amount = amount.replace(/[^\d.,-]/g, '').replace(',', '.');
      // נרמול תאריכים (ותמיכה במספר סריאלי אם CSV מכיל מספרים כאלה)
      const normalizeExcelSerialDate = (val: string) => {
        if (/^\d{1,5}$/.test(val)) {
          const excelEpoch = new Date(1899, 11, 30);
          const serial = parseInt(val, 10);
          if (!isNaN(serial)) {
            const d = new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
            return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear().toString().slice(-2)}`;
          }
        }
        return val.replace(/\./g, '/').replace(/-/g, '/');

        /**
         *
         * amount = amount.replace(/[^\d.,-]/g, '').replace(',', '.');
      // נרמול תאריכים - רק בעמודות תאריך בפועל
      const dateColumnIndex = normalizedHeaders.indexOf('תאריך עסקה');
      const chargeDateColumnIndex = normalizedHeaders.indexOf('תאריך חיוב');
      const normalizeExcelSerialDate = (val: string, isDateField: boolean) => {
        if (isDateField && /^\d{1,5}$/.test(val)) {
          const excelEpoch = new Date(1899, 11, 30);
          const serial = parseInt(val, 10);
          // בדוק שהוא בטווח תאריכים סביר (בין 1 ל-60000)
          if (!isNaN(serial) && serial > 0 && serial < 60000) {
            const d = new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
            return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear().toString().slice(-2)}`;
          }
        }
        return val.replace(/\./g, '/').replace(/-/g, '/');
         */
      };
      if (date) date = normalizeExcelSerialDate(date);
      if (chargeDate) chargeDate = normalizeExcelSerialDate(chargeDate);
      if (date && amount && description) {
        const raw = parseFloat(amount);
        if (isNaN(raw)) continue;
        let direction: 'income' | 'expense' = raw < 0 ? 'income' : 'expense';
        const amountAbs = Math.abs(raw);
        details.push({
          id: `${date}-${raw}-${description}`,
          date,
          amount: amountAbs,
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
  }

  // File System Access API: Pick directory and read CSV files
  const handlePickDirectory = async () => {
    try {
      // @ts-ignore
      const dir = await window.showDirectoryPicker();
      await handlePickDirectory_Internal(dir);
    } catch (err) {
      console.error('שגיאה בבחירת תיקיה:', err);
      setError('בחירת התיקיה נכשלה או בוטלה.');
    }
  };

  // פונקציה לנסיון שוב לקרוא את ה-dirHandle שהיה מקודם (אחרי שהמשתמש המיר את הקבצים)
  const handleRetryPendingDirectory = async () => {
    if (!pendingDirHandle) return;
    await handlePickDirectory_Internal(pendingDirHandle);
  };

  // גרסה פנימית של handlePickDirectory שמקבלת dir כפרמטר
  const handlePickDirectory_Internal = async (dir: any) => {
    setError(null);
    setAnalysis(null);
    setSelectedMonth(formatMonthYear(new Date()));
    setMonths([]);
    setSelectedFolder(null);
    setPendingDirHandle(null); // נקה את ה-pending
    try {
      setDirHandle(dir);
      setSelectedFolder(dir.name || '');
      let allDetails: CreditDetail[] = [];
      let hasExcelFiles = false;
      let hasNoFiles = true;

      for await (const entry of dir.values()) {
        if (entry.kind === 'file') {
          // תמיכה בקריאת קבצי XLSX ישירות
          if (entry.name.endsWith('.xlsx') || entry.name.endsWith('.xls')) {
            hasNoFiles = false;
            try {
              const file = await entry.getFile();
              const arrayBuffer = await file.arrayBuffer();

              // שמור את קובץ האקסל המקורי בזיכרון
              setExcelFiles(prev => new Map(prev).set(entry.name, arrayBuffer));

              // קרא את הקובץ עם Parser המינימלי
              const workbook = await readXLSX(arrayBuffer);

              // עבור על כל הגיליונות
              for (const sheet of workbook.sheets) {
                const sheetData = sheetToArray(sheet);

                // זיהוי סוג הגיליון
                const type = await ensureSheetType(dir, entry.name, sheet.name, sheetData);

                let details: CreditDetail[] = [];
                if (type === 'credit') {
                  details = await parseCreditDetailsFromSheet(sheetData, entry.name);
                } else {
                  details = await parseBankStatementFromSheet(sheetData, entry.name, sheet.name);
                }
                allDetails = allDetails.concat(details);
              }
            } catch (err) {
              console.error(`שגיאה בקריאת קובץ ${entry.name}:`, err);
              // ממשיך לקובץ הבא
            }
          }
          if (entry.name.endsWith('.csv')) {
            hasNoFiles = false;
            const file = await entry.getFile();
            const text = await file.text();
            const rows = parseCSV(text);
            const type = await ensureCsvType(dir, entry.name, rows);
            let details: CreditDetail[] = [];
            if (type === 'credit') {
              details = parseCreditDetailsFromCSV(rows, entry.name);
            } else {
              details = parseBankStatementFromCSV(rows, entry.name);
            }
            allDetails = allDetails.concat(details);
          }
        }
      }

      if (hasNoFiles) {
        setError('לא נמצאו קבצי CSV או XLSX בתיקיה. אנא בחר תיקיה עם קבצי נתונים.');
        return;
      }

      allDetails = applyAliases(allDetails, await loadAliasesFromDir(dir, 'category'), await loadAliasesFromDir(dir, 'description'));
      const categoryRules = await loadCategoryRules(dir);
      allDetails = applyCategoryRules(allDetails, categoryRules);
      const directionOverrides = await loadDirectionOverridesFromDir(dir);
      allDetails = applyDirectionOverrides(allDetails, directionOverrides);
      const { details: finalDetails, creditChargeCycles: finalCycles } = await processCreditChargeMatching(allDetails, dir);
      allDetails = finalDetails;

      const uniqueMonths = Array.from(new Set(allDetails.map(d => getMonthYear(d.date)).filter(Boolean)));
      setMonths(uniqueMonths);
      const latest = uniqueMonths.slice().sort((a, b) => {
        const [ma, ya] = a.split('/').map(Number);
        const [mb, yb] = b.split('/').map(Number);
        return ya !== yb ? ya - yb : ma - mb;
      }).pop();
      setSelectedMonth(latest || formatMonthYear(new Date()));

      const totalAmount = allDetails.reduce((sum, d) => sum + signedAmount(d), 0);
      const averageAmount = allDetails.length > 0 ? totalAmount / allDetails.length : 0;
      setAnalysis({ totalAmount, averageAmount, details: finalDetails, creditChargeCycles: finalCycles });
    } catch (err) {
      console.error('שגיאה בבחירת תיקיה:', err);
      setError('בחירת התיקיה נכשלה או בוטלה.');
    }
  };

  // מצבי תצוגה/פילטרים חדשים
  const [displayMode, setDisplayMode] = useState<'all' | 'expense' | 'income'>('all');

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
  const filteredDetails = scopedDetails.filter(d => (displayMode === 'all' ? true : d.direction === displayMode));

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
  const categories = (() => {
    const catCounts: Record<string, number> = {};
    filteredDetails.forEach(d => {
      if (d.category) catCounts[d.category] = (catCounts[d.category] || 0) + d.amount;
    });
    return catCounts;
  })();

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
  }, [analysis, dateMode]);

  // הצג עמודה חדשה בטבלת העסקאות: שם קובץ מקור
  // (נדרש גם ב-TransactionsTable.tsx, אך כאן נתחיל מהוספת onEditCategory)
  // הוספת state ודיאלוג לשינוי קטגוריה (כולל קובץ מקור)
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    transaction?: CreditDetail;
    candidates: CreditDetail[];
    newCategory: string;
    applyToAll: boolean;
    excludeIds: Set<string>;
  } | null>(null);

  const handleOpenEditCategory = (transaction: CreditDetail) => {
    if (!analysis) return;
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

  // --- פונקציה ליישום שינוי קטגוריה ---
  const handleApplyCategoryChange = async (editDialogParam?: typeof editDialog) => {
    const dialog = editDialogParam || editDialog;
    if (!dialog || !analysis) return;
    const { candidates = [], newCategory = '', applyToAll = false, excludeIds = new Set(), transaction } = dialog;
    let idsToUpdate: string[];
    if (applyToAll) {
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

    // אם בוצע שינוי לכל העסקאות עם אותו תיאור – צור כלל מתמשך (rule) לעתיד
    if (applyToAll && transaction?.description && newCategory) {
      await addDescriptionEqualsRule(dirHandle, transaction.description, newCategory);
    }
    // עדכן את קבצי האקסל בזיכרון וגם בתיקיה (אם נבחרה)
    const detailsToUpdate = newDetails.filter(d => idsToUpdate.includes(d.id));
    const newFiles = await updateExcelFilesWithCategories(detailsToUpdate, newCategory);
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
    setAnalysis({ ...analysis, details: newDetails });
    setEditDialog(null);
  };

  // פונקציה לעדכון קבצי אקסל בזיכרון לפי שינויים בקטגוריה
  const updateExcelFilesWithCategories = async (changedDetails: CreditDetail[], newCategory: string) => {
    // הערה: עדכון קבצי XLSX עדיין לא ממומש במלואו ללא ספריית XLSX
    // נדרש parser מלא שיכול גם לכתוב חזרה ל-XLSX
    // בינתיים, פונקציה זו תחזיר אובייקט ריק
    console.warn('עדכון קבצי Excel לא זמין כרגע ללא ספריית XLSX. שקול לעבוד עם CSV.');
    return {};
  };

  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [categoriesList, setCategoriesList] = useState<CategoryDef[]>([]);

  // State for multi-category prompt
  const [newCategoriesPrompt, setNewCategoriesPrompt] = useState<null | { names: string[], onConfirm: (mapping: Record<string, CategoryDef>) => void }>(null);

  const [categoryAliases, setCategoryAliases] = useState<Record<string, string>>({});
  const [descriptionAliases, setDescriptionAliases] = useState<Record<string, string>>({});
  // replace with unused-safe names
  const [_descriptionAliases, _setDescriptionAliases] = [descriptionAliases, setDescriptionAliases];

  // File System Access API: Read/write categories.json in Excel folder
  const CATEGORIES_JSON = 'categories.json';
  const CATEGORIES_ALIASES_JSON = 'categories-aliases.json';
  const [_CATEGORIES_JSON, _CATEGORIES_ALIASES_JSON] = [CATEGORIES_JSON, CATEGORIES_ALIASES_JSON];

  const [settingsOpen, setSettingsOpen] = useState(false);

  // --- תיאור לקטגוריה: שמירה וטעינה ---
  const [descToCategory, setDescToCategory] = useState<Record<string, string>>({});

  // טען mapping תיאור->קטגוריה מהתיקיה (משתמש בקובץ description-categories.json)
  React.useEffect(() => {
    if (!dirHandle) return;
    (async () => {
      try {
        const fileHandle = await dirHandle.getFileHandle('description-categories.json');
        const file = await fileHandle.getFile();
        const content = await file.text();
        setDescToCategory(JSON.parse(content));
      } catch {
        setDescToCategory({});
      }
    })();
  }, [dirHandle]);

  // שמור mapping תיאור->קטגוריה
  async function saveDescToCategory(aliases: Record<string, string>) {
    if (!dirHandle) return;
    const fileHandle = await dirHandle.getFileHandle('description-categories.json', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(aliases, null, 2));
    await writable.close();
    setDescToCategory(aliases);
  }

  // Prompt for new categories after both categoriesList and analysis are loaded
  React.useEffect(() => {
    if (!analysis || !categoriesList.length) return;
    // מצא קטגוריות מהאקסל שלא קיימות ב-categoriesList
    const excelCats = Array.from(new Set(analysis.details.map(d => d.category).filter(Boolean)));
    const missingCats = excelCats.filter(catName => !!catName && !categoriesList.find(c => c.name === catName)) as string[];
    if (missingCats.length > 0) {
      setNewCategoriesPrompt({
        names: missingCats,
        onConfirm: (mapping) => {
          const merged = [...categoriesList];
          Object.values(mapping).forEach(cat => {
            if (!merged.find(c => c.name === cat.name)) merged.push(cat);
          });
          setCategoriesList(merged);
          if (dirHandle) saveCategoriesToDir(dirHandle, merged);
          setAnalysis(a => a ? ({
            ...a,
            details: a.details.map(d => {
              if (d.category && mapping[d.category]) {
                return { ...d, category: mapping[d.category].name };
              }
              return d;
            })
          }) : a);
          setNewCategoriesPrompt(null);
        }
      });
    }
  }, [analysis, categoriesList, dirHandle]);

  // טען קטגוריות מהתיקיה שנבחרה בכל פעם ש-dirHandle משתנה
  React.useEffect(() => {
    if (!dirHandle) return;
    (async () => {
      const loaded = await loadCategoriesFromDir(dirHandle);
      if (loaded) setCategoriesList(loaded);
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

  const [categoryAliasesManagerOpen, setCategoryAliasesManagerOpen] = useState(false);

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

  // מאזין חדש לאירוע setDescriptionAlias: שמור mapping תיאור->קטגוריה ועדכן סטייט
  React.useEffect(() => {
    function handleSetDescriptionAlias(e: any) {
      if (!e?.detail?.description || !e?.detail?.category) return;
      (async () => {
        const newAliases = { ...descToCategory, [e.detail.description]: e.detail.category };
        await saveDescToCategory(newAliases);
      })();
    }
    window.addEventListener('setDescriptionAlias', handleSetDescriptionAlias);
    return () => window.removeEventListener('setDescriptionAlias', handleSetDescriptionAlias);
  }, [descToCategory, dirHandle]);

  // עדכון כל העסקאות עם תיאור מסוים לקטגוריה חדשה לפי mapping
  function applyDescToCategory(details: CreditDetail[], mapping: Record<string, string>): CreditDetail[] {
    return details.map(d =>
      mapping[d.description] ? { ...d, category: mapping[d.description] } : d
    );
  }

  // עדכון סטייט העסקאות כאשר mapping משתנה
  React.useEffect(() => {
    if (!analysis) return;
    setAnalysis(a => a ? { ...a, details: applyDescToCategory(a.details, descToCategory) } : a);
  }, [descToCategory]);

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

  // הצג מסך טעינה
  if (authLoading) {
    return <div style={{ padding: '2rem' }}>טוען...</div>;
  }

  // אם אין משתמש - הצג מסך התחברות
  if (!user) {
    return <Auth />;
  }

  return (
    <div className="app-container">
      {/* Onboarding screen: show until analysis is ready */}
      {!analysis && (
        <div className="onboarding" role="dialog" aria-labelledby="onboardingTitle" aria-modal="true">
          <div className="onboarding-inner">
            <h1 id="onboardingTitle">ברוך הבא למערכת ניתוח חיובי אשראי</h1>
            <p className="onboarding-sub">בחר תיקיה עם קבצי CSV של פירוטי אשראי / בנק. לאחר הבחירה נטען ונבצע עיבוד ראשוני.</p>

            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f0f8ff', borderRadius: '8px', borderLeft: '4px solid #2196F3' }}>
              <p style={{ fontSize: '0.95em', lineHeight: '1.6', color: '#0d47a1', marginBottom: '10px' }}>
                💡 <strong>יש לך קבצי Excel?</strong> השתמש בכלי ההמרה להמיר אותם ל-CSV:
              </p>
              <a
                href="/excel2csv.html"
                download="excel2csv.html"
                style={{
                  display: 'inline-block',
                  padding: '10px 20px',
                  backgroundColor: '#ff9800',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '6px',
                  fontSize: '0.9em',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  border: 'none',
                  transition: 'background-color 0.3s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f57c00'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ff9800'}
              >
                📥 הורד כלי המרה Excel ל-CSV
              </a>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '15px' }}>
              <button onClick={handlePickDirectory} className="folder-btn primary" autoFocus>
                📁 בחר תיקיה עם קבצי CSV
              </button>
            </div>

            {/* הצג שגיאה מיד מתחת לכפתור בחירת תיקיה */}
            {error === 'EXCEL_DETECTED' && (
              <div style={{
                marginBottom: '20px',
                padding: '20px',
                backgroundColor: '#fff3cd',
                border: '2px solid #ff9800',
                borderRadius: '8px'
              }}>
                <p style={{ fontSize: '1em', fontWeight: 'bold', marginBottom: '10px', color: '#856404' }}>
                  💡 יש לך קבצי Excel? התיקיה שבחרת מכילה רק קבצי Excel.
                </p>
                <p style={{ fontSize: '0.9em', marginBottom: '15px', color: '#856404' }}>
                  השתמש בכלי ההמרה כדי להמיר את קבצי Excel ל-CSV, ואז בחר את התיקיה שוב:
                </p>
                <a
                  href="/excel2csv.html"
                  download="excel2csv.html"
                  className="folder-btn"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 24px',
                    backgroundColor: '#ff9800',
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: '6px',
                    fontSize: '0.95em',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'background-color 0.3s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f57c00'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ff9800'}
                >
                  📥 הורד כלי המרה Excel ל-CSV
                </a>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #ddd' }}>
              <span style={{ fontSize: '0.85em', color: '#666' }}>או בחר קובץ CSV בודד:</span>
              <input
                type="file"
                accept=".csv"
                style={{ display: 'inline-block', fontSize: '0.85em' }}
                onChange={async (e) => {
                  setError(null);
                  setAnalysis(null);
                  setSelectedMonth(formatMonthYear(new Date()));
                  setMonths([]);
                  setSelectedFolder(null);
                  const file = e.target.files && e.target.files[0];
                  if (!file) return;
                  try {
                    let allDetails: CreditDetail[] = [];
                    if (!file.name.endsWith('.csv')) {
                      setError('רק קבצי CSV נתמכים. אם יש לך Excel, השתמש בכלי ההמרה.');
                      return;
                    }
                    const text = await file.text();
                    const rows = parseCSV(text);
                    // Single-file mode: detect type without overrides
                    const type = detectSheetTypeFromCSV(rows);
                    if (type === 'bank') {
                      allDetails = parseBankStatementFromCSV(rows, file.name);
                    } else {
                      allDetails = parseCreditDetailsFromCSV(rows, file.name);
                    }
                    setAnalysis({
                      totalAmount: allDetails.reduce((sum, d) => sum + signedAmount(d), 0),
                      averageAmount: allDetails.length > 0 ? allDetails.reduce((sum, d) => sum + signedAmount(d), 0) / allDetails.length : 0,
                      details: allDetails,
                      creditChargeCycles: [],
                    });
                  } catch (err) {
                    console.error('שגיאה בטעינת קובץ:', err);
                    setError('טעינת הקובץ נכשלה או בוטלה.');
                  }
                }}
              />
            </div>

            {/* שגיאות אחרות (לא EXCEL_DETECTED) */}
            {error && error !== 'EXCEL_DETECTED' && (
              <div className="error-msg" style={{ marginTop: '12px' }}>
                {error}
              </div>
            )}
            <ul className="onboarding-hints" aria-label="הוראות">
              <li>ודא שהדפדפן (Chrome / Edge) תומך בגישת תיקיות.</li>
              <li>מומלץ לאחסן קבצי XLSX מעודכנים בלבד.</li>
              <li>תוכל להחליף תיקיה או קובץ מאוחר יותר דרך ההגדרות.</li>
            </ul>
          </div>
        </div>
      )}
      {selectedFolder && (
        <>
          {dirHandle && (
            <button
              className="settings-btn"
              onClick={() => setSettingsOpen(v => !v)}
              title="הגדרות"
            >
              <span role="img" aria-label="הגדרות">⚙️</span>
            </button>
          )}
          <SettingsMenu
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            onOpenCategoryManager={() => { setCategoryManagerOpen(true); setSettingsOpen(false); }}
            dirHandle={dirHandle}
            onOpenCategoryAliasesManager={() => { setCategoryAliasesManagerOpen(true); setSettingsOpen(false); }}
            descToCategory={descToCategory}
            categoriesList={categoriesList}
            onChangeMapping={async (desc, newCategory) => {
              const newMap = { ...descToCategory, [desc]: newCategory };
              await saveDescToCategory(newMap);
            }}
            onAddCategory={(cat: CategoryDef) => {
              setCategoriesList(prev => {
                const updated = [...prev, cat];
                if (dirHandle) saveCategoriesToDir(dirHandle, updated);
                return updated;
              });
            }}
          />
          {/* header של החלפת תיקיה נמחק – הקלוסטר עבר ל-MainView */}
        </>
      )}
      {error && error !== 'EXCEL_DETECTED' && (
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
            setView={setView}
            categories={categories}
            monthTotals={monthTotals}
            yearlySummary={yearlySummary}
            handleOpenEditCategory={handleOpenEditCategory}
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
            setDateMode={setDateMode}
            selectedFolder={selectedFolder}
            onPickDirectory={handlePickDirectory}
            dirHandle={dirHandle}
          />
          {/* אייקון צ'אט בפינה */}
          <button
            className="chat-fab"
            title="שאל שאלה על העסקאות"
            onClick={() => setChatOpen(true)}
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
        onAddCategory={(cat: CategoryDef) => {
          setCategoriesList(prev => {
            const updated = [...prev, cat];
            if (dirHandle) saveCategoriesToDir(dirHandle, updated);
            return updated;
          });
        }}
      />
      {categoryManagerOpen && (
        <CategoryManager
          categories={categoriesList}
          onChange={(cats) => {
            setCategoriesList(cats);
            if (dirHandle) saveCategoriesToDir(dirHandle, cats);
          }}
          onClose={() => setCategoryManagerOpen(false)}
          categoriesCount={categoriesCount}
          transactionsByCategory={transactionsByCategory}
        />
      )}
      {categoryAliasesManagerOpen && (
        <CategoryAliasesManager
          aliases={categoryAliases}
          categories={categoriesList}
          onChange={handleCategoryAliasesChange}
          onClose={() => setCategoryAliasesManagerOpen(false)}
          onAliasAdded={() => { }}
        />
      )}
      {newCategoriesPrompt && (
        <NewCategoriesTablePrompt
          names={newCategoriesPrompt.names}
          categoriesList={categoriesList}
          onConfirm={newCategoriesPrompt.onConfirm}
          onCancel={() => setNewCategoriesPrompt(null)}
          allDetails={analysis?.details || []}
          handleApplyCategoryChange={handleApplyCategoryChange}
        />
      )}
      <Footer />
    </div>
  );
}

export default App;