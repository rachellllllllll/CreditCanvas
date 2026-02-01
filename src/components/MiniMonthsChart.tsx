import React from 'react';
import './MiniMonthsChart.css';

interface MiniMonthsChartProps {
  /** סיכום הוצאות/הכנסות לפי חודש - מפתח בפורמט MM/YYYY */
  monthTotals: Record<string, number>;
  /** החודש הנבחר כרגע */
  selectedMonth: string;
  /** רשימת חודשים ממוינת */
  sortedMonths: string[];
  /** פונקציה לניווט לחודש */
  onMonthSelect: (month: string) => void;
  /** כמה חודשים להציג (ברירת מחדל: 6) */
  monthsToShow?: number;
  /** מצב תצוגה - הוצאות/הכנסות */
  displayMode?: 'expense' | 'income' | 'all';
}

const MiniMonthsChart: React.FC<MiniMonthsChartProps> = ({
  monthTotals,
  selectedMonth,
  sortedMonths,
  onMonthSelect,
  monthsToShow = 6,
  displayMode = 'expense'
}) => {
  // מצא את האינדקס של החודש הנוכחי
  const currentIdx = sortedMonths.indexOf(selectedMonth);
  
  // לוגיקת "מרכז חכם" - מנסה למרכז את החודש הנבחר
  // 3 לפני + נבחר + 2 אחרי (או מתאים לקצוות)
  const getVisibleRange = () => {
    const total = sortedMonths.length;
    const half = Math.floor(monthsToShow / 2);
    
    // אם אין מספיק חודשים בכלל
    if (total <= monthsToShow) {
      return { start: 0, end: total };
    }
    
    // נקודת התחלה אידיאלית - החודש הנבחר באמצע (קצת שמאלה)
    let idealStart = currentIdx - half;
    let idealEnd = idealStart + monthsToShow;
    
    // התאמה אם חורגים משמאל (תחילת הרשימה)
    if (idealStart < 0) {
      idealStart = 0;
      idealEnd = monthsToShow;
    }
    
    // התאמה אם חורגים מימין (סוף הרשימה)
    if (idealEnd > total) {
      idealEnd = total;
      idealStart = total - monthsToShow;
    }
    
    return { start: idealStart, end: idealEnd };
  };
  
  const { start, end } = getVisibleRange();
  const visibleMonths = sortedMonths.slice(start, end);
  
  // אם אין מספיק חודשים, קח מה שיש
  if (visibleMonths.length === 0) return null;
  
  // חשב את הסכומים לכל חודש (שומרים גם ערך אמיתי וגם מוחלט)
  const monthData = visibleMonths.map(month => {
    const rawAmount = monthTotals[month] || 0;
    return {
      month,
      amount: rawAmount, // ערך אמיתי (יכול להיות שלילי) - לסיכום
      displayAmount: Math.abs(rawAmount), // ערך מוחלט - לתצוגה
      label: formatMonthLabel(month),
      isNegative: rawAmount < 0 // עודף החזרים
    };
  });
  
  // מצא את המקסימום לנרמול הגבהים (משתמש בערך המוחלט)
  const maxAmount = Math.max(...monthData.map(d => d.displayAmount), 1);
  
  // צבע לפי מצב תצוגה
  const getBarColor = (month: string, isSelected: boolean, isNegative: boolean) => {
    // עודף החזרים מוצג בירוק
    if (isNegative) {
      return isSelected ? '#10b981' : '#a7f3d0';
    }
    if (isSelected) {
      return displayMode === 'income' ? '#10b981' : '#6366f1';
    }
    return displayMode === 'income' ? '#a7f3d0' : '#c7d2fe';
  };

  // כותרת דינמית לפי מצב תצוגה
  const title = displayMode === 'income' ? 'השוואת הכנסות' : 'השוואת הוצאות';

  return (
    <div className="mini-months-chart">
      <div className="mmc-title">
        {title}
      </div>
      <div className="mmc-bars">
        {monthData.map(({ month, displayAmount, label, isNegative }) => {
          const isSelected = month === selectedMonth;
          const heightPercent = maxAmount > 0 ? (displayAmount / maxAmount) * 100 : 0;
          
          return (
            <button
              key={month}
              className={`mmc-bar-wrapper ${isSelected ? 'selected' : ''} ${isNegative ? 'refund-surplus' : ''}`}
              onClick={() => onMonthSelect(month)}
              title={`${label}: ${isNegative ? '-' : ''}₪${displayAmount.toLocaleString()}${isNegative ? ' (עודף החזרים)' : ''}`}
              aria-label={`${label}: ${displayAmount.toLocaleString()} שקלים${isNegative ? ' עודף החזרים' : ''}${isSelected ? ' (נבחר)' : ''}`}
            >
              <div className="mmc-bar-container">
                <div 
                  className="mmc-bar"
                  style={{ 
                    height: `${Math.max(heightPercent, 4)}%`,
                    backgroundColor: getBarColor(month, isSelected, isNegative)
                  }}
                />
              </div>
              <span className="mmc-label">{label}</span>
            </button>
          );
        })}
      </div>
      {/* הצגת הסכום של החודש הנבחר */}
      <div className="mmc-selected-amount">
        {(() => {
          const selected = monthData.find(d => d.month === selectedMonth);
          if (!selected) return '0 ₪';
          return `${selected.isNegative ? '-' : ''}${selected.displayAmount.toLocaleString()} ₪`;
        })()}
      </div>
      <div className="mmc-hint">לחץ לניווט</div>
    </div>
  );
};

/** פורמט תווית חודש קצרה */
function formatMonthLabel(month: string): string {
  const [mm] = month.split('/');
  const monthNames = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
  const monthIdx = parseInt(mm, 10) - 1;
  return monthNames[monthIdx] || mm;
}

export default MiniMonthsChart;
