/**
 * Parser לעסקאות אשראי מגיליון Excel.
 * מזהה את הפורמטים של ישראכרט, מקס, כאל, ופועלים.
 */

import type { CreditDetail } from '../types';

export async function parseCreditDetailsFromSheet(sheetData: unknown[][], fileName: string): Promise<CreditDetail[]> {
  // sheetData הוא כבר מערך דו-ממדי (לא sheet של XLSX)
  const json: unknown[][] = sheetData;
  // Find the header row index by searching for a row with known column names
  let headerIdx = -1;
  let headers: string[] = [];
  let chargeDateFromHeader = '';
  let cardLast4FromHeader = '';
  for (let i = 0; i < json.length; i++) {
    // נרמל שבירות שורה (Alt+Enter באקסל) לרווח - חשוב לפורמט כאל ופועלים
    const row = json[i].map((cell) => (cell != null ? String(cell) : '').replace(/\r?\n/g, ' ').trim());
    // --- extract charge date and card last 4 from header lines if present ---
    if (!chargeDateFromHeader) {
      const match = row.join(' ').match(/עסקאות לחיוב ב-(\d{2}\/\d{2}\/\d{4})/);
      if (match) chargeDateFromHeader = match[1];
    }
    if (!cardLast4FromHeader) {
      const joined = row.join(' ');
      // פורמט ישראכרט/מקס: "המסתיים ב-1234"
      // פורמט כאל: "לכרטיס ויזה 1234" או "כאל 123456 לכרטיס ויזה 1234"
      const match = joined.match(/המסתיים ב-(\d{4})/) ||
                    joined.match(/לכרטיס\s+\S+\s+(\d{4})\b/);
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
  const normalizedHeaders = headers.map(h => h.replace(/"/g, '').replace(/\r?\n/g, ' ').trim());
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
    const description = rowObj['שם בית העסק'] || rowObj['שם בית עסק'] || rowObj['בית עסק'] || '';
    // העדפה לסכום חיוב - זה מה שבאמת יורד מהחשבון
    // סכום עסקה נשמר בנפרד להצגה (תשלומים, מט"ח וכו')
    const chargeAmountRaw = rowObj['סכום חיוב'] || rowObj['סכוםחיוב'] || rowObj['סכום בשח'] || '';
    const transactionAmountRaw = rowObj['סכום עסקה'] || rowObj['סכוםעסקה'] || '';
    const transactionCurrency = rowObj['מטבע עסקה'] || rowObj['מטבעעסקה'] || '';
    
    // אם יש סכום חיוב - השתמש בו. אם אין אבל יש סכום עסקה - בדוק אם זו עסקת צבירה
    let amount = chargeAmountRaw;
    if (!chargeAmountRaw && transactionAmountRaw) {
      // placeholder for potential future handling of accumulation transactions
    }
    const category = rowObj['ענף'] || rowObj['קטגוריה'] || '';
    // --- extract charge date and card last 4 ---
    let chargeDate = rowObj['תאריך חיוב'] || rowObj['מועד חיוב'] || chargeDateFromHeader || '';
    const cardLast4 = rowObj['4 ספרות אחרונות של כרטיס האשראי'] || rowObj['4 ספרות אחרונות'] || cardLast4FromHeader || '';
    
    // --- זיהוי עסקאות בחיוב מיידי (משיכת מזומן וכד') ---
    const transactionType = rowObj['סוג עסקה'] || rowObj['סוגעסקה'] || '';
    const notes = rowObj['הערות'] || '';
    const isImmediateCharge = transactionType.includes('משיכת מזומן') 
      || transactionType.includes('חיוב מיידי')
      || notes.includes('מיידי') || notes.includes('מידי');
    if (isImmediateCharge) {
      // בחיוב מיידי: תאריך החיוב = תאריך העסקה
      chargeDate = date;
    }
    // Special handling for Poalim format: amount may be in the form '₪ 11.68'
    if (amount && amount.includes('₪')) {
      amount = amount.replace('₪', '').trim();
    }
    // Remove currency symbols and spaces
    amount = amount.replace(/[^\d.,-]/g, '').replace(',', '.');
    // Normalize date (support both dd-mm-yyyy and dd/mm/yy and Excel serial numbers)
    // תומך גם בסריאלים עשרוניים מ-XLS (כגון 46059.0004...)
    {
      const numVal = parseFloat(date);
      if (!isNaN(numVal) && numVal > 1 && numVal < 60000 && /^\d+(\.\d+)?$/.test(date)) {
        const excelEpoch = Date.UTC(1899, 11, 30);
        const serial = Math.floor(numVal);
        const d = new Date(excelEpoch + serial * 24 * 60 * 60 * 1000);
        date = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(-2)}`;
      } else {
        date = date.replace(/\./g, '/').replace(/-/g, '/');
      }
    }
    // --- normalize chargeDate ---
    if (chargeDate) {
      const numVal = parseFloat(chargeDate);
      if (!isNaN(numVal) && numVal > 1 && numVal < 60000 && /^\d+(\.\d+)?$/.test(chargeDate)) {
        const excelEpoch = Date.UTC(1899, 11, 30);
        const serial = Math.floor(numVal);
        const d = new Date(excelEpoch + serial * 24 * 60 * 60 * 1000);
        chargeDate = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(-2)}`;
      } else {
        chargeDate = chargeDate.replace(/\./g, '/').replace(/-/g, '/');
      }
    }
    if (date && amount && description) {
      const raw = parseFloat(amount);
      if (isNaN(raw)) continue;
      const direction: 'income' | 'expense' = raw < 0 ? 'income' : 'expense';
      const amountAbs = Math.abs(raw);
      
      // חשב סכום עסקה מקורי (אם שונה מסכום החיוב)
      let origTransactionAmount: number | undefined;
      if (transactionAmountRaw) {
        const cleanTransAmount = transactionAmountRaw.replace(/[^\d.,-]/g, '').replace(',', '.');
        const parsedTransAmount = Math.abs(parseFloat(cleanTransAmount));
        if (!isNaN(parsedTransAmount) && parsedTransAmount !== amountAbs) {
          origTransactionAmount = parsedTransAmount;
        }
      }
      
      details.push({
        id: `${fileName}-${i}-${raw}-${description}`,
        date,
        amount: amountAbs,
        transactionAmount: origTransactionAmount,
        transactionCurrency: transactionCurrency || undefined,
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
