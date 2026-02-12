/**
 * ניהול כללי מקורות הכנסה
 * - טעינה ושמירה של incomeSourceRules.json
 * - זיהוי אוטומטי של מקורות הכנסה
 * - זיהוי "התלבטויות" - בתי עסק שצריכים אישור משתמש
 */

import type { CreditDetail, IncomeSourceRule, PendingIncomeSource, TransactionNature } from '../types';

const INCOME_SOURCE_RULES_FILE = 'incomeSourceRules.json';

// ========== טעינה ושמירה ==========

/**
 * טוען כללי מקורות הכנסה מהתיקיה
 */
export async function loadIncomeSourceRules(dirHandle: FileSystemDirectoryHandle): Promise<IncomeSourceRule[]> {
  try {
    const fileHandle = await dirHandle.getFileHandle(INCOME_SOURCE_RULES_FILE);
    const file = await fileHandle.getFile();
    const data = JSON.parse(await file.text());
    if (Array.isArray(data)) return data as IncomeSourceRule[];
    return [];
  } catch {
    return [];
  }
}

/**
 * שומר כללי מקורות הכנסה לתיקיה
 */
export async function saveIncomeSourceRules(
  dirHandle: FileSystemDirectoryHandle,
  rules: IncomeSourceRule[]
): Promise<void> {
  try {
    const fileHandle = await dirHandle.getFileHandle(INCOME_SOURCE_RULES_FILE, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(rules, null, 2));
    await writable.close();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'SecurityError') {
      console.warn('אין רשאות לשמור incomeSourceRules.json');
      return;
    }
    throw err;
  }
}

// ========== לוגיקת זיהוי ==========

/**
 * מחלץ חודש/שנה מתאריך בפורמט dd/mm/yy או dd/mm/yyyy
 */
function getMonthYear(dateStr: string): string {
  const parts = dateStr.split('/');
  if (parts.length >= 3) {
    const month = parts[1];
    let year = parts[2];
    if (year.length === 2) year = '20' + year;
    return `${month.padStart(2, '0')}/${year}`;
  }
  return '';
}

/**
 * מבנה נתונים לניתוח בית עסק
 */
interface VendorAnalysis {
  description: string;
  // כניסות (זיכויים) לפי חודש
  incomeByMonth: Map<string, number>;
  // יציאות (חיובים) לפי חודש
  expenseByMonth: Map<string, number>;
  // עסקאות בודדות לפי חודש (לבדיקת התאמה ברמת עסקה)
  expenseTransactionsByMonth: Map<string, number[]>;
  incomeTransactionsByMonth: Map<string, number[]>;
  // סכום כולל
  totalIncome: number;
  totalExpense: number;
  // מונים לעסקאות
  incomeTransactionCount: number;
  expenseTransactionCount: number;
  // עסקאות
  transactions: CreditDetail[];
}

/**
 * מנתח את כל העסקאות ומחזיר ניתוח לפי בית עסק
 */
