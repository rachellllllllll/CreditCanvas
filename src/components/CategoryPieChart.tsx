import React, { useMemo, useCallback, useState } from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import type { ChartData, ChartOptions } from 'chart.js';
import type { CategoryDef } from './CategoryManager';
import CategoryStats from './CategoryStats';
import './CategoryPieChart.css';
ChartJS.register(ArcElement, Tooltip, Legend);

interface CategoryPieChartProps {
  categories: Record<string, number>;
  categoriesList?: CategoryDef[];
  onCategoryClick?: (categoryName: string) => void;
  showLegend?: boolean;
  maxWidth?: number;
  showExportButton?: boolean;
  title?: string;
  minPercentageToShow?: number; // הסתר קטגוריות מתחת לאחוז זה
  groupSmallCategories?: boolean; // קבץ קטגוריות קטנות ל"אחרים"
  showDetailedStats?: boolean; // הצג סטטיסטיקות מפורטות
  showLabelsOnChart?: boolean; // הצג תוויות על הגרף עצמו
}

const CategoryPieChart: React.FC<CategoryPieChartProps> = ({ 
  categories, 
  categoriesList, 
  onCategoryClick, 
  showLegend = true, 
  maxWidth = 600,
  showExportButton = false,
  title = 'גרף חלוקה לפי קטגוריות',
  minPercentageToShow = 1,
  groupSmallCategories = true,
  showDetailedStats = false,
  showLabelsOnChart = true
}) => {
  // ניהול קטגוריה נבחרת
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  // Early return if no data
  if (!categories || Object.keys(categories).length === 0) {
    return (
      <div className="category-pie-chart" style={{ maxWidth }}>
        <h3>{title}</h3>
        <div style={{ 
          textAlign: 'center', 
          color: '#666', 
          padding: 40,
          fontSize: 16 
        }}>
          אין נתונים להצגה
        </div>
      </div>
    );
  }
  // Process categories - group small ones if needed
  const processedCategories = useMemo(() => {
    const total = Object.values(categories).reduce((sum, val) => sum + val, 0);
    if (!groupSmallCategories) return categories;

    const result: Record<string, number> = {};
    let othersTotal = 0;
    const smallCategories: string[] = [];

    Object.entries(categories).forEach(([name, value]) => {
      const percentage = (value / total) * 100;
      if (percentage >= minPercentageToShow) {
        result[name] = value;
      } else {
        othersTotal += value;
        smallCategories.push(name);
      }
    });

    if (othersTotal > 0 && smallCategories.length > 1) {
      result['אחרים'] = othersTotal;
    } else if (smallCategories.length === 1) {
      // If only one small category, don't group it
      result[smallCategories[0]] = othersTotal;
    }

    return result;
  }, [categories, groupSmallCategories, minPercentageToShow]);

  // Get category definition helper
  const getCategoryDef = useCallback((categoryName: string): CategoryDef | undefined => {
    return categoriesList?.find(cat => cat.name === categoryName);
  }, [categoriesList]);

  // Use colors from categoriesList if available, fallback to default palette
  const { categoryColors, categoryIcons } = useMemo(() => {
    const colors: Record<string, string> = {};
    const icons: Record<string, string> = {};
    const defaultColorPalette = [
      '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', 
      '#C9CBCF', '#B2FF66', '#FF66B2', '#66B2FF', '#FFB266', '#66FFB2', 
      '#B266FF', '#FF6666', '#66FF66', '#6666FF', '#FFD966', '#A2EB36', 
      '#CE56FF', '#40FF9F'
    ];

    Object.keys(processedCategories).forEach((cat, i) => {
      if (cat === 'אחרים') {
        colors[cat] = '#95a5a6'; // Gray for "Others"
        icons[cat] = '📊';
      } else {
        const categoryDef = getCategoryDef(cat);
        colors[cat] = categoryDef?.color || defaultColorPalette[i % defaultColorPalette.length];
        icons[cat] = categoryDef?.icon || '';
      }
    });

    return { categoryColors: colors, categoryIcons: icons };
  }, [processedCategories, getCategoryDef]);

  // pieData עם הדגשה לקטגוריה נבחרת
  const pieData: ChartData<'pie'> = useMemo(() => {
    const labels = Object.keys(processedCategories);
    const data = Object.values(processedCategories);
    return {
      labels,
      datasets: [
        {
          data,
          backgroundColor: labels.map(cat => categoryColors[cat]),
          borderWidth: labels.map(cat => cat === selectedCategory ? 4 : 2),
          borderColor: '#fff',
          hoverBorderWidth: 3,
          hoverBorderColor: '#333',
          offset: labels.map(cat => cat === selectedCategory ? 20 : 0),
        },
      ],
    };
  }, [processedCategories, categoryColors, selectedCategory]);

  // Enhanced plugin with better positioning and readability
  const pieLabelPlugin = useMemo(() => ({
    id: 'pieLabelPlugin',
    afterDatasetsDraw(chart: any) {
      // Skip if labels on chart are disabled
      if (!showLabelsOnChart) return;
      
      const { ctx, chartArea, data } = chart;
      if (!chartArea) return;
      
      chart.getDatasetMeta(0).data.forEach((arc: any, i: number) => {
        const total = data.datasets[0].data.reduce((sum: number, val: number) => sum + val, 0);
        const percentage = ((data.datasets[0].data[i] / total) * 100).toFixed(1);
        
        // Only show label if slice is large enough (>2%)
        if (parseFloat(percentage) < 2) return;
        
        // Calculate angle and position for label
        const angle = (arc.startAngle + arc.endAngle) / 2;
        
        // Calculate radius based on the actual chart area and arc size
        const chartRadius = Math.min(
          (chartArea.right - chartArea.left) / 2,
          (chartArea.bottom - chartArea.top) / 2
        );
        
        // Position labels outside the pie but within the canvas
        const labelRadius = arc.outerRadius + Math.min(25, chartRadius * 0.15);
        const x = arc.x + Math.cos(angle) * labelRadius;
        const y = arc.y + Math.sin(angle) * labelRadius;
        
        // Get icon if available
        const categoryName = data.labels[i];
        const icon = categoryIcons[categoryName];
        
        ctx.save();
        
        // Adjust text alignment based on position
        const isLeft = x < arc.x;
        const isTop = y < arc.y;
        
        ctx.textAlign = isLeft ? 'right' : 'left';
        ctx.textBaseline = isTop ? 'bottom' : 'top';
        
        // Main label
        ctx.font = 'bold 11px Arial';
        ctx.fillStyle = '#333';
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        
        // Draw icon and label
        const displayText = icon ? `${icon} ${categoryName}` : categoryName;
        ctx.strokeText(displayText, x, y);
        ctx.fillText(displayText, x, y);
        
        // Draw percentage below/above based on position
        ctx.font = '9px Arial';
        ctx.fillStyle = '#666';
        const percentageY = isTop ? y - 12 : y + 12;
        ctx.strokeText(`(${percentage}%)`, x, percentageY);
        ctx.fillText(`(${percentage}%)`, x, percentageY);
        
        // Draw a line from the pie to the label for better clarity
        if (labelRadius > arc.outerRadius + 15) {
          ctx.beginPath();
          ctx.moveTo(arc.x + Math.cos(angle) * arc.outerRadius, arc.y + Math.sin(angle) * arc.outerRadius);
          ctx.lineTo(arc.x + Math.cos(angle) * (arc.outerRadius + 10), arc.y + Math.sin(angle) * (arc.outerRadius + 10));
          ctx.strokeStyle = '#ccc';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        
        ctx.restore();
      });
    },
  }), [categoryIcons, showLabelsOnChart]);

  // Click handler for pie slices
  const handleChartClick = useCallback((_event: any, elements: any[]) => {
    if (elements.length > 0) {
      const elementIndex = elements[0].index;
      const categoryName = pieData.labels?.[elementIndex];
      if (categoryName) {
        setSelectedCategory(prev => prev === String(categoryName) ? null : String(categoryName));
        onCategoryClick?.(String(categoryName));
      }
    }
  }, [onCategoryClick, pieData.labels]);

  const options: ChartOptions<'pie'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        top: 40,
        right: 60,
        bottom: 40,
        left: 60
      }
    },
    plugins: {
      legend: { display: false }, // We use custom legend
      tooltip: {
        enabled: true,
        callbacks: {
          label: function(context: any) {
            const total = context.dataset.data.reduce((sum: number, val: number) => sum + val, 0);
            const percentage = ((context.raw / total) * 100).toFixed(1);
            return `${context.label}: ${context.raw.toLocaleString()} ₪ (${percentage}%)`;
          }
        }
      }
    },
    onClick: handleChartClick,
    interaction: {
      intersect: false,
      mode: 'nearest'
    },
    elements: {
      arc: {
        borderAlign: 'center' as const
      }
    }
  }), [handleChartClick]);

  // Export functionality
  const exportChart = useCallback(() => {
    // Create a temporary canvas to export the chart
    const canvas = document.querySelector('.category-pie-chart canvas') as HTMLCanvasElement;
    if (canvas) {
      const link = document.createElement('a');
      link.download = `category-chart-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL();
      link.click();
    }
  }, []);

  return (
    <div className="category-pie-chart" style={{ maxWidth }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {showExportButton && (
          <button
            onClick={exportChart}
            style={{
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
            title="ייצא גרף כתמונה"
          >
            📊 ייצוא
          </button>
        )}
      </div>
      
      {/* Custom Legend with Icons */}
      {showLegend && (
        <div className="category-legend">
          {(pieData.labels ?? []).map((label) => {
            const categoryName = String(label);
            const icon = categoryIcons[categoryName];
            const total = Object.values(processedCategories).reduce((sum, val) => sum + val, 0);
            const percentage = ((processedCategories[categoryName] / total) * 100).toFixed(1);
            
            return (
              <span 
                key={categoryName} 
                className={`category-legend-item ${onCategoryClick ? 'clickable' : ''} ${selectedCategory === categoryName ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedCategory(prev => prev === categoryName ? null : categoryName);
                  onCategoryClick?.(categoryName);
                }}
                tabIndex={onCategoryClick ? 0 : -1}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && onCategoryClick) {
                    e.preventDefault();
                    setSelectedCategory(prev => prev === categoryName ? null : categoryName);
                    onCategoryClick?.(categoryName);
                  }
                }}
                title={`${categoryName}: ${processedCategories[categoryName].toLocaleString()} ₪ (${percentage}%)`}
                role={onCategoryClick ? 'button' : 'text'}
                aria-label={`קטגוריה ${categoryName}, ${processedCategories[categoryName].toLocaleString()} שקלים, ${percentage} אחוז`}
                aria-pressed={selectedCategory === categoryName}
              >
                <span 
                  className="category-color-dot"
                  style={{ background: categoryColors[categoryName] }}
                />
                {icon && (
                  <span className="category-icon">
                    {icon}
                  </span>
                )}
                <span className="category-name">
                  {categoryName}
                </span>
                <span className="category-percentage">
                  ({percentage}%)
                </span>
              </span>
            );
          })}
        </div>
      )}
      
      {/* Chart Container */}
      <div 
        className={`chart-container ${onCategoryClick ? 'clickable' : ''} ${selectedCategory ? 'has-selection' : ''}`}
        style={{
          // Dynamic height based on number of categories and label visibility
          minHeight: showLabelsOnChart 
            ? Math.max(400, Object.keys(processedCategories).length * 30 + 300)
            : Math.max(300, Object.keys(processedCategories).length * 20 + 250)
        }}
      >
        <Pie 
          data={pieData} 
          options={options} 
          plugins={[pieLabelPlugin]}
          aria-label="גרף עוגה המציג חלוקת הוצאות לפי קטגוריות"
        />
      </div>
      {/* לחצן ניקוי בחירה */}
      {selectedCategory && (
        <div className="selection-controls">
          <button 
            className="clear-selection-btn"
            onClick={() => setSelectedCategory(null)}
            aria-label="נקה בחירה"
          >
            נקה בחירה ✕
          </button>
        </div>
      )}
      
      {/* Total Summary */}
      <div className="chart-total-summary">
        <strong>סה"כ: {Object.values(categories).reduce((sum, val) => sum + val, 0).toLocaleString()} ₪</strong>
        {groupSmallCategories && Object.keys(processedCategories).length !== Object.keys(categories).length && (
          <div style={{ fontSize: 12, color: '#6c757d', marginTop: 4 }}>
            מציג {Object.keys(processedCategories).length} מתוך {Object.keys(categories).length} קטגוריות
          </div>
        )}
      </div>
      
      {/* Detailed Statistics */}
      <CategoryStats
        categories={categories}
        categoriesList={categoriesList}
        showDetailedStats={showDetailedStats}
      />
    </div>
  );
};

export default CategoryPieChart;
