import React, { useState, useMemo } from 'react';
import type { UnmatchedBankStatement } from '../utils/creditChargePatterns';
import './MissingBankDetailAlert.css';

interface MissingBankDetailAlertProps {
  /** רשימת מחזורי אשראי שלא נמצאה להם עסקת בנק תואמת */
  unmatchedStatements: UnmatchedBankStatement[];
  /** פונקציה לרענון התיקייה */
  onRefresh: () => void;
  /** שם התיקייה הנוכחית (לזכירת dismiss) */
  folderName?: string;
  /** מפה של שמות ידידותיים לכרטיסים */
  cardNames?: Record<string, string>;
}

const DISMISS_KEY = 'missingBankDetailAlert_dismissed';

/**
 * קיבוץ מחזורים לפי כרטיס אשראי
 */
function groupByCard(
  statements: UnmatchedBankStatement[],
  cardNames?: Record<string, string>
): { card: string; displayName: string; totalAmount: number; count: number; totalTransactions: number }[] {
  const map: Record<string, { totalAmount: number; count: number; totalTransactions: number }> = {};
  for (const s of statements) {
    const key = s.cardLast4;
    if (!map[key]) map[key] = { totalAmount: 0, count: 0, totalTransactions: 0 };
    map[key].totalAmount += Math.abs(s.netCharge);
    map[key].count += 1;
    map[key].totalTransactions += s.transactionCount;
  }
  return Object.entries(map)
    .map(([card, data]) => ({
      card,
      displayName: cardNames?.[card] || `••••${card}`,
      ...data,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

const MissingBankDetailAlert: React.FC<MissingBankDetailAlertProps> = ({
  unmatchedStatements,
  onRefresh,
  folderName = 'default',
  cardNames,
}) => {
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (dismissed) {
        const data = JSON.parse(dismissed) as Record<string, number>;
        // dismiss תקף ל-24 שעות
        if (data[folderName] && Date.now() - data[folderName] < 24 * 60 * 60 * 1000) {
          return true;
        }
      }
    } catch { /* ignore */ }
    return false;
  });

  const [isExpanded, setIsExpanded] = useState(false);

  const groups = useMemo(() => groupByCard(unmatchedStatements, cardNames), [unmatchedStatements, cardNames]);
  const totalAmount = useMemo(
    () => unmatchedStatements.reduce((sum, s) => sum + Math.abs(s.netCharge), 0),
    [unmatchedStatements]
  );

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY);
      const data: Record<string, number> = dismissed ? JSON.parse(dismissed) : {};
      data[folderName] = Date.now();
      localStorage.setItem(DISMISS_KEY, JSON.stringify(data));
    } catch { /* ignore */ }
  };

  // אל תציג אם אין מחזורים חסרים או אם נסגר
  if (!unmatchedStatements.length || isDismissed) return null;

  return (
    <div className="missing-bank-detail-alert" role="alert">
      <div className="mbda-content">
        <span className="mbda-icon">🏦</span>
        <div className="mbda-text-wrapper">
          <span className="mbda-text">
            {groups.length === 1
              ? <>נמצא פירוט אשראי לכרטיס <strong>{groups[0].displayName}</strong> ({unmatchedStatements.length === 1 ? 'מחזור חיוב אחד' : `${unmatchedStatements.length} מחזורי חיוב`}, סה״כ {totalAmount.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ₪) ללא עסקת בנק תואמת</>
              : <>נמצא פירוט אשראי ל-{groups.length} כרטיסים ({unmatchedStatements.length} מחזורי חיוב, סה״כ {totalAmount.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ₪) ללא עסקות בנק תואמות</>
            }
          </span>
          <span className="mbda-hint">
            הוסף את דפי חשבון הבנק לתיקייה כדי לזהות חיובי אשראי ולמנוע ספירה כפולה
          </span>
        </div>
      </div>

      <div className="mbda-actions">
        {groups.length > 1 && (
          <button
            className="mbda-btn mbda-btn-details"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
          >
            {isExpanded ? 'הסתר' : 'פרטים'}
          </button>
        )}
        <button
          className="mbda-btn mbda-btn-primary"
          onClick={onRefresh}
          title="לאחר הוספת הקבצים, לחץ כאן לרענן"
        >
          🔄 רענן
        </button>
        <button
          className="mbda-btn mbda-btn-dismiss"
          onClick={handleDismiss}
          aria-label="סגור התראה"
        >
          ✕
        </button>
      </div>

      {isExpanded && groups.length > 1 && (
        <div className="mbda-details">
          {groups.map(g => (
            <div key={g.card} className="mbda-detail-row">
              <span className="mbda-detail-card">{g.displayName}</span>
              <span className="mbda-detail-amount">
                {g.totalAmount.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ₪
              </span>
              <span className="mbda-detail-count">
                ({g.count} {g.count === 1 ? 'מחזור' : 'מחזורים'}, {g.totalTransactions} עסקאות)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MissingBankDetailAlert;
