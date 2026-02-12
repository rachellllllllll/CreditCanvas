/**
 * XLSX Minimal Parser
 * קורא קבצי XLSX ללא תלות בספריית xlsx הכבדה
 * משתמש רק ב-JSZip ו-DOMParser מובנה
 * מותאם במיוחד לקבצי בנק ואשראי פשוטים
 */

import JSZip from 'jszip';

export interface Cell {
  v: string | number; // value
  t?: 's' | 'n' | 'd' | 'b'; // type: string, number, date, boolean
}

export interface Row {
  [col: string]: Cell; // A, B, C, etc.
}

export interface Sheet {
  name: string;
  rows: Row[];
}

export interface Workbook {
  sheets: Sheet[];
}

const XLSX_NAMESPACE = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

function getElementsByTag(node: Document | Element, tag: string): Element[] {
  const matches = Array.from(node.getElementsByTagName(tag));
  if (matches.length > 0) {
    return matches;
  }
  return Array.from(node.getElementsByTagNameNS(XLSX_NAMESPACE, tag));
}

/**
 * ממיר מספר עמודה (0-based) לאות (A, B, C, ..., Z, AA, AB, ...)
 */
function colNumToLetter(num: number): string {
  let letter = '';
  while (num >= 0) {
    letter = String.fromCharCode((num % 26) + 65) + letter;
    num = Math.floor(num / 26) - 1;
  }
  return letter;
}

/**
 * ממיר אות עמודה (A, B, C, ..., AA, AB) למספר (0, 1, 2, ...)
 */
function colLetterToNum(col: string): number {
  let num = 0;
  for (let i = 0; i < col.length; i++) {
    num = num * 26 + (col.charCodeAt(i) - 64);
  }
  return num - 1; // 0-based
}

/**
 * ממיר תאריך סריאלי של Excel למחרוזת תאריך
 * Excel מתחיל מ-1900-01-01 (סריאלי 1)
 */
// function excelSerialToDate(serial: number): string {
//   const utc_days = Math.floor(serial - 25569);
//   const utc_value = utc_days * 86400;
//   const date_info = new Date(utc_value * 1000);

//   const day = date_info.getUTCDate().toString().padStart(2, '0');
//   const month = (date_info.getUTCMonth() + 1).toString().padStart(2, '0');
//   const year = date_info.getUTCFullYear();

//   return `${day}/${month}/${year}`;
// }

/**
 * בודק אם מספר הוא תאריך סריאלי של Excel
 */
// function isExcelDate(num: number): boolean {
//   // תאריכים ב-Excel הם בין 1 (1900-01-01) ל-~60000 (שנת 2064)
//   return num > 1 && num < 60000;
// }

/**
 * קורא את shared strings (מיפוי טקסטים משותפים)
 */
async function parseSharedStrings(zip: JSZip): Promise<string[]> {
  const sharedStringsFile = zip.file('xl/sharedStrings.xml');
  if (!sharedStringsFile) {
    return [];
  }

  const xml = await sharedStringsFile.async('text');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const strings: string[] = [];
  const siElements = getElementsByTag(doc, 'si');

  for (let i = 0; i < siElements.length; i++) {
    const si = siElements[i];
    // חיפוש טקסט בתוך <t> או <r><t>
    const tElements = getElementsByTag(si, 't');
    let text = '';
    for (let j = 0; j < tElements.length; j++) {
      text += tElements[j].textContent || '';
    }
    strings.push(text);
  }

  return strings;
}

/**
 * קורא גיליון בודד
 */
async function parseSheet(
  zip: JSZip,
  sheetPath: string,
  sharedStrings: string[]
): Promise<Row[]> {
  const sheetFile = zip.file(sheetPath);
  if (!sheetFile) {
    return [];
  }

  const xml = await sheetFile.async('text');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const rows: Row[] = [];
  const rowElements = getElementsByTag(doc, 'row');

  for (let i = 0; i < rowElements.length; i++) {
    const rowElement = rowElements[i];
    // const rowIndex = parseInt(rowElement.getAttribute('r') || '0', 10);
    const row: Row = {};

    const cells = getElementsByTag(rowElement, 'c');
    for (let j = 0; j < cells.length; j++) {
      const cell = cells[j];
      const cellRef = cell.getAttribute('r') || ''; // e.g., "A1", "B2"
      const cellType = cell.getAttribute('t'); // s=string, n=number, b=boolean
      // const cellStyle = cell.getAttribute('s'); // style index (for dates)

      // חילוץ הערך
      const vElement = getElementsByTag(cell, 'v')[0];
      if (!vElement) {
        continue;
      }

      const rawValue = vElement.textContent || '';
      const colLetter = cellRef.replace(/[0-9]/g, ''); // A, B, C...

      let cellValue: Cell = { v: rawValue };

      if (cellType === 's') {
        // String - חיפוש ב-shared strings
        const stringIndex = parseInt(rawValue, 10);
        cellValue = {
          v: sharedStrings[stringIndex] || '',
          t: 's',
        };
      } else if (cellType === 'b') {
        // Boolean
        cellValue = {
          v: rawValue === '1' ? 'TRUE' : 'FALSE',
          t: 'b',
        };
      } else {
        // Number - פשוט החזר כמספר, בלי להמיר לתאריך
        // ההמרה לתאריך תתבצע ב-App.tsx לפי שם העמודה
        // const numValue = parseFloat(rawValue);
        // if (!isNaN(numValue)) {
        //   cellValue = {
        //     v: numValue,
        //     t: 'n',
        //   };
        // } else {
          cellValue = {
            v: rawValue,
            t: 's',
          };
        // }
      }

      row[colLetter] = cellValue;
    }

    if (Object.keys(row).length > 0) {
      rows.push(row);
    }
  }

  return rows;
}

