/**
 * Events Pie Chart Component
 * גרף עוגה להתפלגות אירועים
 */

import React from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend);

interface EventsPieChartProps {
  eventsByType: Record<string, number>;
  title?: string;
}

const CHART_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#22c55e', // green
  '#3b82f6', // blue
  '#ef4444', // red
  '#64748b', // slate
  '#84cc16', // lime
];

export default function EventsPieChart({ eventsByType, title = 'התפלגות אירועים' }: EventsPieChartProps) {
  // Sort by count and take top 8 + others
  const sorted = Object.entries(eventsByType)
    .sort(([, a], [, b]) => b - a);
  
  const topEvents = sorted.slice(0, 8);
  const otherEvents = sorted.slice(8);
  const othersTotal = otherEvents.reduce((sum, [, count]) => sum + count, 0);
  
  const labels = topEvents.map(([name]) => formatEventName(name));
  const values = topEvents.map(([, count]) => count);
  
  if (othersTotal > 0) {
    labels.push('אחר');
    values.push(othersTotal);
  }

  const data = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: CHART_COLORS.slice(0, labels.length),
        borderColor: 'rgba(15, 23, 42, 0.8)',
        borderWidth: 2,
        hoverOffset: 8,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        rtl: true,
        labels: {
          color: '#94a3b8',
          font: { size: 11 },
          usePointStyle: true,
          padding: 12,
          generateLabels: (chart: ChartJS) => {
            const dataset = chart.data.datasets[0];
            const total = (dataset.data as number[]).reduce((a, b) => a + b, 0);
            return chart.data.labels?.map((label, i) => {
              const value = dataset.data[i] as number;
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
              return {
                text: `${label} (${percentage}%)`,
                fillStyle: (dataset.backgroundColor as string[])[i],
                strokeStyle: (dataset.borderColor as string),
                lineWidth: 1,
                hidden: false,
                index: i,
                pointStyle: 'circle' as const,
              };
            }) || [];
          },
        },
      },
      title: {
        display: !!title,
        text: title,
        color: '#f8fafc',
        font: { size: 16, weight: 'bold' as const },
        padding: { bottom: 10 },
      },
      tooltip: {
        rtl: true,
        backgroundColor: 'rgba(30, 41, 59, 0.95)',
        titleColor: '#f8fafc',
        bodyColor: '#cbd5e1',
        borderColor: 'rgba(99, 102, 241, 0.3)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context: { label: string; raw: unknown }) => {
            const total = values.reduce((a, b) => a + b, 0);
            const rawValue = context.raw as number;
            const percentage = ((rawValue / total) * 100).toFixed(1);
            return ` ${context.label}: ${rawValue.toLocaleString('he-IL')} (${percentage}%)`;
          },
        },
      },
    },
    cutout: '60%',
  };

  if (Object.keys(eventsByType).length === 0) {
    return (
      <div className="chart-container chart-empty">
        <p>🍩 אין נתונים להצגה</p>
      </div>
    );
  }

  return (
    <div className/**
 * Events Pie Chart Component
 * גרף עוגה להתפלגות אירועים
 */

import React from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { formatEventName } from './eventNames';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend);

interface EventsPieChartProps {
  eventsByType: Record<string, number>;
  title?: string;
}

const CHART_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#22c55e', // green
  '#3b82f6', // blue
  '#ef4444', // red
  '#64748b', // slate
  '#84cc16', // lime
];

export default function EventsPieChart({ eventsByType, title = 'התפלגות אירועים' }: EventsPieChartProps) {
  // Sort by count and take top 8 + others
  const sorted = Object.entries(eventsByType)
    .sort(([, a], [, b]) => b - a);
  
  const topEvents = sorted.slice(0, 8);
  const otherEvents = sorted.slice(8);
  const othersTotal = otherEvents.reduce((sum, [, count]) => sum + count, 0);
  
  const labels = topEvents.map(([name]) => formatEventName(name));
  const values = topEvents.map(([, count]) => count);
  
  if (othersTotal > 0) {
    labels.push('אחר');
    values.push(othersTotal);
  }

  const data = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: CHART_COLORS.slice(0, labels.length),
        borderColor: 'rgba(15, 23, 42, 0.8)',
        borderWidth: 2,
        hoverOffset: 8,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        rtl: true,
        labels: {
          color: '#94a3b8',
          font: { size: 11 },
          usePointStyle: true,
          padding: 12,
          generateLabels: (chart: ChartJS) => {
            const dataset = chart.data.datasets[0];
            const total = (dataset.data as number[]).reduce((a, b) => a + b, 0);
            return chart.data.labels?.map((label, i) => {
              const value = dataset.data[i] as number;
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
              return {
                text: `${label} (${percentage}%)`,
                fillStyle: (dataset.backgroundColor as string[])[i],
                strokeStyle: (dataset.borderColor as string),
                lineWidth: 1,
                hidden: false,
                index: i,
                pointStyle: 'circle' as const,
              };
            }) || [];
          },
        },
      },
      title: {
        display: !!title,
        text: title,
        color: '#f8fafc',
        font: { size: 16, weight: 'bold' as const },
        padding: { bottom: 10 },
      },
      tooltip: {
        rtl: true,
        backgroundColor: 'rgba(30, 41, 59, 0.95)',
        titleColor: '#f8fafc',
        bodyColor: '#cbd5e1',
        borderColor: 'rgba(99, 102, 241, 0.3)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context: { label: string; raw: unknown }) => {
            const total = values.reduce((a, b) => a + b, 0);
            const rawValue = context.raw as number;
            const percentage = ((rawValue / total) * 100).toFixed(1);
            return ` ${context.label}: ${rawValue.toLocaleString('he-IL')} (${percentage}%)`;
          },
        },
      },
    },
    cutout: '60%',
  };

  if (Object.keys(eventsByType).length === 0) {
    return (
      <div className="chart-container chart-empty">
        <p>🍩 אין נתונים להצגה</p>
      </div>
    );
  }

  return (
    <div className="chart-container pie-chart">
      <Doughnut data={data} options={options} />
    </div>
  );
}
="chart-container pie-chart">
      <Doughnut data={data} options={options} />
    </div>
  );
}

// Helper function to format event names nicely
function formatEventName(name: string): string {
  const nameMap: Record<string, string> = {
    'session_start': 'התחלת סשן',
    'session_duration': 'משך סשן',
    'files_loaded': 'טעינת קבצים',
    'file_upload_success': 'העלאה מוצלחת',
    'file_error': 'שגיאת קובץ',
    'consent_decision': 'החלטת הסכמה',
    'feature_used': 'שימוש בפיצ׳ר',
    'category_assigned': 'הקצאת קטגוריה',
    'category_stats': 'סטטיסטיקות',
    'new_user': 'משתמש חדש',
    'returning_user': 'משתמש חוזר',
    'error_occurred': 'שגיאה',
    'page_view': 'צפייה בדף',
    'user_feedback': 'משוב משתמש',
  };
  return nameMap[name] || name.replace(/_/g, ' ');
}
