import React from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

interface MonthBarChartProps {
  months: string[];
  monthTotals: Record<string, number>;
  selectedMonth: string;
}

const MonthBarChart: React.FC<MonthBarChartProps> = ({ months, monthTotals, selectedMonth }) => {
  // Find index of selected month
  const idx = months.indexOf(selectedMonth);
  let start = idx - 3;
  let end = idx + 4;
  // Adjust window to always show 7 months if possible
  if (start < 0) {
    end += -start;
    start = 0;
  }
  if (end > months.length) {
    start -= (end - months.length);
    end = months.length;
    if (start < 0) start = 0;
  }
  const displayMonths = months.slice(start, end);
  const data = {
    labels: displayMonths,
    datasets: [
      {
        label: 'סך הוצאות',
        data: displayMonths.map(m => monthTotals[m] || 0),
        backgroundColor: displayMonths.map(m => m === selectedMonth ? '#FF6384' : '#36A2EB'),
        borderWidth: 1,
      },
    ],
  };
  return (
    <div style={{ maxWidth: 600, margin: '24px auto' }}>
      <h3>סיכום הוצאות חודשי</h3>
      <Bar data={data} options={{
        plugins: { legend: { display: false } },
        scales: { x: { title: { display: false } }, y: { beginAtZero: true } },
      }} />
    </div>
  );
};

export default MonthBarChart;