/**
 * קורא את ה-relationships מקובץ workbook.xml.rels
 */
async function parseWorkbookRelationships(zip: JSZip): Promise<Map<string, string>> {
  const relsFile = zip.file('xl/_rels/workbook.xml.rels');
  const relationships = new Map<string, string>();
  
  if (!relsFile) {
    return relationships;
  }

  const xml = await relsFile.async('text');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const relElements = doc.getElementsByTagName('Relationship');
  for (let i = 0; i < relElements.length; i++) {
    const rel = relElements[i];
    const id = rel.getAttribute('Id') || '';
    const target = rel.getAttribute('Target') || '';
    if (id && target) {
      // הנתיב יכול להיות יחסי (worksheets/sheet1.xml) או מלא
      const fullPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
      relationships.set(id, fullPath);
    }
  }

  return relationships;
}

/**
 * קורא את רשימת השמות של הגיליונות
 */
async function parseWorkbookSheetNames(zip: JSZip): Promise<{ name: string; path: string }[]> {
  const workbookFile = zip.file('xl/workbook.xml');
  if (!workbookFile) {
    return [];
  }

  // קריאת ה-relationships כדי לקבל את הנתיבים האמיתיים
  const relationships = await parseWorkbookRelationships(zip);

  const xml = await workbookFile.async('text');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const sheets: { name: string; path: string }[] = [];
  const sheetElements = getElementsByTag(doc, 'sheet');

  for (let i = 0; i < sheetElements.length; i++) {
    const sheet = sheetElements[i];
    const name = sheet.getAttribute('name') || `Sheet${i + 1}`;
    
    // נסה לקבל את ה-relationship ID (יכול להיות r:id או שרק id)
    const rId = sheet.getAttribute('r:id') || 
                sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ||
                '';

    let path = '';
    
    if (rId && relationships.has(rId)) {
      // יש לנו את הנתיב האמיתי מה-relationships
      path = relationships.get(rId)!;
    } else {
      // fallback: נסה למצוא קובץ גיליון לפי אינדקס
      const possiblePaths = [
        `xl/worksheets/sheet${i + 1}.xml`,
        `xl/worksheets/sheet${sheet.getAttribute('sheetId') || i + 1}.xml`,
      ];
      
      for (const possiblePath of possiblePaths) {
        if (zip.file(possiblePath)) {
          path = possiblePath;
          break;
        }
      }
      
      // אם עדיין לא מצאנו, חפש כל קובץ sheet
      if (!path) {
        const worksheetsFolder = zip.folder('xl/worksheets');
        if (worksheetsFolder) {
          const files = Object.keys(zip.files).filter(f => f.startsWith('xl/worksheets/sheet') && f.endsWith('.xml'));
          if (files[i]) {
            path = files[i];
          }
        }
      }
    }

    if (path) {
      sheets.push({ name, path });
    }
  }

  return sheets;
}

/**
 * ממיר Row[] (מבנה פנימי) למערך דו-ממדי פשוט
 * שומר על תאים ריקים בתוך שורה (לא דוחף עמודות קדימה)
 */
function rowsToArray(rows: Row[]): (string | number)[][] {
  const result: (string | number)[][] = [];

  // מצא את העמודה המקסימום בכל השורות
  let maxColNum = -1;
  for (const row of rows) {
    const cols = Object.keys(row);
    for (const col of cols) {
      const colNum = colLetterToNum(col);
      if (colNum > maxColNum) {
        maxColNum = colNum;
      }
    }
  }

  // אם אין עמודות בכלל, החזר מערך ריק
  if (maxColNum === -1) {
    return [];
  }

  // בנה את המערך עם שמירה על מיקום עמודות
  for (const row of rows) {
    const arr: (string | number)[] = [];

    // עבור כל עמודה מ-A עד המקסימום
    for (let colNum = 0; colNum <= maxColNum; colNum++) {
      const col = colNumToLetter(colNum);
      if (row[col]) {
        arr.push(row[col].v);
      } else {
        // אם התא ריק, הוסף string ריק
        arr.push('');
      }
    }

    result.push(arr);
  }

  return result;
}

/**
 * הפונקציה הראשית: קורא קובץ XLSX ומחזיר Workbook
 */
export async function readXLSX(arrayBuffer: ArrayBuffer): Promise<Workbook> {
  const zip = await JSZip.loadAsync(arrayBuffer);

  // קריאת shared strings
  const sharedStrings = await parseSharedStrings(zip);

  // קריאת שמות הגיליונות
  const sheetInfos = await parseWorkbookSheetNames(zip);

  // קריאת כל הגיליונות
  const sheets: Sheet[] = [];
  for (const info of sheetInfos) {
    const rows = await parseSheet(zip, info.path, sharedStrings);
    sheets.push({
      name: info.name,
      rows,
    });
  }

  return { sheets };
}

/**
 * פונקציית עזר: ממיר גיליון למערך דו-ממדי (תואם ל-XLSX.utils.sheet_to_json)
 */
export function sheetToArray(sheet: Sheet): (string | number)[][] {
  return rowsToArray(sheet.rows);
}

/**
 * פונקציית עזר: מחזיר את הגיליון הראשון כמערך
 */
export function getFirstSheetAsArray(workbook: Workbook): (string | number)[][] {
  if (workbook.sheets.length === 0) {
    return [];
  }
  return sheetToArray(workbook.sheets[0]);
}
