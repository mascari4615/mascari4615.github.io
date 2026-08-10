/**
 * Time shift and sum core (TASK-KL-088 / S1)
 *
 * Time arithmetic is easy to get wrong by hand because it uses base-60 math.
 *
 * MCP exposes this because models often treat 7:45 as 7.45 hours or forget to roll past midnight.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'timecalc',
  ops: {
    shift: {
      desc:
        'Add or subtract a duration from a time, rolling into the next day past 24:00.' +
        ' duration accepts "1:25", "85m" or "1.5h".',
      in: { start: 'string', duration: 'string', minus: 'boolean?' },
      out: 'string'
    },
    sum: {
      desc:
        'Sum durations (timesheets). One per line; "7:45", "8h" and "90m" can be mixed —' +
        ' base-60 addition is where hand-tallied hours go wrong.',
      in: { times: 'string' },
      out: 'string'
    }
  }
};

/**
 * `"1:30"` · `"90m"` · `"1h30"` · `"1.5h"` · `"90"` 을 **분**으로.
 * 읽을 수 없으면 null — 0 으로 넘기면 합계가 조용히 틀린다.
 */
export function toMinutes(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (s === '') return null;
  const hm = /^(\d+)\s*[:hㅅ시]\s*(\d+)?/.exec(s);
  if (hm !== null) return parseInt(hm[1], 10) * 60 + parseInt(hm[2] ?? '0', 10);
  const h = /^([\d.]+)\s*h$/.exec(s);
  if (h !== null) return Math.round(parseFloat(h[1]) * 60);
  const m = /^(\d+)\s*m?$/.exec(s);
  if (m !== null) return parseInt(m[1], 10);
  return null;
}

/** Human-readable duration. */
export function fmt(min: number): string {
  const neg = min < 0;
  const a = Math.abs(min);
  return `${neg ? '-' : ''}${Math.floor(a / 60)}h ${a % 60}m`;
}

/** "09:40". Wraps within one day. */
export function clock(min: number): string {
  const d = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`;
}

/** Day offset, negative for previous day. */
export const dayShift = (min: number): number => Math.floor(min / 1440);

export interface SumResult {
  total: number;
  counted: number;
  bad: number;
}

export function sumTimes(text: string): SumResult {
  let total = 0;
  let counted = 0;
  let bad = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const v = toMinutes(line);
    if (v === null) bad++;
    else {
      total += v;
      counted++;
    }
  }
  return { total, counted, bad };
}

export const run: ToolRunner = (op, args) => {
  if (op === 'shift') {
    const start = String(args.start ?? '');
    const base = toMinutes(start);
    if (base === null) throw new Error('Enter the start time like 09:40');
    const delta = toMinutes(String(args.duration ?? ''));
    if (delta === null) throw new Error('Enter the duration like 1:25, 85m, or 1.5h');
    const total = args.minus === true ? base - delta : base + delta;
    const shifted = dayShift(total);
    return [
      `Result: ${clock(total)}` + (shifted > 0 ? ` (${shifted} day${shifted > 1 ? 's' : ''} later)` : shifted < 0 ? ` (${-shifted} day${-shifted > 1 ? 's' : ''} earlier)` : ''),
      `${clock(base)} ${args.minus === true ? '−' : '+'} ${fmt(delta)}`,
      `Duration: ${delta} minutes = ${(delta / 60).toFixed(2)} hours`
    ].join('\n');
  }

  if (op === 'sum') {
    const r = sumTimes(String(args.times ?? ''));
    if (r.counted === 0) throw new Error('No readable lines found - enter values like 7:45, 8h, or 90m');
    const lines = [
      `Total: ${fmt(r.total)}`,
      `Decimal hours: ${(r.total / 60).toFixed(2)}h  <- payroll uses this (7:45 is 7.75, not 7.45)`,
      `Lines: ${r.counted}  ·  Average: ${fmt(Math.round(r.total / r.counted))}`
    ];
    if (r.bad > 0) lines.push(`Unreadable lines: ${r.bad}`);
    return lines.join('\n');
  }

  throw new Error(`timecalc has no operation named "${op}"`);
};
