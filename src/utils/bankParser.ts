import type { CreditDetail } from '../types';

function normalizeDate(input: string | number): string {
  let date = String(input ?? '').trim();
  if (!date) return '';
  if (/^\d{1,5}$/.test(date)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const serial = parseInt(date, 10);
    if (!isNaN(serial)) {
      const d = new Date(excelEpoch + serial * 24 * 60 * 60 * 1000);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      return `${dd}/${mm}/${String(yyyy).slice(-2)}`; // dd/mm/yy
    }
  }
  date = date.replace(/\./g, '/').replace(/-/g, '/');
  return date;
}

function parseNumber(s: string | number): number {
  if (s == null) return 0;
  let str = String(s).trim();
  // remove spaces and common currency/rtl marks
  str = str.replace(/\s+/g, '').replace(/[₪‏]/g, '');
  const hasComma = /,/.test(str);
  const hasDot = /\./.test(str);
  if (hasComma && hasDot) {
    // e.g. 2,989.38 -> remove thousands commas
    str = str.replace(/,/g, '');
  } else if (hasComma && !hasDot) {
    // e.g. 2,989 or 50,00 where comma is decimal
    // assume comma is decimal separator
    str = str.replace(/,/g, '.');
  }
  // keep only digits, dot, minus
  str = str.replace(/[^0-9.-]/g, '');
  const f = parseFloat(str);
  return isNaN(f) ? 0 : f;
}

