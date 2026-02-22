export interface CreditDetail {
  id: string;
  date: string;
  amount: number; // סכום חיוב - נשמר תמיד כערך מוחלט (חיובי)
  transactionAmount?: number; // סכום עסקה מקורי (לפני פיצול תשלומים, במט"ח וכו')
  transactionCurrency?: string; // מטבע עסקה מקורי (אם שונה מש"ח)
  description: string;
  category?: string;
  chargeDate?: string; // תאריך חיוב (optional, for credit card transactions)
  cardLast4?: string; // 4 ספרות אחרונות של כרטיס אשראי (optional, for credit card transactions)
  fileName?: string;
  rowIndex?: number;
  headerIdx?: number;
  // --- שדות חדשים לתמיכה בבנק/הכנסות/Overrides ---
  source?: 'credit' | 'bank';
  direction: 'income' | 'expense';
  directionDetected?: 'income' | 'expense';
  transactionType?: 'regular' | 'credit_charge' | 'credit_charge_combined' | 'debit' | 'cash' | 'fee';
  matchReason?: string; // סיבת התאמה (pattern+amount / amount / combined_N)
  matchedComboSize?: number; // במקרה של חיוב בנק מאוחד (כמה מחזורים)
  matchedCardLast4?: string; // כרטיס שהותאם (בחיוב בנק שזוהה)
  matchedCardLast4All?: string[]; // כל הכרטיסים שהותאמו (בחיוב מאוחד)
  neutral?: boolean;
  relatedTransactionIds?: string[];
  matchedCycleKeys?: string[]; // במקרה של חיוב בנק המכסה כמה מחזורי כרטיס
  totalChargeAmount?: number;
  userAdjustedDirection?: boolean;
  userAdjustmentNote?: string;
  // --- שדות מקורות הכנסה ---
  transactionNature?: 'income' | 'expense' | 'expense_reversal';
  incomeSourceId?: string; // מזהה כלל מקור ההכנסה שהתאים
}

export interface CreditChargeCycleSummary {
  chargeDate: string;          // תאריך חיוב (או נפילה ל-date אם אין)
  cardLast4?: string;          // כרטיס ספציפי (ריק = מחזור מאוחד)
  totalExpenses: number;       // סכום חיובי (הוצאות) מוחלטים
  totalRefunds: number;        // סכום זיכויים (income) מוחלטים
  netCharge: number;           // totalExpenses - totalRefunds
  transactionIds: string[];    // כל ה-id של העסקאות במחזור לכרטיס הזה
  // שדות זיהוי חיוב בבנק:
  bankMatchStatus?: 'full' | 'multi' | 'grouped' | 'none'; // grouped=חיוב בנק יחיד מכסה כמה מחזורים שונים
  bankMatchedAmount?: number;           // סכום חיובי הבנק ששויכו (אחרי התאמה)
  bankTransactionIds?: string[];        // מזהי עסקאות הבנק ששויכו
  cycleKey?: string;                    // מפתח פנימי (chargeDate::cardLast4)
}

export interface AnalysisResult {
  totalAmount: number;
  averageAmount: number;
  details: CreditDetail[];
  creditChargeCycles?: CreditChargeCycleSummary[];
}

// כלל קטגוריה עתידי: מאפשר הרחבה לתנאים נוספים (לדוגמה סכום מינימלי, Regex על תיאור וכו').
export interface CategoryRule {
  id: string; // מזהה ייחודי
  category: string; // הקטגוריה להחלה
  active: boolean; // האם הכלל פעיל
  createdAt: string; // ISO timestamp
  updatedAt?: string; // ISO timestamp of last update
  source?: 'user' | 'migration' | 'system';
  conditions: {
    transactionId?: string;     // התאמה לעסקה בודדת לפי מזהה
    descriptionEquals?: string; // התאמה מדויקת לתיאור
    descriptionContains?: string; // התאמה לפי מילות מפתח (מנוקות מסימנים) בתיאור
    descriptionRegex?: string;  // חלופה: התאמה לפי ביטוי רגולרי (i)
    minAmount?: number;         // סכום מינימלי להחלה
    maxAmount?: number;         // סכום מקסימלי (אופציונלי)
    // תנאים חדשים מחיפוש גלובלי:
    source?: 'credit' | 'bank'; // מקור: אשראי או בנק
    direction?: 'income' | 'expense'; // כיוון: הכנסה או הוצאה
    dateFrom?: string;          // תאריך התחלה (YYYY-MM-DD)
    dateTo?: string;            // תאריך סיום (YYYY-MM-DD)
  };
}

// סוג טבע העסקה: הכנסה, הוצאה, או ביטול הוצאה (זיכוי)
export type TransactionNature = 'income' | 'expense' | 'expense_reversal';

// כלל לזיהוי מקור הכנסה
export interface IncomeSourceRule {
  id: string;
  sourceType: 'business' | 'category' | 'transaction'; // transaction = עסקה בודדת
  description: string; // שם בית העסק או הקטגוריה
  transactionId?: string; // מזהה עסקה (כאשר sourceType === 'transaction')
  matchType: 'equals' | 'contains' | 'regex';
  isIncomeSource: boolean; // true = מקור הכנסה, false = לא מקור הכנסה (סימון שלילי)
  incomeType?: string; // סוג ההכנסה (משכורת, החזר, וכו')
  autoDetected: boolean;
  confirmedByUser: boolean;
  createdAt: string;
  monthsDetected?: number; // כמה חודשים זוהו (לזיהוי אוטומטי)
}

// מקור הכנסה פוטנציאלי שממתין לאישור משתמש
export interface PendingIncomeSource {
  description: string;
  totalAmount: number;
  monthsWithIncome: number;
  transactionCount: number;
  hasMatchingExpenses: boolean;
  matchInfo?: {
    sameVendorMatches: number;
    globalMatches: number;
    totalMonths: number;
  };
}
