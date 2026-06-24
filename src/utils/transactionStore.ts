/**
 * Transaction Store — מאגר "דלתא" לעסקאות שנגררו.
 * 
 * שומר רק עסקאות שהגיעו דרך drag & drop ואינן קיימות בקבצי האקסל שבתיקייה.
 * כשהמשתמש מוסיף אקסל חודשי שמכיל את העסקאות — הן מנוקות מה-JSON.
 * 
 * אקסלים בתיקייה = ארכיון היסטורי (לא נוגעים)
 * transactions.json = עדכונים אחרונים (ביניים)
 */

import type { CreditDetail } from '../types';

const STORE_FILENAME = 'transactions.json';

export interface TransactionStore {
  version: number;
  lastUpdated: string;
  transactions: CreditDetail[];
}

/**
 * מנרמל תאריך לפורמט dd/mm/yy (zero-padded, 2-digit year)
 */
function normalizeDate(date: string): string {
  if (!date) return '';
  const parts = date.split('/');
  if (parts.length !== 3) return date;
  let [dd, mm, yy] = parts;
  if (yy.length === 4) yy = yy.slice(-2);
  dd = dd.padStart(2, '0');
  mm = mm.padStart(2, '0');
  return `${dd}/${mm}/${yy}`;
}

/**
 * מפתח ייחודי לעסקה לפי תוכן בלבד (ללא fileName/rowIndex)
 */
export function getContentKey(d: CreditDetail): string {
  const source = d.source || 'credit';
  const date = normalizeDate(d.date || '');
  const amount = d.amount.toFixed(2);
  const desc = d.description.trim().toLowerCase().replace(/\s+/g, ' ');
  const direction = d.direction || 'expense';
  const card = d.cardLast4 || '';
  return `${source}|${date}|${amount}|${direction}|${desc}|${card}`;
}

/**
 * טוען את מאגר העסקאות מהתיקייה
 */
export async function loadTransactionStore(
  dir: FileSystemDirectoryHandle
): Promise<TransactionStore | null> {
  try {
    const fileHandle = await dir.getFileHandle(STORE_FILENAME);
    const file = await fileHandle.getFile();
    const text = await file.text();
    const data = JSON.parse(text);
    
    if (data.version && Array.isArray(data.transactions)) {
      return data as TransactionStore;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * שומר את מאגר העסקאות לתיקייה
 */
export async function saveTransactionStore(
  dir: FileSystemDirectoryHandle,
  transactions: CreditDetail[]
): Promise<void> {
  const store: TransactionStore = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    transactions,
  };
  
  const fileHandle = await dir.getFileHandle(STORE_FILENAME, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(store, null, 2));
  await writable.close();
}

/**
 * מוחק את קובץ המאגר אם הוא ריק
 */
export async function deleteTransactionStoreIfEmpty(
  dir: FileSystemDirectoryHandle
): Promise<void> {
  try {
    const store = await loadTransactionStore(dir);
    if (store && store.transactions.length === 0) {
      await dir.removeEntry(STORE_FILENAME);
    }
  } catch {
    // לא קריטי
  }
}

/**
 * בונה Set של content keys מרשימת עסקאות.
 * מחזיר Map של key → מספר מופעים (לתמיכה בעסקאות זהות לגיטימיות)
 */
function buildContentKeyMap(details: CreditDetail[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of details) {
    const key = getContentKey(d);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

/**
 * מסנן עסקאות שכבר קיימות באקסל — מחזיר רק את ה"דלתא".
 * 
 * @param incoming עסקאות חדשות (מקובץ שנגרר)
 * @param excelTransactions עסקאות שכבר קיימות בקבצי אקסל בתיקייה
 * @returns רק העסקאות שלא קיימות באקסל
 */
export function findNewTransactions(
  incoming: CreditDetail[],
  excelTransactions: CreditDetail[]
): CreditDetail[] {
  const excelKeys = buildContentKeyMap(excelTransactions);
  
  // ספור כמה כבר "נצרכו" מכל מפתח
  const consumed = new Map<string, number>();
  
  const result: CreditDetail[] = [];
  for (const d of incoming) {
    const key = getContentKey(d);
    const excelCount = excelKeys.get(key) || 0;
    const usedCount = consumed.get(key) || 0;
    
    if (usedCount < excelCount) {
      // עסקה קיימת באקסל — דלג
      consumed.set(key, usedCount + 1);
    } else {
      // עסקה חדשה! שמור
      result.push(d);
    }
  }
  
  return result;
}

/**
 * מנקה מה-JSON עסקאות שכעת קיימות בקבצי אקסל.
 * נקרא בעת טעינה — אם המשתמש הוסיף אקסל חודשי שמכסה את העסקאות.
 * 
 * @param storeTransactions עסקאות שבמאגר
 * @param excelTransactions עסקאות מקבצי אקסל
 * @returns עסקאות שצריכות להישאר ב-JSON (לא קיימות בשום אקסל)
 */
export function cleanupStoreTransactions(
  storeTransactions: CreditDetail[],
  excelTransactions: CreditDetail[]
): CreditDetail[] {
  return findNewTransactions(storeTransactions, excelTransactions);
}

