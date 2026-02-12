/**
 * Trend Chart Component
 * גרף קו להצגת מגמות לאורך זמן
 */

import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { TrendDataPoint } from './types';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface TrendChartProps {
  data: TrendDataPoint[];
  title?: string;
}

export default function TrendChart({ data, title = 'מגמת שימוש' }: TrendChartProps) {
  const chartData = {
    labels: data.map(d => d.label),
    datasets: [
      {
        label: 'מבקרים',
        data: data.map(d => d.visitors),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
      {
        label: 'אירועים',
        data: data.map(d => d.events),
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        fill: false,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
      {
        label: 'העלאות קבצים',
        data: data.map(d => d.fileUploads),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        fill: false,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        rtl: true,
        labels: {
          color: '#94a3b8',
          font: { size: 12 },
          usePointStyle: true,
          padding: 20,
        },
      },
      title: {
        display: !!title,
        text: title,
        color: '#f8fafc',
        font: { size: 16, weight: 'bold' as const },
        padding: { bottom: 20 },
      },
      tooltip: {
        rtl: true,
        backgroundColor: 'rgba(30, 41, 59, 0.95)',
        titleColor: '#f8fafc',
        bodyColor: '#cbd5e1',
        borderColor: 'rgba(99, 102, 241, 0.3)',
        borderWidth: 1,
        padding: 12,
        displayColors: true,
      },
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(148, 163, 184, 0.1)',
        },
        ticks: {
          color: '#94a3b8',
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(148, 163, 184, 0.1)',
        },
        ticks: {
          color: '#94a3b8',
        },
      },
    },
  };

  if (data.length === 0) {
    return (
      <div className="chart-container chart-empty">
        <p>📊 אין נתונים להצגה</p>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <Line data={chartData} options={options} />
    </div>
  );
}
