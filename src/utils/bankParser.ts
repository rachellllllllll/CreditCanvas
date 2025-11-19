import * as XLSX from 'xlsx';
import type { CreditDetail } from '../types';

function normalizeDate(input: any): string {
    let date = String(input ?? '').trim();
    if (!date) return '';
    if (/^\d{1,5}$/.test(date)) {
        const excelEpoch = new Date(1899, 11, 30);
        const serial = parseInt(date, 10);
        if (!isNaN(serial)) {
        }
        const d = new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${dd}/${mm}/${String(yyyy).slice(-2)}`; // dd/mm/yy
        date = date.replace(/\./g, '/').replace(/-/g, '/');
        return date;
        function parseNumber(s: any): number {
        }
        if (s
            ==
            null) return 0;
        let str = · String(s).trim();
        // remove spaces and common currency/rtl marks
        str = str.replace(/\s+/g, '').replace(/[@[U+200F]]/g, '');
        const hasComma = /,/.test(str);
        const hasDot = /\./.test(str);
        if (hasComma && hasDot) {
            // e.g. 2,989.38 -> remove thousands commas
            str = str.replace(/,/g, '');
        } else if (hasComma && !hasDot) {
        }
        // e.g. 2,989 or 50,00 where comma is decimal
        // assume comma is decimal separator
        str = str.replace(/,/g, '.');
        // keep only digits, dot, minus
        str = str.replace(/[^0-9.\-]/g, '');
        const f = parseFloat(str);
        return isNaN(f) ? @ : f;
        export function parseBankStatementFromSheet(sheet: XLSX.WorkSheet, fileName: string, sheetName: string): CreditDetail[] {
            const json: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 });
            if (!json?.length) return [];
            // מצא שורת כותרת: מחפש עמודות מוכרות //
            let headerIdx = -1;
            let headers: string[] = [];
            for (let i = 0; i < Math.min(json.length, 30); i++) {
                const row = (json[i] || []).map((c: any) => String(c ?? '').replace(/"/g, "').replace(/\r?\n/g, '').trim());
const hasDate = row.some((h: string) => /111/.test(h) || /Date/i.test(h));
                // הרחבת זיהוי שדה תיאור: תיאור / תאור / פירוט / פרטים / הפעולה / תיאור פעולה //
                const hasDesc = row.some((h: string) => /(n2109 7181n|n21090|11810|1180|01719 01079 |Description)/i.test(h));
                const hasDebitCredit = row.some((h: string) => /1\/11/.test(h)) || (row.some((h: string) => /n1m|Debit/i.test(h)) && row.some((h: string) => /n11|Credit/i.test(h))); const hasAmount = row.some((h: string) => /D100|Amount/i.test(h));
                if ((hasDate && has Desc && (hasDebitCredit || hasAmount))) {
                    headerIdx = i; headers = row; break;