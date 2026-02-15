/**
 * Feature Usage Chart Component
 * גרף שימוש בפיצ'רים - אילו פיצ'רים הכי נפוצים
 */

import React from 'react';

interface FeatureUsageChartProps {
  featureData: Record<string, number>;
}

const FEATURE_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6',
  '#f59e0b', '#22c55e', '#3b82f6', '#ef4444',
  '#64748b', '#84cc16',
];

export default function FeatureUsageChart({ featureData }: FeatureUsageChartProps) {
  const total = Object.values(featureData).reduce((sum, v) => sum + v, 0);

  if (total === 0) {
    return (
      <div className="device-chart chart-empty">
        <p>⚡ אין נתוני שימוש בפיצ'רים</p>
      </div>
    );
  }

  // Sort by count descending, take top 10
  const sorted = Object.entries(featureData)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  return (
    <div className="device-chart">
      <h3 className="chart-title">⚡ שימוש בפיצ'רים</h3>
      <div className="device-bars">
        {sorted.map(([feature, count], index) => {
          const percentage = total > 0 ? (count / total) * 100 : 0;
          const color = FEATURE_COLORS[index % FEATURE_COLORS.length];

          return (
            <div key={feature} className="device-bar-item">
              <div className="device-bar-header">
                <span className="device-icon">🔧</span>
                <span className="device-label" title={feature}>
                  {feature.length > 20 ? feature.slice(0, 20) + '…' : feature}
                </span>
                <span className="device-value">{count.toLocaleString('he-IL')}</span>
                <span className="device-percentage">{percentage.toFixed(1)}%</span>
              </div>
              <div className="device-bar-track">
                <div
                  className="device-bar-fill"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: color,
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