function analyzeVendors(details: CreditDetail[]): Map<string, VendorAnalysis> {
  const vendors = new Map<string, VendorAnalysis>();

  for (const d of details) {
    const desc = d.description;
    if (!desc) continue;

    if (!vendors.has(desc)) {
      vendors.set(desc, {
        description: desc,
        incomeByMonth: new Map(),
        expenseByMonth: new Map(),
        expenseTransactionsByMonth: new Map(),
        incomeTransactionsByMonth: new Map(),
        totalIncome: 0,
        totalExpense: 0,
        incomeTransactionCount: 0,
        expenseTransactionCount: 0,
        transactions: [],
      });
    }

    const vendor = vendors.get(desc)!;
    vendor.transactions.push(d);

    const monthYear = getMonthYear(d.date);
    if (!monthYear) continue;

    // direction מציין את כיוון הזרימה: income = כסף נכנס, expense = כסף יוצא
    if (d.direction === 'income') {
      vendor.totalIncome += d.amount;
      vendor.incomeTransactionCount++;
      vendor.incomeByMonth.set(
        monthYear,
        (vendor.incomeByMonth.get(monthYear) || 0) + d.amount
      );
      // שמור עסקאות בודדות לפי חודש
      if (!vendor.incomeTransactionsByMonth.has(monthYear)) {
        vendor.incomeTransactionsByMonth.set(monthYear, []);
      }
      vendor.incomeTransactionsByMonth.get(monthYear)!.push(d.amount);
    } else {
      vendor.totalExpense += d.amount;
      vendor.expenseTransactionCount++;
      vendor.expenseByMonth.set(
        monthYear,
        (vendor.expenseByMonth.get(monthYear) || 0) + d.amount
      );
      // שמור עסקאות בודדות לפי חודש
      if (!vendor.expenseTransactionsByMonth.has(monthYear)) {
        vendor.expenseTransactionsByMonth.set(monthYear, []);
      }
      vendor.expenseTransactionsByMonth.get(monthYear)!.push(d.amount);
    }
  }

  return vendors;
}

/**
 * בודק אם יש יציאה מקבילה באותו חודש (לזיהוי גביה לא מאושרת / העברה)
 * 
 * בודק ברמת עסקה בודדת (±3₪) - לא על סכום כולל!
 * דוגמה: אם יש 2 הוצאות של 29₪ (סה"כ 58₪) והכנסה של 29₪,
 * הגרסה הישנה לא הייתה תופסת (58≠29), הגרסה החדשה כן (29≈29).
 */
function hasMatchingExpenseInMonth(
  vendor: VendorAnalysis,
  monthYear: string,
  incomeAmount: number,
  tolerance: number = 3 // סטיית סכום מותרת - הוגדל ל-3₪
): boolean {
  // בדיקה ברמת עסקה בודדת: האם יש עסקת הוצאה באותו סכום (±tolerance)?
  const expenseTransactions = vendor.expenseTransactionsByMonth.get(monthYear);
  if (expenseTransactions) {
    for (const expenseAmount of expenseTransactions) {
      if (Math.abs(expenseAmount - incomeAmount) <= tolerance) {
        return true;
      }
    }
  }
  return false;
}

/**
 * בונה אינדקס של סכומי הוצאות לפי חודש וסכום
 * מאפשר חיפוש יעיל O(1) במקום O(n) לכל בדיקה
 * 
 * האינדקס שומר סכומים מרובים לכל הוצאה כדי לאפשר התאמה עם טולרנס
 */
function buildExpenseIndex(vendors: Map<string, VendorAnalysis>): Map<string, Set<string>> {
  // מפתח: "monthYear|amount" (מעוגל ל-0.5 ש"ח), ערך: סט של תיאורי בתי עסק
  const index = new Map<string, Set<string>>();
  
  const addToIndex = (monthYear: string, amount: number, desc: string) => {
    // שומר את הסכום המעוגל ל-0.5 ש"ח
    const roundedAmount = Math.round(amount * 2) / 2;
    const key = `${monthYear}|${roundedAmount}`;
    
    if (!index.has(key)) {
      index.set(key, new Set());
    }
    index.get(key)!.add(desc);
  };
  
  for (const [desc, vendor] of vendors) {
    for (const [monthYear, amount] of vendor.expenseByMonth) {
      // שמור את הסכום המקורי
      addToIndex(monthYear, amount, desc);
      // שמור גם סכומים קרובים לטולרנס (עד 3 ש"ח)
      for (let delta = -6; delta <= 6; delta++) {
        addToIndex(monthYear, amount + delta * 0.5, desc);
      }
    }
  }
  
  return index;
}

/**
 * בודק אם יש יציאה מקבילה באותו חודש - בכל בית עסק (לא רק באותו vendor)
 * זה מזהה מצבים כמו: חיוב "תרומה" 55₪ + זיכוי "החזר חיוב טכני" 55₪
 * או: חיוב "דמי כרטיס" 17.9₪ + זיכוי "MAX" 17.9₪
 * 
 * משתמש באינדקס לחיפוש יעיל O(1) במקום O(n)
 */
