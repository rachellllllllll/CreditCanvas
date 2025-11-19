import React from 'react';
import './TransactionsTable.css';
import './TransactionsTable-enhanced.css';
import type { CreditDetail } from '../types';
import { signedAmount } from '../utils/money';

interface TransactionsTableProps {
  details: CreditDetail[];
  onEditCategory?: (transaction: CreditDetail) => void;
  categoriesList?: { name: string; color: string; icon: string }[];
  isYearlyView?: boolean;
  // When in yearly view, allow selecting a month to drill down.
  // Pass full key MM/YYYY instead of numeric index.
  onMonthSelect?: (monthKey: string) => void;
  creditChargeCycles?: any[]; // cycle summaries with bankMatchStatus
  setView: any;
}

const formatDate = (dateStr: string) => {
  // Try to extract day/month/year from dd/m/yy or dd/mm/yyyy
  const parts = dateStr.split('/');
  if (parts.length >= 3) {
    let day = parts[0].padStart(2, '0');
    let month = parts[1].padStart(2, '0');
    let year = parts[2];
    if (year.length === 2) year = '20' + year;
    if (year.length === 4) return `${day}/${month}/${year}`;
  }
  return dateStr;
};

// לוגיקת צבעים לקטגוריה (כמו ב-CategoryPieChart)
const getCategoryColors = (categories: string[]) => {
  const colorPalette = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF', '#B2FF66', '#FF66B2', '#66B2FF',
    '#FFB266', '#66FFB2', '#B266FF', '#FF6666', '#66FF66', '#6666FF', '#FFD966', '#A2EB36', '#CE56FF', '#40FF9F'
  ];
  const map: Record<string, string> = {};
  categories.forEach((cat, i) => {
    map[cat] = colorPalette[i % colorPalette.length];
  });
  return map;
};

// Utility: get readable text color for background
function getReadableTextColor(bgColor: string): string {
  // Remove hash if present
  const color = bgColor.replace('#', '');
  // Parse hex color
  let r = 255, g = 255, b = 255;
  if (color.length === 6) {
    r = parseInt(color.substring(0, 2), 16);
    g = parseInt(color.substring(2, 4), 16);
    b = parseInt(color.substring(4, 6), 16);
  } else if (color.length === 3) {
    r = parseInt(color[0] + color[0], 16);
    g = parseInt(color[1] + color[1], 16);
    b = parseInt(color[2] + color[2], 16);
  }
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#222' : '#fff';
}

