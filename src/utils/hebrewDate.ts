import { HDate, gematriya } from '@hebcal/core';

/**
 * Hebrew month names
 */
const HEBREW_MONTHS: Record<string, string> = {
  'Nisan': 'ניסן',
  'Iyyar': 'אייר',
  'Sivan': 'סיוון',
  'Tamuz': 'תמוז',
  'Av': 'אב',
  'Elul': 'אלול',
  'Tishrei': 'תשרי',
  'Cheshvan': 'חשוון',
  'Kislev': 'כסלו',
  'Tevet': 'טבת',
  'Sh\'vat': 'שבט',
  'Shvat': 'שבט',
  'Adar': 'אדר',
  'Adar I': 'אדר א׳',
  'Adar II': 'אדר ב׳',
};

/**
 * Convert a date string (DD/MM/YYYY or DD/MM/YY) to Hebrew date format.
 * @param dateStr - Date string in format DD/MM/YYYY or DD/MM/YY
 * @returns Hebrew date string (e.g., "ה׳ ניסן") or empty string on error
 */
export function formatHebrewDate(dateStr: string): string {
  try {
    const parts = dateStr.split('/');
    if (parts.length < 3) return '';

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    
    // Handle 2-digit year
    if (year < 100) {
      year += 2000;
    }

    const date = new Date(year, month - 1, day);
    if (isNaN(date.getTime())) return '';

    const hd = new HDate(date);
    const hebrewDay = gematriya(hd.getDate());
    const monthName = HEBREW_MONTHS[hd.getMonthName()] || hd.getMonthName();

    return `${hebrewDay} ${monthName}`;
  } catch {
    return '';
  }
}

/**
 * Convert a date string to Hebrew date with year.
 * @param dateStr - Date string in format DD/MM/YYYY or DD/MM/YY
 * @returns Hebrew date string with year (e.g., "ה׳ ניסן תשפ״ד")
 */
export function formatHebrewDateWithYear(dateStr: string): string {
  try {
    const parts = dateStr.split('/');
    if (parts.length < 3) return '';

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    
    if (year < 100) {
      year += 2000;
    }

    const date = new Date(year, month - 1, day);
    if (isNaN(date.getTime())) return '';

    const hd = new HDate(date);
    const hebrewDay = gematriya(hd.getDate());
    const monthName = HEBREW_MONTHS[hd.getMonthName()] || hd.getMonthName();
    const hebrewYear = gematriya(hd.getFullYear());

    return `${hebrewDay} ${monthName} ${hebrewYear}`;
  } catch {
    return '';
  }
}
