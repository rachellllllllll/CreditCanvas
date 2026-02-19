import type { CreditDetail, CreditChargeCycleSummary } from '../types';
import { computeCreditChargeCycles } from './creditCycles';

// --- רשימת תיאורים ידועים של חיובי אשראי בדפי חשבון בנק ---
// כל ערך הוא מחרוזת שמחפשים ב-includes (case-insensitive) בתיאור עסקת הבנק
const KNOWN_CREDIT_CHARGE_DESCRIPTIONS: string[] = [
  'מקס',
];

/**
 * בודק אם תיאור עסקת בנק הוא חיוב אשראי ידוע
 */
export function isKnownCreditChargeDescription(description: string): boolean {
  const desc = description.trim().toLowerCase();
  if (!desc) return false;
  return KNOWN_CREDIT_CHARGE_DESCRIPTIONS.some(known => desc.includes(known.toLowerCase()));
}

/**
 * מידע על חיובי אשראי שזוהו לפי תיאור בלבד (ללא מחזור תואם)
 */
export interface UnmatchedCreditCharge {
  description: string;
  amount: number;
  date: string;
  isKnownDescription: boolean; // האם התיאור ברשימה הידועה
}

/**
 * מזהה חיובי אשראי בבנק שאין להם פירוט אשראי תואם.
 * משמש להצגת הודעה למשתמש ולשליחת analytics.
 * לא משנה את העסקאות עצמן (הן ממשיכות להיספר כהוצאה רגילה).
 */
export function detectUnmatchedCreditCharges(details: CreditDetail[]): UnmatchedCreditCharge[] {
  const unmatched: UnmatchedCreditCharge[] = [];
  
  for (const d of details) {
    // רק עסקאות בנק שלא סומנו כ-credit_charge
    if (d.source !== 'bank' || d.direction !== 'expense') continue;
    if (d.transactionType === 'credit_charge' || d.transactionType === 'credit_charge_combined') continue;
    if (d.neutral) continue;
    
    if (isKnownCreditChargeDescription(d.description)) {
      unmatched.push({
        description: d.description,
        amount: d.amount,
        date: d.date,
        isKnownDescription: true,
      });
    }
  }
  
  return unmatched;
}

// MatchOptions: פרמטרים פעילים בלבד (צמצום – הסרת שדות חלקיים היסטוריים)
interface MatchOptions {
  toleranceRatio?: number;      // אחוז סטייה מותר (ברירת מחדל 0.01 = 1%)
  minToleranceAmount?: number;  // מינימום סטייה כספית (ברירת מחדל 2)
  daysBeforeCharge?: number;    // ימים לפני תאריך חיוב עדיין נחשב בחלון (ברירת מחדל 1)
  daysAfterCharge?: number;     // ימים אחרי תאריך חיוב עדיין בחלון (ברירת מחדל 6)
}

// WindowConfig: קובץ הגדרות לחלון ימים סביב תאריך החיוב בפועל של מחזור האשראי
export interface WindowConfig {
  daysBeforeCharge: number;
  daysAfterCharge: number;
}

// parseDayMonthYear: מפרק מחרוזת תאריך בפורמט dd/mm/yy או dd/mm/yyyy לערכים מספריים או null אם לא תקין
function parseDayMonthYear(dateStr: string): { day: number; month: number; year: number } | null {
  const p = dateStr.split('/');
  if (p.length < 3) return null;
  const day = parseInt(p[0], 10);
  const month = parseInt(p[1], 10);
  let year = p[2];
  if (year.length === 2) year = '20' + year;
  const yearNum = parseInt(year, 10);
  if ([day, month, yearNum].some(isNaN)) return null;
  return { day, month, year: yearNum };
}

// (נוקתה לוגיקה חודשית ישנה – משתמשים רק בהפרש ימים ממשי)

