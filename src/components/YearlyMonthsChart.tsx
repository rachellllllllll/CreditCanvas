import React, { useMemo } from 'react';
import './YearlyMonthsChart.css';

interface YearlyMonthsChartProps {
  /** סיכום הוצאות/הכנסות לפי חודש - מפתח בפורמט MM/YYYY */
  monthTotals: Record<string, number>;
  /** השנה הנבחרת */
  selectedYear: string;
  /** רשימת חודשים ממוינת */
  sortedMonths: string[];
  /** פונקציה לניווט לחודש */
  onMonthSelect: (month: string) => void;
  /** פונקציה למעבר לתצוגה חודשית */
  setView: (view: 'monthly' | 'yearly') => void;
  /** מצב תצוגה - הוצאות/הכנסות */
  displayMode?: 'expense' | 'income' | 'all';
}

const MONTH_NAMES = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

const YearlyMonthsChart: React.FC<YearlyMonthsChartProps> = ({
  monthTotals,
  selectedYear,
  sortedMonths,
  onMonthSelect,
  setView,
  displayMode = 'expense'
}) => {
  // סנן רק חודשים מהשנה הנבחרת
  const yearMonths = useMemo(() => {
    return sortedMonths.filter(m => m.endsWith(`/${selectedYear}`));
  }, [sortedMonths, selectedYear]);

  // בנה נתונים ל-12 חודשים (גם אם חסרים)
  const monthData = useMemo(() => {
    const data: { month: string; monthKey: string; amount: number; displayAmount: number; label: string; hasData: boolean }[] = [];
    
    for (let i = 1; i <= 12; i++) {
      const mm = i.toString().padStart(2, '0');
      const monthKey = `${mm}/${selectedYear}`;
      const amount = monthTotals[monthKey] || 0;
      const hasData = yearMonths.includes(monthKey);
      
      data.push({
        month: mm,
        monthKey,
        amount: amount, // ערך אמיתי (יכול להיות שלילי) - לסיכום
        displayAmount: Math.abs(amount), // ערך מוחלט - לתצוגה ויזואלית
        label: MONTH_NAMES[i - 1],
        hasData
      });
    }
    
    return data;
  }, [monthTotals, selectedYear, yearMonths]);

  // מצא את המקסימום לנרמול הגבהים (משתמש בערך המוחלט לתצוגה)
  const maxAmount = useMemo(() => {
    return Math.max(...monthData.map(d => d.displayAmount), 1);
  }, [monthData]);

  // סה"כ שנתי (משתמש בערך האמיתי - שלילי מקטין את הסך)
  const yearTotal = useMemo(() => {
    return monthData.reduce((sum, d) => sum + d.amount, 0);
  }, [monthData]);

  // צבע לפי מצב תצוגה
  const getBarStyles = (hasData: boolean) => {
    if (!hasData) {
      return {
        gradient: 'linear-gradient(180deg, #e2e8f0 0%, #cbd5e1 100%)',
        shadow: 'rgba(0,0,0,0.1)',
        hover: '#94a3b8'
      };
    }
    if (displayMode === 'income') {
      return {
        gradient: 'linear-gradient(180deg, #34d399 0%, #10b981 50%, #059669 100%)',
        shadow: 'rgba(16, 185, 129, 0.4)',
        hover: '#059669'
      };
    }
    return {
      gradient: 'linear-gradient(180deg, #818cf8 0%, #6366f1 50%, #4f46e5 100%)',
      shadow: 'rgba(99, 102, 241, 0.4)',
      hover: '#4f46e5'
    };
  };

  // לחיצה על עמודה → מעבר לחודש
  const handleBarClick = (monthKey: string, hasData: boolean) => {
    if (!hasData) return;
    onMonthSelect(monthKey);
    setView('monthly');
  };

  const title = displayMode === 'income' ? 'הכנסות לפי חודש' : 'הוצאות לפי חודש';

  return (
    <div className="yearly-months-chart">
      <div className="ymc-header">
        <span className="ymc-title">{title} - {selectedYear}</span>
        <span className="ymc-total">
          סה"כ: ₪{yearTotal.toLocaleString()}
        </span>
      </div>
      
      <div className="ymc-chart">
        {monthData.map(({ month, monthKey, amount, displayAmount, label, hasData }) => {
          const heightPercent = maxAmount > 0 ? (displayAmount / maxAmount) * 100 : 0;
          const styles = getBarStyles(hasData);
          const isNegative = amount < 0; // עודף החזרים
          
          return (
            <button
              key={month}
              className={`ymc-bar-wrapper ${hasData ? 'has-data' : 'no-data'} ${isNegative ? 'refund-surplus' : ''}`}
              onClick={() => handleBarClick(monthKey, hasData)}
              disabled={!hasData}
              title={hasData ? `${label}: ₪${displayAmount.toLocaleString()}${isNegative ? ' (עודף החזרים)' : ''} - לחץ לצפייה` : `${label}: אין נתונים`}
              aria-label={`${label} ${selectedYear}: ${displayAmount.toLocaleString()} שקלים${isNegative ? ' עודף החזרים' : ''}${hasData ? ', לחץ לניווט' : ''}`}
              style={{
                '--bar-gradient': isNegative 
                  ? 'linear-gradient(180deg, #34d399 0%, #10b981 50%, #059669 100%)' 
                  : styles.gradient,
                '--bar-shadow-color': isNegative ? 'rgba(16, 185, 129, 0.4)' : styles.shadow,
                '--bar-hover-color': isNegative ? '#059669' : styles.hover,
              } as React.CSSProperties}
            >
              <div className="ymc-bar-container">
                <div 
                  className="ymc-bar"
                  style={{ 
                    height: `${Math.max(heightPercent, hasData ? 6 : 3)}%`,
                  }}
                />
                {hasData && displayAmount > 0 && (
                  <span className="ymc-amount">
                    {isNegative ? '-' : ''}₪{displayAmount >= 10000 ? `${(displayAmount / 1000).toFixed(0)}K` : displayAmount.toLocaleString()}
                  </span>
                )}
              </div>
              <span className="ymc-label">{label}</span>
            </button>
          );
        })}
      </div>
      
      <div className="ymc-hint">לחץ על עמודה לצפייה בחודש</div>
    </div>
  );
};

export default YearlyMonthsChart;
