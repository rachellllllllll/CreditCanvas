import React from 'react';

interface DateNavigatorProps {
  view: 'monthly' | 'yearly';
  sortedMonths: string[]; // format MM/YYYY
  selectedMonth: string; // format MM/YYYY
  setSelectedMonth: (m: string) => void;
  currentMonthIdx: number; // index of selectedMonth inside sortedMonths
  selectedYear: string; // YYYY
  setSelectedYear: (y: string) => void;
  availableYears: string[]; // list of YYYY values
}

// Utility: pad month to 2 digits (already padded but defensive)
const pad = (m: string | number) => String(m).padStart(2, '0');

const DateNavigator: React.FC<DateNavigatorProps> = ({
  view,
  sortedMonths,
  selectedMonth,
  setSelectedMonth,
  currentMonthIdx,
  selectedYear,
  setSelectedYear,
  availableYears,
}) => {
  const [open, setOpen] = React.useState(false);
  // Independent year state used inside the month-picker popover
  const [popoverYear, setPopoverYear] = React.useState(selectedYear);
  const popRef = React.useRef<HTMLDivElement | null>(null);
  const btnRef = React.useRef<HTMLButtonElement | null>(null);

  // Derive year index for yearly view
  const yearIdx = availableYears.indexOf(selectedYear);

  // Year index inside the popover (for month-picker year nav)
  const popoverYearIdx = availableYears.indexOf(popoverYear);

  // Months filtered to popoverYear (for popover grid)
  const monthsForYear = React.useMemo(() => {
    return sortedMonths.filter(m => m.split('/')[1] === popoverYear);
  }, [sortedMonths, popoverYear]);

  const handlePrev = () => {
    if (view === 'monthly') {
      if (currentMonthIdx > 0) setSelectedMonth(sortedMonths[currentMonthIdx - 1]);
    } else {
      if (yearIdx > 0) setSelectedYear(availableYears[yearIdx - 1]);
    }
  };
  const handleNext = () => {
    if (view === 'monthly') {
      if (currentMonthIdx < sortedMonths.length - 1) setSelectedMonth(sortedMonths[currentMonthIdx + 1]);
    } else {
      if (yearIdx < availableYears.length - 1) setSelectedYear(availableYears[yearIdx + 1]);
    }
  };

  const toggleOpen = () => {
    setOpen(o => {
      const next = !o;
      if (next && view === 'monthly') {
        // סנכרון שנת הפופאובר עם החודש הנבחר בעת פתיחת חלון בחירת החודש
        const parts = selectedMonth.split('/');
        if (parts.length === 2) {
          const ym = parts[1];
          if (ym) setPopoverYear(ym);
        }
      }
      return next;
    });
  };
  const close = () => setOpen(false);

  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!open) return;
      if (popRef.current && !popRef.current.contains(e.target as Node) && btnRef.current && e.target !== btnRef.current) {
        close();
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) close();
      if (!open) {
        if (e.key === 'ArrowLeft') { handlePrev(); }
        if (e.key === 'ArrowRight') { handleNext(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, handlePrev, handleNext]);

  // Content label
  const label = view === 'monthly' ? selectedMonth : selectedYear;
  const disablePrev = view === 'monthly' ? currentMonthIdx <= 0 : yearIdx <= 0;
  const disableNext = view === 'monthly' ? currentMonthIdx >= sortedMonths.length - 1 : yearIdx >= availableYears.length - 1;

  return (
    <div className="date-nav-inline segmented-date-toggle" role="group" aria-label={view === 'monthly' ? 'ניווט חודש' : 'ניווט שנה'}>
      <button type="button" className="dn-btn" onClick={handlePrev} disabled={disablePrev} aria-label={view === 'monthly' ? 'חודש קודם' : 'שנה קודמת'}>▶</button>
      <button
        ref={btnRef}
        type="button"
        className="dn-current"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={view === 'monthly' ? 'monthGrid' : 'yearList'}
        onClick={toggleOpen}
      >{label}</button>
      <button type="button" className="dn-btn" onClick={handleNext} disabled={disableNext} aria-label={view === 'monthly' ? 'חודש הבא' : 'שנה הבאה'}>◀</button>
      {open && view === 'monthly' && (
        <div className="dn-popover" ref={popRef} role="dialog" aria-label="בחר חודש">
          <div className="dn-pop-header">
            <div className="dn-year-nav">
              <button
                type="button"
                className="dn-year-arrow"
                disabled={popoverYearIdx <= 0}
                aria-label="שנה קודמת"
                onClick={() => { if (popoverYearIdx > 0) setPopoverYear(availableYears[popoverYearIdx - 1]); }}
              >▶</button>
              <span className="dn-pop-year">{popoverYear}</span>
              <button
                type="button"
                className="dn-year-arrow"
                disabled={popoverYearIdx >= availableYears.length - 1}
                aria-label="שנה הבאה"
                onClick={() => { if (popoverYearIdx < availableYears.length - 1) setPopoverYear(availableYears[popoverYearIdx + 1]); }}
              >◀</button>
            </div>
            <button type="button" className="dn-close" aria-label="סגור" onClick={close}>×</button>
          </div>
          <div className="dn-months" id="monthGrid">
            {Array.from({ length: 12 }, (_, i) => {
              const mm = pad(i + 1);
              const full = `${mm}/${popoverYear}`;
              const hasData = monthsForYear.includes(full);
              const active = full === selectedMonth;
              return (
                <button
                  key={full}
                  type="button"
                  className={
                    (active ? 'active ' : '') + (!hasData ? 'disabled-month' : 'available-month')
                  }
                  data-month={full}
                  disabled={!hasData}
                  aria-disabled={!hasData}
                  onClick={() => {
                    if (!hasData) return;
                    setSelectedMonth(full);
                    close();
                  }}
                >{mm}</button>
              );
            })}
          </div>
          <p className="dn-hint">בחר חודש או השתמש בחיצים ← →</p>
        </div>
      )}
      {open && view === 'yearly' && (
        <div className="dn-popover" ref={popRef} role="dialog" aria-label="בחר שנה">
          <div className="dn-pop-header">
            <span style={{ fontWeight: 600 }}>שנים</span>
            <button type="button" className="dn-close" aria-label="סגור" onClick={close}>×</button>
          </div>
          <div className="dn-years" id="yearList">
            {availableYears.map(y => (
              <button
                key={y}
                type="button"
                className={y === selectedYear ? 'active' : ''}
                onClick={() => { setSelectedYear(y); close(); }}
              >{y}</button>
            ))}
          </div>
          <p className="dn-hint">בחר שנה או השתמש בחיצים ← →</p>
        </div>
      )}
    </div>
  );
};

export default DateNavigator;