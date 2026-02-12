/**
 * Device Breakdown Chart Component
 * גרף התפלגות מכשירים
 */

import React from 'react';
import type { DeviceBreakdown } from './types';

interface DeviceChartProps {
  breakdown: DeviceBreakdown;
}

const DEVICE_INFO = {
  desktop: { label: 'מחשב', icon: '💻', color: '#6366f1' },
  mobile: { label: 'נייד', icon: '📱', color: '#22c55e' },
  tablet: { label: 'טאבלט', icon: '📲', color: '#f59e0b' },
};

export default function DeviceChart({ breakdown }: DeviceChartProps) {
  const total = breakdown.desktop + breakdown.mobile + breakdown.tablet;
  
  if (total === 0) {
    return (
      <div className="device-chart chart-empty">
        <p>📱 אין נתוני מכשירים</p>
      </div>
    );
  }

  const getPercentage = (value: number): number => {
    return total > 0 ? (value / total) * 100 : 0;
  };

  return (
    <div className="device-chart">
      <h3 className="chart-title">📱 התפלגות מכשירים</h3>
      <div className="device-bars">
        {(Object.keys(DEVICE_INFO) as Array<keyof DeviceBreakdown>).map(device => {
          const info = DEVICE_INFO[device];
          const percentage = getPercentage(breakdown[device]);
          
          return (
            <div key={device} className="device-bar-item">
              <div className="device-bar-header">
                <span className="device-icon">{info.icon}</span>
                <span className="device-label">{info.label}</span>
                <span className="device-value">{breakdown[device].toLocaleString('he-IL')}</span>
                <span className="device-percentage">{percentage.toFixed(1)}%</span>
              </div>
              <div className="device-bar-track">
                <div 
                  className="device-bar-fill"
                  style={{ 
                    width: `${percentage}%`,
                    backgroundColor: info.color 
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
