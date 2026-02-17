import React, { useState, useMemo } from 'react';
import type { ConsoleErrorEvent, ErrorStats } from './types';
import './ErrorsTable.css';

interface ErrorsTableProps {
  errors: ConsoleErrorEvent[];
  eventsByType?: Record<string, number>;
  loading?: boolean;
}

/**
 * ErrorsTable - אטבל של שגיאות עבור admin dashboard
 * מציגה שגיאות שנתקבלו, מקצב אותן ומאפשר סינון
 */
const ErrorsTable: React.FC<ErrorsTableProps> = ({ errors, loading = false }) => {
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'latest' | 'frequency'>('latest');

  // סינון וסידור שגיאות
  const filteredAndSorted = useMemo(() => {
    let result = [...errors];

    // סינון לפי סוג
    if (filterType) {
      result = result.filter(e => e.errorType === filterType);
    }

    // סידור
    if (sortBy === 'frequency') {
      // ספור שגיאות זהות
      const counts = new Map<string, number>();
      result.forEach(e => {
        const key = `${e.errorType}:${e.errorMessage}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      result.sort((a, b) => {
        const keyA = `${a.errorType}:${a.errorMessage}`;
        const keyB = `${b.errorType}:${b.errorMessage}`;
        return (counts.get(keyB) || 0) - (counts.get(keyA) || 0);
      });
    } else {
      // לפי תאריך (חדש ראשון)
      result.sort((a, b) => b.timestamp - a.timestamp);
    }

    return result.slice(0, 50); // הגבל ל-50 שגיאות אחרונות
  }, [errors, filterType, sortBy]);

  // סטטיסטיקות
  const errorStats = useMemo(() => {
    const stats: ErrorStats = {
      totalErrors: errors.length,
      errorsByType: {},
      errorsToday: 0,
      uniqueUsersWithErrors: 0,
      topErrors: [],
      criticalErrorCount: 0,
    };

    // ספירה לפי סוג
    errors.forEach(e => {
      stats.errorsByType[e.errorType] = (stats.errorsByType[e.errorType] || 0) + 1;
      
      // שגיאות לא הפיכות
      if (!e.isRecoverable) {
        stats.criticalErrorCount++;
      }

      // שגיאות היום
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (e.timestamp >= today.getTime()) {
        stats.errorsToday++;
      }
    });

    // משתמשים ייחודיים עם שגיאות
    stats.uniqueUsersWithErrors = new Set(errors.map(e => e.visitorId)).size;

    // Top שגיאות (לפי message)
    const messageCounts = new Map<string, number>();
    errors.forEach(e => {
      messageCounts.set(e.errorMessage, (messageCounts.get(e.errorMessage) || 0) + 1);
    });
    stats.topErrors = Array.from(messageCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([message, count]) => ({ message, count }));

    return stats;
  }, [errors]);

  const getErrorTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      react_error: '#ef4444',        // red
      global_error: '#f97316',       // orange
      console_error: '#eab308',      // yellow
      parse_error: '#ec4899',        // pink
      storage_error: '#6366f1',      // indigo
      network_error: '#06b6d4',      // cyan
      other: '#8b5cf6',              // violet
    };
    return colors[type] || '#808080';
  };

  const getErrorTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      react_error: '⚛️ React Error',
      global_error: '🌐 Global Error',
      console_error: '💻 Console Error',
      parse_error: '📝 Parse Error',
      storage_error: '💾 Storage Error',
      network_error: '🔗 Network Error',
      other: '❓ Other',
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="errors-table-container">
        <div className="loading">⏳ טוען שגיאות...</div>
      </div>
    );
  }

  if (errors.length === 0) {
    return (
      <div className="errors-table-container">
        <div className="empty-state">
          <p>✅ אין שגיאות בתקופה הנבחרת</p>
        </div>
      </div>
    );
  }

  return (
    <div className="errors-table-container">
      {/* Stats Cards */}
      <div className="errors-stats">
        <div className="stat-card total">
          <div className="stat-value">{errorStats.totalErrors}</div>
          <div className="stat-label">שגיאות כוללות</div>
        </div>
        <div className="stat-card today">
          <div className="stat-value">{errorStats.errorsToday}</div>
          <div className="stat-label">היום</div>
        </div>
        <div className="stat-card critical">
          <div className="stat-value">{errorStats.criticalErrorCount}</div>
          <div className="stat-label">לא הפיכות</div>
        </div>
        <div className="stat-card users">
          <div className="stat-value">{errorStats.uniqueUsersWithErrors}</div>
          <div className="stat-label">משתמשים</div>
        </div>
      </div>

      {/* Top Errors */}
      {errorStats.topErrors.length > 0 && (
        <div className="top-errors">
          <h3>🔝 שגיאות תכופות</h3>
          <div className="top-errors-list">
            {errorStats.topErrors.map((err, idx) => (
              <div key={idx} className="top-error-item">
                <span className="top-error-count">{err.count}×</span>
                <span className="top-error-message">{err.message.substring(0, 80)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters & Controls */}
      <div className="errors-controls">
        <div className="control-group">
          <label>סוג שגיאה:</label>
          <select 
            value={filterType || ''} 
            onChange={(e) => setFilterType(e.target.value || null)}
            className="filter-select"
          >
            <option value="">הכל</option>
            {Object.keys(errorStats.errorsByType).map(type => (
              <option key={type} value={type}>
                {getErrorTypeLabel(type)} ({errorStats.errorsByType[type]})
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label>סדר:</label>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value as 'latest' | 'frequency')}
            className="filter-select"
          >
            <option value="latest">חדש ראשון</option>
            <option value="frequency">תכוף ראשון</option>
          </select>
        </div>
      </div>

      {/* Errors Table */}
      <table className="errors-table">
        <thead>
          <tr>
            <th>סוג</th>
            <th>שגיאה</th>
            <th>דפדפן</th>
            <th>תאריך</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filteredAndSorted.map((error) => (
            <React.Fragment key={error.id}>
              <tr className={`error-row ${!error.isRecoverable ? 'critical' : ''}`}>
                <td>
                  <span 
                    className="error-badge"
                    style={{ backgroundColor: getErrorTypeColor(error.errorType) }}
                    title={error.errorType}
                  >
                    {getErrorTypeLabel(error.errorType).split(' ')[0]}
                  </span>
                </td>
                <td className="error-message">
                  <strong>{error.errorName || 'Unknown'}</strong>
                  <br />
                  <span className="message-text">{error.errorMessage}</span>
                </td>
                <td className="browser-info">{error.browserInfo}</td>
                <td className="timestamp">
                  {new Date(error.timestamp).toLocaleString('he-IL', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td className="expand-btn">
                  <button
                    className="expand-toggle"
                    onClick={() => setExpandedErrorId(
                      expandedErrorId === error.id ? null : error.id
                    )}
                    title="הצג פרטים"
                  >
                    {expandedErrorId === error.id ? '▼' : '▶'}
                  </button>
                </td>
              </tr>

              {expandedErrorId === error.id && (
                <tr className="error-details-row">
                  <td colSpan={5}>
                    <div className="error-details">
                      {error.componentStack && (
                        <div className="detail-section">
                          <strong>Component Stack:</strong>
                          <pre>{error.componentStack.substring(0, 300)}</pre>
                        </div>
                      )}
                      <div className="detail-section">
                        <strong>Full Message:</strong>
                        <pre>{error.errorMessage}</pre>
                      </div>
                      <div className="detail-meta">
                        <span>Recoverable: {error.isRecoverable ? '✓' : '✗'}</span>
                        <span>Visitor: {error.visitorId.substring(0, 8)}...</span>
                        <span>Created: {new Date(error.createdAt).toLocaleString('he-IL')}</span>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      {filteredAndSorted.length > 0 && (
        <div className="table-footer">
          מוצגות {filteredAndSorted.length} שגיאות מתוך {filteredAndSorted.length === 50 ? 'מעל 50' : errors.length}
        </div>
      )}
    </div>
  );
};

export default ErrorsTable;
