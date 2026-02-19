/**
 * User Data Utilities
 * פונקציות עיבוד: קיבוץ אירועים לפי visitorId ליצירת פרופיל משתמש
 */

import type { AnalyticsEvent } from './types';

// ============================================
// Types
// ============================================

export interface UserSummary {
  visitorId: string;
  deviceType: string;
  visitCount: number;
  fileUploads: number;
  feedbackRating: number | null; // ממוצע דירוגים, null אם אין
  feedbackCount: number;
  errorCount: number;
  firstSeen: number;       // timestamp
  lastSeen: number;        // timestamp
  totalDuration: number;   // שניות
  referrer: string;
  featuresUsed: string[];
  events: AnalyticsEvent[];
}

export interface TimelineDay {
  date: string;       // YYYY-MM-DD
  label: string;      // תאריך בעברית
  events: TimelineEvent[];
  totalDuration: number | null;
}

export interface TimelineEvent {
  id: string;
  timestamp: number;
  time: string;        // HH:MM
  type: string;        // event name
  icon: string;
  color: string;       // CSS color
  title: string;       // כותרת בעברית
  details: string[];   // שורות פרטים
  raw: AnalyticsEvent;
}

// ============================================
// Aggregate events into user summaries
// ============================================

export function aggregateUsers(
  events: AnalyticsEvent[], 
  userRealDates?: Map<string, { firstSeen: number; lastSeen: number }>
): UserSummary[] {
  const usersMap = new Map<string, AnalyticsEvent[]>();

  // קיבוץ לפי visitorId
  for (const event of events) {
    if (!usersMap.has(event.visitorId)) {
      usersMap.set(event.visitorId, []);
    }
    usersMap.get(event.visitorId)!.push(event);
  }

  // יצירת סיכום לכל משתמש
  const users: UserSummary[] = [];

  for (const [visitorId, userEvents] of usersMap) {
    const sorted = [...userEvents].sort((a, b) => a.timestamp - b.timestamp);

    let deviceType = '—';
    let visitCount = 0;
    let fileUploads = 0;
    let totalRating = 0;
    let feedbackCount = 0;
    let errorCount = 0;
    let totalDuration = 0;
    let referrer = 'ישיר';
    const featuresUsed = new Set<string>();

    for (const e of sorted) {
      if (e.event === 'session_start') {
        visitCount++;
        if (e.metadata?.deviceType) deviceType = e.metadata.deviceType as string;
        if (e.metadata?.referrer) referrer = e.metadata.referrer as string;
      }
      if (e.event === 'files_loaded') {
        fileUploads++;
      }
      if (e.event === 'user_feedback' && typeof e.metadata?.rating === 'number') {
        totalRating += e.metadata.rating as number;
        feedbackCount++;
      }
      if (e.event === 'file_error') {
        errorCount++;
      }
      if (e.event === 'session_duration' && typeof e.metadata?.durationSeconds === 'number') {
        totalDuration += e.metadata.durationSeconds as number;
      }
      // תאימות לאחור - duration ישן בתוך session_start
      if (e.event === 'session_start' && typeof e.metadata?.prevSessionDurationSeconds === 'number') {
        totalDuration += e.metadata.prevSessionDurationSeconds as number;
      }
      if (e.event === 'feature_used' && e.metadata?.feature) {
        featuresUsed.add(e.metadata.feature as string);
      }
    }

    // שימוש בתאריכים האמיתיים אם קיימים (מכל ההיסטוריה), אחרת שימוש באירועים המסוננים
    const realDates = userRealDates?.get(visitorId);
    const firstSeenTimestamp = realDates?.firstSeen ?? sorted[0]?.timestamp ?? 0;
    const lastSeenTimestamp = realDates?.lastSeen ?? sorted[sorted.length - 1]?.timestamp ?? 0;

    users.push({
      visitorId,
      deviceType,
      visitCount: visitCount || 1,
      fileUploads,
      feedbackRating: feedbackCount > 0 ? Math.round((totalRating / feedbackCount) * 10) / 10 : null,
      feedbackCount,
      errorCount,
      firstSeen: firstSeenTimestamp,
      lastSeen: lastSeenTimestamp,
      totalDuration,
      referrer,
      featuresUsed: Array.from(featuresUsed),
      events: sorted,
    });
  }

  return users;
}

