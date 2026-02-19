/**
 * Users Table Component
 * טבלת משתמשים — כל שורה = משתמש ייחודי, עם Timeline נפתח
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { AnalyticsEvent } from './types';
import { aggregateUsers, deviceIcon, formatShortDuration } from './userDataUtils';
import UserTimeline from './UserTimeline';

interface UsersTableProps {
  events: AnalyticsEvent[];
  loadUserFullHistory?: (visitorId: string) => Promise<AnalyticsEvent[]>;
  userRealDates?: Map<string, { firstSeen: number; lastSeen: number }>;
}

type SortKey = 'visits' | 'files' | 'lastSeen' | 'duration' | 'errors';
type FilterKey = 'all' | 'withFeedback' | 'withErrors' | 'new' | 'powerUsers';

export default function UsersTable({ events, loadUserFullHistory, userRealDates }: UsersTableProps) {
  const [sortBy, setSortBy] = useState<SortKey>('lastSeen');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterBy, setFilterBy] = useState<FilterKey>('all');
  const [searchText, setSearchText] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [fullHistoryUser, setFullHistoryUser] = useState<{ visitorId: string; events: AnalyticsEvent[] } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // Aggregate events into user summaries
  const users = useMemo(() => aggregateUsers(events, userRealDates), [events, userRealDates]);

  // Filter
  const filtered = useMemo(() => {
    let result = users;

    // Search
    if (searchText.trim()) {
      const s = searchText.toLowerCase();
      result = result.filter(u =>
        u.visitorId.toLowerCase().includes(s) ||
        u.referrer.toLowerCase().includes(s) ||
        u.deviceType.toLowerCase().includes(s) ||
        u.featuresUsed.some(f => f.toLowerCase().includes(s))
      );
    }

    // Filter presets
    switch (filterBy) {
      case 'withFeedback':
        result = result.filter(u => u.feedbackCount > 0);
        break;
      case 'withErrors':
        result = result.filter(u => u.errorCount > 0);
        break;
      case 'new':
        result = result.filter(u => u.visitCount === 1);
        break;
      case 'powerUsers':
        result = result.filter(u => u.visitCount >= 5);
        break;
    }

    // Sort
    result = [...result].sort((a, b) => {
      let diff = 0;
      switch (sortBy) {
        case 'visits': diff = a.visitCount - b.visitCount; break;
        case 'files': diff = a.fileUploads - b.fileUploads; break;
        case 'lastSeen': diff = a.lastSeen - b.lastSeen; break;
        case 'duration': diff = a.totalDuration - b.totalDuration; break;
        case 'errors': diff = a.errorCount - b.errorCount; break;
      }
      return sortOrder === 'desc' ? -diff : diff;
    });

    return result;
  }, [users, searchText, filterBy, sortBy, sortOrder]);

  // Pagination
  const paged = useMemo(() => {
    return filtered.slice(page * pageSize, (page + 1) * pageSize);
  }, [filtered, page]);
  const totalPages = Math.ceil(filtered.length / pageSize);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortOrder('desc');
    }
  };

  const sortArrow = (key: SortKey) => {
    if (sortBy !== key) return '';
    return sortOrder === 'desc' ? ' ↓' : ' ↑';
  };

  // Export CSV
  const exportCSV = () => {
    const headers = ['מזהה', 'מכשיר', 'ביקורים', 'קבצים', 'משוב', 'שגיאות', 'מקור', 'ראשון', 'אחרון', 'זמן שהייה', 'פיצ׳רים'];
    const rows = filtered.map(u => [
      u.visitorId,
      u.deviceType,
      u.visitCount,
      u.fileUploads,
      u.feedbackRating ?? '—',
      u.errorCount,
      u.referrer,
      new Date(u.firstSeen).toLocaleDateString('he-IL'),
      new Date(u.lastSeen).toLocaleDateString('he-IL'),
      formatShortDuration(u.totalDuration),
      u.featuresUsed.join('; '),
    ]);
    const csv = [
      headers.join(','),
      ...rows.map(r => r.map(c => `"${c}"`).join(',')),
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `users_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // כשנבחר משתמש — טען את ההיסטוריה המלאה שלו (ללא הגבלת תאריך)
  useEffect(() => {
    if (!selectedUserId || !loadUserFullHistory) {
      setFullHistoryUser(null);
      return;
    }
    // אם כבר טעון עבור אותו משתמש, דלג
    if (fullHistoryUser?.visitorId === selectedUserId) return;

    let cancelled = false;
    setHistoryLoading(true);
    loadUserFullHistory(selectedUserId).then(fullEvents => {
      if (cancelled) return;
      if (fullEvents.length > 0) {
        setFullHistoryUser({ visitorId: selectedUserId, events: fullEvents });
      } else {
        // fallback: השתמש באירועים המסוננים
        setFullHistoryUser(null);
      }
      setHistoryLoading(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId, loadUserFullHistory]);

  // בנה user summary מההיסטוריה המלאה אם קיימת, אחרת מהאירועים המסוננים
  const selectedUser = useMemo(() => {
    if (!selectedUserId) return null;
    if (fullHistoryUser?.visitorId === selectedUserId) {
      const fullUsers = aggregateUsers(fullHistoryUser.events);
      return fullUsers.find(u => u.visitorId === selectedUserId) || null;
    }
    return users.find(u => u.visitorId === selectedUserId) || null;
  }, [selectedUserId, fullHistoryUser, users]);

  if (users.length === 0) {
    return (
      <div className="users-table-section">
        <div className="empty-state">
          <div className="empty-state-icon">👥</div>
          <div className="empty-state-title">אין נתוני משתמשים</div>
          <div className="empty-state-desc">נתונים יופיעו כאן לאחר שמשתמשים יבקרו באפליקציה</div>
        </div>
      </div>
    );
  }

  return (
    <div className="users-table-section">
      {/* Header */}
      <div className="table-header">
        <h2>👥 משתמשים ({filtered.length.toLocaleString('he-IL')})</h2>
        <div className="table-controls">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="חיפוש מזהה/מקור..."
              value={searchText}
              onChange={e => { setSearchText(e.target.value); setPage(0); }}
              className="search-input"
            />
            {searchText && (
              <button className="search-clear" onClick={() => setSearchText('')}>✕</button>
            )}
          </div>
          <select
            value={filterBy}
            onChange={e => { setFilterBy(e.target.value as FilterKey); setPage(0); }}
            className="filter-select"
          >
            <option value="all">כל המשתמשים</option>
            <option value="withFeedback">עם משוב 💬</option>
            <option value="withErrors">עם שגיאות 🔴</option>
            <option value="new">חדשים (ביקור אחד) 🆕</option>
            <option value="powerUsers">משתמשי-על (5+) 🔥</option>
          </select>
          <button onClick={exportCSV} className="export-btn" title="ייצוא ל-CSV">
            📥 ייצוא
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="events-table-wrapper">
        <table className="events-table users-table">
          <thead>
            <tr>
              <th>👤 מזהה</th>
              <th>📱</th>
              <th className="sortable" onClick={() => handleSort('visits')}>
                ביקורים{sortArrow('visits')}
              </th>
              <th className="sortable" onClick={() => handleSort('files')}>
                קבצים{sortArrow('files')}
              </th>
              <th>⭐ משוב</th>
              <th className="sortable" onClick={() => handleSort('errors')}>
                שגיאות{sortArrow('errors')}
              </th>
              <th>🌐 מקור</th>
              <th className="sortable" onClick={() => handleSort('lastSeen')}>
                פעילות{sortArrow('lastSeen')}
              </th>
              <th className="sortable" onClick={() => handleSort('duration')}>
                ⏱️{sortArrow('duration')}
              </th>
            </tr>
          </thead>
          <tbody>
            {paged.map(u => (
              <React.Fragment key={u.visitorId}>
                <tr
                  className={`users-row ${u.errorCount > 0 ? 'row-error-hint' : ''} ${u.visitCount >= 5 ? 'row-power-hint' : ''} ${selectedUserId === u.visitorId ? 'row-selected' : ''}`}
                  onClick={() => setSelectedUserId(selectedUserId === u.visitorId ? null : u.visitorId)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="visitor-cell">
                    <code>{u.visitorId.slice(0, 8)}</code>
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '1.1rem' }}>
                    {deviceIcon(u.deviceType)}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={u.visitCount >= 5 ? 'power-badge' : ''}>{u.visitCount}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>{u.fileUploads || '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    {u.feedbackRating !== null ? (
                      <span className="feedback-mini">
                        {'⭐'.repeat(Math.round(u.feedbackRating))}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--admin-text-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {u.errorCount > 0 ? (
                      <span className="error-count-badge">{u.errorCount}</span>
                    ) : (
                      <span style={{ color: 'var(--admin-text-muted)' }}>—</span>
                    )}
                  </td>
                  <td>
                    <span className="referrer-mini">
                      {referrerShort(u.referrer)}
                    </span>
                  </td>
                  <td className="time-cell">
                    <span className="time-date">
                      {new Date(u.lastSeen).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}
                    </span>
                    <span className="time-hour">
                      {u.firstSeen !== u.lastSeen
                        ? `מאז ${new Date(u.firstSeen).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}`
                        : 'ביקור ראשון'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--admin-text-secondary)' }}>
                    {formatShortDuration(u.totalDuration)}
                  </td>
                </tr>

                {/* Timeline panel - opens below selected row */}
                {selectedUserId === u.visitorId && (
                  <tr className="timeline-row">
                    <td colSpan={9} style={{ padding: 0, border: 'none' }}>
                      {historyLoading ? (
                        <div className="user-timeline-panel" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 }}>
                          <div className="spinner" style={{ width: 24, height: 24 }} />
                          <span style={{ color: 'var(--admin-text-secondary)' }}>טוען היסטוריה מלאה...</span>
                        </div>
                      ) : selectedUser ? (
                        <UserTimeline
                          user={selectedUser}
                          onClose={() => setSelectedUserId(null)}
                        />
                      ) : null}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button onClick={() => setPage(0)} disabled={page === 0} className="pagination-btn">⏮️</button>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="pagination-btn">◀️</button>
          <span className="pagination-info">עמוד {page + 1} מתוך {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="pagination-btn">▶️</button>
          <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} className="pagination-btn">⏭️</button>
        </div>
      )}
    </div>
  );
}

// ============================================
// Helpers
// ============================================

function referrerShort(ref: string): string {
  const map: Record<string, string> = {
    direct: '🔗 ישיר',
    google: '🔍 Google',
    facebook: '📘 Facebook',
    whatsapp: '💬 WhatsApp',
    linkedin: '💼 LinkedIn',
    twitter: '🐦 Twitter/X',
    github: '🐙 GitHub',
    telegram: '✈️ Telegram',
    bing: '🔎 Bing',
    reddit: '🤖 Reddit',
    other: '🌐 אחר',
    unknown: '❓ לא ידוע',
  };
  return map[ref] || ref;
}
