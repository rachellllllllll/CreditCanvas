import React from 'react';
import type { CategoryDef } from './CategoryManager';

interface CategoryStatsProps {
  categories: Record<string, number>;
  categoriesList?: CategoryDef[];
  showDetailedStats?: boolean;
}

const CategoryStats: React.FC<CategoryStatsProps> = ({ 
  categories, 
  showDetailedStats = false 
}) => {
  const total = Object.values(categories).reduce((sum, val) => sum + val, 0);
  const sortedCategories = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  
  const stats = {
    totalCategories: Object.keys(categories).length,
    avgPerCategory: total / Object.keys(categories).length,
    topCategory: sortedCategories[0],
    bottomCategory: sortedCategories[sortedCategories.length - 1],
    variance: (() => {
      const values = Object.values(categories);
      const avg = total / values.length;
      const squaredDiffs = values.map(val => Math.pow(val - avg, 2));
      return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    })(),
  };

  if (!showDetailedStats) return null;

  return (
    <div style={{
      marginTop: 16,
      padding: 16,
      background: '#f8f9fa',
      borderRadius: 8,
      border: '1px solid #e9ecef',
      fontSize: 13
    }}>
      <h4 style={{ margin: '0 0 12px 0', color: '#495057' }}>סטטיסטיקות מפורטות</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div>
          <strong>מספר קטגוריות:</strong> {stats.totalCategories}
        </div>
        <div>
          <strong>ממוצע לקטגוריה:</strong> {stats.avgPerCategory.toLocaleString()} ₪
        </div>
        <div>
          <strong>קטגוריה מובילה:</strong> {stats.topCategory[0]} ({((stats.topCategory[1] / total) * 100).toFixed(1)}%)
        </div>
        <div>
          <strong>קטגוריה קטנה:</strong> {stats.bottomCategory[0]} ({((stats.bottomCategory[1] / total) * 100).toFixed(1)}%)
        </div>
        <div>
          <strong>שונות:</strong> {Math.sqrt(stats.variance).toLocaleString()} ₪
        </div>
        <div>
          <strong>יחס עליון/תחתון:</strong> {(stats.topCategory[1] / stats.bottomCategory[1]).toFixed(1)}:1
        </div>
      </div>
    </div>
  );
};

export default CategoryStats;
