import React, { useMemo, useState, useCallback } from 'react';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import type { CategoryDef } from './CategoryManager';
import './CategoryDonutChart.css';

// רישום הרכיבים הנדרשים
ChartJS.register(ArcElement, Tooltip, Legend);

interface CategoryDonutChartProps {
  /** מיפוי קטגוריה -> סכום */
  categories: Record<string, number>;
  /** רשימת הגדרות קטגוריות (לצבעים ואייקונים) */
  categoriesList?: CategoryDef[];
  /** callback בלחיצה על קטגוריה (לסינון) */
  onCategoryClick?: (category: string | null) => void;
  /** הקטגוריה שנבחרה כרגע (להדגשה) */
  selectedCategory?: string | null;
  /** האם להציג בצורה מקופלת כברירת מחדל */
  defaultCollapsed?: boolean;
  /** סף אחוז מינימלי להצגה נפרדת (קטגוריות קטנות יותר יוצגו ב"אחר") */
  minPercentage?: number;
  /** כותרת מותאמת */
  title?: string;
  /** מצב תצוגה נוכחי מה-App */
  displayMode?: 'all' | 'income' | 'expense';
  /** מצב קומפקטי - layout אנכי עם legend מקוצר */
  compact?: boolean;
  /** מספר קטגוריות מקסימלי להצגה במצב קומפקטי */
  maxCompactCategories?: number;
  /** מספר קטגוריות מקסימלי להצגה בלגנדה (לפני "הצג עוד") */
  maxVisibleCategories?: number;
}

// פלטת צבעים ברירת מחדל (מודרנית)
const DEFAULT_COLORS = [
  '#3b82f6', // כחול
  '#10b981', // ירוק
  '#f59e0b', // כתום
  '#ef4444', // אדום
  '#8b5cf6', // סגול
  '#ec4899', // ורוד
  '#06b6d4', // תכלת
  '#84cc16', // ליים
  '#f97316', // כתום כהה
  '#6366f1', // אינדיגו
  '#14b8a6', // טיל
  '#a855f7', // סגול בהיר
];

// אייקונים לקטגוריות נפוצות
const CATEGORY_ICONS: Record<string, string> = {
  'מזון': '🍕',
  'מסעדות': '🍽️',
  'סופר': '🛒',
  'סופרמרקט': '🛒',
  'דלק': '⛽',
  'תחבורה': '🚗',
  'קניות': '🛍️',
  'ביגוד': '👕',
  'בילויים': '🎬',
  'בריאות': '💊',
  'חינוך': '📚',
  'תקשורת': '📱',
  'חשבונות': '📄',
  'ביטוח': '🛡️',
  'מיסים': '🏛️',
  'חיסכון': '💰',
  'משכנתא': '🏠',
  'שכר דירה': '🏠',
  'לא מסווג': '❓',
  'אחר': '📦',
};

