/**
 * Stats Tab Component
 * סטטיסטיקות מפורטות על המשתמש
 */

import React, { useMemo } from 'react';
import type { UserSummary } from '../userDataUtils';
import { formatShortDuration } from '../userDataUtils';

interface StatsTabProps {
  user: UserSummary;
}

export default function StatsTab({ user }: StatsTabProps) {
  // חישוב סטטיסטיקות מתקדמות מהאירועים
  const stats = useMemo(() => {
    const filesLoadedEvents = user.events.filter(e => e.event === 'files_loaded');
    
    let totalTransactions = 0;
    let totalMonths = 0;
    let totalFiles = 0;
    let totalCategories = 0;
    
    filesLoadedEvents.forEach(e => {
      const m = e.metadata;
      if (m) {
        totalTransactions += Number(m.transactionCount || 0);
        totalMonths += Number(m.monthCount || 0);
        totalFiles += Number(m.fileCount || 0);
        totalCategories += Number(m.categoryCount || 0);
      }
    });

    const avgTransactionsPerUpload = filesLoadedEvents.length > 0 
      ? Math.round(totalTransactions / filesLoadedEvents.length) 
      : 0;
    
    const avgFilesPerUpload = filesLoadedEvents.length > 0
      ? Math.round((totalFiles / filesLoadedEvents.length) * 10) / 10
      : 0;

    // חישוב ממוצע זמן לסשן
    const avgSessionDuration = user.visitCount > 0
      ? Math.round(user.totalDuration / user.visitCount)
      : 0;

    // חישוב return rate (אם ביקר יותר מפעם אחת)
    const returnRate = user.visitCount > 1
      ? Math.round(((user.visitCount - 1) / user.visitCount) * 100)
      : 0;

    // כמה ימים פעילים
    const uniqueDays = new Set(
      user.events.map(e => new Date(e.timestamp).toDateString())
    ).size;

    return {
      totalTransactions,
      totalMonths,
      totalFiles,
      totalCategories,
      avgTransactionsPerUpload,
      avgFilesPerUpload,
      avgSessionDuration,
      returnRate,
      uniqueDays,
    };
  }, [user]);

  return (
    <div className="stats-tab-wrapper">
      {/* Upload Statistics */}
      {user.fileUploads > 0 && (
        <div className="stats-section">
          <h3 className="stats-section-title">📤 סטטיסטיקות העלאות</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.totalTransactions.toLocaleString('he-IL')}</div>
              <div className="stat-label">סה״כ עסקאות</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.totalMonths}</div>
              <div className="stat-label">חודשים</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.totalCategories}</div>
              <div className="stat-label">קטגוריות</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.totalFiles}</div>
              <div className="stat-label">קבצים</div>
            </div>
          </div>
          
          <div className="stats-summary">
            <div className="stats-summary-item">
              <span className="stats-summary-icon">📊</span>
              <span>ממוצע {stats.avgTransactionsPerUpload} עסקאות להעלאה</span>
            </div>
            <div className="stats-summary-item">
              <span className="stats-summary-icon">📁</span>
              <span>ממוצע {stats.avgFilesPerUpload} קבצים להעלאה</span>
            </div>
          </div>
        </div>
      )}

      {/* Activity Statistics */}
      <div className="stats-section">
        <h3 className="stats-section-title">⏱️ סטטיסטיקות פעילות</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{formatShortDuration(user.totalDuration)}</div>
            <div className="stat-label">סה״כ זמן</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{formatShortDuration(stats.avgSessionDuration)}</div>
            <div className="stat-label">ממוצע לסשן</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.uniqueDays}</div>
            <div className="stat-label">ימים פעילים</div>
          </div>
          {user.visitCount > 1 && (
            <div className="stat-card">
              <div className="stat-value">{stats.returnRate}%</div>
              <div className="stat-label">שיעור חזרה</div>
            </div>
          )}
        </div>
      </div>

      {/* User Profile Summary */}
      <div className="stats-section">
        <h3 className="stats-section-title">👤 פרופיל משתמש</h3>
        <div className="stats-list">
          <div className="stats-list-item">
            <span className="stats-list-label">תאריך הצטרפות:</span>
            <span className="stats-list-value">
              {new Date(user.firstSeen).toLocaleDateString('he-IL', { 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
              })}
            </span>
          </div>
          <div className="stats-list-item">
            <span className="stats-list-label">ביקור אחרון:</span>
            <span className="stats-list-value">
              {new Date(user.lastSeen).toLocaleDateString('he-IL', { 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
              })}
            </span>
          </div>
          <div className="stats-list-item">
            <span className="stats-list-label">מכשיר:</span>
            <span className="stats-list-value">{user.deviceType}</span>
          </div>
          <div className="stats-list-item">
            <span className="stats-list-label">מקור:</span>
            <span className="stats-list-value">{user.referrer}</span>
          </div>
          <div className="stats-list-item">
            <span className="stats-list-label">סוג משתמש:</span>
            <span className="stats-list-value">
              {user.visitCount === 1 ? '🆕 חדש' : user.visitCount >= 5 ? '🔥 משתמש-על' : '🔄 חוזר'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
