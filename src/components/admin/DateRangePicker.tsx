/**
 * Date Range Picker Component
 * בורר טווח תאריכים
 */

import React from 'react';
import type { DateRange } from './types';

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  disabled?: boolean;
}

const DATE_OPTIONS: { value: DateRange; label: string; icon: string }[] = [
  { value: 'today', label: 'היום', icon: '📅' },
  { value: 'week', label: 'שבוע', icon: '📆' },
  { value: 'month', label: 'חודש', icon: '🗓️' },
  { value: 'year', label: 'שנה', icon: '📊' },
];

export default function DateRangePicker({ value, onChange, disabled }: DateRangePickerProps) {
  return (
    <div className="date-range-picker">
      {DATE_OPTIONS.map(option => (
        <button
          key={option.value}
          className={`date-range-btn ${value === option.value ? 'active' : ''}`}
          onClick={() => onChange(option.value)}
          disabled={disabled}
          title={option.label}
        >
          <span className="date-range-icon">{option.icon}</span>
          <span className="date-range-label">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
