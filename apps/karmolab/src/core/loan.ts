/**
 * Loan amortization core (TASK-KL-088 / S1)
 *
 * The interesting part is the split between principal and interest over time.
 *
 * MCP exposes this because models often collapse all repayment methods into one and miss
 * how grace periods and extra payments change the totals.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'loan',
  ops: {
    schedule: {
      desc:
        'Full amortization schedule. method = equal (equal payment, default) | principal (equal principal)' +
        ' | bullet (interest-only then lump sum). grace = interest-only months, extra = extra paid monthly.',
      in: {
        amount: 'number',
        rate: 'number',
        months: 'number',
        method: 'string?',
        grace: 'number?',
        extra: 'number?'
      },
      out: 'string'
    },
    compare: {
      desc:
        'Compare all three repayment methods side by side — total interest and first-month payment,' +
        ' the two numbers that actually decide the choice.',
      in: { amount: 'number', rate: 'number', months: 'number' },
      out: 'string'
    }
  }
};

export interface Row {
  n: number;
  pay: number;
  interest: number;
  principal: number;
  left: number;
}

export const won = (n: number): string => Math.round(n).toLocaleString('en-US', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 });

/** Equal payment. */
export function equalPayment(P: number, ratePercent: number, months: number): Row[] {
  const r = ratePercent / 100 / 12;
  const pay = r === 0 ? P / months : (P * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  const rows: Row[] = [];
  let left = P;
  for (let n = 1; n <= months; n++) {
    const interest = left * r;
    const principal = pay - interest;
    left = Math.max(0, left - principal);
    rows.push({ n, pay, interest, principal, left });
  }
  return rows;
}

/** Equal principal. */
export function equalPrincipal(P: number, ratePercent: number, months: number): Row[] {
  const r = ratePercent / 100 / 12;
  const principal = P / months;
  const rows: Row[] = [];
  let left = P;
  for (let n = 1; n <= months; n++) {
    const interest = left * r;
    left = Math.max(0, left - principal);
    rows.push({ n, pay: principal + interest, interest, principal, left });
  }
  return rows;
}

/** Bullet repayment. */
export function bullet(P: number, ratePercent: number, months: number): Row[] {
  const r = ratePercent / 100 / 12;
  const rows: Row[] = [];
  for (let n = 1; n <= months; n++) {
    const last = n === months;
    rows.push({ n, pay: P * r + (last ? P : 0), interest: P * r, principal: last ? P : 0, left: last ? 0 : P });
  }
  return rows;
}

/**
 * Grace period: interest only.
 */
export function withGrace(P: number, ratePercent: number, grace: number, rows: Row[]): Row[] {
  if (grace <= 0) return rows;
  const r = ratePercent / 100 / 12;
  const head: Row[] = [];
  for (let n = 1; n <= grace; n++) head.push({ n, pay: P * r, interest: P * r, principal: 0, left: P });
  return head.concat(rows.map((row) => ({ ...row, n: row.n + grace })));
}

/**
 * Extra monthly payments shorten the term and reduce interest.
 */
export function withExtra(rows: Row[], ratePercent: number, extra: number): Row[] {
  if (extra <= 0) return rows;
  const r = ratePercent / 100 / 12;
  const out: Row[] = [];
  let left = rows[0] ? rows[0].left + rows[0].principal : 0;
  for (const base of rows) {
    if (left <= 0) break;
    const interest = left * r;
    const payPrincipal = Math.min(base.principal + extra, left);
    left = Math.max(0, left - payPrincipal);
    out.push({ n: base.n, pay: interest + payPrincipal, interest, principal: payPrincipal, left });
  }
  return out;
}

export type Method = 'equal' | 'principal' | 'bullet';

export function scheduleOf(P: number, ratePercent: number, months: number, method: Method = 'equal'): Row[] {
  if (method === 'principal') return equalPrincipal(P, ratePercent, months);
  if (method === 'bullet') return bullet(P, ratePercent, months);
  return equalPayment(P, ratePercent, months);
}

export const totalInterest = (rows: Row[]): number => rows.reduce((a, r) => a + r.interest, 0);

const METHOD_NAME: Record<Method, string> = {
  equal: 'Equal payment',
  principal: 'Equal principal',
  bullet: 'Bullet'
};

function num(args: Record<string, unknown>, key: string, label: string, fallback?: number): number {
  if (args[key] === undefined && fallback !== undefined) return fallback;
  const v = Number(args[key]);
  if (Number.isFinite(v) === false || v < 0) throw new Error(`Enter ${label} as a non-negative number`);
  return v;
}

export const run: ToolRunner = (op, args) => {
  const amount = num(args, 'amount', 'loan amount');
  const rate = num(args, 'rate', 'annual interest rate (%)');
  const months = Math.max(1, Math.round(num(args, 'months', 'months')));

  if (op === 'compare') {
    const lines = (['equal', 'principal', 'bullet'] as Method[]).map((m) => {
      const rows = scheduleOf(amount, rate, months, m);
      return `${METHOD_NAME[m]}: first payment ${won(rows[0].pay)} · total interest ${won(totalInterest(rows))}`;
    });
    return [
      `Principal ${won(amount)} · APR ${rate}% · ${months} months`,
      ...lines,
      'Equal principal has the least total interest; bullet has the most. Monthly payments differ.'
    ].join('\n');
  }

  if (op === 'schedule') {
    const method = (String(args.method ?? 'equal') as Method) || 'equal';
    if (method in METHOD_NAME === false) {
      throw new Error(`Unknown repayment method: ${String(args.method)} (equal, principal, bullet)`);
    }
    const grace = Math.round(num(args, 'grace', 'grace months', 0));
    const extra = num(args, 'extra', 'extra monthly payment', 0);

    const base = withGrace(amount, rate, grace, scheduleOf(amount, rate, months, method));
    const rows = withExtra(base, rate, extra);
    const baseInterest = totalInterest(base);
    const nowInterest = totalInterest(rows);

    const head = [
      `${METHOD_NAME[method]} · Principal ${won(amount)} · APR ${rate}% · ${months} months` + (grace > 0 ? ` · grace ${grace} months` : ''),
      `First payment: ${won(rows[0].pay)}  (interest ${won(rows[0].interest)} · principal ${won(rows[0].principal)})`,
      `Total paid: ${won(rows.reduce((a, r) => a + r.pay, 0))}`,
      `Total interest: ${won(nowInterest)}`
    ];
    if (extra > 0) {
      head.push(
        `If you pay ${won(extra)} extra each month: ${base.length} months -> ${rows.length} months` +
          ` (${base.length - rows.length} months shorter), interest saved ${won(baseInterest - nowInterest)}`
      );
    }
    // Only show a sample of the schedule.
    const pick = [0, Math.floor(rows.length / 2), rows.length - 1].filter((v, i, a) => a.indexOf(v) === i);
    head.push('Schedule sample: ' + pick.map((i) => `${rows[i].n}: interest ${won(rows[i].interest)} · principal ${won(rows[i].principal)}`).join(' / '));
    head.push('Prepayment fees, stamp tax, and other fees are not included.');
    return head.join('\n');
  }

  throw new Error(`loan has no operation named "${op}"`);
};
