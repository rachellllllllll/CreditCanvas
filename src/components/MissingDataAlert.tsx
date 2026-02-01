import React, { useState, useMemo, useEffect } from 'react';
import './MissingDataAlert.css';

interface MissingDataAlertProps {
  /** רשימת חודשים זמינים בפורמט 'MM/YYYY' או 'M/YYYY' */
  availableMonths: string[];
  /** פונקציה לפתיחת בחירת תיקייה */
  onAddFiles: () => void;
  /** מזהה תיקייה (לשמירת dismiss ב-localStorage) */
  folderName?: string;
}

const DISMISS_KEY = 'missingDataAlert_dismissed';

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
];

type AlertType = 'missing_recent' | 'old_data' | null;

interface AlertInfo {
  type: AlertType;
  monthName: string;
  year: string;
  monthsAgo: number;
  dismissKey: string;
}

/**
 * נרמל חודש לפורמט אחיד MM/YYYY
 */
function normalizeMonth(m: string): { month: number; year: number } | null {
  const parts = m.split('/');
  if (parts.length < 2) return null;
  const month = parseInt(parts[0], 10);
  let year = parseInt(parts[1], 10);
  if (isNaN(month) || isNaN(year)) return null;
  if (year < 100) year += 2000;
  return { month, year };
}

/**
 * חשב הפרש חודשים בין שני תאריכים
 */
function monthsDiff(from: { month: number; year: number }, to: { month: number; year: number }): number {
  return (to.year - from.year) * 12 + (to.month - from.month);
}

/**
 * התראה על חודשים חסרים בנתונים
 * מציגה:
 * 1. "חסרים נתונים מ-X" - אם חסר חודש אחד או שניים
 * 2. "הנתונים האחרונים מ-X" - אם הנתונים ישנים (3+ חודשים)
 */
const MissingDataAlert: React.FC<MissingDataAlertProps> = ({
  availableMonths,
  onAddFiles,
  folderName = 'default'
}) => {
  const [isDismissed, setIsDismissed] = useState(false);

  // חשב את סוג ההתראה
  const alertInfo = useMemo((): AlertInfo | null => {
    if (availableMonths.length === 0) return null;
    
    const today = new Date();
    const dayOfMonth = today.getDate();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    const current = { month: currentMonth, year: currentYear };
    
    // מצא את החודש האחרון בנתונים
    let latestMonth: { month: number; year: number } | null = null;
    
    for (const m of availableMonths) {
      const parsed = normalizeMonth(m);
      if (!parsed) continue;
      
      if (!latestMonth || 
          parsed.year > latestMonth.year || 
          (parsed.year === latestMonth.year && parsed.month > latestMonth.month)) {
        latestMonth = parsed;
      }
    }
    
    if (!latestMonth) return null;
    
    // חשב כמה חודשים עברו מהנתונים האחרונים
    const gap = monthsDiff(latestMonth, current);
    
    // אם הנתונים עדכניים (מהחודש הנוכחי או הקודם) - אל תציג
    if (gap <= 1) return null;
    
    // נתונים ישנים (3+ חודשים) - הצג מיד, בלי לחכות ל-5 לחודש
    if (gap >= 3) {
      return {
        type: 'old_data',
        monthName: HEBREW_MONTHS[latestMonth.month - 1],
        year: latestMonth.year.toString(),
        monthsAgo: gap,
        dismissKey: `${latestMonth.month}/${latestMonth.year}`
      };
    }
    
    // חסר 1-2 חודשים - חכה ל-5 לחודש (זמן לקבל דף חיוב)
    if (dayOfMonth < 5) return null;
    
    // הכן את המידע להתראה
    // החודש החסר הוא החודש שאחרי הנתונים האחרונים
    const missingDate = new Date(latestMonth.year, latestMonth.month, 1); // חודש אחרי
    const missingMonth = missingDate.getMonth();
    const missingYear = missingDate.getFullYear();
    
    return {
      type: 'missing_recent',
      monthName: HEBREW_MONTHS[missingMonth],
      year: missingYear.toString(),
      monthsAgo: gap,
      dismissKey: `${missingMonth + 1}/${missingYear}`
    };
  }, [availableMonths]);

  // בדוק אם ההתראה נסגרה
  useEffect(() => {
    if (!alertInfo) return;
    
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (dismissed) {
        const data = JSON.parse(dismissed) as Record<string, string>;
        if (data[folderName] === alertInfo.dismissKey) {
          setIsDismissed(true);
        } else {
          // חודש חדש - אפס את הסגירה
          setIsDismissed(false);
        }
      }
    } catch { /* ignore */ }
  }, [alertInfo, folderName]);

  const handleDismiss = () => {
    setIsDismissed(true);
    
    if (alertInfo) {
      try {
        const dismissed = localStorage.getItem(DISMISS_KEY);
        const data: Record<string, string> = dismissed ? JSON.parse(dismissed) : {};
        data[folderName] = alertInfo.dismissKey;
        localStorage.setItem(DISMISS_KEY, JSON.stringify(data));
      } catch { /* ignore */ }
    }
  };

  // אל תציג אם אין התראה או אם נסגרה
  if (!alertInfo || isDismissed) return null;

  const isOldData = alertInfo.type === 'old_data';

  return (
    <div className={`missing-data-alert ${isOldData ? 'old-data' : ''}`} role="alert">
      <div className="missing-data-content">
        <span className="missing-data-icon">{isOldData ? '📅' : '📂'}</span>
        <span className="missing-data-text">
          {isOldData 
            ? `הנתונים האחרונים מ${alertInfo.monthName} ${alertInfo.year}`
            : `חסרים נתונים מ${alertInfo.monthName} ${alertInfo.year}`
          }
        </span>
      </div>
      <div className="missing-data-actions">
        <button 
          className="missing-data-btn missing-data-btn-primary"
          onClick={onAddFiles}
        >
          {isOldData ? 'עדכן נתונים' : 'הוסף קבצים'}
        </button>
        <button 
          className="missing-data-btn missing-data-btn-dismiss"
          onClick={handleDismiss}
          aria-label="סגור התראה"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default MissingDataAlert;
