/**
 * VAT calculation core (TASK-KL-088 / S1)
 *
 * VAT is easy to mix up because adding it to a net amount and extracting it from a total
 * use the same rate but different formulas.
 *
 * MCP exposes this because LLMs often subtract ten percent from the total and miss the
 * rounding rule that keeps supply, tax, and total aligned.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'vat',
  ops: {
    add: {
      desc:
        'Add VAT to a net amount (net × 1.1). Rounds so that net + VAT equals the total exactly -' +
        ' rounding the three lines separately can make them disagree by one won.',
      in: { amount: 'number', rate: 'number?', rounding: 'string?' },
      out: 'string'
    },
    extract: {
      desc:
        'Extract the net amount and VAT from a VAT-inclusive total (total ÷ 1.1), which is not the same as' +
        ' subtracting 10% - that shortcut gives 99,000 instead of 100,000 for a 110,000 total.',
      in: { amount: 'number', rate: 'number?', rounding: 'string?' },
      out: 'string'
    }
  }
};

export type Rounding = 'floor' | 'round';

export interface VatResult {
  supply: number;
  tax: number;
  total: number;
}

/**
 * Avoid floating-point division here.
 *
 * `110000 / 1.1` becomes `99999.99999999999` in JavaScript. Truncating that value returns
 * `99,999`, which is the common off-by-one failure this tool is meant to catch.
 *
 * So this code uses integer math: scale the rate by 10 and compute
 * `total × 1000 ÷ (1000 + rate × 10)`.
 */
const scaleRate = (ratePercent: number): number => Math.round(ratePercent * 10);

/**
 * Rounding matters because the three lines must still add up exactly.
 */
export function vatAdd(supply: number, ratePercent = 10, rounding: Rounding = 'floor'): VatResult {
  const r10 = scaleRate(ratePercent);
  const cut = rounding === 'floor' ? Math.floor : Math.round;
  const s = cut(supply);
  const tax = cut((s * r10) / 1000);
  return { supply: s, tax, total: s + tax };
}

export function vatExtract(total: number, ratePercent = 10, rounding: Rounding = 'floor'): VatResult {
  const r10 = scaleRate(ratePercent);
  const cut = rounding === 'floor' ? Math.floor : Math.round;
  const t = cut(total);
  const supply = cut((t * 1000) / (1000 + r10));
  return { supply, tax: t - supply, total: t };
}

export const won = (n: number): string => Math.round(n).toLocaleString('en-US', { maximumFractionDigits: 0, style: 'currency', currency: 'KRW' });

function report(r: VatResult, ratePercent: number, how: string): string {
  return [
    `Supply: ${won(r.supply)}`,
    `VAT: ${won(r.tax)}`,
    `Total: ${won(r.total)}`,
    `Rate: ${ratePercent}%  ·  ${how}`,
    `Check: supply + VAT = ${won(r.supply + r.tax)} (must match the total)`
  ].join('\n');
}

export const run: ToolRunner = (op, args) => {
  const amount = Number(args.amount);
  if (Number.isFinite(amount) === false) throw new Error('Amount must be a number');
  const rate = args.rate === undefined ? 10 : Number(args.rate);
  if (Number.isFinite(rate) === false || rate < 0) throw new Error('Rate must be a non-negative number (percent)');
  const rounding: Rounding = args.rounding === 'round' ? 'round' : 'floor';

  if (op === 'add') return report(vatAdd(amount, rate, rounding), rate, `net × ${(1 + rate / 100).toFixed(2)}`);
  if (op === 'extract') return report(vatExtract(amount, rate, rounding), rate, `total ÷ ${(1 + rate / 100).toFixed(2)}`);
  throw new Error(`vat has no operation named "${op}"`);
};
