/**
 * Referrer Source Chart Component
 * גרף מקורות תנועה - מאיפה הגיעו המבקרים
 */

import React from 'react';

interface ReferrerChartProps {
  referrerData: Record<string, number>;
}

const REFERRER_INFO: Record<string, { label: string; icon: string; color: string }> = {
  direct: { label: 'ישיר', icon: '🔗', color: '#6366f1' },
  google: { label: 'Google', icon: '🔍', color: '#4285F4' },
  facebook: { label: 'Facebook', icon: '📘', color: '#1877F2' },
  whatsapp: { label: 'WhatsApp', icon: '💬', color: '#25D366' },
  linkedin: { label: 'LinkedIn', icon: '💼', color: '#0A66C2' },
  twitter: { label: 'Twitter/X', icon: '🐦', color: '#1DA1F2' },
  github: { label: 'GitHub', icon: '🐙', color: '#8b5cf6' },
  telegram: { label: 'Telegram', icon: '✈️', color: '#0088cc' },
  bing: { label: 'Bing', icon: '🔎', color: '#00897B' },
  reddit: { label: 'Reddit', icon: '🤖', color: '#FF4500' },
  other: { label: 'אחר', icon: '🌐', color: '#64748b' },
  unknown: { label: 'לא ידוע', icon: '❓', color: '#475569' },
};

export default function ReferrerChart({ referrerData }: ReferrerChartProps) {
  const total = Object.values(referrerData).reduce((sum, v) => sum + v, 0);

  if (total === 0) {
    return (
      <div className="device-chart chart-empty">
        <p>🌐 אין נתוני מקורות תנועה</p>
      </div>
    );
  }

  // Sort by count descending
  const sorted = Object.entries(referrerData)
    .sort(([, a], [, b]) => b - a);

  return (
    <div className="device-chart">
      <h3 className="chart-title">🌐 מקורות תנועה</h3>
      <div className="device-bars">
        {sorted.map(([source, count]) => {
          const info = REFERRER_INFO[source] || { label: source, icon: '🌐', color: '#64748b' };
          const percentage = total > 0 ? (count / total) * 100 : 0;

          return (
            <div key={source} className="device-bar-item">
              <div className="device-bar-header">
                <span className="device-icon">{info.icon}</span>
                <span className="device-label">{info.label}</span>
                <span className="device-value">{count.toLocaleString('he-IL')}</span>
                <span className="device-percentage">{percentage.toFixed(1)}%</span>
              </div>
              <div className="device-bar-track">
                <div
                  className="device-bar-fill"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: info.color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