// ============================================
// Build timeline for a single user
// ============================================

export function buildTimeline(events: AnalyticsEvent[]): TimelineDay[] {
  const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp); // newest first
  const daysMap = new Map<string, TimelineEvent[]>();
  const dayDurations = new Map<string, number>();

  for (const e of sorted) {
    const date = new Date(e.timestamp);
    const dateKey = date.toISOString().split('T')[0];
    const timeStr = date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

    if (!daysMap.has(dateKey)) {
      daysMap.set(dateKey, []);
    }

    const { icon, color, title, details } = formatEvent(e);

    daysMap.get(dateKey)!.push({
      id: e.id || `${e.visitorId}-${e.timestamp}`,
      timestamp: e.timestamp,
      time: timeStr,
      type: e.event,
      icon,
      color,
      title,
      details,
      raw: e,
    });

    // סיכום משך סשן ליום
    if (e.event === 'session_duration' && typeof e.metadata?.durationSeconds === 'number') {
      dayDurations.set(dateKey, (dayDurations.get(dateKey) || 0) + (e.metadata.durationSeconds as number));
    }
  }

  const days: TimelineDay[] = [];
  for (const [dateKey, dayEvents] of daysMap) {
    const date = new Date(dateKey + 'T12:00:00');
    days.push({
      date: dateKey,
      label: date.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }),
      events: dayEvents,
      totalDuration: dayDurations.get(dateKey) || null,
    });
  }

  return days.sort((a, b) => b.date.localeCompare(a.date)); // newest first
}

// ============================================
// Format individual events for display
// ============================================

interface FormattedEvent {
  icon: string;
  color: string;
  title: string;
  details: string[];
}

function formatEvent(e: AnalyticsEvent): FormattedEvent {
  const m = e.metadata || {};

  switch (e.event) {
    case 'session_start':
      return {
        icon: '🟢',
        color: '#22c55e',
        title: 'נכנס לאפליקציה',
        details: [
          deviceLabel(m.deviceType as string),
          m.referrer ? `🌐 ${referrerLabel(m.referrer as string)}` : '',
          m.visitCount ? `ביקור #${m.visitCount}` : '',
          m.isNewUser ? '🆕 משתמש חדש' : '',
        ].filter(Boolean),
      };

    case 'files_loaded':
      return {
        icon: '📤',
        color: '#3b82f6',
        title: 'העלה קבצים',
        details: [
          m.fileCount ? `${m.fileCount} קבצים` : '',
          m.transactionCount ? `${Number(m.transactionCount).toLocaleString('he-IL')} עסקאות` : '',
          m.monthCount ? `${m.monthCount} חודשים` : '',
          m.categoryCount ? `${m.categoryCount} קטגוריות` : '',
        ].filter(Boolean),
      };

    case 'feature_used':
      return {
        icon: '⚡',
        color: '#f59e0b',
        title: `השתמש: ${m.feature || 'פיצ׳ר'}`,
        details: [],
      };

    case 'file_error':
      return {
        icon: '🔴',
        color: '#ef4444',
        title: 'שגיאת קובץ',
        details: [
          m.errorType ? errorTypeLabel(m.errorType as string) : '',
          m.fileExtension ? `קובץ ${m.fileExtension}` : '',
          m.browserInfo ? `${m.browserInfo}` : '',
        ].filter(Boolean),
      };

    case 'user_feedback': {
      const rating = typeof m.rating === 'number' ? m.rating : 0;
      const stars = '⭐'.repeat(rating);
      return {
        icon: '💬',
        color: '#eab308',
        title: `משוב ${stars}`,
        details: [
          m.text ? `"${m.text}"` : '',
          m.submissionNumber ? `משוב #${m.submissionNumber}` : '',
        ].filter(Boolean),
      };
    }

    case 'category_assigned': {
      const mappings = Array.isArray(m.mappings) ? m.mappings as Array<{ excelCategory?: string; selectedCategory?: string }> : [];
      const mappingStrs = mappings.slice(0, 3).map(
        (mp) => `${mp.excelCategory || '?'} → ${mp.selectedCategory || '?'}`
      );
      if (mappings.length > 3) mappingStrs.push(`+${mappings.length - 3} נוספים`);
      return {
        icon: '🏷️',
        color: '#8b5cf6',
        title: `מיפה ${mappings.length} קטגוריות`,
        details: mappingStrs,
      };
    }

    case 'session_duration':
      return {
        icon: '⏱️',
        color: '#64748b',
        title: `שהה ${formatDuration(m.durationSeconds as number || 0)}`,
        details: [],
      };

    case 'consent_decision':
      return {
        icon: m.consented ? '✅' : '❌',
        color: m.consented ? '#22c55e' : '#ef4444',
        title: m.consented ? 'אישר הסכמה' : 'סירב להסכמה',
        details: [],
      };

    default: {
      const hebrewKeys: Record<string, string> = {
        deviceType: 'סוג מכשיר', referrer: 'מקור', fileCount: 'קבצים',
        transactionCount: 'עסקאות', feature: 'פיצ׳ר', errorType: 'סוג שגיאה',
        rating: 'דירוג', visitCount: 'מספר ביקור',
      };
      return {
        icon: '📌',
        color: '#64748b',
        title: e.event.replace(/_/g, ' '),
        details: Object.entries(m).slice(0, 3).map(([k, v]) => `${hebrewKeys[k] || k}: ${v}`),
      };
    }
  }
}

