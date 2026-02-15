/**
 * Category Mappings Table Component
 * טבלת מיפויי קטגוריות - הצגת המיפויים הנפוצים ביותר
 */

import React, { useState } from 'react';

export interface CategoryMappingEntry {
  excelCategory: string;
  selectedCategory: string;
  count: number;
  descriptions: string[];
  date: string;
}

interface CategoryMappingsTableProps {
  mappings: CategoryMappingEntry[];
}

export default function CategoryMappingsTable({ mappings }: CategoryMappingsTableProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

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

  // Aggregate mappings: count how many times each excel→selected pair appeared
  const aggregated = new Map<string, { count: number; totalTransactions: number; descriptions: Set<string> }>();
  for (const m of mappings) {
    const key = `${m.excelCategory} → ${m.selectedCategory}`;
    const existing = aggregated.get(key) || { count: 0, totalTransactions: 0, descriptions: new Set<string>() };
    existing.count++;
    existing.totalTransactions += m.count;
    m.descriptions.forEach(d => existing.descriptions.add(d));
    aggregated.set(key, existing);
  }

  const sorted = Array.from(aggregated.entries())
    .map(([key, val]) => ({
      key,
      excelCategory: key.split(' → ')[0],
      selectedCategory: key.split(' → ')[1],
      timesChosen: val.count,
      totalTransactions: val.totalTransactions,
      descriptions: Array.from(val.descriptions).slice(0, 10),
    }))
    .sort((a, b) => b.timesChosen - a.timesChosen);

  return (
    <div className="chart-card full-width">
      <h3 className="chart-title">🏷️ מיפויי קטגוריות ({sorted.length} מיפויים ייחודיים)</h3>
      <div className="events-table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
        <table className="events-table">
          <thead>
            <tr>
              <th>קטגוריית אקסל</th>
              <th>קטגוריה שנבחרה</th>
              <th>פעמים שנבחר</th>
              <th>עסקאות</th>
              <th>תיאורים</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <React.Fragment key={row.key}>
                <tr
                  onClick={() => setExpandedRow(expandedRow === row.key ? null : row.key)}
                  style={{ cursor: row.descriptions.length > 0 ? 'pointer' : 'default' }}
                >
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
                    <td colSpan={5} style={{ padding: '8px 16px', background: 'rgba(30, 41, 59, 0.5)' }}>
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
