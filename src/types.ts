export interface CreditDetail {
  id: string;
  date: string;
  amount: number; // נשמר תמיד כערך מוחלט (חיובי)
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
  neutral?: boolean;
  relatedTransactionIds?: string[];
  matchedCycleKeys?: string[]; // במקרה של חיוב בנק המכסה כמה מחזורי כרטיס
  totalChargeAmount?: number;
  userAdjustedDirection?: boolean;
  userAdjustmentNote?: string;
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
  source?: 'user' | 'migration' | 'system';
  conditions: {
    descriptionEquals?: string; // התאמה מדויקת לתיאור
    descriptionRegex?: string;  // חלופה: התאמה לפי ביטוי רגולרי (i)
    minAmount?: number;         // סכום מינימלי להחלה
    maxAmount?: number;         // סכום מקסימלי (אופציונלי)
  };
}
