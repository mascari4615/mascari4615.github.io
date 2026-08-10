/**
 * Deposit, savings, and loan interest core (TASK-KL-088 / S1)
 *
 * Quoted interest and received interest differ because savings deposits earn for different periods
 * and interest income tax is withheld.
 *
 * MCP exposes this because models often answer "principal × rate" and miss the rolling term
 * math and the 15.4% tax.
 */
import type { ToolRunner, ToolSpec } from './types';

/** Interest income tax 15.4% = 14% income tax + 1.4% local tax. */
export const TAX_RATE = 0.154;

export const spec: ToolSpec = {
  id: 'interest',
  ops: {
    deposit: {
      desc:
        'Korean time deposit (simple interest) — maturity interest and the amount actually received,' +
        ' after the 15.4% interest income tax that quoted rates never include.',
      in: { amount: 'number', rate: 'number', months: 'number' },
      out: 'string'
    },
    saving: {
      desc:
        'Korean installment savings (simple interest). Only the early deposits earn a full year, so the' +
        ' real interest is roughly half of total × rate — the single most common money miscalculation here.' +
        ' The gap is shown explicitly.',
      in: { monthly: 'number', rate: 'number', months: 'number' },
      out: 'string'
    },
    loan: {
      desc:
        'Equal-payment loan — monthly payment, total repaid, total interest.',
      in: { amount: 'number', rate: 'number', months: 'number' },
      out: 'string'
    }
  }
};

export const won = (n: number): string => Math.round(n).toLocaleString('en-US', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 });

/** Deposit interest, simple interest. */
export function depositInterest(principal: number, ratePercent: number, months: number): number {
  return principal * (ratePercent / 100) * (months / 12);
}

/**
 * Savings interest: the n-th deposit earns for `(months - n + 1)` months.
 */
export function savingInterest(monthly: number, ratePercent: number, months: number): number {
  let interest = 0;
  for (let n = 1; n <= months; n++) interest += monthly * (ratePercent / 100) * ((months - n + 1) / 12);
  return interest;
}

/** Equal-payment loan. */
export function annuityPayment(principal: number, ratePercent: number, months: number): number {
  const r = ratePercent / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

export interface SavingsResult {
  principal: number;
  gross: number;
  tax: number;
  net: number;
  /** After-tax payout. */
  payout: number;
}

export function afterTax(principal: number, gross: number): SavingsResult {
  const tax = gross * TAX_RATE;
  return { principal, gross, tax, net: gross - tax, payout: principal + gross - tax };
}

function guard(args: Record<string, unknown>, key: string, label: string): number {
  const v = Number(args[key]);
  if (Number.isFinite(v) === false || v < 0) throw new Error(`Enter ${label} as a non-negative number`);
  return v;
}

export const run: ToolRunner = (op, args) => {
  const rate = guard(args, 'rate', 'annual interest rate (%)');
  const months = Math.max(1, Math.round(guard(args, 'months', 'months')));

  if (op === 'loan') {
    const amount = guard(args, 'amount', 'loan amount');
    const monthly = annuityPayment(amount, rate, months);
    const total = monthly * months;
    return [
      `Monthly payment: ${won(monthly)}`,
      `Total repaid: ${won(total)}`,
      `Total interest: ${won(total - amount)}`,
      `First month interest: ${won((amount * rate) / 100 / 12)}`,
      `Repayment type: equal payment (${months} months, APR ${rate}%)`,
      'Note: prepayment fees, stamp tax, and other fees are not included.'
    ].join('\n');
  }

  if (op === 'deposit') {
    const amount = guard(args, 'amount', 'deposit amount');
    const r = afterTax(amount, depositInterest(amount, rate, months));
    return [
      `After-tax payout: ${won(r.payout)}`,
      `Principal: ${won(r.principal)}`,
      `Gross interest: ${won(r.gross)}`,
      `Interest income tax (15.4%): -${won(r.tax)}`,
      `Net interest: ${won(r.net)}`,
      'This uses simple interest; compound products would be larger.'
    ].join('\n');
  }

  if (op === 'saving') {
    const monthly = guard(args, 'monthly', 'monthly deposit');
    const principal = monthly * months;
    const gross = savingInterest(monthly, rate, months);
    const r = afterTax(principal, gross);
    // 「총액 × 연이율」로 오해한 값도 같이 보여 준다 — 그 차이가 이 도구의 값이다.
    const naive = principal * (rate / 100);
    return [
      `After-tax payout: ${won(r.payout)}`,
      `Principal total: ${won(r.principal)} (${won(monthly)} × ${months} months)`,
      `Gross interest: ${won(r.gross)}`,
      `Interest income tax (15.4%): -${won(r.tax)}`,
      `Net interest: ${won(r.net)}`,
      `Note: if you compute "${won(r.principal)} × ${rate}%" you get ${won(naive)}, but that is wrong because` +
        ' earlier deposits earn longer.'
    ].join('\n');
  }

  throw new Error(`interest has no operation named "${op}"`);
};