// ============================================
// Helpers
// ============================================

function deviceLabel(type: string | undefined): string {
  if (!type) return '';
  const map: Record<string, string> = { desktop: '💻 מחשב', mobile: '📱 נייד', tablet: '📲 טאבלט' };
  return map[type] || type;
}

function referrerLabel(ref: string): string {
  const map: Record<string, string> = {
    direct: 'ישיר',
    google: 'Google',
    facebook: 'Facebook',
    whatsapp: 'WhatsApp',
    linkedin: 'LinkedIn',
    twitter: 'Twitter/X',
    github: 'GitHub',
    telegram: 'Telegram',
    bing: 'Bing',
    reddit: 'Reddit',
    other: 'אחר',
    unknown: 'לא ידוע',
  };
  return map[ref] || ref;
}

function errorTypeLabel(type: string): string {
  const map: Record<string, string> = {
    file_read_error: 'שגיאת קריאה',
    parse_error: 'שגיאת פענוח',
    invalid_format: 'פורמט לא תקין',
    file_access_error: 'שגיאת גישה',
  };
  return map[type] || type;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 60) return `${seconds} שניות`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (min < 60) return `${min}:${sec.toString().padStart(2, '0')} דקות`;
  const hr = Math.floor(min / 60);
  const mins = min % 60;
  return `${hr}:${mins.toString().padStart(2, '0')} שעות`;
}

export function formatShortDuration(seconds: number): string {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}שנ׳`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (min < 60) return `${min}:${sec.toString().padStart(2, '0')}`;
  const hr = Math.floor(min / 60);
  const mins = min % 60;
  return `${hr}:${mins.toString().padStart(2, '0')}`;
}

export function deviceIcon(type: string): string {
  const map: Record<string, string> = { desktop: '💻', mobile: '📱', tablet: '📲' };
  return map[type] || '❓';
}

export function referrerIcon(ref: string): string {
  const map: Record<string, string> = {
    direct: '🔗', google: '🔍', facebook: '📘', whatsapp: '💬',
    linkedin: '💼', twitter: '🐦', github: '🐙', telegram: '✈️',
    bing: '🔎', reddit: '🤖', other: '🌐', unknown: '❓',
  };
  return map[ref] || '🌐';
}