const CategoryDonutChart: React.FC<CategoryDonutChartProps> = ({
  categories,
  categoriesList = [],
  onCategoryClick,
  selectedCategory,
  defaultCollapsed = true,
  minPercentage = 3,
  title = 'התפלגות הוצאות',
  displayMode = 'expense',
  compact = false,
  maxCompactCategories = 4,
  maxVisibleCategories = 6,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  // האם הלגנדה מורחבת (מציגה את כל הקטגוריות)
  const [isLegendExpanded, setIsLegendExpanded] = useState(false);

  // מצב תצוגה אפקטיבי: אם displayMode הוא all - מציגים הוצאות בלבד
  const effectiveMode = displayMode === 'all' ? 'expense' : displayMode;

  // חישוב נתוני הגרף
  const chartData = useMemo(() => {
    // הצג את כל הקטגוריות (לא ריקות)
    const allCategories = Object.entries(categories).filter(([, amount]) => amount !== 0);
    
    // חשב סה"כ מכל הקטגוריות (לגרף - ערכים מוחלטים לחישוב אחוזים)
    const chartTotal = allCategories.reduce((sum, [, val]) => sum + Math.abs(val), 0);
    if (chartTotal === 0) return null;

    // חשב סה"כ נטו (להצגה במרכז) - סכום כל הערכים עם הסימנים
    // זה יתאים לסה"כ שמופיע בכרטיס למעלה
    const netTotal = allCategories.reduce((sum, [, val]) => sum + val, 0);
    // הצג כערך מוחלט (כי בתצוגת הוצאות הסכום שלילי)
    const displayTotal = Math.abs(netTotal);

    // מיון לפי סכום מוחלט (יורד)
    const sorted = allCategories
      .map(([name, amount]) => ({
        name,
        amount: Math.abs(amount), // גודל הפרוסה לפי ערך מוחלט
        originalAmount: amount, // שמור ערך מקורי עם סימן (להצגה בלגנדה)
        percentage: (Math.abs(amount) / chartTotal) * 100,
        isNegative: amount < 0, // סימון אם זה ערך שלילי (עודף החזרים)
      }))
      .sort((a, b) => b.amount - a.amount);

    // קיבוץ קטגוריות קטנות ל"אחר"
    const mainCategories: typeof sorted = [];
    let otherAmount = 0;
    let otherCount = 0;

    sorted.forEach(cat => {
      if (cat.percentage >= minPercentage) {
        mainCategories.push(cat);
      } else {
        otherAmount += cat.amount;
        otherCount++;
      }
    });

    // הוסף "אחר" אם יש קטגוריות קטנות
    if (otherAmount > 0) {
      mainCategories.push({
        name: `אחר (${otherCount})`,
        amount: otherAmount,
        originalAmount: otherAmount, // "אחר" תמיד חיובי (מקבץ הוצאות קטנות)
        percentage: (otherAmount / chartTotal) * 100,
        isNegative: false,
      });
    }

    // מצא צבעים מתאימים
    const getColor = (name: string, index: number): string => {
      const catDef = categoriesList.find(c => c.name === name);
      if (catDef?.color) return catDef.color;
      return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
    };

    const getIcon = (name: string): string => {
      const catDef = categoriesList.find(c => c.name === name);
      if (catDef?.icon) return catDef.icon;
      // חפש באייקונים ברירת מחדל
      const lowerName = name.toLowerCase();
      for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
        if (lowerName.includes(key.toLowerCase())) return icon;
      }
      return CATEGORY_ICONS['אחר'];
    };

    return {
      total: displayTotal, // סה"כ נטו (להצגה במרכז) - יתאים לכרטיס למעלה
      chartTotal, // סה"כ לגרף (לחישוב אחוזים)
      categories: mainCategories.map((cat, index) => ({
        ...cat,
        color: getColor(cat.name, index),
        icon: getIcon(cat.name),
      })),
    };
  }, [categories, categoriesList, minPercentage]);

  // צבע ירוק להחזרים
  const REFUND_GREEN = '#10b981';

  // נתונים לגרף Chart.js
  const donutData = useMemo(() => {
    if (!chartData) return null;

    return {
      labels: chartData.categories.map(c => c.name),
      datasets: [{
        data: chartData.categories.map(c => c.amount),
        backgroundColor: chartData.categories.map(c => {
          // הדגשה לקטגוריה נבחרת/נוכחית
          const isActive = selectedCategory === c.name || hoveredCategory === c.name;
          return isActive ? c.color : `${c.color}cc`; // מעט שקיפות אם לא פעיל
        }),
        borderColor: chartData.categories.map(c => {
          const isActive = selectedCategory === c.name || hoveredCategory === c.name;
          // גבול ירוק לקטגוריות עם עודף החזרים
          if (c.isNegative) return REFUND_GREEN;
          return isActive ? c.color : 'transparent';
        }),
        borderWidth: chartData.categories.map(c => {
          const isActive = selectedCategory === c.name || hoveredCategory === c.name;
          // גבול תמיד מוצג לקטגוריות שליליות
          if (c.isNegative) return 2;
          return isActive ? 3 : 0;
        }),
        hoverBorderWidth: 3,
        hoverBorderColor: chartData.categories.map(c => c.isNegative ? REFUND_GREEN : c.color),
        offset: chartData.categories.map(c => {
          const isActive = selectedCategory === c.name || hoveredCategory === c.name;
          return isActive ? 8 : 0;
        }),
      }],
    };
  }, [chartData, selectedCategory, hoveredCategory]);

  // אפשרויות לגרף
  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: true,
    cutout: '60%', // Donut effect
    plugins: {
      legend: {
        display: false, // נציג לגנדה מותאמת אישית
      },
      tooltip: {
        enabled: true,
        rtl: true,
        textDirection: 'rtl' as const,
        backgroundColor: 'rgba(30, 41, 59, 0.95)',
        titleColor: '#fff',
        bodyColor: '#fff',
        padding: 12,
        cornerRadius: 8,
        displayColors: true,
        callbacks: {
          label: (context: { label?: string; parsed: number }) => {
            const value = context.parsed;
            const total = chartData?.chartTotal || 1;
            const percentage = ((value / total) * 100).toFixed(1);
            return `₪${value.toLocaleString()} (${percentage}%)`;
          },
        },
      },
    },
    onClick: (_event: unknown, elements: Array<{ index: number }>) => {
      if (elements.length > 0 && chartData && onCategoryClick) {
        const clickedCategory = chartData.categories[elements[0].index].name;
        // Toggle: אם לוחצים על אותה קטגוריה - בטל סינון
        if (selectedCategory === clickedCategory) {
          onCategoryClick(null);
        } else {
          onCategoryClick(clickedCategory);
        }
      }
    },
    onHover: (_event: unknown, elements: Array<{ index: number }>) => {
      if (elements.length > 0 && chartData) {
        setHoveredCategory(chartData.categories[elements[0].index].name);
      } else {
        setHoveredCategory(null);
      }
    },
  }), [chartData, selectedCategory, onCategoryClick]);

  // לחיצה על פריט בלגנדה
  const handleLegendClick = useCallback((categoryName: string) => {
    if (onCategoryClick) {
      if (selectedCategory === categoryName) {
        onCategoryClick(null);
      } else {
        onCategoryClick(categoryName);
      }
    }
  }, [onCategoryClick, selectedCategory]);

  // קטגוריות להצגה במצב קומפקטי
  const displayCategories = useMemo(() => {
    if (!compact || !chartData) return chartData?.categories || [];
    const cats = chartData.categories;
    if (cats.length <= maxCompactCategories) return cats;
    // קח את ה-N הראשונים ואגד את השאר ל"אחר"
    const top = cats.slice(0, maxCompactCategories - 1);
    const rest = cats.slice(maxCompactCategories - 1);
    const otherAmount = rest.reduce((sum, c) => sum + c.amount, 0);
    const otherPercentage = rest.reduce((sum, c) => sum + c.percentage, 0);
    return [
      ...top,
      {
        name: `אחר (${rest.length})`,
        amount: otherAmount,
        originalAmount: otherAmount,
        percentage: otherPercentage,
        isNegative: false,
        color: '#94a3b8',
        icon: '📦',
      },
    ];
  }, [compact, chartData, maxCompactCategories]);

  // קטגוריות להצגה בלגנדה (עם הגבלה ו"הצג עוד")
  const { visibleCategories, hiddenCount, hasMore } = useMemo(() => {
    if (!chartData) return { visibleCategories: [], hiddenCount: 0, hasMore: false };
    
    // במצב קומפקטי - השתמש ב-displayCategories
    if (compact) {
      return { visibleCategories: displayCategories, hiddenCount: 0, hasMore: false };
    }
    
    const cats = chartData.categories;
    const totalCount = cats.length;
    
    // אם יש פחות או שווה ל-maxVisibleCategories - הצג הכל
    if (totalCount <= maxVisibleCategories) {
      return { visibleCategories: cats, hiddenCount: 0, hasMore: false };
    }
    
    // אם הלגנדה מורחבת - הצג הכל
    if (isLegendExpanded) {
      return { visibleCategories: cats, hiddenCount: 0, hasMore: true };
    }
    
    // אחרת - הצג רק את ה-maxVisibleCategories הראשונות
    return {
      visibleCategories: cats.slice(0, maxVisibleCategories),
      hiddenCount: totalCount - maxVisibleCategories,
      hasMore: true,
    };
  }, [chartData, compact, displayCategories, maxVisibleCategories, isLegendExpanded]);

  // אם אין נתונים
  if (!chartData || chartData.categories.length === 0) {
    return null;
  }

  return (
    <div className={`category-donut-chart ${isCollapsed ? 'collapsed' : 'expanded'} ${compact ? 'compact-mode' : ''}`}>
      {/* כותרת - ללא פעולת סגירה */}
      <div className="donut-header-wrapper">
        <div 
          className="donut-header"
          aria-expanded={!isCollapsed}
          aria-controls="donut-content"
        >
          <div className="donut-header-left">
            <span className="donut-icon">{effectiveMode === 'income' ? '💰' : '📊'}</span>
            <span className="donut-title">
              {effectiveMode === 'income' ? 'התפלגות הכנסות' : 'התפלגות הוצאות'}
            </span>
          </div>
        <div className="donut-header-right">
          {isCollapsed && chartData && (
            <span className="donut-preview">
              {chartData.categories.slice(0, 2).map((c, i) => (
                <span key={c.name} className="preview-item" style={{ color: c.color }}>
                  {c.icon} {c.name.length > 8 ? c.name.slice(0, 8) + '…' : c.name} {c.percentage.toFixed(0)}%
                  {i < Math.min(1, chartData.categories.length - 1) && ' · '}
                </span>
              ))}
              {chartData.categories.length > 2 && <span className="preview-more">+{chartData.categories.length - 2}</span>}
            </span>
          )}
          {/* הסרת חץ הקיפול - כבר לא ניתן ללחוץ על הכותרת */}
        </div>
      </div>
      </div>

      {/* תוכן הגרף */}
      <div 
        id="donut-content"
        className={`donut-content ${isCollapsed ? 'hidden' : 'visible'}`}
      >
        <div className="donut-layout">
          {/* הגרף */}
          <div className="donut-chart-container">
            {donutData && (
              <Doughnut data={donutData} options={chartOptions} />
            )}
            {/* סכום במרכז */}
            <div className="donut-center">
              <span className="donut-center-label">סה״כ</span>
              <span className="donut-center-value">₪{chartData.total.toLocaleString()}</span>
            </div>
          </div>

          {/* לגנדה */}
          <div className="donut-legend">
            {visibleCategories.map((cat) => (
              <button
                key={cat.name}
                className={`legend-item ${selectedCategory === cat.name ? 'selected' : ''} ${hoveredCategory === cat.name ? 'hovered' : ''} ${cat.isNegative ? 'is-refund' : ''}`}
                onClick={() => handleLegendClick(cat.name)}
                onMouseEnter={() => setHoveredCategory(cat.name)}
                onMouseLeave={() => setHoveredCategory(null)}
                style={{
                  '--legend-color': cat.isNegative ? '#10b981' : cat.color,
                } as React.CSSProperties}
              >
                <span 
                  className="legend-color-dot" 
                  style={{ 
                    backgroundColor: cat.color,
                    borderColor: cat.isNegative ? '#10b981' : 'transparent',
                    borderWidth: cat.isNegative ? '2px' : '0',
                    borderStyle: 'solid'
                  }} 
                />
                <span className="legend-icon">{cat.icon}</span>
                <span className={`legend-name ${cat.isNegative ? 'refund-text' : ''}`}>{cat.name}</span>
                {!compact && (
                  <span className="legend-bar-container">
                    <span 
                      className="legend-bar" 
                      style={{ 
                        width: `${cat.percentage}%`,
                        backgroundColor: cat.isNegative ? '#10b981' : cat.color 
                      }}
                    />
                  </span>
                )}
                {!compact && (
                  <span className={`legend-value ${cat.isNegative ? 'refund-text' : ''}`}>
                    {cat.isNegative ? '-' : ''}₪{cat.amount.toLocaleString()}
                  </span>
                )}
                <span className={`legend-percent ${cat.isNegative ? 'refund-text' : ''}`}>{cat.percentage.toFixed(0)}%</span>
              </button>
            ))}
            
            {/* כפתור הצג עוד / הצג פחות */}
            {hasMore && (
              <button
                className="legend-expand-btn"
                onClick={() => setIsLegendExpanded(!isLegendExpanded)}
                aria-expanded={isLegendExpanded}
              >
                {isLegendExpanded ? (
                  <>
                    <span className="expand-icon">▲</span>
                    <span>הצג פחות</span>
                  </>
                ) : (
                  <>
                    <span className="expand-icon">▼</span>
                    <span>+{hiddenCount} קטגוריות נוספות</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* הודעה על סינון פעיל */}
        {selectedCategory && (
          <div className="filter-active-notice">
            <span>🔍 מציג רק: <strong>{selectedCategory}</strong></span>
            <button 
              className="clear-filter-btn"
              onClick={() => onCategoryClick?.(null)}
            >
              ✕ הצג הכל
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoryDonutChart;
