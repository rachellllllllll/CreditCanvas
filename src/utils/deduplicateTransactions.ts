/**
 * סינון כפילויות ברמת עסקה.
 * כשמשתמש גורר מספר קבצים עם עסקאות חופפות (למשל הורדות מימים שונים),
 * הפונקציה מזהה ומסירה עסקאות כפולות.
 * 
 * מפתח ייחודי: source + normalized_date + amount + description (+ cardLast4 לאשראי)
 */

import type { CreditDetail } from '../types';

/**
 * מנרמל תאריך לפורמט dd/mm/yy (2-digit year, zero-padded) כדי להבטיח השוואה עקבית.
 * מטפל ב:
 * - dd/mm/yyyy → dd/mm/yy
 * - d/m/yy → dd/mm/yy (zero-padding)
 */
function normalizeDate(date: string): string {
  if (!date) return '';
  const parts = date.split('/');
  if (parts.length !== 3) return date;
  
  let [dd, mm, yy] = parts;
  // שנה ל-2 ספרות
  if (yy.length === 4) yy = yy.slice(-2);
  // zero-pad
  dd = dd.padStart(2, '0');
  mm = mm.padStart(2, '0');
  
  return `${dd}/${mm}/${yy}`;
}

/**
 * מנרמל תיאור להשוואה: trim + lowercase + collapse whitespace
 */
function normalizeDescription(desc: string): string {
  return desc.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * יוצר מפתח ייחודי לעסקה (ללא קשר לשם הקובץ).
 * 
 * עבור עסקאות אשראי: כולל cardLast4 אם קיים (מבדיל בין כרטיסים).
 * עבור עסקאות בנק: אין cardLast4.
 */
function getTransactionKey(d: CreditDetail): string {
  const source = d.source || 'credit';
  const date = normalizeDate(d.date || '');
  const amount = d.amount.toFixed(2);
  const desc = normalizeDescription(d.description);
  const card = d.cardLast4 || '';
  const direction = d.direction || 'expense';
  
  // מפתח מלא — כולל cardLast4
  return `${source}|${date}|${amount}|${direction}|${desc}|${card}`;
}

/**
 * מפתח ללא cardLast4 — לזיהוי כפילויות בין JSON (ללא cardLast4) לאקסל (עם cardLast4)
 */
function getBaseKey(d: CreditDetail): string {
  const source = d.source || 'credit';
  const date = normalizeDate(d.date || '');
  const amount = d.amount.toFixed(2);
  const desc = normalizeDescription(d.description);
  const direction = d.direction || 'expense';
  
  return `${source}|${date}|${amount}|${direction}|${desc}`;
}

/**
 * מסנן עסקאות כפולות מרשימת עסקאות.
 * 
 * הלוגיקה: אם אותה עסקה (אותו מפתח) מופיעה N פעמים בקובץ מסוים,
 * זה לגיטימי (2 קניות באותו סופר באותו יום).
 * אבל אם אותו מפתח מופיע בקובץ אחר — זו כפילות.
 * 
 * שלב 1: סופר כמה פעמים כל מפתח מופיע בכל קובץ
 * שלב 2: שומר את המקסימום בין הקבצים (= המספר האמיתי של עסקאות)
 * שלב 3: מחזיר עד N עותקים מכל מפתח
 * 
 * חשוב: מטפל גם בכפילויות בין JSON (ללא cardLast4) לאקסל (עם cardLast4).
 * אם עסקה ללא cardLast4 תואמת בדיוק עסקה עם cardLast4 (אותו תאריך+סכום+תיאור+מקור),
 * היא נחשבת כפילות ומוסרת (העסקה עם cardLast4 עדיפה כי יש בה יותר מידע).
 * 
 * @returns רשימת עסקאות ללא כפילויות בין קבצים
 */
export function deduplicateTransactions(details: CreditDetail[]): CreditDetail[] {
  // --- Phase 1: Full-key dedup (exact match including cardLast4) ---
  
  // סופר מופעים של כל מפתח בכל קובץ
  const keyFileCount = new Map<string, Map<string, number>>();
  
  for (const d of details) {
    const key = getTransactionKey(d);
    const file = d.fileName || '__unknown__';
    
    if (!keyFileCount.has(key)) {
      keyFileCount.set(key, new Map());
    }
    const fileCounts = keyFileCount.get(key)!;
    fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
  }
  
  // לכל מפתח, חשב את המקסימום בין הקבצים
  const keyMaxCount = new Map<string, number>();
  for (const [key, fileCounts] of keyFileCount) {
    let max = 0;
    for (const count of fileCounts.values()) {
      if (count > max) max = count;
    }
    keyMaxCount.set(key, max);
  }
  
  // עובר על העסקאות ושומר עד max עותקים מכל מפתח
  const keyEmitted = new Map<string, number>();
  const phase1Result: CreditDetail[] = [];
  
  for (const d of details) {
    const key = getTransactionKey(d);
    const emitted = keyEmitted.get(key) || 0;
    const max = keyMaxCount.get(key) || 1;
    
    if (emitted < max) {
      phase1Result.push(d);
      keyEmitted.set(key, emitted + 1);
    }
  }
  
  // --- Phase 2: Cross-source dedup (JSON without cardLast4 vs Excel with cardLast4) ---
  // אם יש עסקת אשראי עם cardLast4, מסיר עסקאות שתואמות ב-baseKey ואין להן cardLast4
  
  // אוסף את כל ה-baseKeys שיש להם עסקה עם cardLast4
  const baseKeysWithCard = new Set<string>();
  for (const d of phase1Result) {
    if (d.source === 'credit' && d.cardLast4) {
      baseKeysWithCard.add(getBaseKey(d));
    }
  }
  
  // מסנן עסקאות ללא cardLast4 שתואמות עסקאות עם cardLast4
  const result: CreditDetail[] = [];
  for (const d of phase1Result) {
    // הסר רק עסקאות credit ללא cardLast4 שיש להן מקבילה עם cardLast4
    if (d.source === 'credit' && !d.cardLast4 && baseKeysWithCard.has(getBaseKey(d))) {
      continue; // כפילות cross-source — דלג
    }
    result.push(d);
  }
  
  return result;
}

/**
 * מחזיר את מספר הכפילויות שסוננו
 */
export function countDuplicates(details: CreditDetail[]): number {
  const deduped = deduplicateTransactions(details);
  return details.length - deduped.length;
}
