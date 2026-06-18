/**
 * Timeline Tab Component
 * תצוגת ציר זמן כרונולוגי של כל אירועי המשתמש
 */

import React, { useState, useRef, useEffect } from 'react';
import type { UserSummary } from '../userDataUtils';
import { buildTimeline, formatShortDuration } from '../userDataUtils';

interface TimelineTabProps {
  user: UserSummary;
}

export default function TimelineTab({ user }: TimelineTabProps) {
  const timeline = buildTimeline(user.events);
  const daysRef = useRef<HTMLDivElement>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(
    // פותחים את 2 הימים האחרונים כברירת מחדל
    new Set(timeline.slice(0, 2).map(d => d.date))
  );

  // Reset scroll and expanded days when switching users
  useEffect(() => {
    if (daysRef.current) {
      daysRef.current.scrollTop = 0;
    }
    setExpandedDays(new Set(timeline.slice(0, 2).map(d => d.date)));
  }, [user.visitorId, timeline]);

  const toggleDay = (date: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  if (timeline.length === 0) {
    return (
      <div className="tab-empty-state">
        <span className="tab-empty-icon">📅</span>
        <p>אין אירועים להצגה</p>
      </div>
    );
  }

  return (
    <div className="timeline-tab-wrapper">
      {/* Timeline Days */}
      <div className="timeline-days" ref={daysRef}>
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
