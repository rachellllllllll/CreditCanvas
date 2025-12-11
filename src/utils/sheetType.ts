// הסרנו את התלות ב-XLSX - עכשיו מקבלים מערך ישירות

export type SheetType = 'bank' | 'credit' | 'unknown';

function normCell(s: any): string {
  return String(s ?? '')
    .replace(/"/g, '')
    .replace(/\r?\n/g, '')
    .trim();
}

export function detectSheetTypeFromSheet(sheetData: any[][]): SheetType {
  // sheetData הוא כבר מערך דו-ממדי
  const rows: any[] = sheetData;
  const tokens = new Set<string>();

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = (rows[i] || []).map(normCell);
    row.forEach((c: string) => c && tokens.add(c));
    const joined = row.join(' ');
    if (/עסקאות לחיוב ב-|המסתיים ב-/.test(joined)) return 'credit';
  }

  const hasToken = (needle: string) => Array.from(tokens).some(t => t.includes(needle));

  const bankHints = ['חובה/זכות', 'חובה', 'זכות', 'Debit', 'Credit', 'יתרה', 'אסמכתא', 'תיאור פעולה'];
  const creditHints = ['תאריך עסקה', 'שם בית העסק', 'שם בית עסק', 'סכום חיוב', 'סכום עסקה', 'תאריך חיוב'];

  const isBank = bankHints.some(hasToken);
  const isCredit = creditHints.some(hasToken);

  if (isBank && !isCredit) return 'bank';
  if (isCredit && !isBank) return 'credit';
  return 'unknown';
}

// CSV detection: infer type from first ~15 rows of parsed cells
export function detectSheetTypeFromCSV(rows: string[][]): SheetType {
  const tokens = new Set<string>();
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = (rows[i] || []).map(normCell);
    row.forEach((c: string) => c && tokens.add(c));
    const joined = row.join(' ');
    if (/עסקאות לחיוב ב-|המסתיים ב-/.test(joined)) return 'credit';
  }

  const hasToken = (needle: string) => Array.from(tokens).some(t => t.includes(needle));

  const bankHints = ['חובה/זכות', 'חובה', 'זכות', 'Debit', 'Credit', 'יתרה', 'אסמכתא', 'תיאור פעולה'];
  const creditHints = ['תאריך עסקה', 'שם בית העסק', 'שם בית עסק', 'סכום חיוב', 'סכום עסקה', 'תאריך חיוב'];

  const isBank = bankHints.some(hasToken);
  const isCredit = creditHints.some(hasToken);

  if (isBank && !isCredit) return 'bank';
  if (isCredit && !isBank) return 'credit';
  return 'unknown';
}

export type SheetTypeOverrides = Record<string, 'bank' | 'credit'>;
const SHEET_TYPE_OVERRIDES_FILE = 'sheetTypeOverrides.json';

export async function loadSheetTypeOverridesFromDir(dirHandle: any): Promise<SheetTypeOverrides> {
  try {
    const fh = await dirHandle.getFileHandle(SHEET_TYPE_OVERRIDES_FILE);
    const f = await fh.getFile();
    return JSON.parse(await f.text());
  } catch {
    return {} as SheetTypeOverrides;
  }
}

export async function saveSheetTypeOverridesToDir(dirHandle: any, data: SheetTypeOverrides | null) {
  try {
    const fh = await dirHandle.getFileHandle(SHEET_TYPE_OVERRIDES_FILE, { create: true });
    if (data) {
      const w = await fh.createWritable();
      await w.write(JSON.stringify(data, null, 2));
      await w.close();
    }
  } catch (err: any) {
    // SecurityError: User activation is required
    // בעת קריאה מרובה של קבצים, לא תמיד יש רשאות לכתוב
    if (err.name === 'SecurityError') {
      console.warn('אין רשאות לשמור שינויים (SecurityError), דלג...');
      return;
    }
    throw err;
  }
}

async function askUserSheetType(fileName: string, sheetName: string): Promise<'bank' | 'credit' | null> {
  const isBank = window.confirm(`לא זוהה סוג הגיליון עבור:\n${fileName} / ${sheetName}\n\nהאם זה דף חשבון בנק? (אישור=בנק, ביטול=אשראי)`);
  return isBank ? 'bank' : 'credit';
}

export async function ensureSheetType(
  dirHandle: any,
  fileName: string,
  sheetName: string,
  sheetData: any[][]
): Promise<'bank' | 'credit'> {
  const key = `${fileName}::${sheetName}`;
  const overrides = await loadSheetTypeOverridesFromDir(dirHandle);
  if (overrides[key]) return overrides[key];

  const detected = detectSheetTypeFromSheet(sheetData);
  if (detected === 'unknown') {
    const chosen = await askUserSheetType(fileName, sheetName);
    if (!chosen) throw new Error('user-cancelled');
    overrides[key] = chosen;
    await saveSheetTypeOverridesToDir(dirHandle, overrides);
    return chosen;
  }
  overrides[key] = detected as 'bank' | 'credit';
  await saveSheetTypeOverridesToDir(dirHandle, overrides);
  return detected as 'bank' | 'credit';
}

// CSV counterpart to ensureSheetType (no sheetName)
export async function ensureCsvType(
  dirHandle: any,
  fileName: string,
  rows: string[][]
): Promise<'bank' | 'credit'> {
  const key = `${fileName}`;
  const overrides = await loadSheetTypeOverridesFromDir(dirHandle);
  if (overrides[key]) return overrides[key];

  const detected = detectSheetTypeFromCSV(rows);
  if (detected === 'unknown') {
    const isBank = window.confirm(`לא זוהה סוג הקובץ עבור CSV:\n${fileName}\n\nהאם זה דף חשבון בנק? (אישור=בנק, ביטול=אשראי)`);
    const chosen = isBank ? 'bank' : 'credit';
    overrides[key] = chosen;
    await saveSheetTypeOverridesToDir(dirHandle, overrides);
    return chosen;
  }
  overrides[key] = detected as 'bank' | 'credit';
  await saveSheetTypeOverridesToDir(dirHandle, overrides);
  return detected as 'bank' | 'credit';
}