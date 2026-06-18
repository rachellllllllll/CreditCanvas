/**
 * Technical Tab Component
 * מידע טכני על המשתמש - דפדפן, מכשיר, לוקיישן
 */

import React, { useMemo } from 'react';
import type { UserSummary } from '../userDataUtils';

interface TechnicalTabProps {
  user: UserSummary;
}

interface TechnicalInfo {
  deviceType: string;
  screenSize?: string;
  language?: string;
  timezone?: string;
  browserInfo?: string;
  platform?: string;
}

export default function TechnicalTab({ user }: TechnicalTabProps) {
  // Extract technical info from session_start events
  const technicalInfo = useMemo((): TechnicalInfo => {
    const info: TechnicalInfo = {
      deviceType: user.deviceType,
    };
    
    // Find the most recent session_start event with metadata
    const sessionStarts = user.events
      .filter(e => e.event === 'session_start' && e.metadata)
      .sort((a, b) => b.timestamp - a.timestamp);
    
    if (sessionStarts.length > 0) {
      const latestSession = sessionStarts[0].metadata;
      if (latestSession) {
        info.screenSize = latestSession.screenSize as string | undefined;
        info.language = latestSession.language as string | undefined;
        info.timezone = latestSession.timezone as string | undefined;
        info.platform = latestSession.platform as string | undefined;
      }
    }
    
    // Get browser info from any event with browserInfo
    const eventsWithBrowser = user.events.find(e => e.metadata?.browserInfo);
    if (eventsWithBrowser?.metadata?.browserInfo) {
      info.browserInfo = String(eventsWithBrowser.metadata.browserInfo);
    }
    
    return info;
  }, [user]);

  // Device type emoji
  const deviceEmoji = useMemo(() => {
    const map: Record<string, string> = {
      'desktop': '💻',
      'mobile': '📱',
      'tablet': '📲',
    };
    return map[technicalInfo.deviceType] || '❓';
  }, [technicalInfo.deviceType]);

  // Parse browser info
  const browserName = useMemo(() => {
    if (!technicalInfo.browserInfo) return 'לא ידוע';
    const match = technicalInfo.browserInfo.match(/(Chrome|Firefox|Safari|Edge)\/[\d.]+/);
    return match ? match[0] : technicalInfo.browserInfo;
  }, [technicalInfo.browserInfo]);

  return (
    <div className="technical-tab-wrapper">
      {/* Device & Browser */}
      <div className="technical-section">
        <h3 className="technical-section-title">🖥️ מכשיר ודפדפן</h3>
        <div className="technical-info-grid">
          <div className="technical-info-item">
            <span className="technical-info-icon">{deviceEmoji}</span>
            <div className="technical-info-content">
              <div className="technical-info-label">סוג מכשיר</div>
              <div className="technical-info-value">
                {technicalInfo.deviceType.charAt(0).toUpperCase() + technicalInfo.deviceType.slice(1)}
              </div>
            </div>
          </div>

          <div className="technical-info-item">
            <span className="technical-info-icon">🌐</span>
            <div className="technical-info-content">
              <div className="technical-info-label">דפדפן</div>
              <div className="technical-info-value">{browserName}</div>
            </div>
          </div>

          {technicalInfo.screenSize && (
            <div className="technical-info-item">
              <span className="technical-info-icon">📐</span>
              <div className="technical-info-content">
                <div className="technical-info-label">רזולוציה</div>
                <div className="technical-info-value">{technicalInfo.screenSize}</div>
              </div>
            </div>
          )}

          {technicalInfo.platform && (
            <div className="technical-info-item">
              <span className="technical-info-icon">🖥️</span>
              <div className="technical-info-content">
                <div className="technical-info-label">מערכת הפעלה</div>
                <div className="technical-info-value">{technicalInfo.platform}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Localization */}
      <div className="technical-section">
        <h3 className="technical-section-title">🌍 לוקיישן</h3>
        <div className="technical-info-grid">
          {technicalInfo.language && (
            <div className="technical-info-item">
              <span className="technical-info-icon">🗣️</span>
              <div className="technical-info-content">
                <div className="technical-info-label">שפה</div>
                <div className="technical-info-value">{technicalInfo.language}</div>
              </div>
            </div>
          )}

          {technicalInfo.timezone && (
            <div className="technical-info-item">
              <span className="technical-info-icon">🕐</span>
              <div className="technical-info-content">
                <div className="technical-info-label">אזור זמן</div>
                <div className="technical-info-value">{technicalInfo.timezone}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Connection & Activity */}
      <div className="technical-section">
        <h3 className="technical-section-title">📡 חיבור ופעילות</h3>
        <div className="technical-info-list">
          <div className="technical-info-row">
            <span className="technical-info-row-label">מקור כניסה:</span>
            <span className="technical-info-row-value">{user.referrer}</span>
          </div>
          <div className="technical-info-row">
            <span className="technical-info-row-label">מזהה ייחודי:</span>
            <span className="technical-info-row-value">
              <code>{user.visitorId}</code>
            </span>
          </div>
          <div className="technical-info-row">
            <span className="technical-info-row-label">כניסה ראשונה:</span>
            <span className="technical-info-row-value">
              {new Date(user.firstSeen).toLocaleString('he-IL', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          <div className="technical-info-row">
            <span className="technical-info-row-label">פעילות אחרונה:</span>
            <span className="technical-info-row-value">
              {new Date(user.lastSeen).toLocaleString('he-IL', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Debug Info */}
      <div className="technical-section">
        <h3 className="technical-section-title">🔧 מידע מתקדם</h3>
        <details className="technical-debug-details">
          <summary className="technical-debug-summary">
            הצג JSON מלא של המשתמש
          </summary>
          <pre className="technical-debug-json">
            {JSON.stringify(
              {
                visitorId: user.visitorId,
                deviceType: user.deviceType,
                visitCount: user.visitCount,
                firstSeen: new Date(user.firstSeen).toISOString(),
                lastSeen: new Date(user.lastSeen).toISOString(),
                totalDuration: user.totalDuration,
                referrer: user.referrer,
                fileUploads: user.fileUploads,
                feedbackCount: user.feedbackCount,
                feedbackRating: user.feedbackRating,
                errorCount: user.errorCount,
                featuresUsed: user.featuresUsed,
                technicalInfo,
              },
              null,
              2
            )}
          </pre>
        </details>
      </div>
    </div>
  );
}