export function parseBankStatementFromSheet(sheetData: (string | number)[][], fileName: string, sheetName: string): Promise<CreditDetail[]> {
  // sheetData הוא כבר מערך דו-ממדי (מ-xlsxMinimal)
  const json: (string | number)[][] = sheetData;
  if (!json?.length) return Promise.resolve([]);

  // מצא שורת כותרת: מחפש עמודות מוכרות
  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(json.length, 30); i++) {
    const row = (json[i] || []).map((c: string | number) => String(c ?? '').replace(/"/g, '').replace(/\r?\n/g, '').trim());
    const hasDate = row.some((h: string) => /תאריך/.test(h) || /Date/i.test(h));
    // הרחבת זיהוי שדה תיאור: תיאור/תאור/פירוט/פרטים/הפעולה/תיאור פעולה
    const hasDesc = row.some((h: string) => /(תיאור פעולה|הפעולה|תיאור|תאור|פירוט|פרטים|Description)/i.test(h));
    const hasDebitCredit = row.some((h: string) => /חובה\/זכות/.test(h)) || (row.some((h: string) => /חובה|Debit/i.test(h)) && row.some((h: string) => /זכות|Credit/i.test(h)));
    const hasAmount = row.some((h: string) => /סכום|Amount/i.test(h));
    if ((hasDate && hasDesc && (hasDebitCredit || hasAmount))) {
      headerIdx = i; headers = row; break;
    }
  }
  if (headerIdx === -1) return Promise.resolve([]);

  const normalizedHeaders = headers.map(h => h.replace(/"/g, '').replace(/\r?\n/g, '').trim());
  const idxOf = (nameCandidates: string[]) => {
    for (let i = 0; i < normalizedHeaders.length; i++) {
      const h = normalizedHeaders[i];
      if (nameCandidates.some(n => h.includes(n))) return i;
    }
    return -1;
  };

  const dateIdx = idxOf(['תאריך', 'Date']);
  // הרחבת מועמדים לשדה תיאור
  const descIdx = idxOf(['תיאור פעולה', 'הפעולה', 'תיאור', 'תאור', 'פירוט', 'פרטים', 'Description']);
  const actionIdx = idxOf(['הפעולה']);
  const detailsIdx = idxOf(['פרטים', 'פירוט', 'תיאור פעולה']);
  const debitIdx = idxOf(['חובה', 'Debit']);
  const creditIdx = idxOf(['זכות', 'Credit']);
  const amountIdx = idxOf(['סכום', 'Amount']);

  const details: CreditDetail[] = [];
  for (let r = headerIdx + 1; r < json.length; r++) {
    const row = json[r] || [];
    const dateRaw = dateIdx >= 0 ? row[dateIdx] : '';
    const date = normalizeDate(dateRaw);

    // תיאור: אם קיימים גם "פרטים" וגם "הפעולה" – לשלב שניהם. אחרת פרטים, ואם אין אז תיאור, ואם אין אז הפעולה
    const descriptionParts: string[] = [];
    if (!descriptionParts.length && descIdx >= 0) {
      const v = row[descIdx];
      if (v != null && String(v).trim()) descriptionParts.push(String(v).trim());
    }
    if (detailsIdx >= 0) {
      const v = row[detailsIdx];
      if (v != null && String(v).trim()) descriptionParts.push(String(v).trim());
    }
    if (actionIdx >= 0) {
      const v = row[actionIdx];
      if (v != null) {
        const trimmed = String(v).trim();
        if (trimmed && !descriptionParts.includes(trimmed)) descriptionParts.push(trimmed);
      }
    }
    const descriptionRaw = descriptionParts.join(' - ');
    const description = String(descriptionRaw ?? '').trim();

    if (!date || !description) continue;

    let direction: 'income' | 'expense' = 'expense';
    let amountAbs = 0;

    if (debitIdx >= 0 || creditIdx >= 0) {
      const debit = debitIdx >= 0 ? parseNumber(row[debitIdx]) : 0;
      const credit = creditIdx >= 0 ? parseNumber(row[creditIdx]) : 0;
      if (debit > 0 && credit <= 0) { direction = 'expense'; amountAbs = Math.abs(debit); }
      else if (credit > 0 && debit <= 0) { direction = 'income'; amountAbs = Math.abs(credit); }
      else if (debit > 0 && credit > 0) { // העדף החיובי הגדול
        if (debit >= credit) { direction = 'expense'; amountAbs = Math.abs(debit); }
        else { direction = 'income'; amountAbs = Math.abs(credit); }
      } else {
        // fallback לסכום כללי
        const amt = amountIdx >= 0 ? parseNumber(row[amountIdx]) : 0;
        direction = amt < 0 ? 'expense' : 'income';
        amountAbs = Math.abs(amt);
      }
    } else if (amountIdx >= 0) {
      const amt = parseNumber(row[amountIdx]);
      direction = amt < 0 ? 'expense' : 'income';
      amountAbs = Math.abs(amt);
    } else {
      continue; // אין סכום
    }

    const id = `${'bank'}|${fileName}|${sheetName}|${r}|${date}|${amountAbs.toFixed(2)}|${description.trim().toLowerCase()}`;

    details.push({
      id,
      date,
      amount: amountAbs,
      description,
      source: 'bank',
      direction,
      directionDetected: direction,
      fileName,
      rowIndex: r,
      headerIdx,
    });
  }

  return Promise.resolve(details);
}

// CSV parser: rows are already split into cells
export function parseBankStatementFromCSV(rows: string[][], fileName: string): CreditDetail[] {
  if (!rows?.length) return [];

  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = (rows[i] || []).map((c: string) => String(c ?? '').replace(/"/g, '').replace(/\r?\n/g, '').trim());
    const hasDate = row.some((h: string) => /תאריך/.test(h) || /Date/i.test(h));
    const hasDesc = row.some((h: string) => /(תיאור פעולה|הפעולה|תיאור|תאור|פירוט|פרטים|Description)/i.test(h));
    const hasDebitCredit = row.some((h: string) => /חובה\/זכות/.test(h)) || (row.some((h: string) => /חובה|Debit/i.test(h)) && row.some((h: string) => /זכות|Credit/i.test(h)));
    const hasAmount = row.some((h: string) => /סכום|Amount/i.test(h));
    if ((hasDate && hasDesc && (hasDebitCredit || hasAmount))) { headerIdx = i; headers = row; break; }
  }
  if (headerIdx === -1) return [];

  const normalizedHeaders = headers.map(h => h.replace(/"/g, '').replace(/\r?\n/g, '').trim());
  const idxOf = (nameCandidates: string[]) => {
    for (let i = 0; i < normalizedHeaders.length; i++) {
      const h = normalizedHeaders[i];
      if (nameCandidates.some(n => h.includes(n))) return i;
    }
    return -1;
  };

  const dateIdx = idxOf(['תאריך', 'Date']);
  const descIdx = idxOf(['תיאור פעולה', 'הפעולה', 'תיאור', 'תאור', 'פירוט', 'פרטים', 'Description']);
  const actionIdx = idxOf(['הפעולה']);
  const detailsIdx = idxOf(['פרטים', 'פירוט', 'תיאור פעולה']);
  const debitIdx = idxOf(['חובה', 'Debit']);
  const creditIdx = idxOf(['זכות', 'Credit']);
  const amountIdx = idxOf(['סכום', 'Amount']);

  const details: CreditDetail[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const dateRaw = dateIdx >= 0 ? row[dateIdx] : '';
    const date = normalizeDate(dateRaw);

    const descriptionParts: string[] = [];
    if (!descriptionParts.length && descIdx >= 0) {
      const v = row[descIdx];
      if (v != null && String(v).trim()) descriptionParts.push(String(v).trim());
    }
    if (detailsIdx >= 0) {
      const v = row[detailsIdx];
      if (v != null && String(v).trim()) descriptionParts.push(String(v).trim());
    }
    if (actionIdx >= 0) {
      const v = row[actionIdx];
      if (v != null) {
        const trimmed = String(v).trim();
        if (trimmed && !descriptionParts.includes(trimmed)) descriptionParts.push(trimmed);
      }
    }
    const descriptionRaw = descriptionParts.join(' - ');
    const description = String(descriptionRaw ?? '').trim();

    if (!date || !description) continue;

    let direction: 'income' | 'expense' = 'expense';
    let amountAbs = 0;

    if (debitIdx >= 0 || creditIdx >= 0) {
      const debit = debitIdx >= 0 ? parseNumber(row[debitIdx]) : 0;
      const credit = creditIdx >= 0 ? parseNumber(row[creditIdx]) : 0;
      if (debit > 0 && credit <= 0) { direction = 'expense'; amountAbs = Math.abs(debit); }
      else if (credit > 0 && debit <= 0) { direction = 'income'; amountAbs = Math.abs(credit); }
      else if (debit > 0 && credit > 0) {
        if (debit >= credit) { direction = 'expense'; amountAbs = Math.abs(debit); }
        else { direction = 'income'; amountAbs = Math.abs(credit); }
      } else {
        const amt = amountIdx >= 0 ? parseNumber(row[amountIdx]) : 0;
        direction = amt < 0 ? 'expense' : 'income';
        amountAbs = Math.abs(amt);
      }
    } else if (amountIdx >= 0) {
      const amt = parseNumber(row[amountIdx]);
      direction = amt < 0 ? 'expense' : 'income';
      amountAbs = Math.abs(amt);
    } else {
      continue;
    }

    const id = `${'bank'}|${fileName}|${r}|${date}|${amountAbs.toFixed(2)}|${description.trim().toLowerCase()}`;

    details.push({
      id,
      date,
      amount: amountAbs,
      description,
      source: 'bank',
      direction,
      directionDetected: direction,
      fileName,
      rowIndex: r,
      headerIdx,
    });
  }

  return details;
}
