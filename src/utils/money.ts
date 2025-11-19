import type { CreditDetail } from '../types';

// amount נשמר תמיד כערך מוחלט; signedAmount קובע את הסימן לפי direction
export const signedAmount = (d: CreditDetail) =>
  d.direction === 'income' ? +Math.abs(d.amount) : -Math.abs(d.amount);
