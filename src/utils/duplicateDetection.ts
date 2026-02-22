/**
 * duplicateDetection.ts
 * 
 * זיהוי קבצים כפולים ותקופות חופפות.
 * 
 * רמה 1: Hash בינארי – קבצים זהים לחלוטין (אותו תוכן, שם שונה)
 * רמה 3: חפיפת טווחי תאריכים – קבצים מאותו מקור+כרטיס עם טווחי תאריכים חופפים
 */

import type { CreditDetail } from '../types';

// ====== רמה 1: זיהוי קבצים בינאריים זהים ======

export interface DuplicateFileGroup {
  /** ה-hash המשותף */
  hash: string;
  /** כל הנתיבים עם אותו תוכן */
  paths: string[];
  /** גודל הקובץ בבתים */
  fileSize: number;
}

/**
 * חישוב SHA-256 hash של ArrayBuffer באמצעות Web Crypto API
 */
async function hashArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * זיהוי קבצים עם תוכן בינארי זהה.
 * מקבל את ה-Map של excelFiles (נתיב → ArrayBuffer) ומחזיר קבוצות של כפילויות.
 */
export async function findDuplicateFiles(
  excelFiles: Map<string, ArrayBuffer>
): Promise<DuplicateFileGroup[]> {
  if (excelFiles.size < 2) return [];

  const hashToFiles: Map<string, { paths: string[]; fileSize: number }> = new Map();

  for (const [path, buffer] of excelFiles) {
    const hash = await hashArrayBuffer(buffer);
    const existing = hashToFiles.get(hash);
    if (existing) {
      existing.paths.push(path);
    } else {
      hashToFiles.set(hash, { paths: [path], fileSize: buffer.byteLength });
    }
  }

  // החזר רק קבוצות עם יותר מקובץ אחד
  const duplicates: DuplicateFileGroup[] = [];
  for (const [hash, { paths, fileSize }] of hashToFiles) {
    if (paths.length > 1) {
      duplicates.push({ hash, paths, fileSize });
    }
  }

  return duplicates;
}

// ====== רמה 3: זיהוי חפיפת טווחי תאריכים ======

export interface OverlappingDateRange {
  /** מקור: 'bank' או 'credit' */
  source: 'bank' | 'credit';
  /** כרטיס (4 ספרות אחרונות) – רלוונטי רק לאשראי */
  cardLast4: string | null;
  /** קובץ ראשון */
  file1: string;
  /** טווח תאריכים של קובץ 1 */
  range1: { from: string; to: string; count: number };
  /** קובץ שני */
  file2: string;
  /** טווח תאריכים של קובץ 2 */
  range2: { from: string; to: string; count: number };
  /** כמות ימים חופפים */
  overlapDays: number;
  /** אחוז חפיפה (מתוך הקובץ הקטן יותר) */
  overlapPercent: number;
}

/**
 * פירוס תאריך dd/mm/yy או dd/mm/yyyy ל-Date
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length < 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000;
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return new Date(year, month - 1, day);
}

/**
 * פורמט Date חזרה ל-dd/mm/yyyy
 */
function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * חישוב הפרש ימים בין שני תאריכים
 */
function daysDiff(a: Date, b: Date): number {
  return Math.round(Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

interface FileRange {
  fileName: string;
  from: Date;
  to: Date;
  count: number;
}

/**
 * זיהוי קבצים עם טווחי תאריכים חופפים לפי מקור (bank/credit) + כרטיס.
 * חפיפה מזוהה רק כשטווחי התאריכים חופפים ב-80% ומעלה (מתוך הקובץ הקטן יותר).
 */
export function findOverlappingDateRanges(
  allDetails: CreditDetail[],
  skippedFiles: Set<string> = new Set()
): OverlappingDateRange[] {
  // מפתח: "source|cardLast4" → רשימת טווחים לפי קובץ
  const groups: Map<string, FileRange[]> = new Map();

  for (const d of allDetails) {
    // דלג על קבצים שכבר סומנו ככפולים (רמה 1)
    if (d.fileName && skippedFiles.has(d.fileName)) continue;

    const source = d.source || 'credit';
    const card = source === 'credit' ? (d.cardLast4 || 'ALL') : 'BANK';
    const key = `${source}|${card}`;
    const fileName = d.fileName || 'unknown';

    // לעסקאות אשראי: השתמש ב-chargeDate (תאריך חיוב) אם קיים
    // כי עסקאות בתשלומים מרחיבות את טווח תאריך העסקה בצורה מלאכותית
    // אבל chargeDate מייצג את מחזור החיוב – ושונה בין קבצים חודשיים
    const dateStr = (source === 'credit' && d.chargeDate) ? d.chargeDate : d.date;
    const date = parseDate(dateStr);
    if (!date) continue;

    if (!groups.has(key)) groups.set(key, []);
    const fileRanges = groups.get(key)!;

    // מצא או צור טווח לקובץ הנוכחי
    let fileRange = fileRanges.find(fr => fr.fileName === fileName);
    if (!fileRange) {
      fileRange = { fileName, from: date, to: date, count: 0 };
      fileRanges.push(fileRange);
    }

    if (date < fileRange.from) fileRange.from = date;
    if (date > fileRange.to) fileRange.to = date;
    fileRange.count++;
  }

  const overlaps: OverlappingDateRange[] = [];

  for (const [key, fileRanges] of groups) {
    if (fileRanges.length < 2) continue;

    const [source, card] = key.split('|');

    // השוואה בין כל זוג קבצים
    for (let i = 0; i < fileRanges.length; i++) {
      for (let j = i + 1; j < fileRanges.length; j++) {
        const a = fileRanges[i];
        const b = fileRanges[j];

        // חישוב חפיפה
        const overlapStart = a.from > b.from ? a.from : b.from;
        const overlapEnd = a.to < b.to ? a.to : b.to;

        if (overlapStart > overlapEnd) continue; // אין חפיפה

        const overlapDays = daysDiff(overlapStart, overlapEnd) + 1;
        const aSpan = daysDiff(a.from, a.to) + 1;
        const bSpan = daysDiff(b.from, b.to) + 1;
        const smallerSpan = Math.min(aSpan, bSpan);

        const overlapPercent = smallerSpan > 0 ? (overlapDays / smallerSpan) * 100 : 0;

        // סף: חפיפה ב-80% מתוך הקובץ הקטן + שניהם מכילים לפחות 3 עסקאות
        if (overlapPercent >= 80 && a.count >= 3 && b.count >= 3) {
          overlaps.push({
            source: source as 'bank' | 'credit',
            cardLast4: card === 'BANK' || card === 'ALL' ? null : card,
            file1: a.fileName,
            range1: { from: formatDate(a.from), to: formatDate(a.to), count: a.count },
            file2: b.fileName,
            range2: { from: formatDate(b.from), to: formatDate(b.to), count: b.count },
            overlapDays,
            overlapPercent: Math.round(overlapPercent)
          });
        }
      }
    }
  }

  return overlaps;
}

// ====== סוג מאוחד לכלל התראות כפילויות ======

export interface DuplicateFilesInfo {
  /** קבצים בינאריים זהים (רמה 1) */
  identicalFiles: DuplicateFileGroup[];
  /** טווחי תאריכים חופפים (רמה 3) */
  overlappingRanges: OverlappingDateRange[];
  /** קבצים שדולגו (רמה 1 – כפולים) */
  skippedFiles: string[];
}
