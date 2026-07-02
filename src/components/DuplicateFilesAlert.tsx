import React, { useState } from 'react';
import type { DuplicateFilesInfo } from '../utils/duplicateDetection';
import './DuplicateFilesAlert.css';

interface DuplicateFilesAlertProps {
  /** מידע על קבצים כפולים */
  duplicateInfo: DuplicateFilesInfo;
  /** פונקציה לרענון התיקייה */
  onRefresh: () => void;
  /** שם תיקייה לזכירת dismiss */
  folderName?: string;
}

const DISMISS_KEY = 'duplicateFilesAlert_dismissed';

/**
 * חילוץ שם קובץ מנתיב יחסי
 */
function fileNameFromPath(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

/**
 * פורמט גודל קובץ
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const DuplicateFilesAlert: React.FC<DuplicateFilesAlertProps> = ({
  duplicateInfo,
  onRefresh,
  folderName = 'default',
}) => {
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (dismissed) {
        const data = JSON.parse(dismissed) as Record<string, number>;
        if (data[folderName] && Date.now() - data[folderName] < 24 * 60 * 60 * 1000) {
          return true;
        }
      }
    } catch { /* ignore */ }
    return false;
  });

  const [showDetails, setShowDetails] = useState(false);

  const { identicalFiles, overlappingRanges, skippedFiles } = duplicateInfo;
  const hasIdentical = identicalFiles.length > 0;
  const hasOverlapping = overlappingRanges.length > 0;

  console.log(`[DUP-ALERT] isDismissed=${isDismissed}, hasIdentical=${hasIdentical} (${identicalFiles.length}), hasOverlapping=${hasOverlapping} (${overlappingRanges.length}), folderName=${folderName}`);
  if (isDismissed || (!hasIdentical && !hasOverlapping)) return null;

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      const existing = JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
      existing[folderName] = Date.now();
      localStorage.setItem(DISMISS_KEY, JSON.stringify(existing));
    } catch { /* ignore */ }
  };

  const totalSkipped = skippedFiles.length;

  return (
    <div className="DuplicateFilesAlert" role="alert">
      <div className="DuplicateFilesAlert-header">
        <span className="DuplicateFilesAlert-icon">📋</span>
        <div className="DuplicateFilesAlert-text">
          <strong>זוהו קבצים כפולים</strong>
          <span className="DuplicateFilesAlert-summary">
            {hasIdentical && (
              <span>
                🔁 {identicalFiles.length} {identicalFiles.length === 1 ? 'קבוצת קבצים זהים' : 'קבוצות קבצים זהים'}
                {totalSkipped > 0 && ` (${totalSkipped} קבצים דולגו אוטומטית)`}
              </span>
            )}
            {hasIdentical && hasOverlapping && <span className="DuplicateFilesAlert-separator"> · </span>}
            {hasOverlapping && (
              <span>
                📅 {overlappingRanges.length} {overlappingRanges.length === 1 ? 'חפיפת תאריכים' : 'חפיפות תאריכים'}
              </span>
            )}
          </span>
        </div>
        <div className="DuplicateFilesAlert-actions">
          <button
            className="DuplicateFilesAlert-details-btn"
            onClick={() => setShowDetails(!showDetails)}
            aria-expanded={showDetails}
          >
            {showDetails ? 'הסתר פרטים' : 'הצג פרטים'}
          </button>
          <button
            className="DuplicateFilesAlert-dismiss-btn"
            onClick={handleDismiss}
            title="הסתר התראה ל-24 שעות"
            aria-label="סגור התראה"
          >
            ✕
          </button>
        </div>
      </div>

      {showDetails && (
        <div className="DuplicateFilesAlert-details">
          {/* רמה 1: קבצים זהים */}
          {hasIdentical && (
            <div className="DuplicateFilesAlert-section">
              <h4 className="DuplicateFilesAlert-section-title">
                🔁 קבצים בינאריים זהים
                <span className="DuplicateFilesAlert-section-subtitle">
                  (אותו תוכן בדיוק, נשמרו בשמות שונים – דולגו אוטומטית)
                </span>
              </h4>
              {identicalFiles.map((group, gi) => (
                <div key={gi} className="DuplicateFilesAlert-group">
                  <div className="DuplicateFilesAlert-group-header">
                    <span className="DuplicateFilesAlert-group-size">{formatFileSize(group.fileSize)}</span>
                    <span className="DuplicateFilesAlert-group-count">{group.paths.length} עותקים</span>
                  </div>
                  <ul className="DuplicateFilesAlert-file-list">
                    {group.paths.map((path, pi) => (
                      <li key={pi} className={pi === 0 ? 'DuplicateFilesAlert-file-kept' : 'DuplicateFilesAlert-file-skipped'}>
                        <span className="DuplicateFilesAlert-file-badge">
                          {pi === 0 ? '✅ נטען' : '⏭️ דולג'}
                        </span>
                        <span className="DuplicateFilesAlert-file-name" title={path}>
                          {fileNameFromPath(path)}
                        </span>
                        {path.includes('/') && (
                          <span className="DuplicateFilesAlert-file-path" title={path}>
                            {path}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* רמה 3: חפיפות תאריכים */}
          {hasOverlapping && (
            <div className="DuplicateFilesAlert-section">
              <h4 className="DuplicateFilesAlert-section-title">
                📅 קבצים עם טווחי תאריכים חופפים
                <span className="DuplicateFilesAlert-section-subtitle">
                  (ייתכן שמדובר באותם נתונים – עסקאות עלולות להיספר פעמיים)
                </span>
              </h4>
              {overlappingRanges.map((overlap, oi) => (
                <div key={oi} className="DuplicateFilesAlert-overlap">
                  <div className="DuplicateFilesAlert-overlap-header">
                    <span className="DuplicateFilesAlert-overlap-source">
                      {overlap.source === 'bank' ? '🏦 בנק' : '💳 אשראי'}
                      {overlap.cardLast4 && ` (••••${overlap.cardLast4})`}
                    </span>
                    <span className="DuplicateFilesAlert-overlap-badge">
                      חפיפה {overlap.overlapPercent}% · {overlap.overlapDays} ימים
                    </span>
                  </div>
                  <div className="DuplicateFilesAlert-overlap-files">
                    <div className="DuplicateFilesAlert-overlap-file">
                      <span className="DuplicateFilesAlert-file-name" title={overlap.file1}>
                        {fileNameFromPath(overlap.file1)}
                      </span>
                      <span className="DuplicateFilesAlert-date-range">
                        {overlap.range1.from} – {overlap.range1.to}
                        <span className="DuplicateFilesAlert-tx-count">({overlap.range1.count} עסקאות)</span>
                      </span>
                    </div>
                    <div className="DuplicateFilesAlert-overlap-vs">↕️</div>
                    <div className="DuplicateFilesAlert-overlap-file">
                      <span className="DuplicateFilesAlert-file-name" title={overlap.file2}>
                        {fileNameFromPath(overlap.file2)}
                      </span>
                      <span className="DuplicateFilesAlert-date-range">
                        {overlap.range2.from} – {overlap.range2.to}
                        <span className="DuplicateFilesAlert-tx-count">({overlap.range2.count} עסקאות)</span>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="DuplicateFilesAlert-tip">
            💡 <strong>טיפ:</strong> כדי לפתור כפילויות, הסר את הקבצים המיותרים מהתיקייה ו
            <button className="DuplicateFilesAlert-refresh-btn" onClick={onRefresh}>טען מחדש</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DuplicateFilesAlert;
