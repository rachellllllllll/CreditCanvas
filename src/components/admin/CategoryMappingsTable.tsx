/**
 * Category Mappings Table Component
 * טבלת מיפויי קטגוריות - הצגת המיפויים הנפוצים ביותר
 */

import React, { useState, useMemo } from 'react';
import type { MappingType } from '../../utils/analytics';

export interface CategoryMappingEntry {
  excelCategory: string;
  selectedCategory: string;
  count: number;
  descriptions: string[];
  date: string;
  mappingType: MappingType;
}

interface CategoryMappingsTableProps {
  mappings: CategoryMappingEntry[];
}

type FilterType = 'all' | MappingType;

// תצוגה ויזואלית לכל סוג מיפוי
const MAPPING_TYPE_CONFIG: Record<MappingType, { label: string; icon: string; color: string; bgColor: string }> = {
  manual_mapping: {
    label: 'מיפוי ידני',
    icon: '✋',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.15)'
  },
  auto_matched: {
    label: 'זוהה אוטומטית',
    icon: '🤖',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.15)'
  },
  new_category: {
    label: 'קטגוריה חדשה',
    icon: '🆕',
    color: '#6366f1',
    bgColor: 'rgba(99, 102, 241, 0.15)'
  }
};

export default function CategoryMappingsTable({ mappings }: CategoryMappingsTableProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<FilterType>('manual_mapping');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Calculate statistics by type
  const stats = useMemo(() => {
    const byType: Record<MappingType, number> = {
      manual_mapping: 0,
      auto_matched: 0,
      new_category: 0
    };
    
    mappings.forEach(m => {
      byType[m.mappingType]++;
    });
    
    return byType;
  }, [mappings]);

  // Filter and aggregate mappings
  const filteredMappings = useMemo(() => {
    let filtered = filterType === 'all' 
      ? mappings 
      : mappings.filter(m => m.mappingType === filterType);
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m => 
        m.excelCategory.toLowerCase().includes(query) ||
        m.selectedCategory.toLowerCase().includes(query) ||
        m.descriptions.some(d => d.toLowerCase().includes(query))
      );
    }
    
    return filtered;
  }, [mappings, filterType, searchQuery]);

  // Aggregate mappings: count how many times each excel→selected pair appeared
  const sorted = useMemo(() => {
    const aggregated = new Map<string, { 
      count: number; 
      totalTransactions: number; 
      descriptions: Set<string>;
      mappingType: MappingType;
    }>();
    
    for (const m of filteredMappings) {
      const key = `${m.excelCategory} → ${m.selectedCategory}`;
      const existing = aggregated.get(key) || { 
        count: 0, 
        totalTransactions: 0, 
        descriptions: new Set<string>(),
        mappingType: m.mappingType
      };
      existing.count++;
      existing.totalTransactions += m.count;
      m.descriptions.forEach(d => existing.descriptions.add(d));
      aggregated.set(key, existing);
    }

    return Array.from(aggregated.entries())
      .map(([key, val]) => ({
        key,
        excelCategory: key.split(' → ')[0],
        selectedCategory: key.split(' → ')[1],
        timesChosen: val.count,
        totalTransactions: val.totalTransactions,
        descriptions: Array.from(val.descriptions).slice(0, 10),
        mappingType: val.mappingType
      }))
      // Sort: manual_mapping first, then by times chosen
      .sort((a, b) => {
        if (a.mappingType === 'manual_mapping' && b.mappingType !== 'manual_mapping') return -1;
        if (a.mappingType !== 'manual_mapping' && b.mappingType === 'manual_mapping') return 1;
        return b.timesChosen - a.timesChosen;
      });
  }, [filteredMappings]);

  // Export to CSV
  const handleExportCSV = () => {
    if (sorted.length === 0) {
      alert('אין נתונים לייצוא');
      return;
    }

    // Build CSV content
    const headers = ['סוג', 'קטגוריית אקסל', 'קטגוריה שנבחרה', 'פעמים שנבחר', 'עסקאות', 'תיאורים'];
    const rows = sorted.map(row => [
      MAPPING_TYPE_CONFIG[row.mappingType].label,
      row.excelCategory,
      row.selectedCategory,
      row.timesChosen,
      row.totalTransactions,
      row.descriptions.join('; ')
    ]);

    // Convert to CSV format (with BOM for proper Hebrew encoding in Excel)
    const BOM = '\uFEFF';
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `category-mappings-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (mappings.length === 0) {
    return (
      <div className="chart-card full-width">
        <h3 className="chart-title">🏷️ מיפויי קטגוריות</h3>
        <div className="chart-empty" style={{ padding: '32px' }}>
          <p>אין נתוני מיפוי קטגוריות</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chart-card full-width">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderBottom: '1px solid rgba(148, 163, 184, 0.1)' }}>
        <h3 className="chart-title">🏷️ מיפויי קטגוריות</h3>
        <button
          onClick={handleExportCSV}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            background: 'rgba(30, 41, 59, 0.5)',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
          onMouseEnter={(e) => {
            const target = e.target as HTMLElement;
            target.style.background = 'rgba(99, 102, 241, 0.15)';
            target.style.color = '#818cf8';
            target.style.borderColor = '#6366f1';
          }}
          onMouseLeave={(e) => {
            const target = e.target as HTMLElement;
            target.style.background = 'rgba(30, 41, 59, 0.5)';
            target.style.color = '#94a3b8';
            target.style.borderColor = 'rgba(148, 163, 184, 0.2)';
          }}
        >
          <span>📥</span>
          <span>ייצוא ל-CSV</span>
        </button>
      </div>
      
      {/* Search box */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(148, 163, 184, 0.1)' }}>
        <input
          type="text"
          placeholder="🔍 חיפוש בקטגוריות או תיאורים..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            background: 'rgba(30, 41, 59, 0.5)',
            color: '#e2e8f0',
            fontSize: '0.875rem',
            outline: 'none',
            transition: 'all 0.2s',
            boxSizing: 'border-box'
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#6366f1';
            e.currentTarget.style.background = 'rgba(30, 41, 59, 0.8)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)';
            e.currentTarget.style.background = 'rgba(30, 41, 59, 0.5)';
          }}
        />
      </div>
      
      {/* Filter buttons */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        padding: '12px 16px', 
        borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
        flexWrap: 'wrap'
      }}>
        <button
          onClick={() => setFilterType('all')}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: filterType === 'all' ? '2px solid #6366f1' : '1px solid rgba(148, 163, 184, 0.2)',
            background: filterType === 'all' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(30, 41, 59, 0.5)',
            color: filterType === 'all' ? '#818cf8' : '#94a3b8',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: filterType === 'all' ? '600' : '400',
            transition: 'all 0.2s'
          }}
        >
          הכל ({filteredMappings.length})
        </button>
        
        {(Object.entries(MAPPING_TYPE_CONFIG) as [MappingType, typeof MAPPING_TYPE_CONFIG[MappingType]][]).map(([type, config]) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: filterType === type ? `2px solid ${config.color}` : '1px solid rgba(148, 163, 184, 0.2)',
              background: filterType === type ? config.bgColor : 'rgba(30, 41, 59, 0.5)',
              color: filterType === type ? config.color : '#94a3b8',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: filterType === type ? '600' : '400',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>{config.icon}</span>
            <span>{config.label}</span>
            <span style={{ 
              background: 'rgba(255, 255, 255, 0.1)', 
              padding: '2px 6px', 
              borderRadius: '4px',
              fontSize: '0.75rem'
            }}>
              {stats[type]}
            </span>
          </button>
        ))}
      </div>

      <div className="events-table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
        <table className="events-table">
          <thead>
            <tr>
              <th>סוג</th>
              <th>קטגוריית אקסל</th>
              <th>קטגוריה שנבחרה</th>
              <th>פעמים שנבחר</th>
              <th>עסקאות</th>
              <th>תיאורים</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const typeConfig = MAPPING_TYPE_CONFIG[row.mappingType];
              return (
                <React.Fragment key={row.key}>
                  <tr
                    onClick={() => setExpandedRow(expandedRow === row.key ? null : row.key)}
                    style={{ cursor: row.descriptions.length > 0 ? 'pointer' : 'default' }}
                  >
                    <td>
                      <span 
                        className="event-badge" 
                        style={{ 
                          background: typeConfig.bgColor, 
                          color: typeConfig.color,
                          fontSize: '0.75rem',
                          padding: '4px 8px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title={typeConfig.label}
                      >
                        {typeConfig.icon}
                      </span>
                    </td>
                    <td>
                      <span className="event-badge" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5' }}>
                        {row.excelCategory}
                      </span>
                    </td>
                    <td>
                      <span className="event-badge" style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#86efac' }}>
                        {row.selectedCategory}
                      </span>
                    </td>
                    <td>{row.timesChosen}</td>
                    <td>{row.totalTransactions.toLocaleString('he-IL')}</td>
                    <td>
                      {row.descriptions.length > 0 && (
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                          {expandedRow === row.key ? '▲' : '▼'} {row.descriptions.length} תיאורים
                        </span>
                      )}
                    </td>
                  </tr>
                  {expandedRow === row.key && row.descriptions.length > 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '8px 16px', background: 'rgba(30, 41, 59, 0.5)' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {row.descriptions.map((desc, i) => (
                            <span
                              key={i}
                              style={{
                                background: 'rgba(99, 102, 241, 0.15)',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                                color: '#cbd5e1',
                              }}
                            >
                              {desc}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
