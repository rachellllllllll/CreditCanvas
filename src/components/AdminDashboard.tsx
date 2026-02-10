/**
 * Admin Dashboard Component
 * דף ניהול לצפייה בנתוני אנליטיקס מ-Firebase
 */

import React, { useState, useEffect } from 'react';
import { 
  signInWithGoogle, 
  logOut, 
  onAuthChange, 
  isAdmin,
  type User 
} from '../utils/firebaseAuth';
import { 
  getFirestore, 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs
} from 'firebase/firestore';
import { getApps } from 'firebase/app';
import './AdminDashboard.css';

// ============================================
// Types
// ============================================

interface AnalyticsEvent {
  id: string;
  visitorId: string;
  event: string;
  timestamp: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

interface Stats {
  totalEvents: number;
  uniqueVisitors: number;
  eventsToday: number;
  eventsByType: Record<string, number>;
}

// ============================================
// Admin Dashboard Component
// ============================================

export default function AdminDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  // האזנה לשינויי auth
  useEffect(() => {
    const unsubscribe = onAuthChange((authUser) => {
      setUser(authUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // טעינת נתונים כשמשתמש מורשה
  useEffect(() => {
    if (user && isAdmin(user)) {
      loadAnalyticsData();
    }
  }, [user]);

  // פונקציה לטעינת נתונים מ-Firestore
  async function loadAnalyticsData() {
    setLoadingData(true);
    setError(null);

    try {
      const apps = getApps();
      if (apps.length === 0) {
        throw new Error('Firebase לא מאותחל');
      }
      
      const db = getFirestore(apps[0]);
      const eventsRef = collection(db, 'analytics_events');
      
      // שליפת 500 אירועים אחרונים
      const q = query(eventsRef, orderBy('timestamp', 'desc'), limit(500));
      const snapshot = await getDocs(q);
      
      const loadedEvents: AnalyticsEvent[] = [];
      snapshot.forEach((doc) => {
        loadedEvents.push({
          id: doc.id,
          ...doc.data()
        } as AnalyticsEvent);
      });
      
      setEvents(loadedEvents);
      
      // חישוב סטטיסטיקות
      const uniqueVisitors = new Set(loadedEvents.map(e => e.visitorId)).size;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTimestamp = today.getTime();
      
      const eventsToday = loadedEvents.filter(e => e.timestamp >= todayTimestamp).length;
      
      const eventsByType: Record<string, number> = {};
      loadedEvents.forEach(e => {
        eventsByType[e.event] = (eventsByType[e.event] || 0) + 1;
      });
      
      setStats({
        totalEvents: loadedEvents.length,
        uniqueVisitors,
        eventsToday,
        eventsByType
      });
      
    } catch (err) {
      console.error('Error loading analytics:', err);
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת נתונים');
    } finally {
      setLoadingData(false);
    }
  }

  // מסך טעינה
  if (loading) {
    return (
      <div className="admin-container">
        <div className="admin-loading">
          <div className="spinner"></div>
          <p>טוען...</p>
        </div>
      </div>
    );
  }

  // מסך התחברות
  if (!user) {
    return (
      <div className="admin-container">
        <div className="admin-login">
          <div className="admin-login-card">
            <h1>🔐 כניסת מנהל</h1>
            <p>התחבר עם חשבון Google מורשה</p>
            
            {error && (
              <div className="login-error">
                ⚠️ {error}
                {error.includes('auth/unauthorized-domain') && (
                  <p className="error-hint">
                    יש להוסיף את הדומיין ב-Firebase Console → Authentication → Settings → Authorized domains
                  </p>
                )}
                {error.includes('auth/operation-not-allowed') && (
                  <p className="error-hint">
                    יש להפעיל Google Sign-in ב-Firebase Console → Authentication → Sign-in method → Google
                  </p>
                )}
              </div>
            )}
            
            <button 
              className="google-login-btn"
              onClick={async () => {
                setError(null);
                try {
                  await signInWithGoogle();
                } catch (err: unknown) {
                  console.error('[Admin] Login error:', err);
                  if (err instanceof Error) {
                    // שגיאות נפוצות
                    if (err.message.includes('auth/unauthorized-domain')) {
                      setError('הדומיין לא מורשה. יש להוסיף אותו ב-Firebase Console.');
                    } else if (err.message.includes('auth/operation-not-allowed')) {
                      setError('Google Sign-in לא מופעל. יש להפעיל ב-Firebase Console.');
                    } else if (err.message.includes('popup-closed')) {
                      setError('החלון נסגר. נסה שוב.');
                    } else {
                      setError(err.message);
                    }
                  } else {
                    setError('שגיאה לא ידועה בהתחברות');
                  }
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

  // משתמש מחובר אבל לא מורשה
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

  // רשימת סוגי אירועים לפילטר
  const eventTypes = ['all', ...Object.keys(stats?.eventsByType || {})];
  
  // סינון אירועים
  const filteredEvents = filter === 'all' 
    ? events 
    : events.filter(e => e.event === filter);

  // דשבורד אדמין
  return (
    <div className="admin-container">
      <header className="admin-header">
        <div className="admin-title">
          <h1>📊 דשבורד אדמין</h1>
          <span className="user-info">
            {user.photoURL && <img src={user.photoURL} alt="" className="user-avatar" />}
            {user.displayName || user.email}
          </span>
        </div>
        <div className="admin-actions">
          <button onClick={loadAnalyticsData} className="refresh-btn" disabled={loadingData}>
            🔄 רענן
          </button>
          <button onClick={logOut} className="logout-btn">התנתק</button>
          <a href="/" className="back-link">← חזרה לאפליקציה</a>
        </div>
      </header>

      {error && (
        <div className="admin-error">
          ⚠️ {error}
        </div>
      )}

      {loadingData ? (
        <div className="admin-loading">
          <div className="spinner"></div>
          <p>טוען נתונים...</p>
        </div>
      ) : (
        <>
          {/* כרטיסי סטטיסטיקות */}
          {stats && (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{stats.totalEvents}</div>
                <div className="stat-label">סה"כ אירועים</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.uniqueVisitors}</div>
                <div className="stat-label">מבקרים ייחודיים</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.eventsToday}</div>
                <div className="stat-label">אירועים היום</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{Object.keys(stats.eventsByType).length}</div>
                <div className="stat-label">סוגי אירועים</div>
              </div>
            </div>
          )}

          {/* התפלגות לפי סוג */}
          {stats && (
            <div className="events-breakdown">
              <h2>📈 התפלגות לפי סוג אירוע</h2>
              <div className="breakdown-grid">
                {Object.entries(stats.eventsByType)
                  .sort(([,a], [,b]) => b - a)
                  .map(([type, count]) => (
                    <div key={type} className="breakdown-item">
                      <span className="event-type">{type}</span>
                      <span className="event-count">{count}</span>
                      <div 
                        className="event-bar" 
                        style={{ width: `${(count / stats.totalEvents) * 100}%` }}
                      />
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* טבלת אירועים */}
          <div className="events-table-section">
            <div className="table-header">
              <h2>📋 אירועים אחרונים</h2>
              <select 
                value={filter} 
                onChange={(e) => setFilter(e.target.value)}
                className="filter-select"
              >
                {eventTypes.map(type => (
                  <option key={type} value={type}>
                    {type === 'all' ? 'הכל' : type}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="events-table-wrapper">
              <table className="events-table">
                <thead>
                  <tr>
                    <th>זמן</th>
                    <th>סוג אירוע</th>
                    <th>מזהה מבקר</th>
                    <th>מידע נוסף</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.slice(0, 100).map(event => (
                    <tr key={event.id}>
                      <td className="time-cell">
                        {new Date(event.timestamp).toLocaleString('he-IL')}
                      </td>
                      <td>
                        <span className="event-badge">{event.event}</span>
                      </td>
                      <td className="visitor-cell">
                        {event.visitorId.slice(0, 8)}...
                      </td>
                      <td className="metadata-cell">
                        {event.metadata && Object.keys(event.metadata).length > 0 && (
                          <details>
                            <summary>פרטים</summary>
                            <pre>{JSON.stringify(event.metadata, null, 2)}</pre>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {filteredEvents.length > 100 && (
              <p className="table-note">מציג 100 מתוך {filteredEvents.length} אירועים</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
