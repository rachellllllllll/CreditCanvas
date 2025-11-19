import React, { useState, useMemo, useEffect, useRef } from 'react';
import TransactionsTable from './TransactionsTable';
import DateNavigator from './DateNavigator';
import type { CreditDetail, AnalysisResult } from '../types';
import type { CategoryDef } from './CategoryManager';
import './MainView.css';
import { signedAmount } from '../utils/money';
import SourceFilter from './filters/SourceFilter';

interface MainViewProps {
  analysis: AnalysisResult;
  selectedMonth: string; // פורמט 'MM/YYYY'
  setSelectedMonth: (month: string) => void;
  months: string[];
  sortedMonths: string[];
  currentMonthIdx: number;
  diff: number | null;
  percent: number | null;
  filteredDetails: CreditDetail[];
  filteredTotal: number;
  view: 'monthly' | 'yearly';
  setView: (view: 'monthly' | 'yearly') => void;
  categories: Record<string, number>;
  monthTotals: Record<string, number>;
  yearlySummary: Record<string, number>;
  handleOpenEditCategory: (tx: CreditDetail) => void;
  categoriesList: CategoryDef[];
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  // חדשים – בקרי סינון מצב תצוגה והסתרת תשלומי כרטיס
  displayMode: 'all' | 'expense' | 'income';
  setDisplayMode: (mode: 'all' | 'expense' | 'income') => void;
  // חדשים: מצב תאריך (עסקה / חיוב)
  dateMode: 'transaction' | 'charge';
  setDateMode: (m: 'transaction' | 'charge') => void;
  // חדשים: תיקיה נבחרת + פעולה להחלפה
  selectedFolder: string | null;
  onPickDirectory: () => void;
  dirHandle?: any;
}