const TransactionsTable: React.FC<TransactionsTableProps> = ({ details, onEditCategory, categoriesList,setView, ...props }) => {
  // Constants
  const CATEGORY_COLUMN_WIDTH = 250;

  // Virtual display category: map bank-without-category to 'תנועות בנק'
  const displayCategoryFor = React.useCallback((d: CreditDetail) => {
    return d.category || (d.source === 'bank' ? 'תנועות בנק' : 'ללא קטגוריה');
  }, []);

  const [sortBy, setSortBy] = React.useState<'date' | 'amount' | 'description' | 'category'>('date');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({});
  const [groupByCategory, setGroupByCategory] = React.useState(true);

  const parseDate = (dateStr: string) => {
    // Expects dd/mm/yyyy or dd/m/yy
    const parts = dateStr.split('/');
    if (parts.length >= 3) {
      let day = parts[0].padStart(2, '0');
      let month = parts[1].padStart(2, '0');
      let year = parts[2];
      if (year.length === 2) year = '20' + year;
      if (year.length === 4) {
        // yyyy-mm-dd for Date parsing
        return new Date(`${year}-${month}-${day}`).getTime();
      }
    }
    return 0; // fallback for invalid date
  };

  // קיבוץ לפי קטגוריה (תצוגה): משתמש ב-displayCategoryFor
  const grouped = React.useMemo(() => {
    const map: Record<string, CreditDetail[]> = {};
    details.forEach(d => {
      const cat = displayCategoryFor(d);
      if (!map[cat]) map[cat] = [];
      map[cat].push(d);
    });
    return map;
  }, [details, displayCategoryFor]);

  const allCategories = React.useMemo(() => Object.keys(grouped), [grouped]);
  const categoryColors = React.useMemo(() => getCategoryColors(allCategories), [allCategories]);

  // סכום כולל לכל קטגוריה (חתום לפי כיוון)
  const categoryTotals = React.useMemo(() => {
    const totals: Record<string, number> = {};
    for (const cat in grouped) {
      totals[cat] = grouped[cat].reduce((sum, d) => sum + signedAmount(d), 0);
    }
    return totals;
  }, [grouped]);

  // חישוב סכום חודשי לכל קטגוריה (תצוגה)
  const monthlyTotalsByCategory = React.useMemo(() => {
    // { [cat]: number[12] }
    const map: Record<string, number[]> = {};
    for (const cat of allCategories) {
      map[cat] = Array(12).fill(0);
    }
    details.forEach(d => {
      const cat = displayCategoryFor(d);
      const parts = d.date?.split('/') || [];
      let monthIdx = 0;
      if (parts.length >= 2) {
        monthIdx = Math.max(0, Math.min(11, parseInt(parts[1], 10) - 1));
      }
      map[cat][monthIdx] += signedAmount(d);
    });
    return map;
  }, [details, allCategories, displayCategoryFor]);

  // סכומי חודשים לכלל העסקאות + סכום שנתי כולל (תיקון לוגיקה שנשברה)
  const monthlyTotalsAll: number[] = React.useMemo(() => {
    const arr = Array(12).fill(0);
    details.forEach(d => {
      const parts = d.date?.split('/') || [];
      let monthIdx = 0;
      if (parts.length >= 2) {
        monthIdx = Math.max(0, Math.min(11, parseInt(parts[1], 10) - 1));
      }
      arr[monthIdx] += signedAmount(d);
    });
    return arr;
  }, [details]);

  const grandTotalAll = React.useMemo(() => monthlyTotalsAll.reduce((a, b) => a + b, 0), [monthlyTotalsAll]);

  const handleToggleGroup = (cat: string) => {
    setOpenGroups(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  // מיון קטגוריות לפי סכום כולל (יורד)
  const sortedCategories = allCategories.slice().sort((a, b) => categoryTotals[b] - categoryTotals[a]);

  // מיון כל העסקאות (ללא קיבוץ)
  const sortedDetails = React.useMemo(() => {
    const sorted = [...details];
    sorted.sort((a, b) => {
      let valA: any = a[sortBy] ?? '';
      let valB: any = b[sortBy] ?? '';
      if (sortBy === 'amount') {
        valA = Number(valA);
        valB = Number(valB);
      } else if (sortBy === 'date') {
        // Use parseDate for robust date sorting
        valA = parseDate(a.date || '');
        valB = parseDate(b.date || '');
      }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [details, sortBy, sortDir]);

  // (הוסר missingCycles – לא בשימוש לאחר צמצום הלוגיקה)

  const handleSort = (col: 'date' | 'amount' | 'description' | 'category') => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  // Helper: extract year from transaction data if in yearly view
  const getYearFromData = () => {
    if (!isYearlyView || !details.length) return undefined;
    const firstDate = details[0].date;
    const parts = firstDate.split('/');
    if (parts.length >= 3) {
      let year = parts[2];
      if (year.length === 2) year = '20' + year;
      return year;
    }
    return undefined;
  };

  // Helper: get category def by name
  const getCategoryDef = (cat: string) => categoriesList?.find(c => c.name === cat);

  // קובע אם להציג תצוגה שנתית (כל החודשים) או רגילה (חודש בודד)
  const isYearlyView = typeof props.isYearlyView === 'boolean' ? props.isYearlyView : false;


  // Add support for displaying chargeDate and card last4 badge (hover vs always visible)
  const [showChargeDate, setShowChargeDate] = React.useState(false);
  const [showCardLast4, setShowCardLast4] = React.useState(false); // when true: always show badge

  // State for context menu
  const [contextMenu, setContextMenu] = React.useState<null | { x: number; y: number; monthIdx: number; category: string; year?: string }>(null);

  // Close context menu on click elsewhere
  React.useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  // Reusable component for expand/collapse buttons
  const ExpandCollapseButtons = () => (
    <span style={{ marginRight: 4, display: 'flex', gap: 2 }}>
      <button
        className="TransactionsTable-expand-collapse-btn TransactionsTable-expand-collapse-btn-icon"
        title="פתח את כל הקטגוריות"
        aria-label="פתח את כל הקטגוריות"
        onClick={() => {
          const newState: Record<string, boolean> = {};
          sortedCategories.forEach(cat => { newState[cat] = true; });
          setOpenGroups(newState);
        }}
        style={{ padding: 2, background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" stroke="#444" strokeWidth="2" fill="none" /></svg>
      </button>
      <button
        className="TransactionsTable-expand-collapse-btn TransactionsTable-expand-collapse-btn-icon"
        title="סגור את כל הקטגוריות"
        aria-label="סגור את כל הקטגוריות"
        onClick={() => {
          const newState: Record<string, boolean> = {};
          sortedCategories.forEach(cat => { newState[cat] = false; });
          setOpenGroups(newState);
        }}
        style={{ padding: 2, background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M15 12l-5-5-5 5" stroke="#444" strokeWidth="2" fill="none" /></svg>
      </button>
    </span>
  );

  return (
    <div className="TransactionsTable-container">
      {/* {!isYearlyView && missingCycles.length > 0 && (
        <div
          className="TransactionsTable-missing-cycles-banner"
          style={{
            background: '#fff7ed',
            border: '1px solid #fdba74',
            padding: '8px 12px',
            borderRadius: 8,
            marginBottom: 12,
            lineHeight: 1.4
          }}
        >
          <strong>מחזורי חיוב ללא תנועת בנק מזוהה:</strong>
          <ul style={{ margin: '4px 0 0', paddingInlineStart: 20 }}>
            {missingCycles.map(c => (
              <li key={c.cycleKey}>
                {c.chargeDate} {c.cardLast4 ? `(כרטיס ${c.cardLast4})` : '(כל הכרטיסים)'} – נטו {c.netCharge?.toLocaleString()} ₪. ייתכן שחסר דף בנק / פירוט אשראי.
              </li>
            ))}
          </ul>
        </div>
      )} */}
      <div className="TransactionsTable-title-bar" style={{ position: 'sticky', zIndex: 3, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <h2 className="TransactionsTable-title">פירוט עסקאות</h2>
        {/* Show toggles only when relevant */}
        {!isYearlyView && (
          <>
            <label style={{ marginLeft: 16 }}>
              <input type="checkbox" checked={showChargeDate} onChange={e => setShowChargeDate(e.target.checked)} />
              הצג תאריך חיוב
            </label>
            <label style={{ marginLeft: 8 }}>
              <input type="checkbox" checked={showCardLast4} onChange={e => setShowCardLast4(e.target.checked)} />
              תמיד הצג ספרות כרטיס
            </label>
            <label style={{ marginLeft: 8 }}>
              <input type="checkbox" checked={groupByCategory} onChange={e => setGroupByCategory(e.target.checked)} />
              קבץ לפי קטגוריה
            </label>
          </>
        )}
      </div>
      <table className={
        'TransactionsTable-table' + (isYearlyView ? ' TransactionsTable-yearly-table' : '')
      } style={{ width: '100%', tableLayout: 'fixed' }}>
        <thead className="TransactionsTable-thead" style={{ position: 'sticky', zIndex: 4, background: '#fff' }}>
          <tr>
            {/* דינמי: עמודות לפי מצב */}
            {isYearlyView ? (
              <>
                <th className="TransactionsTable-th TransactionsTable-th-top-right TransactionsTable-category-column" style={{ width: CATEGORY_COLUMN_WIDTH, minWidth: CATEGORY_COLUMN_WIDTH, position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
                    קטגוריה
                    <ExpandCollapseButtons />
                  </div>
                </th>
                {Array.from({ length: 12 }).map((_, i) => (
                  <th className="TransactionsTable-th" key={i}>{i + 1}</th>
                ))}
                <th className="TransactionsTable-th TransactionsTable-th-top-left">סך הכל</th>
              </>
            ) : groupByCategory ? (
              <>
                <th className="TransactionsTable-th TransactionsTable-th-top-right TransactionsTable-category-column" style={{ width: CATEGORY_COLUMN_WIDTH, minWidth: CATEGORY_COLUMN_WIDTH, position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
                    קטגוריה
                    <ExpandCollapseButtons />
                  </div>
                </th>
                <th className="TransactionsTable-th">תאריך</th>
                {showChargeDate && <th className="TransactionsTable-th">תאריך חיוב</th>}
                <th className="TransactionsTable-th">תיאור</th>
                {/* עמודת ספרות כרטיס הוסרה; badge מוצג ליד תג אשראי */}
                <th className="TransactionsTable-th TransactionsTable-th-top-left">סכום</th>
              </>
            ) : (
              <>
                <th className="TransactionsTable-th TransactionsTable-th-top-right" onClick={() => handleSort('date')}>
                  תאריך {sortBy === 'date' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
                {showChargeDate && <th className="TransactionsTable-th">תאריך חיוב</th>}
                <th className="TransactionsTable-th" onClick={() => handleSort('description')}>
                  תיאור {sortBy === 'description' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th className="TransactionsTable-th" onClick={() => handleSort('category')} style={{ width: CATEGORY_COLUMN_WIDTH, minWidth: CATEGORY_COLUMN_WIDTH }}>
                  קטגוריה {sortBy === 'category' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
                {/* עמודת ספרות כרטיס הוסרה; badge מוצג ליד תג אשראי */}
                <th className="TransactionsTable-th TransactionsTable-th-top-left" onClick={() => handleSort('amount')}>
                  סכום {sortBy === 'amount' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {/* דינמי: שורות לפי מצב */}
          {isYearlyView ? (
            sortedCategories.map(cat => {
              // חישוב סכומים לפי בית עסק לכל חודש
              const businessesByMonth: Record<number, Record<string, number>> = {};
              for (let m = 0; m < 12; m++) businessesByMonth[m] = {};
              (grouped[cat] || []).forEach(tx => {
                const parts = tx.date?.split('/') || [];
                let monthIdx = 0;
                if (parts.length >= 2) {
                  monthIdx = Math.max(0, Math.min(11, parseInt(parts[1], 10) - 1));
                }
                const desc = tx.description || '---';
                if (!businessesByMonth[monthIdx][desc]) businessesByMonth[monthIdx][desc] = 0;
                businessesByMonth[monthIdx][desc] += signedAmount(tx);
              });
              const expanded = !!openGroups[cat];
              const categoryBgColor = getCategoryDef(cat)?.color || categoryColors[cat];
              const categoryColor = getReadableTextColor(categoryBgColor);
              return (
                <React.Fragment key={cat}>
                  <tr className="TransactionsTable-group-row" style={{ background: categoryBgColor + '22', fontWeight: 700 }}>
                    <td
                      className="TransactionsTable-group-toggle TransactionsTable-category-column"
                      onClick={() => handleToggleGroup(cat)}
                      title={expanded ? 'סגור קטגוריה' : 'הצג פירוט בתי עסק'}
                    >
                      <span className={"TransactionsTable-group-toggle-arrow" + (expanded ? ' open' : '')}>
                        {expanded ? '▼' : '►'}
                      </span>
                      <span className="TransactionsTable-group-label" style={{ background: categoryBgColor, color: categoryColor }}>
                        {getCategoryDef(cat)?.icon && <span className="TransactionsTable-category-icon">{getCategoryDef(cat)?.icon}</span>}
                        {cat}
                      </span>
                    </td>
                    {monthlyTotalsByCategory[cat].map((amt, i) => (
                      <td
                        className="TransactionsTable-td TransactionsTable-td-amount"
                        key={i}
                        style={{ cursor: 'pointer', position: 'relative' }}
                        onClick={e => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, monthIdx: i, category: cat, year: getYearFromData() });
                        }}
                        onContextMenu={e => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, monthIdx: i, category: cat, year: getYearFromData() });
                        }}
                      >
                        {amt ? amt.toLocaleString() : ''}
                      </td>
                    ))}
                    <td className="TransactionsTable-group-total">{categoryTotals[cat].toLocaleString()}</td>
                  </tr>
                  {expanded && (
                    Object.values(businessesByMonth).some(monthObj => Object.keys(monthObj).length > 0) ? (
                      Object.keys(
                        Object.values(businessesByMonth).reduce((acc, monthObj) => ({ ...acc, ...monthObj }), {})
                      ).map(business => (
                        <tr key={business} className="TransactionsTable-business-row">
                          <td className="TransactionsTable-business-label TransactionsTable-category-column" style={{ paddingLeft: 32 }}>{business}</td>
                          {Array.from({ length: 12 }).map((_, i) => (
                            <td
                              className="TransactionsTable-td TransactionsTable-td-amount"
                              key={i}
                              style={{ cursor: 'pointer', position: 'relative' }}
                              onClick={e => {
                                e.preventDefault();
                                setContextMenu({ x: e.clientX, y: e.clientY, monthIdx: i, category: cat, year: getYearFromData() });
                              }}
                              onContextMenu={e => {
                                e.preventDefault();
                                setContextMenu({ x: e.clientX, y: e.clientY, monthIdx: i, category: cat, year: getYearFromData() });
                              }}
                            >
                              {businessesByMonth[i][business] ? businessesByMonth[i][business].toLocaleString() : ''}
                            </td>
                          ))}
                          <td className="TransactionsTable-group-total">
                            {Object.values(businessesByMonth).reduce((sum, monthObj) => sum + (monthObj[business] || 0), 0).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    ) : null
                  )}
                </React.Fragment>
              );
            })
          ) : groupByCategory ? (
            sortedCategories.map(cat => {
              const categoryBgColor = getCategoryDef(cat)?.color || categoryColors[cat];
              const categoryColor = getReadableTextColor(categoryBgColor);
              return (
                <React.Fragment key={cat}>
                  <tr className="TransactionsTable-group-row" style={{ background: categoryBgColor + '22', fontWeight: 700 }}>
                    <td
                      className="TransactionsTable-group-toggle TransactionsTable-category-column"
                      onClick={() => handleToggleGroup(cat)}
                      title={openGroups[cat] ? 'סגור קטגוריה' : 'פתח קטגוריה'}
                    >
                      <span className={"TransactionsTable-group-toggle-arrow" + (openGroups[cat] ? ' open' : '')}>
                        {openGroups[cat] ? '▼' : '►'}
                      </span>
                      <span className="TransactionsTable-group-label" style={{ background: categoryBgColor, color: categoryColor }}>
                        {getCategoryDef(cat)?.icon && <span className="TransactionsTable-category-icon">{getCategoryDef(cat)?.icon}</span>}
                        {cat}
                      </span>
                    </td>
                    <td></td>
                    {showChargeDate && <td></td>}
                    {/* עמודה ריקה לספרות כרטיס הוסרה */}
                    <td></td>
                    <td className="TransactionsTable-group-total">{categoryTotals[cat].toLocaleString()}</td>
                  </tr>
                  {openGroups[cat] && grouped[cat].sort((a, b) => parseDate(b.date) - parseDate(a.date)).map((d, idx) => (
                    <tr key={d.id} className={idx % 2 === 0 ? 'TransactionsTable-row-alt' : 'TransactionsTable-row'}>
                      <td className="TransactionsTable-td TransactionsTable-category-column">
                        {onEditCategory && (
                          <button
                            className="TransactionsTable-category-btn"
                            onClick={() => onEditCategory(d)}
                          >
                            שינוי קטגוריה
                          </button>
                        )}
                      </td>
                      <td className="TransactionsTable-td TransactionsTable-td-date">{formatDate(d.date)}
                        {/* Source badge + optional card last4 badge */}
                        <span
                          className={'source-badge' + (d.source === 'bank' ? ' source-bank' : ' source-credit')}
                          style={{ marginRight: 6, fontSize: 12, padding: '2px 6px', borderRadius: 6, background: d.source === 'bank' ? '#e0f2fe' : '#fce7f3', color: d.source === 'bank' ? '#0369a1' : '#9d174d', display: 'inline-block' }}
                          title={d.source === 'bank' ? undefined : (d.cardLast4 ? `כרטיס ••••${d.cardLast4}` : undefined)}
                        >
                          {d.source === 'bank' ? 'בנק' : 'אשראי'}
                        </span>
                        {d.source !== 'bank' && d.cardLast4 && (
                          <span
                            className={'TransactionsTable-card-badge' + (showCardLast4 ? ' always-visible' : '')}
                            style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, background: '#ececec', color: '#333', fontFamily: 'monospace', marginRight: 4, display: 'inline-block' }}
                            title={`כרטיס ••••${d.cardLast4}`}
                          >
                            ••••{d.cardLast4}
                          </span>
                        )}
                        {d.transactionType === 'credit_charge' && (
                          <span style={{
                            marginRight: 4, fontSize: 12, padding: '2px 6px', borderRadius: 6,
                            background: '#d1fae5', color: '#065f46'
                          }} title="חיוב אשראי – מפורק בעסקאות הכרטיס">
                            חיוב אשראי {d.relatedTransactionIds?.length ? `(${d.relatedTransactionIds.length})` : ''}
                          </span>
                        )}
                        {d.transactionType === 'credit_charge_combined' && (
                          <span style={{
                            marginRight: 4, fontSize: 12, padding: '2px 6px', borderRadius: 6,
                            background: '#ede9fe', color: '#5b21b6'
                          }} title={`חיוב בנק מאוחד – משלב ${d.matchedComboSize || (d.matchedCycleKeys?.length || 0)} מחזורים`}>
                            חיוב מאוחד {(() => {
                              const size = d.matchedComboSize || (d.matchedCycleKeys?.length || 0);
                              return size ? `(${size})` : '';
                            })()}
                          </span>
                        )}
                        {d.source === 'bank' && d.transactionType === 'credit_charge' && !d.relatedTransactionIds?.length && (
                          <span style={{
                            marginRight: 4, fontSize: 12, padding: '2px 6px', borderRadius: 6,
                            background: '#fee2e2', color: '#991b1b'
                          }} title="חיוב אשראי ללא פירוט – טען דף פירוט">
                            חסר פירוט אשראי
                          </span>
                        )}
                      </td>
                      {showChargeDate && <td className="TransactionsTable-td TransactionsTable-td-date">{d.chargeDate ? formatDate(d.chargeDate) : ''}</td>}
                      <td className="TransactionsTable-td">{d.description}</td>
                      {/* ספרות כרטיס מוצגות כעת כ-badge בתוך תא התאריך */}
                      <td className="TransactionsTable-td TransactionsTable-td-amount" style={{ color: d.direction === 'income' ? '#16a34a' : '#dc2626' }}>
                        {d.direction === 'income' ? '+' : '-'}{Math.abs(d.amount).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              )
            })
          ) : (
            sortedDetails.map((d, idx) => {
              return (
                <tr key={d.id} className={idx % 2 === 0 ? 'TransactionsTable-row-alt' : 'TransactionsTable-row'}>
                  <td className="TransactionsTable-td TransactionsTable-td-date">{formatDate(d.date)}
                    <span
                      className={'source-badge' + (d.source === 'bank' ? ' source-bank' : ' source-credit')}
                      style={{ marginRight: 6, fontSize: 12, padding: '2px 6px', borderRadius: 6, background: d.source === 'bank' ? '#e0f2fe' : '#fce7f3', color: d.source === 'bank' ? '#0369a1' : '#9d174d', display: 'inline-block' }}
                      title={d.source === 'bank' ? undefined : (d.cardLast4 ? `כרטיס ••••${d.cardLast4}` : undefined)}
                    >
                      {d.source === 'bank' ? 'בנק' : 'אשראי'}
                    </span>
                    {d.source !== 'bank' && d.cardLast4 && (
                      <span
                        className={'TransactionsTable-card-badge' + (showCardLast4 ? ' always-visible' : '')}
                        style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, background: '#ececec', color: '#333', fontFamily: 'monospace', marginRight: 4, display: 'inline-block' }}
                        title={`כרטיס ••••${d.cardLast4}`}
                      >
                        ••••{d.cardLast4}
                      </span>
                    )}
                    {d.transactionType === 'credit_charge' && (
                      <span style={{
                        marginRight: 4, fontSize: 12, padding: '2px 6px', borderRadius: 6,
                        background: '#d1fae5', color: '#065f46'
                      }} title="חיוב אשראי – מפורק בעסקאות הכרטיס">
                        חיוב אשראי {d.relatedTransactionIds?.length ? `(${d.relatedTransactionIds.length})` : ''}
                      </span>
                    )}
                    {d.transactionType === 'credit_charge_combined' && (
                      <span style={{
                        marginRight: 4, fontSize: 12, padding: '2px 6px', borderRadius: 6,
                        background: '#ede9fe', color: '#5b21b6'
                      }} title={`חיוב בנק מאוחד – משלב ${d.matchedComboSize || (d.matchedCycleKeys?.length || 0)} מחזורים`}>
                        חיוב מאוחד {(() => {
                          const size = d.matchedComboSize || (d.matchedCycleKeys?.length || 0);
                          return size ? `(${size})` : '';
                        })()}
                      </span>
                    )}
                    {d.source === 'bank' && d.transactionType === 'credit_charge' && !d.relatedTransactionIds?.length && (
                      <span style={{
                        marginRight: 4, fontSize: 12, padding: '2px 6px', borderRadius: 6,
                        background: '#fee2e2', color: '#991b1b'
                      }} title="חיוב אשראי ללא פירוט – טען דף פירוט">
                        חסר פירוט אשראי
                      </span>
                    )}
                  </td>
                  {showChargeDate && <td className="TransactionsTable-td TransactionsTable-td-date">{d.chargeDate ? formatDate(d.chargeDate) : ''}</td>}
                  <td className="TransactionsTable-td">{d.description}</td>
                  <td className="TransactionsTable-td">
                    {(() => {
                      const dispCat = displayCategoryFor(d);
                      const categoryBgColor = (d.category ? (getCategoryDef(d.category)?.color) : undefined) || categoryColors[dispCat] || '#ddd';
                      const categoryColor = getReadableTextColor(categoryBgColor);
                      return (
                        <span
                          className={
                            'TransactionsTable-category-label' + (onEditCategory ? ' TransactionsTable-category-label-editable' : '')
                          }
                          style={{
                            background: categoryBgColor,
                            color: categoryColor,
                            cursor: onEditCategory ? 'pointer' : undefined,
                            textDecoration: onEditCategory ? 'underline dotted' : undefined
                          }}
                          title={onEditCategory ? 'לחץ כדי לשנות קטגוריה' : undefined}
                          onClick={onEditCategory ? () => onEditCategory(d) : undefined}
                        >
                          {getCategoryDef(d.category || '')?.icon && <span className="TransactionsTable-category-icon">{getCategoryDef(d.category || '')?.icon}</span>}
                          {dispCat}
                        </span>
                      );
                    })()}
                  </td>
                  {/* ספרות כרטיס מוצגות כעת כ-badge בתוך תא התאריך */}
                  <td className="TransactionsTable-td TransactionsTable-td-amount" style={{ color: d.direction === 'income' ? '#16a34a' : '#dc2626' }}>
                    {d.direction === 'income' ? '+' : '-'}{Math.abs(d.amount).toLocaleString()}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
        {/* שורת סיכום חודשי לכל הקטגוריות - מוצגת רק בתצוגה שנתית */}
        {isYearlyView && (
          <tfoot>
            <tr className="TransactionsTable-summary-row" style={{ background: '#fafafa', fontWeight: 700 }}>
              <td className="TransactionsTable-category-column">סיכום</td>
              {monthlyTotalsAll.map((amt, i) => (
                <td key={i} className="TransactionsTable-td TransactionsTable-td-amount">{amt ? amt.toLocaleString() : ''}</td>
              ))}
              <td className="TransactionsTable-group-total">{grandTotalAll.toLocaleString()}</td>
            </tr>
          </tfoot>
        )}
      </table>
      {/* Context menu for month cell */}
      {contextMenu && (
        <div
          className="TransactionsTable-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="TransactionsTable-context-menu-btn"
            onClick={() => {
              const cm = contextMenu; // capture before closing
              setContextMenu(null);
              if (props.onMonthSelect) {
                const year = cm.year || new Date().getFullYear().toString();
                const monthKey = `${String(cm.monthIdx + 1).padStart(2, '0')}/${year}`;
                props.onMonthSelect(monthKey);
                setView('monthly');
              }
            }}
          >
            פתח חודש
          </button>
        </div>
      )}
    </div>
  );
};

export default TransactionsTable;
