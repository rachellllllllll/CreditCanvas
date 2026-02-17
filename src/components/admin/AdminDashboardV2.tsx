/**
 * Admin Dashboard Component - Enhanced Version
 * דשבורד אדמין משופר עם גרפים, KPIs ומסננים
 */

import React, { useState, useEffect } from 'react';
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
import FeedbackTable from './FeedbackTable';
import ReferrerChart from './ReferrerChart';
import FeatureUsageChart from './FeatureUsageChart';
import CategoryMappingsTable from './CategoryMappingsTable';
import ErrorsTable from './ErrorsTable';
import { extractFeedbackEntries, calculateFeedbackStats } from './feedbackUtils';
import './AdminDashboard.css';

// ============================================
// Admin Dashboard Component
// ============================================

export default function AdminDashboardV2() {
  console.log('[Admin] AdminDashboard V2 rendering');
  
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

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
    loadUserFullHistory
  } = useAnalyticsData();

  // Auth state management
  useEffect(() => {
    console.log('[Admin] Setting up auth...');
    
    checkRedirectResult()
      .then((redirectUser) => {
        if (redirectUser) {
          console.log('[Admin] User from redirect:', redirectUser.email);
        }
      })
      .catch((err) => {
        console.error('[Admin] Redirect error:', err);
        setAuthError(err instanceof Error ? err.message : 'שגיאה בהתחברות');
      });

    const unsubscribe = onAuthChange((authUser) => {
      console.log('[Admin] Auth state changed:', authUser?.email || 'no user');
      setUser(authUser);
      setAuthLoading(false);
    });
    
    return unsubscribe;
  }, []);

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
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
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

  // Extract feedback data
  const feedbackEntries = extractFeedbackEntries(events);
  const feedbackStats = calculateFeedbackStats(feedbackEntries);

  // Main Dashboard
  return (
    <div className="admin-container">
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
        <>
          {/* KPI Cards - Row 1: Core metrics */}
          <div className="kpi-grid">
            <KPICard
              icon="👥"
              value={stats?.uniqueVisitors || 0}
              label="מבקרים ייחודיים"
              color="primary"
            />
            <KPICard
              icon="🆕"
              value={stats?.newVisitors || 0}
              label="משתמשים חדשים"
              color="primary"
            />
            <KPICard
              icon="📤"
              value={stats?.totalFileUploads || 0}
              label="העלאות קבצים"
              color="success"
            />
            <KPICard
              icon="⏱️"
              value={stats?.avgSessionDuration ? formatDuration(stats.avgSessionDuration) : '—'}
              label="זמן שהייה ממוצע"
              color="info"
            />
          </div>
          {/* KPI Cards - Row 2: Secondary metrics */}
          <div className="kpi-grid kpi-grid-secondary">
            <KPICard
              icon="📊"
              value={stats?.totalEvents || 0}
              label="סה״כ אירועים"
              color="info"
            />
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

          {/* Charts Grid */}
          <div className="section-header">
            <h2>📈 גרפים ותובנות</h2>
          </div>
          <div className="charts-grid">
            {/* Trend Chart - Full Width */}
            <div className="chart-card full-width">
              <TrendChart data={trendData} title="📈 מגמת שימוש" />
            </div>

            {/* Events Distribution */}
            <div className="chart-card">
              <EventsPieChart 
                eventsByType={stats?.eventsByType || {}} 
                title="🍩 התפלגות אירועים"
              />
            </div>

            {/* Device Breakdown */}
            <div className="chart-card">
              <DeviceChart breakdown={deviceBreakdown} />
            </div>

            {/* Referrer Sources */}
            <div className="chart-card">
              <ReferrerChart referrerData={referrerBreakdown} />
            </div>

            {/* Feature Usage */}
            <div className="chart-card">
              <FeatureUsageChart featureData={featureUsage} />
            </div>

            {/* Hourly Heatmap - Full Width */}
            <div className="chart-card full-width">
              <HourlyHeatmap data={hourlyActivity} />
            </div>
          </div>

          {/* Users Table with Timeline */}
          <UsersTable events={events} loadUserFullHistory={loadUserFullHistory} />

          {/* Feedback Table */}
          <FeedbackTable feedbackEvents={feedbackEntries} />

          {/* Category Mappings Table */}
          <CategoryMappingsTable mappings={categoryMappings} />

          {/* Errors Table */}
          {errors.length > 0 && (
            <div className="admin-section">
              <h2>🛠️ שגיאות במערכת</h2>
              <ErrorsTable 
                errors={errors} 
                eventsByType={stats?.eventsByType || {}}
                loading={dataLoading}
              />
            </div>
          )}
        </>
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