const MainView: React.FC<MainViewProps> = ({
  selectedMonth, setSelectedMonth, sortedMonths, currentMonthIdx,
  diff, percent, filteredDetails,
  view, setView, categories, yearlySummary,
  handleOpenEditCategory, categoriesList, selectedYear, setSelectedYear,
  displayMode, setDisplayMode,
  dateMode, setDateMode, analysis, selectedFolder, onPickDirectory, dirHandle
}) => {
  // State לניהול סינון
  const [selectedCategory] = useState<string | null>(null);
  const [searchTerm] = useState('');
  const [amountFilter] = useState('all');
  // רפרנס לכותרת העליונה לצורך מעבר למצב מכווץ בגלילה
  const headerRef = useRef<HTMLDivElement | null>(null);

  // רשימת כרטיסים זמינים (4 ספרות אחרונות) מחושבת מהנתונים הגולמיים
  const availableCards = useMemo(() => {
    const set = new Set<string>();
    for (const d of analysis.details) {
      if (d.source === 'credit' && d.cardLast4) set.add(d.cardLast4);
    }
    return Array.from(set).sort();
  }, [analysis.details]);
  // בחירת הכרטיסים המוצגים (ברירת מחדל: כולם)
  const [selectedCards, setSelectedCards] = useState<string[]>(availableCards);
  // האם להציג עסקאות בנק
  const [includeBank, setIncludeBank] = useState(true);

  // עדכון בחירת הכרטיסים אם נוספו/הוסרו (נתונים חדשים) – שומר על בחירות קיימות ככל האפשר
  React.useEffect(() => {
    setSelectedCards(prev => {
      // אם prev ריק (למשל לאחר איפוס) לא נוסיף אוטומטית כרטיסים חדשים
      if (prev.length === 0) return prev;
      // ודא שכל כרטיס חדש שנוסף נכנס, אבל אל תמחק בחירות קיימות שלא קיימות עוד
      const next = new Set(prev);
      for (const c of availableCards) next.add(c);
      return Array.from(next);
    });
  }, [availableCards]);

  const toggleCard = (last4: string) => {
    setSelectedCards(prev => prev.includes(last4)
      ? prev.filter(c => c !== last4)
      : [...prev, last4]);
  };

  const allCardsSelected = selectedCards.length === availableCards.length;
  const clearSelection = () => setSelectedCards([]);
  const selectAllCards = () => setSelectedCards(availableCards);
  // גרפים בוטלו/מוסרים כרגע מהתצוגה
  // const [showBarChart, setShowBarChart] = useState(false);
  // const [showPieChart, setShowPieChart] = useState(false);

  // סיכומי הכנסות/הוצאות/נטו לפי filteredDetails שהתקבלו מההורה
  const summary = useMemo(() => {
    const income = filteredDetails
      .filter(d => d.direction === 'income')
      .reduce((s, d) => s + Math.abs(d.amount), 0);
    const expense = filteredDetails
      .filter(d => d.direction === 'expense')
      .reduce((s, d) => s + Math.abs(d.amount), 0);
    const net = filteredDetails.reduce((s, d) => s + signedAmount(d), 0);
    return { income, expense, net };
  }, [filteredDetails]);

  // סינון העסקאות לפי הקטגוריה הנבחרת וחיפוש
  const filteredTransactions = useMemo(() => {
    let filtered = filteredDetails;

    // סינון לפי מקורות (כרטיסים / בנק)
    filtered = filtered.filter(tx => {
      if (tx.source === 'credit') {
        // אם אין cardLast4 נתייחס כאילו תמיד מוצג
        if (!tx.cardLast4) return true;
        // אם לא נבחר אף כרטיס – לא להציג כרטיסים בכלל
        if (selectedCards.length === 0) return false;
        return selectedCards.includes(tx.cardLast4);
      }
      if (tx.source === 'bank') {
        return includeBank; // האם להציג בנק
      }
      return true;
    });

    // סינון לפי קטגוריה
    if (selectedCategory) {
      filtered = filtered.filter(tx => tx.category === selectedCategory);
    }

    // סינון לפי חיפוש
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(tx => 
        tx.description.toLowerCase().includes(term) ||
        tx.category?.toLowerCase().includes(term)
      );
    }

    // סינון לפי סכום
    if (amountFilter !== 'all') {
      filtered = filtered.filter(tx => {
        const amount = Math.abs(tx.amount);
        switch (amountFilter) {
          case 'low': return amount <= 100;
          case 'medium': return amount > 100 && amount <= 500;
          case 'high': return amount > 500;
          default: return true;
        }
      });
    }

    return filtered;
  }, [filteredDetails, selectedCategory, searchTerm, amountFilter, selectedCards, includeBank]);

  // חישוב הקטגוריה הגדולה ביותר
  const topCategoryData = useMemo(() => {
    const sortedCategories = Object.entries(categories)
      .sort(([,a], [,b]) => b - a);
    
    if (sortedCategories.length === 0) return null;
    
    const [topCategory, topAmount] = sortedCategories[0];
    const total = Object.values(categories).reduce((sum, val) => sum + val, 0);
    const percentage = total > 0 ? ((topAmount / total) * 100).toFixed(1) : '0';
    
    return { name: topCategory, amount: topAmount, percentage };
  }, [categories]);

  // הפקת צבע ואייקון לקטגוריה מובילה (אם קיימת בהגדרות)
  const topCategoryVisual = useMemo(() => {
    if (!topCategoryData) return null;
    const def = categoriesList.find(c => c.name === topCategoryData.name);
    const baseColor = def?.color || '#6366f1';
    const icon = def?.icon || '🏆';
    // פונקציה לערבוב עם לבן כדי להחליש את הרוויה (ratio = כמה לבן להכניס)
    const blendWithWhite = (hex: string, ratio: number) => {
      const h = hex.replace('#','');
      const num = parseInt(h, 16);
      const r = (num >> 16) & 255;
      const g = (num >> 8) & 255;
      const b = num & 255;
      const mix = (c: number) => Math.round(c * (1 - ratio) + 255 * ratio);
      return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
    };
    // ערכים עדינים יותר: הרבה יותר לבן => פחות בולט מול שאר הכרטיסים
    const soft1 = blendWithWhite(baseColor, 0.65);
    const soft2 = blendWithWhite(baseColor, 0.82);
    const badgeBg = blendWithWhite(baseColor, 0.75);
    const border = blendWithWhite(baseColor, 0.55);
    return { color: baseColor, icon, soft1, soft2, badgeBg, border };
  }, [topCategoryData, categoriesList]);

  // שינוי אחוזי הוצאות לעומת חודש קודם (לסימן על הכרטיס כמו בדוגמה)
  const expensePrevChange = useMemo(() => {
    if (view !== 'monthly' || currentMonthIdx <= 0) return null;
    const prevMonth = sortedMonths[currentMonthIdx - 1];
    const currMonth = selectedMonth;
    const monthOf = (d: CreditDetail) => {
      const raw = (dateMode === 'charge' && d.chargeDate) ? d.chargeDate : d.date;
      // פורמט צפוי: DD/MM/YYYY או D/M/YY
      const parts = raw.split(/[\/\-]/);
      if (parts.length < 3) return '';
      const mm = parts[1].padStart(2, '0');
      const yyyy = parts[2].length === 2 ? '20' + parts[2] : parts[2];
      return `${mm}/${yyyy}`;
    };
    let currExpense = 0;
    let prevExpense = 0;
    for (const d of analysis.details) {
      if (d.direction !== 'expense') continue;
      const m = monthOf(d);
      const amt = Math.abs(d.amount);
      if (m == currMonth) currExpense += amt;
      else if (m === prevMonth) prevExpense += amt;
    }
    if (prevExpense <= 0) return null; // אין בסיס להשוואה
    const diffVal = currExpense - prevExpense;
    const percentVal = (diffVal / prevExpense) * 100;
    return { diff: diffVal, percent: percentVal };
  }, [analysis.details, view, currentMonthIdx, selectedMonth, sortedMonths, dateMode]);


  // רשימת שנים זמינות (על בסיס כל העסקאות – דרך yearlySummary או monthTotals אינו כולל אפס חודשים, נחלץ מתוך המפתחות של yearlySummary)
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    Object.keys(yearlySummary).forEach(k => {
      const [y] = k.split('-');
      years.add(y);
    });
    return Array.from(years).sort();
  }, [yearlySummary]);

  // אתחל selectedYear אם חסר או יצא מהטווח
  React.useEffect(() => {
    if (availableYears.length === 0) return;
    if (!selectedYear || !availableYears.includes(selectedYear)) {
      // בחר כברירת מחדל את השנה האחרונה (הכי חדשה)
      setSelectedYear(availableYears[availableYears.length - 1]);
    }
  }, [availableYears, selectedYear, setSelectedYear]);

  // אפקט גלילה עם היסטרזיס + rAF: מונע הבהוב ע"י שני ספים שונים והפחתת Reflow
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    let condensed = false;
    const CONDENSE_ABOVE = 100; // נכנסים למצב מכווץ רק מעל סף גבוה יותר
    const EXPAND_BELOW = 60;    // חוזרים למצב רגיל רק מתחת לסף נמוך יותר
    let ticking = false;
    const apply = () => {
      const y = window.scrollY;
      if (!condensed && y > CONDENSE_ABOVE) {
        el.classList.add('condensed');
        condensed = true;
      } else if (condensed && y < EXPAND_BELOW) {
        el.classList.remove('condensed');
        condensed = false;
      }
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(apply);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    apply(); // בדיקה ראשונית במצב הטעינה
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // אפקט מדידת גובה דינמי של הכותרת והזרקה כמשתנה CSS
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const applyHeight = () => {
      const h = el.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--header-height', h + 'px');
    };
    applyHeight();
    const resizeObserver = new ResizeObserver(applyHeight);
    resizeObserver.observe(el);
    window.addEventListener('resize', applyHeight);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', applyHeight);
    };
  }, []);

  return (
    <div className="main-view">
      {/* 1. כותרת ראשית + בחירת תצוגה + פעולות */}
      <div className="main-view-header">
  <div ref={headerRef} className="header-top" role="toolbar" aria-label="סרגל ראשי של סינון וניווט">
          <div className="folder-cluster" aria-label="תיקיית אקסל נבחרת">
            {selectedFolder && (
              <span className="folder-current" title={selectedFolder}>תיקיה: <b>{selectedFolder}</b></span>
            )}
            <button onClick={onPickDirectory} className="folder-btn swap" title="החלפת תיקיה">
              📁 החלפת תיקיה
            </button>
          </div>
          {/* <h1>ניתוח הוצאות</h1> */}
          <div className="view-toggle">
            <button 
              onClick={() => setView('monthly')}
              className={view === 'monthly' ? 'active' : ''}
            >
              תצוגה חודשית
            </button>
            <button 
              onClick={() => setView('yearly')}
              className={view === 'yearly' ? 'active' : ''}
            >
              תצוגה שנתית
            </button>
          </div>

          {/* בורר מקורות (כרטיסי אשראי / בנק) */}
          <SourceFilter
            availableCards={availableCards}
            selectedCards={selectedCards}
            onToggleCard={toggleCard}
            includeBank={includeBank}
            onToggleBank={setIncludeBank}
            allSelected={allCardsSelected}
            onSelectAll={selectAllCards}
            onClearSelection={clearSelection}
            dirHandle={dirHandle}
          />

          {/* ניווט חודש / שנה משולב */}
          <DateNavigator 
            view={view}
            sortedMonths={sortedMonths}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            currentMonthIdx={currentMonthIdx}
            selectedYear={selectedYear || ''}
            setSelectedYear={setSelectedYear}
            availableYears={availableYears}
          />

          {/* בורר מצב תאריך (מעוצב כסגמנט) */}
          <div className="date-mode-wrapper">
            <div className="date-mode-toggle" role="radiogroup" aria-label="בחירת מצב תאריך">
              <button
                type="button"
                className={`mode-transaction ${dateMode === 'transaction' ? 'active' : ''}`}
                aria-pressed={dateMode === 'transaction'}
                onClick={() => setDateMode('transaction')}
              >לפי תאריך עסקה</button>
              <button
                type="button"
                className={`mode-charge ${dateMode === 'charge' ? 'active' : ''}`}
                aria-pressed={dateMode === 'charge'}
                onClick={() => setDateMode('charge')}
              >לפי תאריך חיוב</button>
            </div>
          </div>

          {/* Segmented control: הכל | הוצאות | הכנסות */}
          <div>
            <div className="display-mode-toggle" style={{ display: 'flex', gap: 8 }}>
              <button className={`mode-all ${displayMode === 'all' ? 'active' : ''}`} onClick={() => setDisplayMode('all')}>הכל</button>
              <button className={`mode-expense ${displayMode === 'expense' ? 'active' : ''}`} onClick={() => setDisplayMode('expense')}>הוצאות</button>
              <button className={`mode-income ${displayMode === 'income' ? 'active' : ''}`} onClick={() => setDisplayMode('income')}>הכנסות</button>
            </div>
          </div>
        </div>

        {/* מדדים מאוחדים (Pattern A) */}
        <div className="metrics-cards" role="group" aria-label="מדדי מצב">
          <div className={`metric-card net ${summary.net < 0 ? 'neg' : 'pos'}`} aria-label={`נטו ${summary.net.toLocaleString()} ₪`}>
            <div className="mc-header">
              <span className="mc-label">סך הכל נטו</span>
              {view === 'monthly' && percent !== null && diff !== null && (
                <span className={`mc-badge ${percent >= 0 ? 'pos' : 'neg'}`} aria-label={`שינוי נטו מהחודש הקודם ${Math.abs(percent).toFixed(1)}%`}>
                  {Math.abs(percent).toFixed(1)}%{percent >= 0 ? '+' : '-'}
                </span>
              )}
            </div>
            <div className="mc-value" title={`נטו בחודש`}>₪{summary.net.toLocaleString()}</div>
            <div className="mc-sub">לעומת החודש הקודם</div>
            {view === 'monthly' && diff !== null && percent !== null && (
              <span className="visually-hidden" aria-live="polite">נטו השתנה ב {Math.abs(diff).toLocaleString()} ₪ ({Math.abs(percent).toFixed(1)}%)</span>
            )}
          </div>
          <div className="metric-card expense" aria-label={`סה"כ הוצאות ${summary.expense.toLocaleString()} ₪`}>
            <div className="mc-header">
              <span className="mc-label">הוצאות</span>
              {expensePrevChange && (
                <span className={`mc-badge ${expensePrevChange.percent >= 0 ? 'pos' : 'neg'}`} aria-label={`שינוי בהוצאות לעומת חודש קודם ${Math.abs(expensePrevChange.percent).toFixed(1)}%`}>
                  {Math.abs(expensePrevChange.percent).toFixed(1)}%{expensePrevChange.percent >= 0 ? '+' : '-'}
                </span>
              )}
            </div>
            <div className="mc-value" title={`הוצאות בחודש`}>₪{summary.expense.toLocaleString()}</div>
            <div className="mc-sub">סה"כ עסקאות מחויבות</div>
          </div>
          <div className="metric-card income" aria-label={`סה"כ הכנסות ${summary.income.toLocaleString()} ₪`}>
            <div className="mc-header">
              <span className="mc-label">הכנסות</span>
            </div>
            <div className="mc-value" title={`הכנסות בחודש`}>₪{summary.income.toLocaleString()}</div>
            <div className="mc-sub">כולל כל ההכנסות</div>
          </div>
          <div className="metric-card tx-count" aria-label={`מספר עסקאות ${filteredTransactions.length}`}> 
            <div className="mc-header">
              <span className="mc-label">מספר עסקאות</span>
            </div>
            <div className="mc-value" title={`סה"כ עסקאות בחודש`}>{filteredTransactions.length}</div>
            <div className="mc-sub">פעילות החודש</div>
          </div>
          {topCategoryData && topCategoryVisual && (
            <div
              className="metric-card top-cat dynamic"
              aria-label={`קטגוריה מובילה ${topCategoryData.name} אחוז ${topCategoryData.percentage}%`}
              style={{
                background: `linear-gradient(135deg, ${topCategoryVisual.soft1} 0%, ${topCategoryVisual.soft2} 38%, #ffffff 92%)`,
                borderColor: topCategoryVisual.border,
                filter: 'saturate(0.85) brightness(1.02)'
              }}
            >
              <div className="mc-header">
                <span className="mc-label">קטגוריה מובילה</span>
                <span
                  className="mc-badge dynamic"
                  aria-label={`אחוז מתוך ההוצאות ${topCategoryData.percentage}%`}
                  style={{
                    background: topCategoryVisual.badgeBg,
                    color: '#1e293b'
                  }}
                >{topCategoryData.percentage}%</span>
              </div>
              <div className="mc-value" title={topCategoryData.name}>
                <span className="mc-icon" aria-hidden="true" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))', marginInlineStart: 4 }}>
                  {topCategoryVisual.icon}
                </span>
                {topCategoryData.name}
              </div>
              <div className="mc-sub">מתוך כלל ההוצאות</div>
            </div>
          )}
        </div>

      </div>

      {/* התצוגה החדשה של ניווט חודש/שנה משולב מחליפה את הבלוק הישן */}

      {/* כרטיסי סיכום בוטלו – הוחלפו בשורת מדדים קומפקטית */}

      {/* 5. תוכן ראשי - גרפים ו/או טבלאות */}
      <div className="main-content">
        {view === 'monthly' ? (
          <>
            {/* גרף עמודות עם כפתור מזעור */}
            {/* <div className="chart-section-wrapper">
              <div className="chart-header">
                <h3>גרף עמודות חודשיות</h3>
                <button 
                  className="minimize-btn"
                  onClick={() => setShowBarChart(!showBarChart)}
                  title={showBarChart ? 'מזער גרף' : 'הרחב גרף'}
                >
                  {showBarChart ? '�' : '📈'}
                </button>
              </div>
              {showBarChart && (
                <div className="chart-section bar-chart">
                  <MonthBarChart 
                    monthTotals={monthTotals}
                    selectedMonth={selectedMonth}
                    months={months}
                  />
                </div>
              )}
            </div> */}

            {/* גרף עוגה עם כפתור מזעור */}
            {/* <div className="chart-section-wrapper">
              <div className="chart-header">
                <h3>גרף עוגה לפי קטגוריות</h3>
                <button 
                  className="minimize-btn"
                  onClick={() => setShowPieChart(!showPieChart)}
                  title={showPieChart ? 'מזער גרף' : 'הרחב גרף'}
                >
                  {showPieChart ? '🍰' : '📊'}
                </button>
              </div>
              {showPieChart && (
                <div className="chart-section pie-chart">
                  <CategoryPieChart 
                    categories={categories}
                  />
                </div>
              )}
            </div> */}

            {/* טבלת עסקאות */}
            <div className="table-section">
              <TransactionsTable 
                details={filteredTransactions}
                onEditCategory={handleOpenEditCategory}
                categoriesList={categoriesList}
                creditChargeCycles={analysis.creditChargeCycles || []}
                setView={setView}
              />
            </div>
          </>
        ) : (
          <div className="yearly-view">
            {/* גרף עמודות שנתי הוסר זמנית */}

            {/* טבלת עסקאות גם בתצוגה שנתית */}
            <div className="table-section">
              <TransactionsTable 
                details={filteredTransactions}
                onEditCategory={handleOpenEditCategory}
                categoriesList={categoriesList}
                isYearlyView={true}
                creditChargeCycles={analysis.creditChargeCycles || []}
                onMonthSelect={setSelectedMonth}
                setView={setView}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MainView;