// isBankChargeInWindow: בודק הפרש ימים ממשי בין תאריך העסקה בבנק לבין תאריך החיוב במחזור
export function isBankChargeInWindow(bankDate: string, cycleChargeDate: string, cfg: WindowConfig): boolean {
  const b = parseDayMonthYear(bankDate);
  const c = parseDayMonthYear(cycleChargeDate);
  if (!b || !c) return false;
  const bankD = new Date(b.year, b.month - 1, b.day);
  const cycleD = new Date(c.year, c.month - 1, c.day);
  const diffMs = bankD.getTime() - cycleD.getTime(); // חיובי בנק אחרי תאריך חיוב -> diff חיובי
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= -cfg.daysBeforeCharge && diffDays <= cfg.daysAfterCharge;
}

type MarkResult = {
  updatedDetails: CreditDetail[];
  updatedCycles: CreditChargeCycleSummary[];
};

// --- Persistent user pattern support ---
export type CreditChargePattern = {
  value: string;
  type?: 'contains' | 'regex';
  active?: boolean;
};

const PATTERNS_JSON_FILENAME = 'creditChargePatterns.json';
// (בוטל שימוש בקובץ עבור חלון ימים – ערכי ברירת מחדל קבועים בקוד)
const DEFAULT_WINDOW_CONFIG: WindowConfig = { daysBeforeCharge: 1, daysAfterCharge: 6 };

// Base patterns (seed) – כרגע ריק כדי לא להכניס רעש אוטומטי
const BASE_FALLBACK_PATTERN_STRINGS: string[] = [];

// ensurePatternsFile: טוען או יוצר (אם חסר) קובץ JSON עם רשימת תבניות זיהוי חיובי אשראי
async function ensurePatternsFile(dirHandle: FileSystemDirectoryHandle): Promise<CreditChargePattern[]> {
  if (!dirHandle) return BASE_FALLBACK_PATTERN_STRINGS.map(v => ({ value: v, type: 'contains', active: true }));
  try {
    const fh = await dirHandle.getFileHandle(PATTERNS_JSON_FILENAME);
    const file = await fh.getFile();
    const txt = await file.text();
    const data = JSON.parse(txt);
    if (Array.isArray(data)) return data as CreditChargePattern[];
  } catch {
    // Create new file with base patterns
    try {
      const fhNew = await dirHandle.getFileHandle(PATTERNS_JSON_FILENAME, { create: true });
      const writable = await fhNew.createWritable();
      const seed: CreditChargePattern[] = BASE_FALLBACK_PATTERN_STRINGS.map(v => ({ value: v, type: 'contains', active: true }));
      await writable.write(JSON.stringify(seed, null, 2));
      await writable.close();
      return seed;
    } catch {
      return BASE_FALLBACK_PATTERN_STRINGS.map(v => ({ value: v, type: 'contains', active: true }));
    }
  }
  return BASE_FALLBACK_PATTERN_STRINGS.map(v => ({ value: v, type: 'contains', active: true }));
}

// loadCreditChargeWindowConfig: מחזיר תמיד את ערכי ברירת המחדל (ללא טעינה מקובץ)
export function loadCreditChargeWindowConfig(): WindowConfig {
  return DEFAULT_WINDOW_CONFIG;
}

// (נמחקה פונקציית savePatterns שלא בשימוש לאחר צמצום יכולות עדכון דינמי של התבניות)


// compilePatternToRegex: ממיר תבנית (contains/regex) ל-RegExp פעיל או null אם אינה תקפה
function compilePatternToRegex(p: CreditChargePattern): RegExp | null {
  const val = p.value.trim();
  if (!val || p.active === false) return null;
  if (p.type === 'regex') {
    try { return new RegExp(val, 'i'); } catch { return null; }
  }
  // contains – escape special chars lightly, then build regex
  const escaped = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, 'i');
}

