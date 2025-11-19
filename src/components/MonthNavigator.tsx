import React from 'react';

interface MonthNavigatorProps {
  months: string[];
  selectedMonth: string;
  onChange: (month: string) => void;
  prevTotal?: number;
  nextTotal?: number;
  disablePrev: boolean;
  disableNext: boolean;
}

const MonthNavigator: React.FC<MonthNavigatorProps> = ({
  months,
  selectedMonth,
  onChange,
  prevTotal,
  nextTotal,
  disablePrev,
  disableNext,
}) => {
  const currentIdx = months.indexOf(selectedMonth);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <button disabled={disablePrev} onClick={() => onChange(months[currentIdx - 1])}>
        ← חודש קודם
      </button>
      {currentIdx > 0 && (
        <span style={{ color: '#888', fontSize: 13 }}>
          (סה"כ: {prevTotal?.toLocaleString() || 0} ₪)
        </span>
      )}
      <span style={{ fontWeight: 'bold' }}>בחר חודש: </span>
      <select
        value={selectedMonth}
        onChange={e => onChange(e.target.value)}
        style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #bbb', fontSize: 16, background: '#f8f8fa', minWidth: 110 }}
      >
        {months.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <button disabled={disableNext} onClick={() => onChange(months[currentIdx + 1])}>
        חודש הבא →
      </button>
      {currentIdx !== -1 && currentIdx < months.length - 1 && (
        <span style={{ color: '#888', fontSize: 13 }}>
          (סה"כ: {nextTotal?.toLocaleString() || 0} ₪)
        </span>
      )}
    </div>
  );
};

export default MonthNavigator;
