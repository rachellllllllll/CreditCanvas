// Simple money helpers
export function formatMoney(n: number): string {
  return n.toFixed(2);
}

export function parseMoney(s: string): number {
  const v = parseFloat(s.replace(/[^0-9.-]+/g, ''));
  return Number.isFinite(v) ? v : 0;
}
