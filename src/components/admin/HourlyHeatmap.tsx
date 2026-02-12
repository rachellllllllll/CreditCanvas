/**
 * Hourly Activity Heatmap Component
 * מפת חום של פעילות לפי שעות
 */

import React from 'react';
import type { HourlyActivity } from './types';

interface HourlyHeatmapProps {
  data: HourlyActivity[];
}

export default function HourlyHeatmap({ data }: HourlyHeatmapProps) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  
  const getIntensity = (count: number): number => {
    return count / maxCount;
  };
  
  const getColor = (intensity: number): string => {
    if (intensity === 0) return 'rgba(99, 102, 241, 0.05)';
    if (intensity < 0.25) return 'rgba(99, 102, 241, 0.2)';
    if (intensity < 0.5) return 'rgba(99, 102, 241, 0.4)';
    if (intensity < 0.75) return 'rgba(99, 102, 241, 0.6)';
    return 'rgba(99, 102, 241, 0.9)';
  };

  const formatHour = (hour: number): string => {
    return `${hour.toString().padStart(2, '0')}:00`;
  };

  // Group hours for display (4 rows of 6 hours each)
  const hourGroups = [
    data.slice(0, 6),   // 00:00 - 05:00
    data.slice(6, 12),  // 06:00 - 11:00
    data.slice(12, 18), // 12:00 - 17:00
    data.slice(18, 24), // 18:00 - 23:00
  ];

  const groupLabels = ['לילה', 'בוקר', 'צהריים', 'ערב'];

  return (
    <div className="hourly-heatmap">
      <h3 className="chart-title">🕐 פעילות לפי שעות</h3>
      <div className="heatmap-grid">
        {hourGroups.map((group, groupIndex) => (
          <div key={groupIndex} className="heatmap-row">
            <span className="heatmap-row-label">{groupLabels[groupIndex]}</span>
            <div className="heatmap-cells">
              {group.map((hourData) => (
                <div
                  key={hourData.hour}
                  className="heatmap-cell"
                  style={{ backgroundColor: getColor(getIntensity(hourData.count)) }}
                  title={`${formatHour(hourData.hour)} - ${hourData.count} אירועים`}
                >
                  <span className="heatmap-cell-hour">{hourData.hour}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="heatmap-legend">
        <span className="legend-label">פחות</span>
        <div className="legend-scale">
          {[0, 0.25, 0.5, 0.75, 1].map((intensity, i) => (
            <div
              key={i}
              className="legend-cell"
              style={{ backgroundColor: getColor(intensity) }}
            />
          ))}
        </div>
        <span className="legend-label">יותר</span>
      </div>
    </div>
  );
}
