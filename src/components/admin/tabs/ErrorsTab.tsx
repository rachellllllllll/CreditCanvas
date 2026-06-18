/**
 * Errors Tab Component
 * הצגת כל השגיאות שהמשתמש נתקל בהן
 */

import React, { useMemo } from 'react';
import type { UserSummary } from '../userDataUtils';

interface ErrorsTabProps {
  user: UserSummary;
}

interface ErrorEntry {
  id: string;
  timestamp: number;
  type: string;
  message: string;
  fileExtension?: string;
  browserInfo?: string;
  isRecoverable?: boolean;
}

// Error type display names
const ERROR_TYPE_NAMES: Record<string, string> = {
  'file_read_error': 'שגיאת קריאת קובץ',
  'parse_error': 'שגיאת פענוח',
  'invalid_format': 'פורמט לא תקין',
  'file_access_error': 'שגיאת גישה לקובץ',
  'react_error': 'שגיאת React',
  'global_error': 'שגיאה כללית',
  'storage_error': 'שגיאת אחסון',
  'network_error': 'שגיאת רשת',
  'console_error': 'שגיאת קונסול',
};

export default function ErrorsTab({ user }: ErrorsTabProps) {
  // Extract error events
  const errors = useMemo(() => {
    const entries: ErrorEntry[] = [];
    
    user.events.forEach(e => {
      if ((e.event === 'file_error' || e.event === 'console_error') && e.metadata) {
        const errorType = String(e.metadata.errorType || 'unknown');
        const errorMessage = String(e.metadata.errorMessage || 'Unknown error');
        const fileExtension = e.metadata.fileExtension ? String(e.metadata.fileExtension) : undefined;
        const browserInfo = e.metadata.browserInfo ? String(e.metadata.browserInfo) : undefined;
        const isRecoverable = typeof e.metadata.isRecoverable === 'boolean' 
          ? e.metadata.isRecoverable 
          : undefined;
        
        entries.push({
          id: e.id || `${e.timestamp}`,
          timestamp: e.timestamp,
          type: errorType,
          message: errorMessage,
          fileExtension,
          browserInfo,
          isRecoverable,
        });
      }
    });
    
    // Sort by timestamp (newest first)
    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }, [user.events]);

  // Count errors by type
  const errorsByType = useMemo(() => {
    const counts: Record<string, number> = {};
    errors.forEach(err => {
      counts[err.type] = (counts[err.type] || 0) + 1;
    });
    return counts;
  }, [errors]);

  if (errors.length === 0) {
    return (
      <div className="tab-empty-state">
        <span className="tab-empty-icon">✅</span>
        <p>המשתמש לא נתקל בשגיאות</p>
      </div>
    );
  }

  return (
    <div className="errors-tab-wrapper">
      {/* Summary */}
      <div className="errors-summary">
        <div className="errors-summary-stat">
          <span className="errors-summary-value">{errors.length}</span>
          <span className="errors-summary-label">סה״כ שגיאות</span>
        </div>
        <div className="errors-summary-stat">
          <span className="errors-summary-value">{Object.keys(errorsByType).length}</span>
          <span className="errors-summary-label">סוגי שגיאות</span>
        </div>
      </div>

      {/* Errors by Type Summary */}
      <div className="errors-types-section">
        <h3 className="errors-section-title">📊 התפלגות שגיאות</h3>
        <div className="errors-types-list">
          {Object.entries(errorsByType)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => (
              <div key={type} className="error-type-item">
                <span className="error-type-label">
                  {ERROR_TYPE_NAMES[type] || type}
                </span>
                <span className="error-type-count">{count}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Errors Table */}
      <div className="errors-table-section">
        <h3 className="errors-section-title">🔴 רשימת שגיאות</h3>
        <div className="errors-table-wrapper">
          <table className="errors-table">
            <thead>
              <tr>
                <th>זמן</th>
                <th>סוג</th>
                <th>הודעה</th>
                <th>קובץ</th>
                <th>דפדפן</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((error) => (
                <tr key={error.id} className="error-row">
                  <td className="error-time">
                    <div className="error-date">
                      {new Date(error.timestamp).toLocaleDateString('he-IL', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </div>
                    <div className="error-hour">
                      {new Date(error.timestamp).toLocaleTimeString('he-IL', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </td>
                  <td className="error-type">
                    <span className={`error-type-badge ${error.isRecoverable === false ? 'error-critical' : ''}`}>
                      {ERROR_TYPE_NAMES[error.type] || error.type}
                    </span>
                  </td>
                  <td className="error-message" title={error.message}>
                    {error.message.length > 60 
                      ? error.message.substring(0, 60) + '...' 
                      : error.message}
                  </td>
                  <td className="error-file">
                    {error.fileExtension ? (
                      <code>{error.fileExtension}</code>
                    ) : (
                      <span className="error-na">—</span>
                    )}
                  </td>
                  <td className="error-browser">
                    {error.browserInfo || <span className="error-na">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
