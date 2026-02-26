/**
 * Merchant Category Propagation
 * 
 * מנגנון הפצת קטגוריות לפי סוחר מוכר:
 * אם "רמי לוי" מסווג כ"מזון ומשקאות" בקובץ A,
 * אז "רמי לוי" בקובץ B (שבלי קטגוריה) יקבל אותה קטגוריה אוטומטית.
 * 
 * עובד על כל המקורות (אשראי + בנק), אבל ה-UI מציג רק אשראי.
 */

import type { CreditDetail } from '../types';

/** חילוץ שם סוחר מנורמל מתיאור עסקה */
export function extractMerchantName(description: string): string {
  if (!description) return '';
  const cleaned = description
    .replace(/\d{1,2}[/\-.]\d{1,2}([/\-.]\d{2,4})?/g, '') // תאריכים
    .replace(/\d{4,}/g, '') // מספרים ארוכים
    .replace(/[*#\-_]+/g, ' ')
    .trim();
  const words = cleaned.split(/\s+/).filter(w => w.length > 1);
  return words.slice(0, 3).join(' ').toLowerCase();
}

/** תוצאת הפצה לסוחר בודד */
export interface PropagationResult {
  merchantName: string;
  category: string;
  /** כמה עסקאות סווגו אוטומטית */
  propagatedCount: number;
  /** כמה עסקאות מקוריות היו מסווגות (מקור הידע) */
  sourceCount: number;
  /** % ביטחון: אחוז העסקאות המסווגות מכלל עסקאות הסוחר */
  confidence: number;
}

/** סוחר ללא קטגוריה (להצגה ב-UI) */
export interface UncategorizedMerchant {
  merchantName: string;
  /** שם תצוגה קריא — התיאור הנפוץ ביותר מהעסקאות */
  displayName: string;
  /** כמה עסקאות ללא קטגוריה */
  transactionCount: number;
  /** סכום כולל */
  totalAmount: number;
  /** מקור: credit / bank / mixed */
  source: 'credit' | 'bank' | 'mixed';
  /** עסקאות להצגה בהרחבה (עד 10) */
  transactions: Array<{ date: string; description: string; amount: number }>;
}

/**
 * הפצה אוטומטית של קטגוריות סוחר:
 * בונה מפה merchant→category מעסקאות מסווגות,
 * ומחיל על עסקאות ללא קטגוריה עם אותו שם סוחר.
 * 
 * @returns עסקאות מעודכנות + סטטיסטיקות הפצה
 */
export function propagateMerchantCategories(
  details: CreditDetail[]
): {
  updatedDetails: CreditDetail[];
  propagations: PropagationResult[];
  uncategorizedCreditMerchants: UncategorizedMerchant[];
} {
  // שלב 1: בנה מפה merchant → {category → count}
  const merchantCategoryMap = new Map<string, Map<string, number>>();
  // גם: merchant → סה"כ עסקאות (כולל ללא קטגוריה)
  const merchantTotalCount = new Map<string, number>();

  for (const tx of details) {
    const merchant = extractMerchantName(tx.description);
    if (!merchant || merchant.length <= 2) continue;

    merchantTotalCount.set(merchant, (merchantTotalCount.get(merchant) || 0) + 1);

    const category = tx.category || '';
    if (!category) continue;

    if (!merchantCategoryMap.has(merchant)) {
      merchantCategoryMap.set(merchant, new Map());
    }
    const catMap = merchantCategoryMap.get(merchant)!;
    catMap.set(category, (catMap.get(category) || 0) + 1);
  }

  // שלב 2: זהה סוחרים עם קטגוריה אחת בלבד (ללא קונפליקט)
  const reliableMerchants = new Map<string, { category: string; sourceCount: number }>();

  for (const [merchant, catMap] of merchantCategoryMap.entries()) {
    if (catMap.size !== 1) continue; // קונפליקט — לא מפיצים אוטומטית

    const [category, count] = Array.from(catMap.entries())[0];
    if (count < 2) continue; // צריך לפחות 2 עסקאות מסווגות כדי לסמוך

    reliableMerchants.set(merchant, { category, sourceCount: count });
  }

  // שלב 3: החל קטגוריה על עסקאות ללא קטגוריה
  const propagationCounts = new Map<string, number>(); // merchant → כמה עסקאות הופצו

  const updatedDetails = details.map(tx => {
    if (tx.category) return tx; // כבר יש קטגוריה

    const merchant = extractMerchantName(tx.description);
    if (!merchant || merchant.length <= 2) return tx;

    const reliable = reliableMerchants.get(merchant);
    if (!reliable) return tx;

    propagationCounts.set(merchant, (propagationCounts.get(merchant) || 0) + 1);

    return { ...tx, category: reliable.category };
  });

  // שלב 4: בנה תוצאות הפצה
  const propagations: PropagationResult[] = [];
  for (const [merchant, count] of propagationCounts.entries()) {
    const reliable = reliableMerchants.get(merchant)!;
    const total = merchantTotalCount.get(merchant) || 1;
    propagations.push({
      merchantName: merchant,
      category: reliable.category,
      propagatedCount: count,
      sourceCount: reliable.sourceCount,
      confidence: reliable.sourceCount / total,
    });
  }

  // מיין לפי כמות עסקאות שהופצו
  propagations.sort((a, b) => b.propagatedCount - a.propagatedCount);

  // שלב 5: זהה סוחרי אשראי שנשארו ללא קטגוריה
  // (רק source='credit' — לשימוש ב-UI, ללא מידע אישי)
  const uncategorizedMerchantMap = new Map<string, {
    count: number;
    totalAmount: number;
    sources: Set<string>;
    descriptionCounts: Map<string, number>;
    transactions: Array<{ date: string; description: string; amount: number }>;
  }>();

  for (const tx of updatedDetails) {
    if (tx.category) continue; // כבר מסווג
    if (tx.source !== 'credit') continue; // רק אשראי ב-UI

    const merchant = extractMerchantName(tx.description);
    if (!merchant || merchant.length <= 2) continue;

    if (!uncategorizedMerchantMap.has(merchant)) {
      uncategorizedMerchantMap.set(merchant, {
        count: 0,
        totalAmount: 0,
        sources: new Set(),
        descriptionCounts: new Map(),
        transactions: [],
      });
    }
    const entry = uncategorizedMerchantMap.get(merchant)!;
    entry.count++;
    entry.totalAmount += Math.abs(tx.amount);
    entry.sources.add(tx.source);
    entry.descriptionCounts.set(tx.description, (entry.descriptionCounts.get(tx.description) || 0) + 1);
    if (entry.transactions.length < 10) {
      entry.transactions.push({ date: tx.date, description: tx.description, amount: tx.amount });
    }
  }

  const uncategorizedCreditMerchants: UncategorizedMerchant[] = Array.from(
    uncategorizedMerchantMap.entries()
  )
    .map(([merchantName, data]) => {
      // שם תצוגה: התיאור הנפוץ ביותר — קריא ומקורי
      const mostCommon = Array.from(data.descriptionCounts.entries())
        .sort((a, b) => b[1] - a[1])[0]?.[0] || merchantName;
      return {
        merchantName,
        displayName: mostCommon,
        transactionCount: data.count,
        totalAmount: data.totalAmount,
        source: (data.sources.size > 1 ? 'mixed' :
          data.sources.has('credit') ? 'credit' : 'bank') as UncategorizedMerchant['source'],
        transactions: data.transactions,
      };
    })
    .sort((a, b) => b.transactionCount - a.transactionCount);

  return { updatedDetails, propagations, uncategorizedCreditMerchants };
}
