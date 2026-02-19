/**
 * Category Stats Chart Component
 * גרף עוגה להתפלגות קטגוריות הוצאה ממוצעת
 */

import React from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

interface CategoryStatsChartProps {
  categoryData: Record<string, number>;
  title?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  'מזון': '#22c55e',
  'תחבורה': '#3b82f6',
  'קניות': '#ec4899',
  'בילויים': '#f59e0b',
  'חשבונות': '#6366f1',
  'בריאות': '#14b8a6',
  'ביטוח': '#8b5cf6',
  'חינוך': '#84cc16',
  'אחר': '#64748b',
};

const FALLBACK_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6',
  '#f59e0b', '#22c55e', '#3b82f6', '#ef4444', '#64748b',
];

export default function CategoryStatsChart({ categoryData, title = '📂 התפלגות קטגוריות (ממוצע)' }: CategoryStatsChartProps) {
  const sorted = Object.entries(categoryData)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);

  if (!sorted.length) {
    return (
      <div className="chart-container chart-empty">
        <p>📂 אין נתוני קטגוריות</p>
      </div>
    );
  }

  const labels = sorted.map(([name]) => name);
  const values = sorted.map(([, pct]) => pct);
  const colors = sorted.map(([name], i) => CATEGORY_COLORS[name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]);

  const data = {
    labels,
    datasets: [{
      data: values,
      backgroundColor: colors,
      borderColor: 'rgba(15, 23, 42, 0.8)',
      borderWidth: 2,
      hoverOffset: 8,
    }],
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
            return chart.data.labels?.map((label, i) => {
              const value = dataset.data[i] as number;
              return {
                text: `${label} (${value}%)`,
                fillStyle: (dataset.backgroundColor as string[])[i],
                strokeStyle: dataset.borderColor as string,
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
            return ` ${context.label}: ${context.raw as number}%`;
          },
        },
      },
    },
    cutout: '60%',
  };

  return (
    <div className="chart-container pie-chart">
      <Doughnut data={data} options={options} />
    </div>
  );
}
