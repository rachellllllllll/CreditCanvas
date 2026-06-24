/**
 * Parser לעסקאות שהתקבלו מ-API (דרך התוסף).
 * ממיר את הפורמט של israeli-bank-scrapers ל-CreditDetail[].
 */

import type { CreditDetail } from '../types';

// הפורמט שמחזיר israeli-bank-scrapers
export interface ScrapedTransaction {
  date: string;                   // ISO date string
  processedDate?: string;         // תאריך עיבוד
  originalAmount?: number;        // סכום מקורי (במט"ח)
  originalCurrency?: string;      // מטבע מקורי
  chargedAmount: number;          // סכום חיוב בש"ח
  description: string;            // תיאור העסקה
  memo?: string;                  // פרטים נוספים
  installments?: {
    number: number;
    total: number;
  };
  status?: string;                // 'completed' | 'pending'
  type?: string;                  // 'normal' | 'installments'
  identifier?: string;            // מזהה ייחודי מהבנק
  category?: string;              // קטגוריה (אם חברת האשראי סיפקה)
}

export interface ScrapedAccountData {
  success: boolean;
  accountNumber?: string;
  txns: ScrapedTransaction[];
  errorType?: string;
  errorMessage?: string;
}

export interface ScrapedResult {
  providerId: string;
  providerLabel: string;
  scrapeDate: string;    // ISO timestamp
  accounts: ScrapedAccountData[];
}

// ספקים נתמכים
export type ProviderId = 
  | 'visa-cal'
  | 'max'
  | 'isracard'
  | 'leumi'
  | 'hapoalim'
  | 'discount'
  | 'mizrahi'
  | 'fibi';

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  type: 'credit' | 'bank';
}

export const SUPPORTED_PROVIDERS: ProviderInfo[] = [
  { id: 'visa-cal', label: 'ויזה כאל (Cal)', type: 'credit' },
  { id: 'max', label: 'מקס (לאומי קארד)', type: 'credit' },
  { id: 'isracard', label: 'ישראכרט', type: 'credit' },
  { id: 'leumi', label: 'בנק לאומי', type: 'bank' },
  { id: 'hapoalim', label: 'בנק הפועלים', type: 'bank' },
  { id: 'discount', label: 'בנק דיסקונט', type: 'bank' },
  { id: 'mizrahi', label: 'בנק מזרחי טפחות', type: 'bank' },
  { id: 'fibi', label: 'הבנק הבינלאומי', type: 'bank' },
];

/** המרת תאריך ISO ל-dd/mm/yy */
function isoToLocalDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  } catch {
    return '';
  }
}

/** המרת עסקאות scraped ל-CreditDetail[] */
export function parseScrapedTransactions(
  result: ScrapedResult
): CreditDetail[] {
  const details: CreditDetail[] = [];
  const provider = SUPPORTED_PROVIDERS.find(p => p.id === result.providerId);
  const source: 'credit' | 'bank' = provider?.type ?? 'credit';
  const fileName = `${result.providerId}_${result.scrapeDate.slice(0, 10)}.json`;

  for (const account of result.accounts) {
    if (!account.success || !account.txns) continue;

    for (let i = 0; i < account.txns.length; i++) {
      const tx = account.txns[i];
      const date = isoToLocalDate(tx.date);
      if (!date) continue;

      const amount = Math.abs(tx.chargedAmount);
      const direction: 'income' | 'expense' = tx.chargedAmount < 0 ? 'income' : 'expense';
      const description = tx.description?.trim() || tx.memo?.trim() || '';
      if (!description) continue;

      const chargeDate = tx.processedDate ? isoToLocalDate(tx.processedDate) : undefined;

      const id = `${source}|${fileName}|${account.accountNumber || 'main'}|${i}|${date}|${amount.toFixed(2)}|${description.trim().toLowerCase()}`;

      details.push({
        id,
        date,
        amount,
        description,
        source,
        direction,
        directionDetected: direction,
        fileName,
        rowIndex: i,
        headerIdx: 0,
        ...(chargeDate && { chargeDate }),
        ...(tx.originalAmount && { transactionAmount: Math.abs(tx.originalAmount) }),
        ...(tx.originalCurrency && tx.originalCurrency !== 'ILS' && { transactionCurrency: tx.originalCurrency }),
        ...(tx.category && { category: tx.category }),
      });
    }
  }

  return details;
}

/** קריאת כל קבצי JSON מהתיקייה (שנוצרו מ-scraping) */
export async function loadScrapedJsonFiles(
  dirHandle: FileSystemDirectoryHandle
): Promise<CreditDetail[]> {
  const allDetails: CreditDetail[] = [];

  // @ts-expect-error - values() exists on FileSystemDirectoryHandle
  for await (const entry of dirHandle.values()) {
    if (entry.kind !== 'file') continue;
    if (!entry.name.endsWith('.json')) continue;
    // דלג על קבצי config
    if (
      entry.name === 'categories.json' ||
      entry.name === 'category-rules.json' ||
      entry.name === 'categories-aliases.json' ||
      entry.name === 'description-aliases.json' ||
      entry.name === 'credentials.enc.json' ||
      entry.name === 'income-source-rules.json' ||
      entry.name === 'sheet-type-overrides.json' ||
      entry.name === 'direction-overrides.json' ||
      entry.name === 'credit-charge-matching.json' ||
      entry.name === 'user-profile.json' ||
      entry.name === 'sync-state.json' ||
      entry.name === 'transactions.json'
    ) continue;

    try {
      const file = await entry.getFile();
      const text = await file.text();
      const data = JSON.parse(text);

      // בדיקה שזה קובץ scraped (יש providerId ו-accounts)
      if (data.providerId && Array.isArray(data.accounts)) {
        const details = parseScrapedTransactions(data as ScrapedResult);
        allDetails.push(...details);
      }
    } catch {
      // דלג על קבצים שלא ניתנים לפרסור
      continue;
    }
  }

  return allDetails;
}

/** שמירת תוצאות scraping כקובץ JSON בתיקייה */
export async function saveScrapedResult(
  dirHandle: FileSystemDirectoryHandle,
  result: ScrapedResult
): Promise<string> {
  const dateStr = result.scrapeDate.slice(0, 7); // YYYY-MM
  const fileName = `${result.providerId}_${dateStr}.json`;

  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(result, null, 2));
  await writable.close();

  return fileName;
}
