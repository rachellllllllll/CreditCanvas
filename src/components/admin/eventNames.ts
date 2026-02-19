/**
 * Shared event name formatting utility
 * מפת תרגום שמות אירועים לעברית - משותפת לכל קומפוננטות האדמין
 */

const EVENT_NAME_MAP: Record<string, string> = {
  'session_start': 'התחלת סשן',
  'session_duration': 'משך סשן',
  'files_loaded': 'טעינת קבצים',
  'file_upload_success': 'העלאה מוצלחת',
  'file_error': 'שגיאת קובץ',
  'consent_decision': 'החלטת הסכמה',
  'feature_used': 'שימוש בפיצ׳ר',
  'category_assigned': 'הקצאת קטגוריה',
  'category_stats': 'סטטיסטיקות',
  'new_user': 'משתמש חדש',
  'returning_user': 'משתמש חוזר',
  'error_occurred': 'שגיאה',
  'page_view': 'צפייה בדף',
  'user_feedback': 'משוב משתמש',
  'unknown_credit_charge_descriptions': 'תיאורי חיוב לא מזוהים',
  'console_error': 'שגיאת קונסול',
};

/**
 * מחזיר שם עברי לאירוע. אם אין תרגום, מחזיר את השם המקורי עם רווחים במקום _
 */
export function formatEventName(name: string): string {
  return EVENT_NAME_MAP[name] || name.replace(/_/g, ' ');
}

/**
 * מחזיר שם עברי + שם מקורי בסוגריים (לשימוש בטבלאות שצריכות גם חיפוש ב-Firebase)
 * למשל: "טעינת קבצים (files_loaded)"
 */
export function formatEventNameWithOriginal(name: string): string {
  const hebrew = EVENT_NAME_MAP[name];
  if (hebrew) return `${hebrew} (${name})`;
  return name.replace(/_/g, ' ');
}
