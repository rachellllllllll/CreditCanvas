import React from 'react';
import { Bar } from 'react-chartjs-2';
// import TransactionsTable from './TransactionsTable';
import type { CreditDetail } from '../types';
import type { CategoryDef } from './CategoryManager';

interface YearlyBarChartProps {
  summary: Record<string, number>;
  allDetails?: CreditDetail[];
  onEditCategory?: (transaction: CreditDetail) => void;
  categoriesList?: CategoryDef[];
  onAddCategory?: (cat: CategoryDef) => void;
  // onMonthSelect?: (monthKey: string) => void; // MM/YYYY
  selectedYear: string; // YYYY
  setSelectedYear: (year: string) => void;
}

const YearlyBarChart: React.FC<YearlyBarChartProps> = ({ summary, allDetails, onEditCategory, categoriesList, selectedYear, setSelectedYear }) => {
  // Helper to get all consecutive months from min to max (YYYY-MM)
  const getAllConsecutiveMonths = (minKey: string, maxKey: string) => {
    const [minYear, minMonth] = minKey.split('-').map(Number);
    const [maxYear, maxMonth] = maxKey.split('-').map(Number);
    const monthsArr: string[] = [];
    let y = minYear, m = minMonth;
    while (y < maxYear || (y === maxYear && m <= maxMonth)) {
      monthsArr.push(`${y}-${m.toString().padStart(2, '0')}`);
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return monthsArr;
  };

  // Find the min and max month in summary (YYYY-MM, lexicographically)
  const allSummaryMonths = Object.keys(summary);
  const sortedSummaryMonths = allSummaryMonths.slice().sort();
  const minMonthKey = sortedSummaryMonths[0] || '';
  const maxMonthKey = sortedSummaryMonths[sortedSummaryMonths.length - 1] || '';
  const months = (minMonthKey && maxMonthKey) ? getAllConsecutiveMonths(minMonthKey, maxMonthKey) : [];

  // --- שנה נבחרת ---
  const allYears = React.useMemo(() => {
    const yearsSet = new Set<string>();
    months.forEach(m => yearsSet.add(m.slice(0, 4)));
    return Array.from(yearsSet).sort();
  }, [months]);
  React.useEffect(() => {
    if (allYears.length > 0 && !allYears.includes(selectedYear)) {
      setSelectedYear(allYears[allYears.length - 1]);
    }
  }, [allYears, selectedYear, setSelectedYear]);
  const yearMonths = Array.from({ length: 12 }, (_, i) => `${selectedYear}-${(i + 1).toString().padStart(2, '0')}`);

  // קטגוריות
  const [selectedCategory, setSelectedCategory] = React.useState<string>('all');
  const categories = React.useMemo(() => {
    if (!allDetails) return [];
    const setCat = new Set<string>();
    allDetails.forEach(d => { if (d.category) setCat.add(d.category); });
    return Array.from(setCat).sort();
  }, [allDetails]);
  const allOptions = ['all', ...categories];
  const currentCatIdx = allOptions.indexOf(selectedCategory);
  const prevCat = currentCatIdx > 0 ? allOptions[currentCatIdx - 1] : null;
  const nextCat = currentCatIdx < allOptions.length - 1 ? allOptions[currentCatIdx + 1] : null;

  // חישוב summary לפי קטגוריה
  const filteredSummary = React.useMemo(() => {
    if (!allDetails || selectedCategory === 'all') return summary;
    const catSummary: Record<string, number> = {};
    allDetails.forEach(d => {
      if (d.category === selectedCategory) {
        const [month, year] = d.date.split('/').slice(1, 3);
        let fullYear = year.length === 2 ? '20' + year : year;
        const key = `${fullYear}-${month.padStart(2, '0')}`;
        catSummary[key] = (catSummary[key] || 0) + d.amount;
      }
    });
    return catSummary;
  }, [allDetails, selectedCategory, summary]);

  // Always show 12 months of selected year, fill missing with 0
  const chartMonths = yearMonths;
  const chartData = chartMonths.map(m => filteredSummary[m] || 0);
  const filteredVisibleMonths = chartMonths;
  const filteredVisibleData = chartData;

  // סינון עסקאות של השנה הנבחרת
  const yearDetails = React.useMemo(() => {
    if (!allDetails || !selectedYear) return [];
    return allDetails.filter(d => {
      const parts = d.date.split('/');
      if (parts.length < 3) return false;
      let year = parts[2];
      if (year.length === 2) year = '20' + year;
      return year === selectedYear;
    });
  }, [allDetails, selectedYear]);

  return (
    <div className="yearly-summary-container">
      <div className="year-selector">
        <label>
          שנה:
          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="year-select">
            {allYears.map((y: string) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <button
          onClick={() => prevCat && setSelectedCategory(prevCat)}
          disabled={!prevCat}
          className="category-nav-button"
        >
          ← {prevCat && (prevCat === 'all' ? 'הכל' : prevCat)}
        </button>
        <label>
          <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="category-select">
            <option value="all">הכל</option>
            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </label>
        <button
          onClick={() => nextCat && setSelectedCategory(nextCat)}
          disabled={!nextCat}
          className="category-nav-button"
        >
          {nextCat && (nextCat === 'all' ? 'הכל' : nextCat)} →
        </button>
      </div>
      <h4 className="yearly-chart-title">הוצאות חודשיות</h4>
      <div className="yearly-chart-container">
        <Bar
          data={{
            labels: filteredVisibleMonths.map(m => m.slice(5) + '/' + m.slice(0, 4)),
            datasets: [
              {
                label: selectedCategory === 'all' ? 'סה"כ הוצאות' : `סה"כ (${selectedCategory})`,
                data: filteredVisibleData,
                backgroundColor: '#36A2EB',
              },
            ],
          }}
          options={{
            plugins: { legend: { display: false } },
            scales: { x: { title: { display: false } }, y: { beginAtZero: true } },
            maintainAspectRatio: false,
            responsive: true,
            animation: false,
          }}
          height={380}
        />
      </div>
      <div className="yearly-months-info">
        {selectedYear && (
          <>מציג חודשים 1/{selectedYear}-12/{selectedYear} (תצוגה: 12 חודשים)</>
        )}
      </div>
      {/* טבלת עסקאות של השנה */}
      {yearDetails.length > 0 && onEditCategory && categoriesList && (
        <div className="yearly-transactions-table-container">
          <h4 className="yearly-transactions-title">פירוט עסקאות לשנה {selectedYear}</h4>
          {/* <TransactionsTable 
            details={yearDetails} 
            onEditCategory={onEditCategory} 
            categoriesList={categoriesList}
            isYearlyView={true} 
            onMonthSelect={(monthKey) => onMonthSelect?.(monthKey)}
          /> */}
        </div>
      )}
    </div>
  );
};

export default YearlyBarChart;
