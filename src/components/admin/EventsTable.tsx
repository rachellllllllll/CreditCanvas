/**
 * Enhanced Events Table Component
 * טבלת אירועים משופרת עם חיפוש, סינון וייצוא
 */

import React, { useState, useMemo } from 'react';
import type { AnalyticsEvent } from './types';

interface EventsTableProps {
  events: AnalyticsEvent[];
  eventTypes: string[];
}

export default function EventsTable({ events, eventTypes }: EventsTableProps) {
  const [filter, setFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState<string>('');
  const [sortBy, setSortBy] = useState<'time' | 'event'>('time');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Filter and search events
  const filteredEvents = useMemo(() => {
    let result = events;
    
    // Filter by event type
    if (filter !== 'all') {
      result = result.filter(e => e.event === filter);
    }
    
    // Search in visitor ID or metadata
    if (searchText.trim()) {
      const search = searchText.toLowerCase();
      result = result.filter(e => 
        e.visitorId.toLowerCase().includes(search) ||
        e.event.toLowerCase().includes(search) ||
        JSON.stringify(e.metadata || {}).toLowerCase().includes(search)
      );
    }
    
    // Sort
    result = [...result].sort((a, b) => {
      if (sortBy === 'time') {
        return sortOrder === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp;
      } else {
        const comparison = a.event.localeCompare(b.event);
        return sortOrder === 'desc' ? -comparison : comparison;
      }
    });
    
    return result;
  }, [events, filter, searchText, sortBy, sortOrder]);

  // Pagination
  const paginatedEvents = useMemo(() => {
    const start = page * pageSize;
    return filteredEvents.slice(start, start + pageSize);
  }, [filteredEvents, page]);

  const totalPages = Math.ceil(filteredEvents.length / pageSize);

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['זמן', 'סוג אירוע', 'מזהה מבקר', 'מידע נוסף'];
    const rows = filteredEvents.map(e => [
      new Date(e.timestamp).toLocaleString('he-IL'),
      e.event,
      e.visitorId,
      JSON.stringify(e.metadata || {})
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `analytics_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleSort = (column: 'time' | 'event') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  return (
    <div className="events-table-section">
      <div className="table-header">
        <h2>📋 אירועים ({filteredEvents.length.toLocaleString('he-IL')})</h2>
        <div className="table-controls">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="חיפוש..."
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setPage(0);
              }}
              className="search-input"
            />
            {searchText && (
              <button 
                className="search-clear"
                onClick={() => setSearchText('')}
              >
                ✕
              </button>
            )}
          </div>
          
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
            className="filter-select"
          >
            <option value="all">כל האירועים</option>
            {eventTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          
          <button onClick={exportToCSV} className="export-btn" title="ייצוא ל-CSV">
            📥 ייצוא
          </button>
        </div>
      </div>

      <div className="events-table-wrapper">
        <table className="events-table">
          <thead>
            <tr>
              <th 
                className={`sortable ${sortBy === 'time' ? 'sorted' : ''}`}
                onClick={() => handleSort('time')}
              >
                זמן {sortBy === 'time' && (sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th 
                className={`sortable ${sortBy === 'event' ? 'sorted' : ''}`}
                onClick={() => handleSort('event')}
              >
                סוג אירוע {sortBy === 'event' && (sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th>מזהה מבקר</th>
              <th>מידע נוסף</th>
            </tr>
          </thead>
          <tbody>
            {paginatedEvents.map(event => (
              <tr key={event.id}>
                <td className="time-cell">
                  <span className="time-date">
                    {new Date(event.timestamp).toLocaleDateString('he-IL')}
                  </span>
                  <span className="time-hour">
                    {new Date(event.timestamp).toLocaleTimeString('he-IL')}
                  </span>
                </td>
                <td>
                  <span className={`event-badge event-${getEventColor(event.event)}`}>
                    {event.event}
                  </span>
                </td>
                <td className="visitor-cell">
                  <code>{event.visitorId.slice(0, 8)}...</code>
                </td>
                <td className="metadata-cell">
                  {event.metadata && Object.keys(event.metadata).length > 0 && (
                    <MetadataDisplay metadata={event.metadata} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => setPage(0)}
            disabled={page === 0}
            className="pagination-btn"
          >
            ⏮️
          </button>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="pagination-btn"
          >
            ◀️
          </button>
          <span className="pagination-info">
            עמוד {page + 1} מתוך {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="pagination-btn"
          >
            ▶️
          </button>
          <button
            onClick={() => setPage(totalPages - 1)}
            disabled={page >= totalPages - 1}
            className="pagination-btn"
          >
            ⏭️
          </button>
        </div>
      )}
    </div>
  );
}

// Helper component for metadata display
function MetadataDisplay({ metadata }: { metadata: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  
  const importantKeys = ['deviceType', 'isNewUser', 'visitCount', 'feature', 'errorType'];
  const summary = importantKeys
    .filter(key => metadata[key] !== undefined)
    .map(key => `${key}: ${metadata[key]}`)
    .join(' | ');

  if (Object.keys(metadata).length <= 3) {
    return <span className="metadata-inline">{summary || JSON.stringify(metadata)}</span>;
  }

  return (
    <details open={expanded} onToggle={() => setExpanded(!expanded)}>
      <summary className="metadata-summary">
        {summary || 'פרטים נוספים'}
      </summary>
      <pre className="metadata-full">{JSON.stringify(metadata, null, 2)}</pre>
    </details>
  );
}

// Helper function to get event color class
function getEventColor(eventName: string): string {
  if (eventName.includes('error')) return 'error';
  if (eventName.includes('success') || eventName.includes('loaded')) return 'success';
  if (eventName.includes('session')) return 'info';
  if (eventName.includes('consent')) return 'warning';
  return 'default';
}
