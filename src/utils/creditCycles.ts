import type { CreditDetail, CreditChargeCycleSummary } from '../types';

function normalizeChargeDate(d: CreditDetail): string {
  return d.chargeDate && d.chargeDate.trim() ? d.chargeDate : d.date;
}

export function computeCreditChargeCycles(details: CreditDetail[]): CreditChargeCycleSummary[] {
  const creditDetails = details.filter(d => d.source === 'credit');
  if (!creditDetails.length) return [];

  const byPair: Record<string, CreditChargeCycleSummary> = {};
  for (const d of creditDetails) {
    const cd = normalizeChargeDate(d);
    const key = `${cd}::${d.cardLast4 || ''}`;
    if (!byPair[key]) {
      byPair[key] = {
        chargeDate: cd,
        cardLast4: d.cardLast4 || '',
        totalExpenses: 0,
        totalRefunds: 0,
        netCharge: 0,
        transactionIds: [],
        cycleKey: key,
        bankMatchStatus: 'none',
        bankMatchedAmount: 0,
        bankTransactionIds: [],
      };
    }
    if (d.direction === 'expense') {
      byPair[key].totalExpenses += d.amount;
    } else {
      byPair[key].totalRefunds += d.amount;
    }
    byPair[key].transactionIds.push(d.id);
  }

  Object.values(byPair).forEach(c => {
    c.netCharge = c.totalExpenses - c.totalRefunds;
  });

  const byDate: Record<string, CreditChargeCycleSummary> = {};
  Object.values(byPair).forEach(c => {
    if (!byDate[c.chargeDate]) {
      const key = `${c.chargeDate}::ALL`;
      byDate[c.chargeDate] = {
        chargeDate: c.chargeDate,
        cardLast4: undefined,
        totalExpenses: 0,
        totalRefunds: 0,
        netCharge: 0,
        transactionIds: [],
        cycleKey: key,
        bankMatchStatus: 'none',
        bankMatchedAmount: 0,
        bankTransactionIds: [],
      };
    }
    byDate[c.chargeDate].totalExpenses += c.totalExpenses;
    byDate[c.chargeDate].totalRefunds += c.totalRefunds;
    byDate[c.chargeDate].transactionIds.push(...c.transactionIds);
  });
  Object.values(byDate).forEach(c => {
    c.netCharge = c.totalExpenses - c.totalRefunds;
  });

  return [
    ...Object.values(byPair),
    ...Object.values(byDate),
  ];
}
