/**
 * KPI Card Component
 * כרטיס מדד מספרי עם אייקון ושינוי אחוזי
 */

import React from 'react';

interface KPICardProps {
  icon: string;
  value: number | string;
  label: string;
  change?: number; // אחוז שינוי (חיובי/שלילי)
  changeLabel?: string;
  color?: 'primary' | 'success' | 'warning' | 'error' | 'info';
  onClick?: () => void;
}

export default function KPICard({ 
  icon, 
  value, 
  label, 
  change, 
  changeLabel = 'מאתמול',
  color = 'primary',
  onClick 
}: KPICardProps) {
  const formatValue = (val: number | string): string => {
    if (typeof val === 'string') return val;
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toLocaleString('he-IL');
  };

  const getChangeClass = (changeVal: number): string => {
    if (changeVal > 0) return 'kpi-change positive';
    if (changeVal < 0) return 'kpi-change negative';
    return 'kpi-change neutral';
  };

  const getChangeIcon = (changeVal: number): string => {
    if (changeVal > 0) return '↑';
    if (changeVal < 0) return '↓';
    return '→';
  };

  return (
    <div 
      className={`kpi-card kpi-${color} ${onClick ? 'kpi-clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-content">
        <div className="kpi-value">{formatValue(value)}</div>
        <div className="kpi-label">{label}</div>
        {change !== undefined && (
          <div className={getChangeClass(change)}>
            {getChangeIcon(change)} {Math.abs(change).toFixed(1)}% {changeLabel}
          </div>
        )}
      </div>
    </div>
  );
}
