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
import type { 
  AnalyticsEvent, 
  Stats, 
  DateRange, 
  TrendDataPoint,
  DailyStats,
  HourlyActivity,
  DeviceBreakdown
} from '../types';

interface UseAnalyticsDataReturn {
  events: AnalyticsEvent[];
  stats: Stats | null;
  trendData: TrendDataPoint[];
  dailyStats: DailyStats[];
  hourlyActivity: HourlyActivity[];
  deviceBreakdown: DeviceBreakdown;
  referrerBreakdown: Record<string, number>;
  featureUsage: Record<string, number>;
  categoryMappings: Array<{ excelCategory: string; selectedCategory: string; count: number; descriptions: string[]; date: string }>;
  loading: boolean;
  error: string | null;
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  refresh: () => Promise<void>;
}

export function useAnalyticsData(): UseAnalyticsDataReturn {
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('week');

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
        setTimeout(() => reject(new Error('Timeout - טעינת הנתונים לקחה יותר מדי זמן')), 15000);
      });

      const snapshot = await Promise.race([getDocs(q), timeoutPromise]);
      
      const loadedEvents: AnalyticsEvent[] = [];
      snapshot.forEach((doc) => {
        loadedEvents.push({
          id: doc.id,
          ...doc.data()
        } as AnalyticsEvent);
      });

      setEvents(loadedEvents);
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

  // Calculate daily stats
  const dailyStats = useMemo((): DailyStats[] => {
    return trendData.map(d => ({
      date: d.date,
      visitors: d.visitors,
      events: d.events,
      fileUploads: d.fileUploads,
      errors: events.filter(e => 
        new Date(e.timestamp).toISOString().split('T')[0] === d.date && 
        (e.event === 'file_error')
      ).length
    }));
  }, [trendData, events]);

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
    const mappings: Array<{ excelCategory: string; selectedCategory: string; count: number; descriptions: string[]; date: string }> = [];
    events.forEach(e => {
      if (e.event === 'category_assigned' && Array.isArray(e.metadata?.mappings)) {
        const eventDate = new Date(e.timestamp).toLocaleDateString('he-IL');
        (e.metadata.mappings as Array<{ excelCategory?: string; selectedCategory?: string; count?: number; descriptions?: string[] }>).forEach(m => {
          if (m.excelCategory && m.selectedCategory) {
            mappings.push({
              excelCategory: m.excelCategory,
              selectedCategory: m.selectedCategory,
              count: m.count || 0,
              descriptions: m.descriptions || [],
              date: eventDate,
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

  return {
    events,
    stats,
    trendData,
    dailyStats,
    hourlyActivity,
    deviceBreakdown,
    referrerBreakdown,
    featureUsage,
    categoryMappings,
    loading,
    error,
    dateRange,
    setDateRange,
    refresh: loadData
  };
}
