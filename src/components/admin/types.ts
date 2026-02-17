/**
 * Admin Dashboard Types
 */

// ============================================
// Analytics Event Types
// ============================================

export interface AnalyticsEvent {
  id: string;
  visitorId: string;
  event: string;
  timestamp: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// Statistics Types
// ============================================

export interface Stats {
  totalEvents: number;
  uniqueVisitors: number;
  eventsToday: number;
  eventsByType: Record<string, number>;
  // Enhanced stats
  newVisitors: number;
  returningVisitors: number;
  avgSessionDuration: number;
  totalFileUploads: number;
  errorCount: number;
}

export interface DailyStats {
  date: string;
  visitors: number;
  events: number;
  fileUploads: number;
  errors: number;
}

export interface HourlyActivity {
  hour: number;
  count: number;
}

export interface DeviceBreakdown {
  desktop: number;
  mobile: number;
  tablet: number;
}

// ============================================
// Filter Types
// ============================================

export type DateRange = 'today' | 'week' | 'month' | 'year' | 'custom';

export interface DateFilter {
  range: DateRange;
  startDate?: Date;
  endDate?: Date;
}

export interface EventFilter {
  eventType: string;
  dateRange: DateRange;
  searchText: string;
}

// ============================================
// Chart Data Types
// ============================================

export interface TrendDataPoint {
  date: string;
  label: string;
  visitors: number;
  events: number;
  fileUploads: number;
}

export interface PieChartData {
  name: string;
  value: number;
  color: string;
}

// ============================================
// Error Tracking Types
// ============================================

export interface ConsoleErrorEvent {
  id: string;
  visitorId: string;
  errorType: 'react_error' | 'global_error' | 'parse_error' | 'storage_error' | 'network_error' | 'console_error' | 'other';
  errorName: string;
  errorMessage: string;
  componentStack?: string;
  isRecoverable: boolean;
  browserInfo: string;
  timestamp: number;
  createdAt: string;
}

export interface ErrorStats {
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsToday: number;
  uniqueUsersWithErrors: number;
  topErrors: { message: string; count: number }[];
  criticalErrorCount: number; // Unrecoverable errors
}
