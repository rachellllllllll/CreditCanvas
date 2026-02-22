/**
 * Admin Dashboard Component - Enhanced Version with Tabs
 * דשבורד אדמין משופר עם טאבים, גרפים, KPIs ומסננים
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  signInWithGoogle,
  logOut,
  onAuthChange,
  isAdmin,
  checkRedirectResult,
  type User
} from '../../utils/firebaseAuth';
import { useAnalyticsData } from './hooks/useAnalyticsData';
import KPICard from './KPICard';
import DateRangePicker from './DateRangePicker';
import TrendChart from './TrendChart';
import EventsPieChart from './EventsPieChart';
import DeviceChart from './DeviceChart';
import HourlyHeatmap from './HourlyHeatmap';
import UsersTable from './UsersTable';
import EventsTable from './EventsTable';
import FeedbackTable from './FeedbackTable';
import ReferrerChart from './ReferrerChart';
import FeatureUsageChart from './FeatureUsageChart';
import CategoryMappingsTable from './CategoryMappingsTable';
import ErrorsTable from './ErrorsTable';
import UnknownCreditDescriptionsTable from './UnknownCreditDescriptionsTable';
import { extractFeedbackEntries, calculateFeedbackStats } from './feedbackUtils';
import CategoryStatsChart from './CategoryStatsChart.tsx';
import './AdminDashboard.css';

// ============================================
// Tab Configuration
// ============================================
type TabId = 'overview' | 'users' | 'feedback' | 'data' | 'errors';

interface TabConfig {
  id: TabId;
  label: string;
  icon: string;
  badge?: number;
}

// ============================================
// Admin Dashboard Component
// ============================================

export default function AdminDashboardV2() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Analytics data hook
  const {
    events,
    errors,
    stats,
    trendData,
    hourlyActivity,
    deviceBreakdown,
    referrerBreakdown,
    featureUsage,
    categoryMappings,
    loading: dataLoading,
    error: dataError,
    dateRange,
    setDateRange,
    refresh,
    loadUserFullHistory,
    userRealDates,
    userFullEvents,
    loadingUserFullData
  } = useAnalyticsData();

  // Auth state management
  useEffect(() => {
    checkRedirectResult()
      .then((redirectUser) => {
        if (redirectUser) {
          // user authenticated via redirect
        }
      })
      .catch((err) => {
        console.error('[Admin] Redirect error:', err);
        setAuthError(err instanceof Error ? err.message : 'שגיאה בהתחברות');
      });

    const unsubscribe = onAuthChange((authUser) => {
      setUser(authUser);
      setAuthLoading(false);
    });

    return unsubscribe;
  }, []);

  // Extract feedback data
  const feedbackEntries = useMemo(() => extractFeedbackEntries(events), [events]);
  const feedbackStats = useMemo(() => calculateFeedbackStats(feedbackEntries), [feedbackEntries]);

  // Event types list for EventsTable
  const eventTypes = useMemo(() => {
    return Array.from(new Set(events.map(e => e.event))).sort();
  }, [events]);

  // ===== KPI Trend Calculation =====
  // Split current period into two halves to compute % change
  const kpiTrends = useMemo(() => {
    if (!events.length) return null;

    // Find the actual time range of loaded events
    const timestamps = events.map(e => e.timestamp);
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    const midTs = minTs + (maxTs - minTs) / 2;

    const recentEvents = events.filter(e => e.timestamp >= midTs);
    const olderEvents = events.filter(e => e.timestamp < midTs);

    const countMetric = (evts: typeof events, pred: (e: typeof events[0]) => boolean) =>
      evts.filter(pred).length;
    const uniqueVisitors = (evts: typeof events) =>
      new Set(evts.map(e => e.visitorId)).size;

    const calcChange = (current: number, previous: number): number | undefined => {
      if (previous === 0) return current > 0 ? 100 : undefined;
      return ((current - previous) / previous) * 100;
    };

    const recentVisitors = uniqueVisitors(recentEvents);
    const olderVisitors = uniqueVisitors(olderEvents);
    const recentNew = countMetric(recentEvents, e => e.event === 'session_start' && !!e.metadata?.isNewUser);
    const olderNew = countMetric(olderEvents, e => e.event === 'session_start' && !!e.metadata?.isNewUser);
    const recentUploads = countMetric(recentEvents, e => e.event === 'files_loaded');
    const olderUploads = countMetric(olderEvents, e => e.event === 'files_loaded');
    const recentErrors = countMetric(recentEvents, e => e.event === 'file_error');
    const olderErrors = countMetric(olderEvents, e => e.event === 'file_error');
    const recentTotal = recentEvents.length;
    const olderTotal = olderEvents.length;

    return {
      visitors: calcChange(recentVisitors, olderVisitors),
      newVisitors: calcChange(recentNew, olderNew),
      uploads: calcChange(recentUploads, olderUploads),
      events: calcChange(recentTotal, olderTotal),
      errors: calcChange(recentErrors, olderErrors),
    };
  }, [events]);

  const trendLabel = useMemo(() => {
    const labels: Record<string, string> = {
      today: 'מאתמול',
      week: 'מהשבוע הקודם',
      month: 'מהחודש הקודם',
      year: 'מהשנה הקודמת',
    };
    return labels[dateRange] || 'מהתקופה הקודמת';
  }, [dateRange]);

  // ===== Category Stats Aggregation =====
  const categoryStatsAgg = useMemo(() => {
    const catEvents = events.filter(e => e.event === 'category_stats' && e.metadata?.categories);
    if (!catEvents.length) return null;
    const totals: Record<string, number> = {};
    let count = 0;
    for (const e of catEvents) {
      const cats = e.metadata!.categories as Record<string, number>;
      for (const [cat, pct] of Object.entries(cats)) {
        totals[cat] = (totals[cat] || 0) + pct;
      }
      count++;
    }
    // Average percentages across all users
    const avg: Record<string, number> = {};
    for (const [cat, total] of Object.entries(totals)) {
      avg[cat] = Math.round(total / count);
    }
    return avg;
  }, [events]);

  // ===== Files Loaded KPIs =====
  const filesLoadedKpis = useMemo(() => {
    const flEvents = events.filter(e => e.event === 'files_loaded');
    if (!flEvents.length) return null;
    let totalTx = 0, totalMonths = 0, totalFiles = 0, n = 0;
    for (const e of flEvents) {
      const m = e.metadata as Record<string, unknown> | undefined;
      if (!m) continue;
      totalTx += Number(m.transactionCount || 0);
      totalMonths += Number(m.monthCount || 0);
      totalFiles += Number(m.fileCount || 0);
      n++;
    }
    return {
      avgTransactions: n > 0 ? Math.round(totalTx / n) : 0,
      avgMonths: n > 0 ? Math.round((totalMonths / n) * 10) / 10 : 0,
      avgFiles: n > 0 ? Math.round((totalFiles / n) * 10) / 10 : 0,
      totalUploads: flEvents.length,
    };
  }, [events]);

  // ===== File Error Events =====
  const fileErrors = useMemo(() => {
    return events
      .filter(e => e.event === 'file_error')
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [events]);

  // Tab configuration with dynamic badges
  const tabs: TabConfig[] = useMemo(() => [
    { id: 'overview', label: 'סקירה', icon: '📊' },
    { id: 'users', label: 'משתמשים', icon: '👥', badge: stats?.uniqueVisitors || undefined },
    { id: 'feedback', label: 'משובים', icon: '💬', badge: feedbackEntries.length || undefined },
    { id: 'data', label: 'נתונים', icon: '📋' },
    { id: 'errors', label: 'שגיאות', icon: '🛠️', badge: (errors.length + fileErrors.length) || undefined },
  ], [stats, feedbackEntries.length, errors.length, fileErrors.length]);

  // Loading state
  if (authLoading) {
    return (
      <div className="admin-container">
        <div className="admin-loading">
          <div className="spinner"></div>
          <p>טוען...</p>
        </div>
      </div>
    );
  }

  // Login screen
  if (!user) {
    return (
      <div className="admin-container">
        <div className="admin-login">
          <div className="admin-login-card">
            <h1>🔐 כניסת מנהל</h1>
            <p>התחבר עם חשבון Google מורשה</p>

            {authError && (
              <div className="login-error">
                ⚠️ {authError}
                {authError.includes('auth/unauthorized-domain') && (
                  <p className="error-hint">
                    יש להוסיף את הדומיין ב-Firebase Console → Authentication → Settings → Authorized domains
                  </p>
                )}
              </div>
            )}

            <button
              className="google-login-btn"
              onClick={async () => {
                setAuthError(null);
                try {
                  await signInWithGoogle();
                } catch (err) {
                  console.error('[Admin] Login error:', err);
                  setAuthError(err instanceof Error ? err.message : 'שגיאה בהתחברות');
                }
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              התחבר עם Google
            </button>
            <a href="/" className="back-link">← חזרה לאפליקציה</a>
          </div>
        </div>
      </div>
    );
  }

  // Unauthorized user
  if (!isAdmin(user)) {
    return (
      <div className="admin-container">
        <div className="admin-denied">
          <div className="admin-denied-card">
            <h1>⛔ אין הרשאה</h1>
            <p>המייל <strong>{user.email}</strong> לא מורשה לצפייה בדף זה.</p>
            <p className="hint">פנה למנהל המערכת להוספת הרשאה.</p>
            <div className="actions">
              <button onClick={logOut} className="logout-btn">התנתק</button>
              <a href="/" className="back-link">← חזרה לאפליקציה</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main Dashboard
  return (
    <div className="admin-container admin-tabbed">
      {/* Header */}
      <header className="admin-header">
        <div className="admin-title">
          <h1>📊 דשבורד אנליטיקס</h1>
          <span className="user-info">
            {user.photoURL && <img src={user.photoURL} alt="" className="user-avatar" />}
            {user.displayName || user.email}
          </span>
        </div>
        <div className="admin-actions">
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
            disabled={dataLoading}
          />
          <button onClick={refresh} className="refresh-btn" disabled={dataLoading}>
            {dataLoading ? '⏳' : '🔄'} רענן
          </button>
          {!dataLoading && events.length > 0 && (
            <span className="last-updated">
              עודכן {new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={logOut} className="logout-btn">התנתק</button>
          <a href="/" className="back-link">← חזרה לאפליקציה</a>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="admin-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`admin-tab ${activeTab === tab.id ? 'admin-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="admin-tab-icon">{tab.icon}</span>
            <span className="admin-tab-label">{tab.label}</span>
            {tab.badge != null && tab.badge > 0 && (
              <span className="admin-tab-badge">{tab.badge > 99 ? '99+' : tab.badge}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Error Message */}
      {dataError && (
        <div className="admin-error">
          ⚠️ {dataError}
        </div>
      )}

      {/* Loading State */}
      {dataLoading ? (
        <div className="admin-loading">
          <div className="spinner"></div>
          <p>טוען נתונים...</p>
        </div>
      ) : (
        <div className="admin-tab-content">
          {/* ===== Tab: Overview ===== */}
          {activeTab === 'overview' && (
            <>
              {/* KPI Cards - Row 1 */}
              <div className="kpi-grid">
                <KPICard icon="👥" value={stats?.uniqueVisitors || 0} label="מבקרים ייחודיים" color="primary" change={kpiTrends?.visitors} changeLabel={trendLabel} />
                <KPICard icon="🆕" value={stats?.newVisitors || 0} label="משתמשים חדשים" color="primary" change={kpiTrends?.newVisitors} changeLabel={trendLabel} />
                <KPICard icon="📤" value={stats?.totalFileUploads || 0} label="העלאות קבצים" color="success" change={kpiTrends?.uploads} changeLabel={trendLabel} />
                <KPICard icon="⏱️" value={stats?.avgSessionDuration ? formatDuration(stats.avgSessionDuration) : '—'} label="זמן שהייה ממוצע" color="info" />
              </div>
              {/* KPI Cards - Row 2 */}
              <div className="kpi-grid kpi-grid-secondary">
                <KPICard icon="📊" value={stats?.totalEvents || 0} label="סה״כ אירועים" color="info" change={kpiTrends?.events} changeLabel={trendLabel} />
                <KPICard
                  icon="💬"
                  value={feedbackStats.totalFeedbacks > 0 ? `${feedbackStats.averageRating} ⭐` : '—'}
                  label={`משובים (${feedbackStats.totalFeedbacks})`}
                  color={feedbackStats.averageRating >= 4 ? 'success' : feedbackStats.averageRating >= 3 ? 'warning' : feedbackStats.totalFeedbacks > 0 ? 'error' : 'info'}
                />
                <KPICard
                  icon="❌"
                  value={stats?.errorCount || 0}
                  label="שגיאות"
                  color={stats?.errorCount && stats.errorCount > 0 ? 'error' : 'success'}
                />
              </div>

              {/* KPI Cards - Row 3: Files Loaded */}
              {filesLoadedKpis && (
                <div className="kpi-grid kpi-grid-secondary">
                  <KPICard icon="📑" value={filesLoadedKpis.avgTransactions} label="ממוצע עסקאות להעלאה" color="info" />
                  <KPICard icon="📅" value={filesLoadedKpis.avgMonths} label="ממוצע חודשים להעלאה" color="info" />
                  <KPICard icon="📁" value={filesLoadedKpis.avgFiles} label="ממוצע קבצים להעלאה" color="info" />
                </div>
              )}

              {/* Charts */}
              <div className="charts-grid">
                <div className="chart-card full-width">
                  <TrendChart data={trendData} title="📈 מגמת שימוש" />
                </div>
                <div className="chart-card">
                  <EventsPieChart eventsByType={stats?.eventsByType || {}} title="🍩 התפלגות אירועים" />
                </div>
                <div className="chart-card">
                  <DeviceChart breakdown={deviceBreakdown} />
                </div>
                {categoryStatsAgg && (
                  <div className="chart-card">
                    <CategoryStatsChart categoryData={categoryStatsAgg} />
                  </div>
                )}
              </div>
            </>
          )}

          {/* ===== Tab: Users ===== */}
          {activeTab === 'users' && (
            <>
              <div className="charts-grid">
                <div className="chart-card">
                  <ReferrerChart referrerData={referrerBreakdown} />
                </div>
                <div className="chart-card">
                  <FeatureUsageChart featureData={featureUsage} />
                </div>
                <div className="chart-card full-width">
                  <HourlyHeatmap data={hourlyActivity} />
                </div>
              </div>
              <UsersTable
                events={events}
                loadUserFullHistory={loadUserFullHistory}
                userRealDates={userRealDates}
                userFullEvents={userFullEvents}
                loadingUserFullData={loadingUserFullData}
              />
            </>
          )}

          {/* ===== Tab: Feedback ===== */}
          {activeTab === 'feedback' && (
            <FeedbackTable feedbackEvents={feedbackEntries} />
          )}

          {/* ===== Tab: Data ===== */}
          {activeTab === 'data' && (
            <>
              <UnknownCreditDescriptionsTable events={events} onDeleted={refresh} />
              <CategoryMappingsTable mappings={categoryMappings} />
              <div className="section-header" style={{ marginTop: '24px' }}>
                <h2>📋 כל האירועים</h2>
              </div>
              <EventsTable events={events} eventTypes={eventTypes} />
            </>
          )}

          {/* ===== Tab: Errors ===== */}
          {activeTab === 'errors' && (
            <>
              {/* File Errors Section */}
              {fileErrors.length > 0 && (
                <div className="file-errors-section">
                  <h2>📂 שגיאות קבצים ({fileErrors.length})</h2>
                  <p className="file-errors-subtitle">שגיאות בפתיחה/פענוח של קבצי Excel — מידע על הפורמט, הדפדפן והסוג</p>
                  <div className="file-errors-table-wrapper">
                    <table className="file-errors-table">
                      <thead>
                        <tr>
                          <th>זמן</th>
                          <th>סוג שגיאה</th>
                          <th>הודעה</th>
                          <th>סיומת</th>
                          <th>דפדפן</th>
                          <th>מזהה</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fileErrors.slice(0, 50).map(e => (
                          <tr key={e.id}>
                            <td className="time-cell">
                              <span className="time-date">{new Date(e.timestamp).toLocaleDateString('he-IL')}</span>
                              <span className="time-hour">{new Date(e.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
                            </td>
                            <td><span className="event-badge event-error">{String(e.metadata?.errorType || '—')}</span></td>
                            <td className="error-msg-cell" title={String(e.metadata?.errorMessage || '')}>{String(e.metadata?.errorMessage || '—').slice(0, 80)}</td>
                            <td><code>{String(e.metadata?.fileExtension || '—')}</code></td>
                            <td className="browser-cell">{String(e.metadata?.browserInfo || '—')}</td>
                            <td className="visitor-cell"><code>{e.visitorId.slice(0, 8)}...</code></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {fileErrors.length > 50 && (
                    <p className="file-errors-more">מוצגות 50 מתוך {fileErrors.length} שגיאות</p>
                  )}
                </div>
              )}

              {/* Console Errors Section */}
              {errors.length > 0 ? (
                <ErrorsTable
                  errors={errors}
                  eventsByType={stats?.eventsByType || {}}
                  loading={dataLoading}
                />
              ) : fileErrors.length === 0 ? (
                <div className="admin-empty-tab">
                  <span className="admin-empty-tab-icon">✅</span>
                  <p>אין שגיאות בתקופה הנבחרת</p>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Helper Functions
// ============================================

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}שנ׳`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}:${secs.toString().padStart(2, '0')}`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${mins.toString().padStart(2, '0')}`;
}
