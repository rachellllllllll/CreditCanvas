/**
 * Custom hook for loading and processing analytics data
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  getFirestore, 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs,
  where
} from 'firebase/firestore';
import { getFirebaseApp } from '../../../utils/firebaseAuth';
import { 
  AnalyticsEvent, 
  Stats, 
  DateRange, 
  TrendDataPoint,
  HourlyActivity,
  DeviceBreakdown,
  ConsoleErrorEvent
} from '../types';
import type { MappingType } from '../../../utils/analytics';

interface UseAnalyticsDataReturn {
  events: AnalyticsEvent[];
  errors: ConsoleErrorEvent[];
  stats: Stats | null;
  trendData: TrendDataPoint[];
  hourlyActivity: HourlyActivity[];
  deviceBreakdown: DeviceBreakdown;
  referrerBreakdown: Record<string, number>;
  featureUsage: Record<string, number>;
  categoryMappings: Array<{ excelCategory: string; selectedCategory: string; count: number; descriptions: string[]; date: string; mappingType: MappingType }>;
  loading: boolean;
  error: string | null;
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  refresh: () => Promise<void>;
  loadUserFullHistory: (visitorId: string) => Promise<AnalyticsEvent[]>;
  userRealDates: Map<string, { firstSeen: number; lastSeen: number }>;
  userFullEvents: Map<string, AnalyticsEvent[]>;
}

export function useAnalyticsData(): UseAnalyticsDataReturn {
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [errors, setErrors] = useState<ConsoleErrorEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('week');
  const [userRealDates, setUserRealDates] = useState<Map<string, { firstSeen: number; lastSeen: number }>>(new Map());
  const [userFullEvents, setUserFullEvents] = useState<Map<string, AnalyticsEvent[]>>(new Map());

  // Calculate date boundaries based on range
  const getDateBoundary = useCallback((range: DateRange): number => {
    const now = new Date();
    switch (range) {
      case 'today':
        now.setHours(0, 0, 0, 0);
        return now.getTime();
      case 'week':
        now.setDate(now.getDate() - 7);
        return now.getTime();
      case 'month':
        now.setMonth(now.getMonth() - 1);
        return now.getTime();
      case 'year':
        now.setFullYear(now.getFullYear() - 1);
        return now.getTime();
      default:
        now.setDate(now.getDate() - 7);
        return now.getTime();
    }
  }, []);

  // Load data from Firestore
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const app = getFirebaseApp();
      if (!app) {
        throw new Error('Firebase לא מאותחל - בדוק את ההגדרות');
      }

      const db = getFirestore(app);
      const eventsRef = collection(db, 'analytics_events');
      
      const startTime = getDateBoundary(dateRange);
      
      // Query with date filter
      const q = query(
        eventsRef, 
        where('timestamp', '>=', startTime),
        orderBy('timestamp', 'desc'), 
        limit(2000)
      );

      // Timeout of 15 seconds
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('תם הזמן — טעינת הנתונים לקחה יותר מדי זמן')), 15000);
      });

      const snapshot = await Promise.race([getDocs(q), timeoutPromise]);
      
      const loadedEvents: AnalyticsEvent[] = [];
      const loadedErrors: ConsoleErrorEvent[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.event === 'console_error') {
          // Flatten metadata for console_error events
          loadedErrors.push({
            id: doc.id,
            visitorId: data.visitorId,
            timestamp: data.timestamp,
            createdAt: data.createdAt,
            event: data.event,
            // Spread metadata fields to top level
            ...(data.metadata || {}),
          } as ConsoleErrorEvent);
        } else {
          loadedEvents.push({
            id: doc.id,
            ...data
          } as AnalyticsEvent);
        }
      });

      setEvents(loadedEvents);
      setErrors(loadedErrors);
    } catch (err) {
      console.error('[Admin] Error loading analytics:', err);
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת נתונים');
    } finally {
      setLoading(false);
    }
  }, [dateRange, getDateBoundary]);

  // Calculate statistics from events
  const stats = useMemo((): Stats | null => {
    if (events.length === 0) {
      return {
        totalEvents: 0,
        uniqueVisitors: 0,
        eventsToday: 0,
        eventsByType: {},
        newVisitors: 0,
        returningVisitors: 0,
        avgSessionDuration: 0,
        totalFileUploads: 0,
        errorCount: 0
      };
    }

    const uniqueVisitorIds = new Set(events.map(e => e.visitorId));
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();
    
    const eventsToday = events.filter(e => e.timestamp >= todayTimestamp).length;

    const eventsByType: Record<string, number> = {};
    let newVisitors = 0;
    let totalSessionDuration = 0;
    let sessionCount = 0;
    let totalFileUploads = 0;
    let errorCount = 0;

    events.forEach(e => {
      eventsByType[e.event] = (eventsByType[e.event] || 0) + 1;

      if (e.event === 'session_start' && e.metadata?.isNewUser) {
        newVisitors++;
      }
      
      if (e.event === 'session_duration' && typeof e.metadata?.durationSeconds === 'number') {
        totalSessionDuration += e.metadata.durationSeconds as number;
        sessionCount++;
      }
      // תאימות לאחור - נתוני duration ישנים שנשמרו בתוך session_start
      if (e.event === 'session_start' && typeof e.metadata?.prevSessionDurationSeconds === 'number') {
        totalSessionDuration += e.metadata.prevSessionDurationSeconds as number;
        sessionCount++;
      }

      if (e.event === 'files_loaded') {
        totalFileUploads++;
      }

      if (e.event === 'file_error') {
        errorCount++;
      }
    });

    return {
      totalEvents: events.length,
      uniqueVisitors: uniqueVisitorIds.size,
      eventsToday,
      eventsByType,
      newVisitors,
      returningVisitors: uniqueVisitorIds.size - newVisitors,
      avgSessionDuration: sessionCount > 0 ? Math.round(totalSessionDuration / sessionCount) : 0,
      totalFileUploads,
      errorCount
    };
  }, [events]);

  // Calculate trend data for charts
  const trendData = useMemo((): TrendDataPoint[] => {
    if (events.length === 0) return [];

    const dailyMap = new Map<string, TrendDataPoint>();
    
    events.forEach(e => {
      const date = new Date(e.timestamp);
      const dateKey = date.toISOString().split('T')[0];
      const label = date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
      
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, {
          date: dateKey,
          label,
          visitors: 0,
          events: 0,
          fileUploads: 0
        });
      }
      
      const day = dailyMap.get(dateKey)!;
      day.events++;
      
      if (e.event === 'session_start') {
        day.visitors++;
      }
      if (e.event === 'files_loaded') {
        day.fileUploads++;
      }
    });

    return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [events]);

  // Calculate hourly activity
  const hourlyActivity = useMemo((): HourlyActivity[] => {
    const hourMap = new Map<number, number>();
    
    for (let i = 0; i < 24; i++) {
      hourMap.set(i, 0);
    }
    
    events.forEach(e => {
      const hour = new Date(e.timestamp).getHours();
      hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
    });

    return Array.from(hourMap.entries()).map(([hour, count]) => ({ hour, count }));
  }, [events]);

  // Calculate device breakdown
  const deviceBreakdown = useMemo((): DeviceBreakdown => {
    const breakdown = { desktop: 0, mobile: 0, tablet: 0 };
    
    events.forEach(e => {
      if (e.metadata?.deviceType) {
        const device = e.metadata.deviceType as keyof DeviceBreakdown;
        if (breakdown[device] !== undefined) {
          breakdown[device]++;
        }
      }
    });

    return breakdown;
  }, [events]);

  // Calculate referrer breakdown from session_start events
  const referrerBreakdown = useMemo((): Record<string, number> => {
    const breakdown: Record<string, number> = {};
    events.forEach(e => {
      if (e.event === 'session_start' && e.metadata?.referrer) {
        const ref = e.metadata.referrer as string;
        breakdown[ref] = (breakdown[ref] || 0) + 1;
      }
    });
    return breakdown;
  }, [events]);

  // Calculate feature usage from feature_used events
  const featureUsage = useMemo((): Record<string, number> => {
    const usage: Record<string, number> = {};
    events.forEach(e => {
      if (e.event === 'feature_used' && e.metadata?.feature) {
        const feature = e.metadata.feature as string;
        usage[feature] = (usage[feature] || 0) + 1;
      }
    });
    return usage;
  }, [events]);

  // Extract category mappings from category_assigned events
  const categoryMappings = useMemo(() => {
    const mappings: Array<{ excelCategory: string; selectedCategory: string; count: number; descriptions: string[]; date: string; mappingType: MappingType }> = [];
    events.forEach(e => {
      if (e.event === 'category_assigned' && Array.isArray(e.metadata?.mappings)) {
        const eventDate = new Date(e.timestamp).toLocaleDateString('he-IL');
        (e.metadata.mappings as Array<{ excelCategory?: string; selectedCategory?: string; count?: number; descriptions?: string[]; mappingType?: MappingType }>).forEach(m => {
          if (m.excelCategory && m.selectedCategory) {
            mappings.push({
              excelCategory: m.excelCategory,
              selectedCategory: m.selectedCategory,
              count: m.count || 0,
              descriptions: m.descriptions || [],
              date: eventDate,
              mappingType: m.mappingType || 'manual_mapping', // fallback for old data
            });
          }
        });
      }
    });
    return mappings;
  }, [events]);

  // Load data on mount and when date range changes
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load full event history for all users (for accurate stats in Users table)
  const loadUserFullData = useCallback(async () => {
    if (events.length === 0) return;
    
    try {
      const app = getFirebaseApp();
      if (!app) return;
      const db = getFirestore(app);
      
      // קבלת רשימת visitorIds ייחודיים
      const visitorIds = Array.from(new Set(events.map(e => e.visitorId)));
      const datesMap = new Map<string, { firstSeen: number; lastSeen: number }>();
      const fullEventsMap = new Map<string, AnalyticsEvent[]>();

      // טעינת כל האירועים לכל משתמש — שאילתה אחת במקום שתיים (first+last)
      const eventsRef = collection(db, 'analytics_events');
      
      const dataPromises = visitorIds.map(async (visitorId) => {
        const userQuery = query(
          eventsRef,
          where('visitorId', '==', visitorId),
          orderBy('timestamp', 'desc'),
          limit(500)
        );

        const snapshot = await getDocs(userQuery);
        const userEvents: AnalyticsEvent[] = [];
        snapshot.forEach((doc) => {
          userEvents.push({ id: doc.id, ...doc.data() } as AnalyticsEvent);
        });

        // חישוב firstSeen/lastSeen מכל האירועים
        let firstSeen = 0;
        let lastSeen = 0;
        if (userEvents.length > 0) {
          // Events are sorted DESC, so first item is latest, last item is earliest
          lastSeen = userEvents[0].timestamp;
          firstSeen = userEvents[userEvents.length - 1].timestamp;
        }

        return { visitorId, firstSeen, lastSeen, events: userEvents };
      });

      const results = await Promise.all(dataPromises);
      
      results.forEach(({ visitorId, firstSeen, lastSeen, events: userEvts }) => {
        datesMap.set(visitorId, { firstSeen, lastSeen });
        fullEventsMap.set(visitorId, userEvts);
      });

      setUserRealDates(datesMap);
      setUserFullEvents(fullEventsMap);
    } catch (err) {
      console.error('[Admin] Error loading user full data:', err);
    }
  }, [events]);

  // Load full user data when events change
  useEffect(() => {
    loadUserFullData();
  }, [loadUserFullData]);

  // Load full history for a specific user (ignores date filter)
  const loadUserFullHistory = useCallback(async (visitorId: string): Promise<AnalyticsEvent[]> => {
    try {
      const app = getFirebaseApp();
      if (!app) return [];
      const db = getFirestore(app);
      const eventsRef = collection(db, 'analytics_events');
      const q = query(
        eventsRef,
        where('visitorId', '==', visitorId),
        orderBy('timestamp', 'desc'),
        limit(500)
      );
      const snapshot = await getDocs(q);
      const result: AnalyticsEvent[] = [];
      snapshot.forEach((doc) => {
        result.push({ id: doc.id, ...doc.data() } as AnalyticsEvent);
      });
      return result;
    } catch (err) {
      console.error('[Admin] Error loading user history:', err);
      return [];
    }
  }, []);

  return {
    events,
    errors,
    stats,
    trendData,
    hourlyActivity,
    deviceBreakdown,
    referrerBreakdown,
    featureUsage,
    categoryMappings,
    loading,
    error,
    dateRange,
    setDateRange,
    refresh: loadData,
    loadUserFullHistory,
    userRealDates,
    userFullEvents
  };
}
