import React, { useState, useMemo } from 'react';
import type { UnmatchedCreditCharge } from '../utils/creditChargePatterns';
import './MissingCreditDetailAlert.css';

interface MissingCreditDetailAlertProps {
  /** רשימת חיובי אשראי שזוהו לפי תיאור אך חסר להם פירוט */
  unmatchedCharges: UnmatchedCreditCharge[];
  /** פונקציה לרענון התיקייה */
  onRefresh: () => void;
  /** שם התיקייה הנוכחית (לזכירת dismiss) */
  folderName?: string;
  /** חיפוש עסקאות לפי שם חברת אשראי בטבלה */
  onSearchCompany?: (companyName: string) => void;
}

const DISMISS_KEY = 'missingCreditDetailAlert_dismissed';

/**
 * קיבוץ חיובים לפי חברת אשראי (תיאור מרכזי)
 */
function groupByCompany(charges: UnmatchedCreditCharge[]): { company: string; totalAmount: number; count: number }[] {
  const map: Record<string, { totalAmount: number; count: number }> = {};
  for (const c of charges) {
    const key = c.description.trim();
    if (!map[key]) map[key] = { totalAmount: 0, count: 0 };
    map[key].totalAmount += c.amount;
    map[key].count += 1;
  }
  return Object.entries(map)
    .map(([company, data]) => ({ company, ...data }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

const MissingCreditDetailAlert: React.FC<MissingCreditDetailAlertProps> = ({
  unmatchedCharges,
  onRefresh,
  folderName = 'default',
  onSearchCompany,
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

  const groups = useMemo(() => groupByCompany(unmatchedCharges), [unmatchedCharges]);
  const totalAmount = useMemo(
    () => unmatchedCharges.reduce((sum, c) => sum + c.amount, 0),
    [unmatchedCharges]
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

  // אל תציג אם אין חיובים או אם נסגר
  if (!unmatchedCharges.length || isDismissed) return null;

  return (
    <div className="missing-credit-detail-alert" role="alert">
      <div className="mcda-content">
        <span className="mcda-icon">💳</span>
        <div className="mcda-text-wrapper">
          <span className="mcda-text">
            {unmatchedCharges.length === 1
              ? <>זוהה חיוב אשראי של {onSearchCompany ? (
                  <button
                    type="button"
                    className="mcda-company-link"
                    onClick={() => onSearchCompany(groups[0].company)}
                    title="הצג עסקאות בטבלה"
                  >{groups[0].company}</button>
                ) : groups[0].company} ({totalAmount.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₪) ללא פירוט עסקאות</>
              : <>זוהו {unmatchedCharges.length} חיובי אשראי ללא פירוט עסקאות:{' '}
                {groups.map((g, i) => (
                  <span key={g.company}>
                    {i > 0 && ', '}
                    {onSearchCompany ? (
                      <button
                        type="button"
                        className="mcda-company-link"
                        onClick={() => onSearchCompany(g.company)}
                        title="הצג עסקאות בטבלה"
                      >{g.company}{g.count > 1 ? ` (×${g.count})` : ''}</button>
                    ) : (
                      <>{g.company}{g.count > 1 ? ` (×${g.count})` : ''}</>
                    )}
                  </span>
                ))}
                {' '}(סה״כ {totalAmount.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₪)</>
            }
          </span>
          <span className="mcda-hint">
            הוסף את קבצי פירוט האשראי לתיקייה כדי לראות פירוט מלא ולמנוע ספירה כפולה
          </span>
        </div>
      </div>

      <div className="mcda-actions">
        {groups.length > 1 && (
          <button
            className="mcda-btn mcda-btn-details"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
          >
            {isExpanded ? 'הסתר' : 'פרטים'}
          </button>
        )}
        <button
          className="mcda-btn mcda-btn-primary"
          onClick={onRefresh}
          title="לאחר הוספת הקבצים, לחץ כאן לרענן"
        >
          🔄 רענן
        </button>
        <button
          className="mcda-btn mcda-btn-dismiss"
          onClick={handleDismiss}
          aria-label="סגור התראה"
        >
          ✕
        </button>
      </div>

      {isExpanded && groups.length > 1 && (
        <div className="mcda-details">
          {groups.map(g => (
            <div key={g.company} className="mcda-detail-row">
              <span className="mcda-detail-company">{g.company}</span>
              <span className="mcda-detail-amount">
                {g.totalAmount.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₪
              </span>
              {g.count > 1 && (
                <span className="mcda-detail-count">({g.count} חיובים)</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MissingCreditDetailAlert;