// markBankCreditChargesExactWithPatterns: לוגיקה חדשה לפי דרישה
// 1. קודם כל זיהוי לפי תיאור (patterns) – אם מתאים הופך ל-credit_charge (מסומן neutral שלא ייספר פעמיים)
// 2. אם לא נמצא לפי תיאור: התאמת סכום מדויקת למחזורי כרטיס (לא מחזורים מאוחדים), בתוך חלון ימים (1 לפני, 6 אחרי ברירת מחדל)
//    אין יותר סיווג חלקי; או התאמה מלאה או כלום. מחזורי ALL אינם נבדקים כאן כדי למנוע בלבול בין שני כרטיסים שונים.
export async function markBankCreditChargesExactWithPatterns(
  details: CreditDetail[],
  cycles: CreditChargeCycleSummary[],
  dirHandle: FileSystemDirectoryHandle,
  opts: MatchOptions = {}
): Promise<MarkResult> {
  const {
    daysBeforeCharge = DEFAULT_WINDOW_CONFIG.daysBeforeCharge,
    daysAfterCharge = DEFAULT_WINDOW_CONFIG.daysAfterCharge,
    toleranceRatio = 0.01,
    minToleranceAmount = 2,
  } = opts;

  if (!cycles?.length) {
    return { updatedDetails: details, updatedCycles: cycles || [] };
  }

  // טען תבניות (פעיל גם אם אין dirHandle – שימוש ב-seed)
  const patterns = await ensurePatternsFile(dirHandle);
  const regexes = patterns.map(compilePatternToRegex).filter(Boolean) as RegExp[];

  // השתמש רק במחזורים לפי כרטיס (cardLast4 מוגדר) – לא במחזורים מאוחדים
  const perCardCycles = cycles.filter(c => c.cardLast4);

  // מפת התאמות למחזור לצורך סטטוס בסוף
  const cycleAgg: Record<string, { amt: number; bankIds: string[] }> = {};
  perCardCycles.forEach(c => { cycleAgg[c.cycleKey!] = { amt: 0, bankIds: [] }; });

  // מעקב אחרי מחזורים שכבר הותאמו - כל מחזור יכול להתאים רק לעסקת בנק אחת
  const matchedCycleKeys = new Set<string>();

  // שלב ראשון: אסוף את כל ההתאמות האפשריות עם ציון המרחק (הפרש סכום)
  type CandidateMatch = {
    detailIndex: number;
    cycle: CreditChargeCycleSummary;
    diff: number;
    patternMatched: boolean;
  };
  const candidates: CandidateMatch[] = [];

  details.forEach((d, idx) => {
    if (d.source !== 'bank' || d.direction !== 'expense') return;
    const desc = d.description || '';

    // רשימת מחזורים בטווח ימים עבור העסקה הזו
    const windowCycles = perCardCycles.filter(c => c.chargeDate && isBankChargeInWindow(d.date, c.chargeDate, { daysBeforeCharge, daysAfterCharge }));
    if (!windowCycles.length) return;

    const patternMatched = regexes.some(r => r.test(desc));

    for (const c of windowCycles) {
      const diff = Math.abs(d.amount - c.netCharge);
      const allowed = Math.max(c.netCharge * toleranceRatio, minToleranceAmount);
      if (diff <= allowed) {
        candidates.push({ detailIndex: idx, cycle: c, diff, patternMatched });
      }
    }
  });

  // מיין לפי: 1) תבנית תואמת קודם 2) הפרש סכום קטן קודם (התאמה מדויקת יותר)
  candidates.sort((a, b) => {
    if (a.patternMatched !== b.patternMatched) return a.patternMatched ? -1 : 1;
    return a.diff - b.diff;
  });

  // שלב שני: הקצה כל מחזור לעסקת הבנק הכי מתאימה (1:1)
  const detailMatchMap = new Map<number, { cycle: CreditChargeCycleSummary; patternMatched: boolean }>();

  for (const cand of candidates) {
    // מחזור כבר הותאם? דלג
    if (matchedCycleKeys.has(cand.cycle.cycleKey!)) continue;
    // עסקת בנק כבר הותאמה? דלג
    if (detailMatchMap.has(cand.detailIndex)) continue;

    matchedCycleKeys.add(cand.cycle.cycleKey!);
    detailMatchMap.set(cand.detailIndex, { cycle: cand.cycle, patternMatched: cand.patternMatched });
  }

  // שלב שלישי: בנה את מערך העסקאות המעודכן
  const updatedDetails: CreditDetail[] = details.map((d, idx) => {
    const match = detailMatchMap.get(idx);
    if (!match) return d;

    const { cycle: matched, patternMatched } = match;
    cycleAgg[matched.cycleKey!].amt += d.amount;
    cycleAgg[matched.cycleKey!].bankIds.push(d.id);
    return {
      ...d,
      transactionType: 'credit_charge',
      neutral: true,
      relatedTransactionIds: matched.transactionIds,
      matchReason: patternMatched ? 'pattern+amount' : 'amount',
      matchedCardLast4: matched.cardLast4 // הכרטיס שהותאם
    };
  });

  // חישוב סטטוס מחזורי כרטיס (רק למחזורי כרטיס, לא מאוחדים)
  const updatedCycles: CreditChargeCycleSummary[] = cycles.map(c => {
    if (!c.cardLast4) {
      // מחזור מאוחד – לא נבדק בלוגיקה חדשה, משאיר bankMatchStatus ללא שינוי או none אם לא הותאם קודם
      return { ...c, bankMatchStatus: 'none', bankMatchedAmount: 0, bankTransactionIds: [] };
    }
    const agg = cycleAgg[c.cycleKey!];
    if (!agg || agg.amt === 0) {
      return { ...c, bankMatchStatus: 'none', bankMatchedAmount: 0, bankTransactionIds: [] };
    }
    const diff = Math.abs(agg.amt - c.netCharge);
    const allowed = Math.max(c.netCharge * toleranceRatio, minToleranceAmount);
    let status: 'full' | 'multi' = 'full';
    if (diff <= allowed) {
      status = agg.bankIds.length > 1 ? 'multi' : 'full';
    } else {
      // במקרה של הפרש גדול – עדיין נסמן none כדי לא ליצור partial (לפי הדרישה החדשה)
      return { ...c, bankMatchStatus: 'none', bankMatchedAmount: agg.amt, bankTransactionIds: agg.bankIds };
    }
    return { ...c, bankMatchStatus: status, bankMatchedAmount: agg.amt, bankTransactionIds: agg.bankIds };
  });

  return { updatedDetails, updatedCycles };
}

