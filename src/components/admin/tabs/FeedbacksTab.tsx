/**
 * Feedbacks Tab Component
 * הצגת כל המשובים שהמשתמש נתן
 */

import React, { useMemo } from 'react';
import type { UserSummary } from '../userDataUtils';

interface FeedbacksTabProps {
  user: UserSummary;
}

interface FeedbackEntry {
  id: string;
  timestamp: number;
  rating: number;
  text: string;
  submissionNumber: number;
}

export default function FeedbacksTab({ user }: FeedbacksTabProps) {
  // Extract feedback events
  const feedbacks = useMemo(() => {
    const entries: FeedbackEntry[] = [];
    
    user.events.forEach(e => {
      if (e.event === 'user_feedback' && e.metadata) {
        const rating = typeof e.metadata.rating === 'number' ? e.metadata.rating : 0;
        const text = typeof e.metadata.text === 'string' ? e.metadata.text : '';
        const submissionNumber = typeof e.metadata.submissionNumber === 'number' 
          ? e.metadata.submissionNumber 
          : entries.length + 1;
        
        if (rating > 0) {
          entries.push({
            id: e.id || `${e.timestamp}`,
            timestamp: e.timestamp,
            rating,
            text,
            submissionNumber,
          });
        }
      }
    });
    
    // Sort by timestamp (newest first)
    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }, [user.events]);

  // Calculate average rating
  const avgRating = useMemo(() => {
    if (feedbacks.length === 0) return 0;
    const sum = feedbacks.reduce((acc, f) => acc + f.rating, 0);
    return Math.round((sum / feedbacks.length) * 10) / 10;
  }, [feedbacks]);

  if (feedbacks.length === 0) {
    return (
      <div className="tab-empty-state">
        <span className="tab-empty-icon">💬</span>
        <p>המשתמש עדיין לא השאיר משובים</p>
      </div>
    );
  }

  return (
    <div className="feedbacks-tab-wrapper">
      {/* Summary Header */}
      <div className="feedbacks-summary">
        <div className="feedbacks-summary-stat">
          <span className="feedbacks-summary-value">{feedbacks.length}</span>
          <span className="feedbacks-summary-label">משובים</span>
        </div>
        <div className="feedbacks-summary-stat">
          <span className="feedbacks-summary-value">
            {'⭐'.repeat(Math.round(avgRating))} {avgRating}
          </span>
          <span className="feedbacks-summary-label">ממוצע</span>
        </div>
      </div>

      {/* Feedbacks List */}
      <div className="feedbacks-list">
        {feedbacks.map((feedback) => (
          <div key={feedback.id} className="feedback-card">
            <div className="feedback-header">
              <div className="feedback-rating">
                {'⭐'.repeat(feedback.rating)}
              </div>
              <div className="feedback-meta">
                <span className="feedback-date">
                  {new Date(feedback.timestamp).toLocaleDateString('he-IL', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
                <span className="feedback-time">
                  {new Date(feedback.timestamp).toLocaleTimeString('he-IL', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
            
            {feedback.text && (
              <div className="feedback-text">
                "{feedback.text}"
              </div>
            )}
            
            <div className="feedback-footer">
              <span className="feedback-number">משוב #{feedback.submissionNumber}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
