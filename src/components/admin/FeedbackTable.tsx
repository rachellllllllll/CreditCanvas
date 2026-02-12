/**
 * Feedback Table Component for Admin Dashboard
 * טבלת משובים מפורטת עם דירוגים, טקסט ומידע על המשתמש
 */

import React, { useState, useMemo } from 'react';
import { calculateFeedbackStats } from './feedbackUtils';
import type { FeedbackEntry } from './feedbackUtils';

interface FeedbackTableProps {
  feedbackEvents: FeedbackEntry[];
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span className="feedback-stars-display" style={{ direction: 'ltr', display: 'inline-flex', gap: '1px' }}>
      {[1, 2, 3, 4, 5].map(s => (
        <span key={s} style={{ color: s <= rating ? '#f59e0b' : '#475569', fontSize: '1rem' }}>★</span>
      ))}
    </span>
  );
}

function RatingBar({ rating, count, total }: { rating: number; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="feedback-rating-bar" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
      <span style={{ width: '20px', textAlign: 'center', color: 'var(--admin-text-secondary)' }}>{rating}</span>
      <span style={{ color: '#f59e0b', fontSize: '0.9rem' }}>★</span>
      <div style={{
        flex: 1,
        height: '8px',
        background: 'var(--admin-bg-hover)',
        borderRadius: '4px',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: rating >= 4 ? 'var(--admin-success)' : rating >= 3 ? 'var(--admin-warning)' : 'var(--admin-error)',
          borderRadius: '4px',
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ width: '30px', textAlign: 'left', color: 'var(--admin-text-muted)' }}>{count}</span>
    </div>
  );
}

export default function FeedbackTable({ feedbackEvents }: FeedbackTableProps) {
  const [showOnlyWithText, setShowOnlyWithText] = useState(false);

  const stats = useMemo(() => calculateFeedbackStats(feedbackEvents), [feedbackEvents]);

  const displayed = useMemo(() => {
    if (showOnlyWithText) return feedbackEvents.filter(e => e.text.trim().length > 0);
    return feedbackEvents;
  }, [feedbackEvents, showOnlyWithText]);

  if (feedbackEvents.length === 0) {
    return (
      <div className="chart-card full-width">
        <h3 className="chart-title">💬 משובי משתמשים</h3>
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--admin-text-muted)' }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '12px' }}>📭</span>
          <p>טרם התקבלו משובים</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chart-card full-width">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <h3 className="chart-title" style={{ margin: 0 }}>💬 משובי משתמשים ({stats.totalFeedbacks})</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--admin-text-secondary)', fontSize: '0.85rem' }}>
          <input
            type="checkbox"
            checked={showOnlyWithText}
            onChange={e => setShowOnlyWithText(e.target.checked)}
            style={{ accentColor: 'var(--admin-primary)' }}
          />
          רק עם טקסט ({stats.withText})
        </label>
      </div>

      {/* Summary Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: '24px',
        marginBottom: '24px',
        padding: '16px',
        background: 'var(--admin-bg-main)',
        borderRadius: 'var(--admin-radius-sm)',
        alignItems: 'center',
      }}>
        {/* Average big number */}
        <div style={{ textAlign: 'center', minWidth: '100px' }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--admin-text-primary)', lineHeight: 1 }}>
            {stats.averageRating}
          </div>
          <StarDisplay rating={Math.round(stats.averageRating)} />
          <div style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)', marginTop: '4px' }}>
            {stats.uniqueResponders} משיבים
          </div>
        </div>

        {/* Rating distribution */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {[5, 4, 3, 2, 1].map(r => (
            <RatingBar key={r} rating={r} count={stats.ratingDistribution[r] || 0} total={stats.totalFeedbacks} />
          ))}
        </div>
      </div>

      {/* Feedback List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '500px', overflowY: 'auto' }}>
        {displayed.map(entry => (
          <div
            key={entry.id}
            style={{
              background: 'var(--admin-bg-main)',
              borderRadius: 'var(--admin-radius-sm)',
              padding: '14px 16px',
              borderRight: `3px solid ${entry.rating >= 4 ? 'var(--admin-success)' : entry.rating >= 3 ? 'var(--admin-warning)' : 'var(--admin-error)'}`,
            }}
          >
            {/* Top row: stars + date + visitor */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: entry.text ? '8px' : 0, flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <StarDisplay rating={entry.rating} />
                {entry.submissionNumber > 1 && (
                  <span style={{
                    fontSize: '0.7rem',
                    background: 'var(--admin-primary)',
                    color: '#fff',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}>
                    משוב #{entry.submissionNumber}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>
                <span>ביקור #{entry.visitCount}</span>
                <code style={{ fontSize: '0.75rem', opacity: 0.7 }}>{entry.visitorId.slice(0, 8)}</code>
                <span>{new Date(entry.timestamp).toLocaleDateString('he-IL')} {new Date(entry.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            {/* Text */}
            {entry.text && (
              <div style={{
                color: 'var(--admin-text-primary)',
                fontSize: '0.9rem',
                lineHeight: 1.5,
                direction: 'rtl',
              }}>
                "{entry.text}"
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
