/**
 * User Timeline Component
 * תצוגת Timeline ויזואלית של כל הפעילות של משתמש בודד
 */

import React, { useState } from 'react';
import type { UserSummary } from './userDataUtils';
import { buildTimeline, deviceIcon, formatShortDuration } from './userDataUtils';

interface UserTimelineProps {
  user: UserSummary;
  onClose: () => void;
}

export default function UserTimeline({ user, onClose }: UserTimelineProps) {
  const timeline = buildTimeline(user.events);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(
    // פותחים את 2 הימים האחרונים כברירת מחדל
    new Set(timeline.slice(0, 2).map(d => d.date))
  );

  const toggleDay = (date: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  return (
    <div className="user-timeline-panel">
      {/* Header */}
      <div className="timeline-header">
        <div className="timeline-header-info">
          <span className="timeline-user-id">
            {deviceIcon(user.deviceType)} משתמש <code>{user.visitorId.slice(0, 8)}</code>
          </span>
          <div className="timeline-user-badges">
            <span className="timeline-badge">{user.visitCount} ביקורים</span>
            <span className="timeline-badge">{user.fileUploads} העלאות</span>
            {user.feedbackRating !== null && (
              <span className="timeline-badge timeline-badge-gold">
                {'⭐'.repeat(Math.round(user.feedbackRating))} {user.feedbackRating}
              </span>
            )}
            {user.errorCount > 0 && (
              <span className="timeline-badge timeline-badge-red">
                {user.errorCount} שגיאות
              </span>
            )}
            {user.featuresUsed.length > 0 && (
              <span className="timeline-badge">{user.featuresUsed.length} פיצ׳רים</span>
            )}
          </div>
        </div>
        <button className="timeline-close-btn" onClick={onClose} title="סגור">✕</button>
      </div>

      {/* Features used list */}
      {user.featuresUsed.length > 0 && (
        <div className="timeline-features">
          {user.featuresUsed.map(f => (
            <span key={f} className="timeline-feature-tag">⚡ {f}</span>
          ))}
        </div>
      )}

      {/* Timeline Days */}
      <div className="timeline-days">
        {timeline.map(day => {
          const isOpen = expandedDays.has(day.date);
          return (
            <div key={day.date} className="timeline-day">
              <button
                className={`timeline-day-header ${isOpen ? 'open' : ''}`}
                onClick={() => toggleDay(day.date)}
              >
                <span className="timeline-day-label">📅 {day.label}</span>
                <span className="timeline-day-meta">
                  {day.events.length} אירועים
                  {day.totalDuration ? ` · ⏱️ ${formatShortDuration(day.totalDuration)}` : ''}
                </span>
                <span className="timeline-day-toggle">{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div className="timeline-events">
                  {day.events.map((event, idx) => (
                    <div key={event.id} className="timeline-event">
                      {/* Connector line */}
                      <div className="timeline-connector">
                        <div
                          className="timeline-dot"
                          style={{ backgroundColor: event.color }}
                        >
                          {event.icon}
                        </div>
                        {idx < day.events.length - 1 && (
                          <div className="timeline-line" />
                        )}
                      </div>

                      {/* Event content */}
                      <div className="timeline-event-content">
                        <div className="timeline-event-header">
                          <span className="timeline-event-time">{event.time}</span>
                          <span className="timeline-event-title">{event.title}</span>
                        </div>
                        {event.details.length > 0 && (
                          <div className="timeline-event-details">
                            {event.details.map((d, i) => (
                              <span key={i} className="timeline-detail-item">{d}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
