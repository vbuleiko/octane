export type FinanceInput = { price: number; deposit?: number; ratePercent: number; months: number; balloon?: number };

/** Standard amortised instalment, as used by South African vehicle finance calculators. */
export function monthlyInstalment({ price, deposit = 0, ratePercent, months, balloon = 0 }: FinanceInput) {
  const principal = Math.max(0, price - deposit);
  if (principal === 0 || months <= 0) return 0;
  const r = ratePercent / 1200;
  if (r === 0) return (principal - balloon) / months;
  const pvBalloon = balloon / Math.pow(1 + r, months);
  return ((principal - pvBalloon) * r) / (1 - Math.pow(1 + r, -months));
}

export function financeSummary(input: FinanceInput) {
  const monthly = monthlyInstalment(input);
  const loan = Math.max(0, input.price - (input.deposit ?? 0));
  const total = monthly * input.months + (input.balloon ?? 0);
  return { monthly, loan, total, interest: Math.max(0, total - loan) };
}

export const RATE_MIN = 9;
export const RATE_MAX = 20;
export const TERMS = [12, 24, 36, 48, 54, 60, 72] as const;