// markBankCombinedCreditCharges: זיהוי מצב בו חיוב בנק יחיד מכסה כמה מחזורי כרטיס שונים (לדוגמה שני כרטיסים). עובד רק על עסקאות שלא סומנו עדיין.
export function markBankCombinedCreditCharges(
  details: CreditDetail[],
  cycles: CreditChargeCycleSummary[],
  opts: MatchOptions = {}
): MarkResult {
  const {
    daysBeforeCharge = DEFAULT_WINDOW_CONFIG.daysBeforeCharge,
    daysAfterCharge = DEFAULT_WINDOW_CONFIG.daysAfterCharge,
    toleranceRatio = 0.01,
    minToleranceAmount = 2,
  } = opts;
  if (!cycles?.length) return { updatedDetails: details, updatedCycles: cycles || [] };

  // נשתמש רק במחזורים לפי כרטיס שעדיין לא קיבלו התאמה מלאה (full/multi/grouped)
  const perCardCycles = cycles.filter(c => c.cardLast4);
  const eligibleCycles = perCardCycles.filter(c => !c.bankMatchStatus || c.bankMatchStatus === 'none');

  // קיבוץ מחזורים לפי תאריך חיוב כדי לבדוק קומבינציות באותו תאריך
  const cyclesByDate: Record<string, CreditChargeCycleSummary[]> = {};
  eligibleCycles.forEach(c => {
    if (!c.chargeDate) return;
    if (!cyclesByDate[c.chargeDate]) cyclesByDate[c.chargeDate] = [];
    cyclesByDate[c.chargeDate].push(c);
  });

  // העתק למחזורי פלט
  const cycleMap: Record<string, CreditChargeCycleSummary> = {};
  cycles.forEach(c => { cycleMap[c.cycleKey!] = { ...c }; });

  // עזר ליצירת קומבינציות באורך k
  function combinations<T>(arr: T[], k: number): T[][] {
    const res: T[][] = [];
    function backtrack(start: number, combo: T[]) {
      if (combo.length === k) { res.push([...combo]); return; }
      for (let i = start; i < arr.length; i++) {
        combo.push(arr[i]);
        backtrack(i + 1, combo);
        combo.pop();
      }
    }
    backtrack(0, []);
    return res;
  }

  const updatedDetails = details.map(d => {
    if (d.source !== 'bank' || d.direction !== 'expense' || d.transactionType === 'credit_charge') return d;

    // מצא מחזורי כרטיס בטווח ימים ובאותו תאריך חיוב
    let matchedCombo: CreditChargeCycleSummary[] | null = null;
    let matchedChargeDate: string | null = null;

    for (const [chargeDate, cyclesArr] of Object.entries(cyclesByDate)) {
      // סנן לפי חלון ימים (התאריך של העסקה מול תאריך החיוב של הקבוצה)
      if (!isBankChargeInWindow(d.date, chargeDate, { daysBeforeCharge, daysAfterCharge })) continue;
      // סדר עדיפויות: קודם 4, אח"כ 3, אח"כ 2
      for (const size of [4, 3, 2]) {
        if (cyclesArr.length < size) continue;
        const combos = combinations(cyclesArr, size);
        for (const combo of combos) {
          const comboNet = combo.reduce((sum, c) => sum + c.netCharge, 0);
          const diff = Math.abs(d.amount - comboNet);
          const allowed = Math.max(comboNet * toleranceRatio, minToleranceAmount);
          if (diff <= allowed) {
            matchedCombo = combo;
            matchedChargeDate = chargeDate;
            break;
          }
        }
        if (matchedCombo) break;
      }
      if (matchedCombo) break;
    }

  if (!matchedCombo) return d;

    matchedCombo.forEach(c => {
      const existing = cycleMap[c.cycleKey!];
      const bankIds = existing.bankTransactionIds ? [...existing.bankTransactionIds, d.id] : [d.id];
      cycleMap[c.cycleKey!] = {
        ...existing,
        bankMatchStatus: 'grouped',
        bankMatchedAmount: c.netCharge,
        bankTransactionIds: Array.from(new Set(bankIds)),
      };
    });

    const comboSize = matchedCombo.length;
    return {
      ...d,
      transactionType: 'credit_charge_combined',
      neutral: true,
      relatedTransactionIds: matchedCombo.flatMap(c => c.transactionIds),
      matchedCycleKeys: matchedCombo.map(c => c.cycleKey!),
      matchedChargeDate: matchedChargeDate || undefined,
      matchedComboSize: comboSize,
      matchReason: `combined_${comboSize}`
    } as CreditDetail;
  });

  const updatedCycles = Object.values(cycleMap);
  return { updatedDetails, updatedCycles };
}

