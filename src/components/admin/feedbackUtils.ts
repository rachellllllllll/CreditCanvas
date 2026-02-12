/**
 * Feedback utilities for Admin Dashboard
 * פונקציות עזר לחילוץ וחישוב סטטיסטיקות משוב
 */

import type { AnalyticsEvent } from './types';

export interface FeedbackEntry {
  id: string;
  visitorId: string;
  rating: number;
  text: string;
  visitCount: number;
  submissionNumber: number;
  timestamp: number;
  createdAt: string;
}

export interface FeedbackStats {
  totalFeedbacks: number;
  averageRating: number;
  ratingDistribution: Record<number, number>;
  withText: number;
  uniqueResponders: number;
}

export function extractFeedbackEntries(events: AnalyticsEvent[]): FeedbackEntry[] {
  return events
    .filter(e => e.event === 'user_feedback' && e.metadata?.rating)
    .map(e => ({
      id: e.id,
      visitorId: e.visitorId,
      rating: (e.metadata?.rating as number) || 0,
      text: (e.metadata?.text as string) || '',
      visitCount: (e.metadata?.visitCount as number) || 0,
      submissionNumber: (e.metadata?.submissionNumber as number) || 1,
      timestamp: e.timestamp,
      createdAt: e.createdAt,
    }))
    .sort((a, b) => b.timestamp - a.timestamp);
}

export function calculateFeedbackStats(entries: FeedbackEntry[]): FeedbackStats {
  if (entries.length === 0) {
    return {
      totalFeedbacks: 0,
      averageRating: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      withText: 0,
      uniqueResponders: 0,
    };
  }

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  const responders = new Set<string>();

  entries.forEach(e => {
    sum += e.rating;
    distribution[e.rating] = (distribution[e.rating] || 0) + 1;
    responders.add(e.visitorId);
  });

  return {
    totalFeedbacks: entries.length,
    averageRating: Math.round((sum / entries.length) * 10) / 10,
    ratingDistribution: distribution,
    withText: entries.filter(e => e.text.trim().length > 0).length,
    uniqueResponders: responders.size,
  };
}