function hasMatchingExpenseGlobally(
  expenseIndex: Map<string, Set<string>>,
  currentVendorDesc: string,
  monthYear: string,
  incomeAmount: number
): boolean {
  // מעגל ל-0.5 ש"ח כמו באינדקס
  const roundedAmount = Math.round(incomeAmount * 2) / 2;
  const key = `${monthYear}|${roundedAmount}`;
  const vendors = expenseIndex.get(key);
  
  if (vendors) {
    // בדוק אם יש בית עסק אחר עם הוצאה בסכום הזה
    for (const desc of vendors) {
      if (desc !== currentVendorDesc) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * זיהוי אוטומטי של מקורות הכנסה
 * 
 * קריטריונים:
 * 1. נכנס כסף במשך לפחות 3 חודשים שונים
 * 2. אין יציאה מקבילה באותו סכום באותם חודשים
 */
export function detectAutoIncomeSources(
  details: CreditDetail[],
  existingRules: IncomeSourceRule[]
): IncomeSourceRule[] {
  const vendors = analyzeVendors(details);
  const expenseIndex = buildExpenseIndex(vendors); // בנה אינדקס פעם אחת - O(n)
  const newRules: IncomeSourceRule[] = [];

  // צור סט של תיאורים שכבר יש להם כלל
  const existingDescriptions = new Set(existingRules.map(r => r.description));

  for (const [desc, vendor] of vendors) {
    // דלג אם כבר יש כלל לבית עסק זה
    if (existingDescriptions.has(desc)) continue;

    // === קריטריון 0: בדיקת יחס הוצאות/הכנסות ויחס עסקאות ===
    // אם יש יותר הוצאות מהכנסות - זה לא מקור הכנסה (למשל: דן חברה לתחבורה ציבורית)
    if (vendor.totalExpense > vendor.totalIncome) continue;
    
    // אם מספר עסקאות ההוצאה >= מספר עסקאות ההכנסה - זה לא מקור הכנסה
    // (אם יש 10 חיובים ו-3 החזרים, ברור שזה לא הכנסה)
    if (vendor.expenseTransactionCount >= vendor.incomeTransactionCount) continue;

    // בדוק כמה חודשים נכנס כסף
    const monthsWithIncome = vendor.incomeByMonth.size;
    
    // קריטריון 1: לפחות 3 חודשים
    if (monthsWithIncome < 3) continue;

    // קריטריון 2: בדוק שאין יציאות מקבילות באותם חודשים
    // במקום לעצור בהתאמה ראשונה, סופרים כמה חודשים יש התאמה
    let sameVendorMatches = 0;
    let globalMatches = 0;
    
    for (const [monthYear, incomeAmount] of vendor.incomeByMonth) {
      // בדיקה באותו בית עסק
      if (hasMatchingExpenseInMonth(vendor, monthYear, incomeAmount)) {
        sameVendorMatches++;
      }
      // בדיקה גלובלית - בכל בתי העסק האחרים
      // זה מזהה מצבים כמו: חיוב "תרומה" 55₪ + זיכוי "החזר חיוב טכני" 55₪
      else if (hasMatchingExpenseGlobally(expenseIndex, desc, monthYear, incomeAmount)) {
        globalMatches++;
      }
    }

    // חשב יחס התאמות
    const totalMonths = vendor.incomeByMonth.size;
    const sameVendorRatio = sameVendorMatches / totalMonths;
    const globalRatio = globalMatches / totalMonths;
    // יחס משולב: כל התאמה (מקומית או גלובלית) נספרת
    const combinedRatio = (sameVendorMatches + globalMatches) / totalMonths;
    
    // אם יש התאמה ב-40%+ מהחודשים (סה"כ) - זה כנראה לא הכנסה אמיתית
    // זה מזהה מקרים כמו: MAX +17.9 מול דמי כרטיס -17.9
    const hasMatchingExpenses = sameVendorRatio >= 0.5 || globalRatio >= 0.4 || combinedRatio >= 0.4;
    
    if (hasMatchingExpenses) continue;

    // זה מקור הכנסה! צור כלל חדש
    const newRule: IncomeSourceRule = {
      id: crypto.randomUUID(),
      sourceType: 'business',
      description: desc,
      matchType: 'equals',
      isIncomeSource: true,
      autoDetected: true,
      confirmedByUser: false,
      createdAt: new Date().toISOString(),
      monthsDetected: monthsWithIncome,
    };

    newRules.push(newRule);
  }

  return newRules;
}

/**
 * זיהוי "התלבטויות" - בתי עסק עם סכום חיובי שלא עברו את הקריטריונים
 */
export function detectPendingIncomeSources(
  details: CreditDetail[],
  existingRules: IncomeSourceRule[]
): PendingIncomeSource[] {
  const vendors = analyzeVendors(details);
  const expenseIndex = buildExpenseIndex(vendors); // בנה אינדקס פעם אחת - O(n)
  const pending: PendingIncomeSource[] = [];

  // צור סט של תיאורים שכבר יש להם כלל
  const existingDescriptions = new Set(existingRules.map(r => r.description));

  for (const [desc, vendor] of vendors) {
    // דלג אם כבר יש כלל לבית עסק זה
    if (existingDescriptions.has(desc)) continue;

    // בדוק אם הסכום הכולל חיובי (יותר כניסות מיציאות)
    const netAmount = vendor.totalIncome - vendor.totalExpense;
    if (netAmount <= 0) continue;

    // בדוק אם יש חודשים עם כניסות
    const monthsWithIncome = vendor.incomeByMonth.size;
    if (monthsWithIncome === 0) continue;

    // בדוק אם יש יציאות מקבילות - סופרים כמה חודשים יש התאמה
    let sameVendorMatches = 0;
    let globalMatches = 0;
    
    for (const [monthYear, incomeAmount] of vendor.incomeByMonth) {
      // בדיקה באותו בית עסק
      if (hasMatchingExpenseInMonth(vendor, monthYear, incomeAmount)) {
        sameVendorMatches++;
      }
      // בדיקה גלובלית - בכל בתי העסק האחרים
      else if (hasMatchingExpenseGlobally(expenseIndex, desc, monthYear, incomeAmount)) {
        globalMatches++;
      }
    }

    // חשב יחס התאמות
    const totalMonths = vendor.incomeByMonth.size;
    const sameVendorRatio = sameVendorMatches / totalMonths;
    const globalRatio = globalMatches / totalMonths;
    
    // יש התאמה משמעותית אם:
    // - באותו בית עסק: 30%+ מהחודשים (סף נמוך יותר להתלבטות)
    // - בבית עסק אחר: 50%+ מהחודשים
    const hasSignificantMatches = sameVendorRatio >= 0.3 || globalRatio >= 0.5;
    const matchInfo = {
      sameVendorMatches,
      globalMatches,
      totalMonths,
    };

    // אם יש פחות מ-3 חודשים או יש יציאות מקבילות משמעותיות, זה "התלבטות"
    if (monthsWithIncome < 3 || hasSignificantMatches) {
      pending.push({
        description: desc,
        totalAmount: netAmount,
        monthsWithIncome,
        transactionCount: vendor.transactions.filter(t => t.direction === 'income').length,
        hasMatchingExpenses: hasSignificantMatches,
        matchInfo, // מידע נוסף לדיבוג
      });
    }
  }

  // מיין לפי סכום (מהגדול לקטן)
  pending.sort((a, b) => b.totalAmount - a.totalAmount);

  return pending;
}

// ========== יישום כללים על עסקאות ==========

/**
 * מחיל כללי מקורות הכנסה על עסקאות
 * - עסקאות מבתי עסק או קטגוריות שזוהו כמקור הכנסה יקבלו transactionNature = 'income'
 * - שאר העסקאות יקבלו 'expense' (ברירת מחדל)
 */
export function applyIncomeSourceRules(
  details: CreditDetail[],
  rules: IncomeSourceRule[]
): CreditDetail[] {

  // בנה מפות של תיאורים וקטגוריות שהם מקורות הכנסה
  const incomeSourceBusinesses = new Map<string, IncomeSourceRule>();
  const incomeSourceCategories = new Map<string, IncomeSourceRule>();
  // כללים לעסקאות בודדות - קדימות הכי גבוהה
  const transactionRules = new Map<string, IncomeSourceRule>();
  // כללים שלילית - עסקים/קטגוריות שסומנו כ"לא הכנסה"
  const notIncomeSourceBusinesses = new Set<string>();
  const notIncomeSourceCategories = new Set<string>();
  
  for (const rule of rules) {
    // כללים לעסקאות בודדות - יש להם קדימות הכי גבוהה
    if (rule.sourceType === 'transaction' && rule.transactionId) {
      transactionRules.set(rule.transactionId, rule);
      continue;
    }
    
    if (rule.isIncomeSource) {
      if (rule.sourceType === 'category') {
        incomeSourceCategories.set(rule.description, rule);
      } else {
        // ברירת מחדל: business (לתאימות אחורה)
        incomeSourceBusinesses.set(rule.description, rule);
      }
    } else {
      // כלל שלילי - סומן כ"לא הכנסה"
      if (rule.sourceType === 'category') {
        notIncomeSourceCategories.add(rule.description);
      } else {
        notIncomeSourceBusinesses.add(rule.description);
      }
    }
  }

  return details.map(d => {
    // ברירת מחדל: הכל הוצאה
    let nature: TransactionNature = 'expense';
    let incomeSourceId: string | undefined;
    // direction נשאר כפי שהוא - מציין את כיוון הזרימה הפיננסית האמיתית
    // בחישובים נשתמש ב-direction כדי לדעת אם להוסיף או לקזז

    // בדוק קודם כלל ברמת עסקה בודדת - קדימות הכי גבוהה
    const transactionRule = transactionRules.get(d.id);
    if (transactionRule) {
      // יש כלל ספציפי לעסקה זו
      if (transactionRule.isIncomeSource) {
        nature = 'income';
      } else {
        // סומן כ"לא הכנסה" - התנהג כמו הוצאה
        nature = d.direction === 'income' ? 'expense_reversal' : 'expense';
      }
      incomeSourceId = transactionRule.id;
      return {
        ...d,
        transactionNature: nature,
        incomeSourceId,
      };
    }

    // בדוק אם סומן כ"לא הכנסה" - אם כן, תמיד הוצאה/ביטול הוצאה
    const isMarkedAsNotIncome = notIncomeSourceBusinesses.has(d.description) ||
      (d.category && notIncomeSourceCategories.has(d.category));
    
    if (isMarkedAsNotIncome) {
      // סומן במפורש כלא-הכנסה
      if (d.direction === 'income') {
        // כסף נכנס ממקור שסומן כ"לא הכנסה" = ביטול הוצאה (זיכוי)
        nature = 'expense_reversal';
      } else {
        // כסף יוצא = הוצאה רגילה
        nature = 'expense';
      }
    } else {
      // בדוק קודם לפי בית עסק (קדימות גבוהה יותר)
      const businessRule = incomeSourceBusinesses.get(d.description);
      if (businessRule) {
        // משתמש סימן את בית העסק כמקור הכנסה - כל העסקאות שלו שייכות להכנסות
        // direction קובע אם להוסיף (income) או לקזז (expense) מסה"כ ההכנסות
        nature = 'income';
        incomeSourceId = businessRule.id;
      } else {
        // בדוק לפי קטגוריה
        const categoryRule = d.category ? incomeSourceCategories.get(d.category) : undefined;
        if (categoryRule) {
          // משתמש סימן את הקטגוריה כמקור הכנסה - כל העסקאות שלה שייכות להכנסות
          nature = 'income';
          incomeSourceId = categoryRule.id;
        } else if (d.direction === 'income') {
          // נכנס כסף אבל לא מקור הכנסה מוכר = ביטול הוצאה
          nature = 'expense_reversal';
        }
      }
    }

    return {
      ...d,
      transactionNature: nature,
      incomeSourceId,
    };
  });
}

// ========== פעולות CRUD ==========

/**
 * הוספת כלל מקור הכנסה חדש (לבית עסק)
 */
export async function addIncomeSourceRule(
  dirHandle: FileSystemDirectoryHandle,
  description: string,
  incomeType?: string
): Promise<IncomeSourceRule> {
  const rules = await loadIncomeSourceRules(dirHandle);
  
  const newRule: IncomeSourceRule = {
    id: crypto.randomUUID(),
    sourceType: 'business',
    description,
    matchType: 'equals',
    isIncomeSource: true,
    incomeType,
    autoDetected: false,
    confirmedByUser: true,
    createdAt: new Date().toISOString(),
  };

  rules.push(newRule);
  await saveIncomeSourceRules(dirHandle, rules);
  
  return newRule;
}

/**
 * הוספת כלל מקור הכנסה חדש לקטגוריה
 */
export async function addCategoryIncomeSourceRule(
  dirHandle: FileSystemDirectoryHandle,
  categoryName: string,
  incomeType?: string
): Promise<IncomeSourceRule> {
  const rules = await loadIncomeSourceRules(dirHandle);
  
  const newRule: IncomeSourceRule = {
    id: crypto.randomUUID(),
    sourceType: 'category',
    description: categoryName,
    matchType: 'equals',
    isIncomeSource: true,
    incomeType,
    autoDetected: false,
    confirmedByUser: true,
    createdAt: new Date().toISOString(),
  };

  rules.push(newRule);
  await saveIncomeSourceRules(dirHandle, rules);
  
  return newRule;
}

/**
 * אישור כלל שזוהה אוטומטית
 */
export async function confirmIncomeSourceRule(
  dirHandle: FileSystemDirectoryHandle,
  ruleId: string,
  incomeType?: string
): Promise<void> {
  const rules = await loadIncomeSourceRules(dirHandle);
  const rule = rules.find(r => r.id === ruleId);
  
  if (rule) {
    rule.confirmedByUser = true;
    if (incomeType) rule.incomeType = incomeType;
    await saveIncomeSourceRules(dirHandle, rules);
  }
}

/**
 * הסרת כלל מקור הכנסה
 */
export async function removeIncomeSourceRule(
  dirHandle: FileSystemDirectoryHandle,
  ruleId: string
): Promise<void> {
  const rules = await loadIncomeSourceRules(dirHandle);
  const filtered = rules.filter(r => r.id !== ruleId);
  await saveIncomeSourceRules(dirHandle, filtered);
}

/**
 * סימון בית עסק כ"לא מקור הכנסה" (לדלג עליו בעתיד)
 */
export async function markAsNotIncomeSource(
  dirHandle: FileSystemDirectoryHandle,
  description: string,
  sourceType: 'business' | 'category' = 'business'
): Promise<void> {
  const rules = await loadIncomeSourceRules(dirHandle);
  
  const newRule: IncomeSourceRule = {
    id: crypto.randomUUID(),
    sourceType,
    description,
    matchType: 'equals',
    isIncomeSource: false, // סימון שזה לא מקור הכנסה
    autoDetected: false,
    confirmedByUser: true,
    createdAt: new Date().toISOString(),
  };

  rules.push(newRule);
  await saveIncomeSourceRules(dirHandle, rules);
}