// Orchestrator: מבצע את כל השלבים של זיהוי חיובי אשראי (patterns + exact + שילובים 2/3/4) ומחזיר פרטי ניתוח
export async function processCreditChargeMatching(
  allDetails: CreditDetail[],
  dirHandle: FileSystemDirectoryHandle,
  opts: MatchOptions = {}
): Promise<{ details: CreditDetail[]; creditChargeCycles: CreditChargeCycleSummary[] }> {
  const cycles = computeCreditChargeCycles(allDetails);
  const windowCfg = loadCreditChargeWindowConfig();
  // שלב 1: התאמה לפי patterns + סכום מדויק למחזורי כרטיס בודדים
  const { updatedDetails: afterExact, updatedCycles: cyclesAfterExact } = await markBankCreditChargesExactWithPatterns(
    allDetails,
    cycles,
    dirHandle,
    {
      daysBeforeCharge: opts.daysBeforeCharge ?? windowCfg.daysBeforeCharge,
      daysAfterCharge: opts.daysAfterCharge ?? windowCfg.daysAfterCharge,
      toleranceRatio: opts.toleranceRatio,
      minToleranceAmount: opts.minToleranceAmount,
    }
  );
  // שלב 2: זיהוי חיובי בנק מאוחדים (2,3,4 מחזורים)
  const { updatedDetails: finalDetails, updatedCycles: finalCycles } = markBankCombinedCreditCharges(
    afterExact,
    cyclesAfterExact,
    {
      daysBeforeCharge: opts.daysBeforeCharge ?? windowCfg.daysBeforeCharge,
      daysAfterCharge: opts.daysAfterCharge ?? windowCfg.daysAfterCharge,
      toleranceRatio: opts.toleranceRatio,
      minToleranceAmount: opts.minToleranceAmount,
    }
  );
  return { details: finalDetails, creditChargeCycles: finalCycles };
}

