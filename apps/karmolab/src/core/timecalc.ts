/**
 * 시간 더하기·빼기 — 알맹이 (TASK-KL-088 / S1)
 *
 * 「9시 40분에 시작해 1시간 25분 걸리면 몇 시?」는 60진법이라 손으로 하면 자주 틀린다.
 * 근무시간 합계(7:45 + 8:20 + …)도 마찬가지 — **계산기에 넣으면 7.45 로 읽혀** 엉뚱한 값이 나온다.
 *
 * MCP 로 내놓는 이유(B등급): LLM 도 같은 실수를 한다 — 7:45 를 7.75시간으로 옳게 바꾸는 대신
 * 7.45 로 다루거나, 24시를 넘겼을 때 다음 날로 넘기는 걸 빠뜨린다. 여기선 **분(minute) 하나로만**
 * 계산하고 표시할 때만 60진법으로 되돌린다 — 그러면 틀릴 자리가 없어진다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'timecalc',
  ops: {
    shift: {
      desc:
        'Add or subtract a duration from a time, rolling into the next day past 24:00.' +
        ' duration accepts "1:25", "85m" or "1.5h".' +
        ' / 시각에 시간 더하기·빼기. 자정 넘김 처리.',
      in: { start: 'string', duration: 'string', minus: 'boolean?' },
      out: 'string'
    },
    sum: {
      desc:
        'Sum durations (timesheets). One per line; "7:45", "8h" and "90m" can be mixed —' +
        ' base-60 addition is where hand-tallied hours go wrong.' +
        ' / 시간 합계. 한 줄에 하나, 표기 섞여도 됨.',
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

/** 「7시간 45분」. 음수도 부호를 붙여 그대로 보여 준다. */
export function fmt(min: number): string {
  const neg = min < 0;
  const a = Math.abs(min);
  return `${neg ? '-' : ''}${Math.floor(a / 60)}시간 ${a % 60}분`;
}

/** 「09:40」. 24시를 넘거나 0시 아래로 내려가도 하루 안으로 되돌린다. */
export function clock(min: number): string {
  const d = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`;
}

/** 며칠 넘어갔나 (음수면 전날로). */
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
    if (base === null) throw new Error('시작 시각을 09:40 처럼 적어 주세요');
    const delta = toMinutes(String(args.duration ?? ''));
    if (delta === null) throw new Error('걸리는 시간을 1:25 · 85m · 1.5h 처럼 적어 주세요');
    const total = args.minus === true ? base - delta : base + delta;
    const shifted = dayShift(total);
    return [
      `결과: ${clock(total)}` + (shifted > 0 ? ` (${shifted}일 뒤)` : shifted < 0 ? ` (${-shifted}일 전)` : ''),
      `${clock(base)} ${args.minus === true ? '−' : '+'} ${fmt(delta)}`,
      `걸리는 시간: ${delta}분 = ${(delta / 60).toFixed(2)}시간`
    ].join('\n');
  }

  if (op === 'sum') {
    const r = sumTimes(String(args.times ?? ''));
    if (r.counted === 0) throw new Error('읽을 수 있는 줄이 없습니다 — 7:45 · 8h · 90m 처럼 적어 주세요');
    const lines = [
      `합계: ${fmt(r.total)}`,
      `소수 시간: ${(r.total / 60).toFixed(2)}시간  ← 급여 계산에 쓰는 값 (7:45 는 7.45 가 아니라 7.75)`,
      `줄 수: ${r.counted}  ·  평균: ${fmt(Math.round(r.total / r.counted))}`
    ];
    if (r.bad > 0) lines.push(`못 읽은 줄: ${r.bad}줄`);
    return lines.join('\n');
  }

  throw new Error(`timecalc 에 「${op}」 는 없습니다`);
};
