/**
 * Category Insights Card
 * הצלבה בין קטגוריות לא מזוהות לבין מה שמשתמשים מיפו בפועל
 * מאפשר לראות אילו קטגוריות כדאי להוסיף ל-categoryRules
 */

import React, { useState, useMemo } from 'react';
import type { MappingType } from '../../utils/analytics';

export interface CategoryInsight {
  excelCategory: string;
  totalTransactions: number;
  userCount: number;
  mappedTo: Array<{ selectedCategory: string; count: number; mappingType: MappingType }>;
}

interface CategoryInsightsCardProps {
  insights: CategoryInsight[];
}

const MAPPING_TYPE_ICONS: Record<MappingType, string> = {
  manual_mapping: '✋',
  auto_matched: '🤖',
  new_category: '🆕',
};

export default function CategoryInsightsCard({ insights }: CategoryInsightsCardProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unmapped' | 'mapped'>('all');

  const filtered = useMemo(() => {
    let list = insights;
    if (filter === 'unmapped') list = list.filter(i => i.mappedTo.length === 0);
    if (filter === 'mapped') list = list.filter(i => i.mappedTo.length > 0);
    return list;
  }, [insights, filter]);

  const displayed = showAll ? filtered : filtered.slice(0, 15);
  const maxTransactions = Math.max(...insights.map(i => i.totalTransactions), 1);

  // סטטיסטיקות
  const totalUnknown = insights.length;
  const totalMapped = insights.filter(i => i.mappedTo.length > 0).length;
  const totalUnmapped = totalUnknown - totalMapped;

  if (insights.length === 0) {
    return (
      <div className="chart-card full-width">
        <h3 className="chart-title">🔍 תובנות קטגוריות</h3>
        <div className="chart-empty" style={{ padding: '32px' }}>
          <p>אין קטגוריות לא מזוהות בתקופה הנבחרת</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chart-card full-width">
      <h3 className="chart-title" style={{ padding: '16px 16px 0' }}>🔍 תובנות קטגוריות</h3>
      <p style={{ color: '#94a3b8', fontSize: '0.8rem', padding: '4px 16px 12px', margin: 0 }}>
        קטגוריות מאקסל שלא זוהו אוטומטית — ואיך משתמשים מיפו אותן
      </p>

      {/* Summary badges */}
      <div style={{ display: 'flex', gap: '8px', padding: '0 16px 12px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setFilter('all')}
          style={{
            padding: '4px 12px',
            borderRadius: '12px',
            border: `1px solid ${filter === 'all' ? '#6366f1' : 'rgba(148,163,184,0.2)'}`,
            background: filter === 'all' ? 'rgba(99,102,241,0.15)' : 'transparent',
            color: filter === 'all' ? '#818cf8' : '#94a3b8',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 500,
          }}
        >
          הכל ({totalUnknown})
        </button>
        <button
          onClick={() => setFilter('unmapped')}
          style={{
            padding: '4px 12px',
            borderRadius: '12px',
            border: `1px solid ${filter === 'unmapped' ? '#ef4444' : 'rgba(148,163,184,0.2)'}`,
            background: filter === 'unmapped' ? 'rgba(239,68,68,0.15)' : 'transparent',
            color: filter === 'unmapped' ? '#f87171' : '#94a3b8',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 500,
          }}
        >
          🔴 ללא מיפוי ({totalUnmapped})
        </button>
        <button
          onClick={() => setFilter('mapped')}
          style={{
            padding: '4px 12px',
            borderRadius: '12px',
            border: `1px solid ${filter === 'mapped' ? '#22c55e' : 'rgba(148,163,184,0.2)'}`,
            background: filter === 'mapped' ? 'rgba(34,197,94,0.15)' : 'transparent',
            color: filter === 'mapped' ? '#4ade80' : '#94a3b8',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 500,
          }}
        >
          🟢 עם מיפוי ({totalMapped})
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.15)' }}>
              <th style={thStyle}>קטגוריה מאקסל</th>
              <th style={{ ...thStyle, width: '120px' }}>עסקאות</th>
              <th style={{ ...thStyle, width: '80px' }}>👤 משתמשים</th>
              <th style={thStyle}>מיפוי נפוץ</th>
              <th style={{ ...thStyle, width: '90px' }}>סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map(item => {
              const isExpanded = expandedRow === item.excelCategory;
              const topMapping = item.mappedTo[0];
              const barWidth = Math.max((item.totalTransactions / maxTransactions) * 100, 4);
              
              return (
                <React.Fragment key={item.excelCategory}>
                  <tr
                    onClick={() => setExpandedRow(isExpanded ? null : item.excelCategory)}
                    style={{
                      borderBottom: '1px solid rgba(148,163,184,0.08)',
                      cursor: item.mappedTo.length > 0 ? 'pointer' : 'default',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(148,163,184,0.05)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Category name */}
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {item.mappedTo.length > 0 && (
                          <span style={{ fontSize: '0.7rem', color: '#64748b', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                        )}
                        <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{item.excelCategory}</span>
                      </div>
                    </td>

                    {/* Transaction bar */}
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          height: '6px',
                          width: `${barWidth}%`,
                          borderRadius: '3px',
                          background: item.mappedTo.length > 0
                            ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                            : 'linear-gradient(90deg, #ef4444, #f87171)',
                          minWidth: '4px',
                        }} />
                        <span style={{ color: '#94a3b8', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {item.totalTransactions.toLocaleString('he-IL')}
                        </span>
                      </div>
                    </td>

                    {/* User count */}
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{ 
                        background: 'rgba(99,102,241,0.15)', 
                        color: '#818cf8', 
                        padding: '2px 8px', 
                        borderRadius: '8px', 
                        fontSize: '0.8rem',
                        fontWeight: 600,
                      }}>
                        {item.userCount}
                      </span>
                    </td>

                    {/* Top mapping */}
                    <td style={tdStyle}>
                      {topMapping ? (
                        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                          {MAPPING_TYPE_ICONS[topMapping.mappingType]} {topMapping.selectedCategory}
                          {topMapping.count > 1 && <span style={{ color: '#64748b' }}> ×{topMapping.count}</span>}
                        </span>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: '0.8rem', fontStyle: 'italic' }}>—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {item.mappedTo.length > 0 ? (
                        <span style={{ 
                          background: 'rgba(34,197,94,0.15)', 
                          color: '#4ade80', 
                          padding: '2px 8px', 
                          borderRadius: '8px', 
                          fontSize: '0.75rem' 
                        }}>
                          ממופה
                        </span>
                      ) : (
                        <span style={{ 
                          background: 'rgba(239,68,68,0.15)', 
                          color: '#f87171', 
                          padding: '2px 8px', 
                          borderRadius: '8px', 
                          fontSize: '0.75rem' 
                        }}>
                          חסר
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* Expanded mappings */}
                  {isExpanded && item.mappedTo.length > 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: '0 16px 12px 40px', background: 'rgba(30,41,59,0.4)' }}>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px', fontWeight: 500 }}>
                          המשתמשים מיפו ל:
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {item.mappedTo.map(m => (
                            <div key={m.selectedCategory} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span>{MAPPING_TYPE_ICONS[m.mappingType]}</span>
                              <span style={{ color: '#e2e8f0' }}>{m.selectedCategory}</span>
                              <span style={{ 
                                color: '#64748b', 
                                fontSize: '0.75rem',
                                background: 'rgba(148,163,184,0.1)',
                                padding: '1px 6px',
                                borderRadius: '6px',
                              }}>
                                {m.count} {m.count === 1 ? 'פעם' : 'פעמים'}
                              </span>
                              <span style={{ color: '#64748b', fontSize: '0.7rem' }}>
                                {m.mappingType === 'manual_mapping' && 'ידני'}
                                {m.mappingType === 'new_category' && 'קטגוריה חדשה'}
                                {m.mappingType === 'auto_matched' && 'אוטומטי'}
                              </span>
                            </div>
                          ))}
                        </div>
                        {/* Recommendation */}
                        {item.mappedTo.length > 0 && item.userCount >= 2 && (
                          <div style={{ 
                            marginTop: '8px', 
                            padding: '6px 10px', 
                            background: 'rgba(245,158,11,0.1)', 
                            border: '1px solid rgba(245,158,11,0.2)',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            color: '#fbbf24',
                          }}>
                            💡 המלצה: הוסף כלל אוטומטי "{item.excelCategory}" → "{item.mappedTo[0].selectedCategory}" 
                            ({item.userCount} משתמשים בחרו כך)
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Show more */}
      {filtered.length > 15 && !showAll && (
        <div style={{ textAlign: 'center', padding: '12px' }}>
          <button
            onClick={() => setShowAll(true)}
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              border: '1px solid rgba(148,163,184,0.2)',
              background: 'rgba(30,41,59,0.5)',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            הצג עוד {filtered.length - 15} קטגוריות...
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================
// Style helpers
// ============================================

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'right',
  color: '#64748b',
  fontWeight: 600,
  fontSize: '0.8rem',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
};
