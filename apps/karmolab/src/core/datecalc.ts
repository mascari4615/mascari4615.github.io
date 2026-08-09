/**
 * 날짜 계산 · D-Day — 알맹이 (TASK-KL-088 / S1)
 *
 * MCP 로 내놓는 이유(B등급): 날짜 산수는 LLM 이 **자신 있게 틀리는** 대표 자리다.
 *  ① 「3개월 뒤」 — 1월 31일에 한 달을 더하면 2월 31일이 없다. 여기선 그 달의 마지막 날로 맞춘다.
 *  ② 윤년 — 2/29 가 있는 해와 없는 해의 답이 다르다.
 *  ③ D-Day — 「D-100」이 오늘을 세느냐 마느냐로 하루가 갈린다. 관례는 **시작일을 1일째로** 센다.
 *  ④ 두 날짜 사이 — 끝날을 포함하느냐로 또 하루가 갈린다.
 * 그 갈림을 값과 말로 **분명히 적어** 낸다. 「며칠」만 던지면 맞는지 확인할 방법이 없다.
 *
 * 「오늘」은 인자로 받는다 — 알맹이가 시계를 직접 보면 같은 입력에 답이 매번 달라진다.
 * 공휴일까지 뺀 영업일은 `core/workdays.ts` 가 한다(여긴 주말만).
 */
import type { ToolRunner, ToolSpec } from './types';

export const DAY = 86400000;

export const spec: ToolSpec = {
  id: 'datecalc',
  ops: {
    shift: {
      desc:
        'Add or subtract days/weeks/months/years. Jan 31 + 1 month clamps to the last day of February' +
        ' instead of rolling over into March, which is what naive date math does.' +
        ' / 날짜 더하기·빼기. 없는 날은 그 달 마지막 날로.',
      in: { date: 'string', days: 'number?', weeks: 'number?', months: 'number?', years: 'number?' },
      out: 'string'
    },
    between: {
      desc:
        'Days, weeks and weekdays between two dates — reported both inclusive and exclusive of the end date,' +
        ' because that off-by-one is the whole argument.' +
        ' / 두 날짜 사이 일수·주수·평일수. 끝날 포함/제외 둘 다.',
      in: { start: 'string', end: 'string' },
      out: 'string'
    },
    dday: {
      desc:
        'Days until (or since) a target date. Reports both the D-Day convention (start day counts as day 1)' +
        ' and the plain difference — they differ by one and that is where the confusion lives.' +
        ' / D-Day. 관례 계산과 단순 차이를 함께.',
      in: { date: 'string', today: 'string?' },
      out: 'string'
    }
  }
};

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export const midnight = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const toInput = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function parseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
  if (m === null) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // 2월 30일 같은 값을 Date 가 3월로 넘기는 것을 막는다.
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;
}

export const label = (d: Date): string => `${toInput(d)} (${WEEKDAYS[d.getDay()]})`;

export const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export const daysInMonth = (y: number, m0: number): number => new Date(y, m0 + 1, 0).getDate();

/**
 * 달·해를 더할 때 **날짜가 넘치지 않게** 맞춘다.
 * 1/31 + 1개월 = 2/28(윤년이면 2/29). 그냥 setMonth 하면 3/3 이 나온다 — 그게 흔한 버그다.
 */
export function addMonths(d: Date, months: number): Date {
  const y = d.getFullYear();
  const m = d.getMonth() + months;
  const targetY = y + Math.floor(m / 12);
  const targetM = ((m % 12) + 12) % 12;
  return new Date(targetY, targetM, Math.min(d.getDate(), daysInMonth(targetY, targetM)));
}

export function shift(d: Date, opts: { days?: number; weeks?: number; months?: number; years?: number }): Date {
  let out = new Date(d.getTime());
  if (opts.years) out = addMonths(out, opts.years * 12);
  if (opts.months) out = addMonths(out, opts.months);
  const dayDelta = (opts.days ?? 0) + (opts.weeks ?? 0) * 7;
  if (dayDelta !== 0) out = new Date(out.getFullYear(), out.getMonth(), out.getDate() + dayDelta);
  return out;
}

export interface BetweenDates {
  /** 끝날을 안 센 값 (= 단순 차이). */
  days: number;
  /** 끝날까지 센 값. 사람들이 「며칠간」이라 할 때 대개 이쪽. */
  inclusive: number;
  weeks: number;
  weekdays: number;
}

/** 주말을 뺀 평일 수 (공휴일은 안 뺀다 — 그건 `workdays`). 끝날 포함. */
export function weekdaysBetween(from: Date, to: Date): number {
  const [a, b] = from.getTime() <= to.getTime() ? [from, to] : [to, from];
  let n = 0;
  for (let t = a.getTime(); t <= b.getTime(); t += DAY) {
    const day = new Date(t).getDay();
    if (day !== 0 && day !== 6) n++;
  }
  return n;
}

export function between(from: Date, to: Date): BetweenDates {
  const days = Math.round(Math.abs(to.getTime() - from.getTime()) / DAY);
  return { days, inclusive: days + 1, weeks: Math.floor(days / 7), weekdays: weekdaysBetween(from, to) };
}

export interface DdayResult {
  /** 단순 날짜 차이. 오늘이면 0. */
  diff: number;
  /** D-Day 표기 (D-100 · D+3 · D-DAY). 관례상 **시작일을 1일째**로 센다. */
  tag: string;
  /** 「며칠째」 — 시작일을 1일째로. 지난 날짜에만 뜻이 있다. */
  nth: number;
}

export function dday(target: Date, today: Date): DdayResult {
  const diff = Math.round((midnight(target).getTime() - midnight(today).getTime()) / DAY);
  return {
    diff,
    tag: diff === 0 ? 'D-DAY' : diff > 0 ? `D-${diff}` : `D+${-diff}`,
    nth: -diff + 1
  };
}

const need = (raw: unknown, what: string): Date => {
  const d = parseDate(String(raw ?? ''));
  if (d === null) throw new Error(`${what}을(를) YYYY-MM-DD 로 주세요 (없는 날짜는 안 됩니다)`);
  return d;
};

export const run: ToolRunner = (op, args) => {
  if (op === 'shift') {
    const from = need(args.date, '날짜');
    const opts = {
      days: Number(args.days ?? 0),
      weeks: Number(args.weeks ?? 0),
      months: Number(args.months ?? 0),
      years: Number(args.years ?? 0)
    };
    if (Object.values(opts).every((v) => v === 0)) throw new Error('더하거나 뺄 값을 하나는 주세요 (days·weeks·months·years)');
    if (Object.values(opts).some((v) => Number.isFinite(v) === false)) throw new Error('더할 값은 숫자여야 합니다');
    const to = shift(from, opts);
    const lines = [`${label(from)} → ${label(to)}`, `날짜 차이: ${Math.round((to.getTime() - from.getTime()) / DAY)}일`];
    if (opts.months !== 0 || opts.years !== 0) {
      const naive = from.getDate();
      if (to.getDate() !== naive) {
        lines.push(`※ ${naive}일이 그 달에 없어 마지막 날(${to.getDate()}일)로 맞췄습니다.`);
      }
    }
    return lines.join('\n');
  }

  if (op === 'between') {
    const from = need(args.start, '시작일');
    const to = need(args.end, '끝나는 날');
    const b = between(from, to);
    return [
      `${label(from)} ~ ${label(to)}`,
      `${b.days}일 (끝날 안 셈)  ·  ${b.inclusive}일 (끝날까지 셈)  ← 「며칠간」은 대개 이쪽`,
      `${b.weeks}주 + ${b.days % 7}일  ·  평일 ${b.weekdays}일 (공휴일은 안 뺐습니다 — 그건 workdays)`
    ].join('\n');
  }

  if (op === 'dday') {
    const target = need(args.date, '기준일');
    const today = args.today === undefined ? midnight(new Date()) : need(args.today, '오늘');
    const r = dday(target, today);
    const lines = [`${label(target)} → ${r.tag} (오늘 ${toInput(today)} 기준)`];
    if (r.diff > 0) lines.push(`${r.diff}일 남음`);
    else if (r.diff < 0) lines.push(`${-r.diff}일 지남 · 시작일을 1일째로 세면 오늘이 ${r.nth}일째`);
    else lines.push('오늘입니다');
    return lines.join('\n');
  }

  throw new Error(`datecalc 에 「${op}」 는 없습니다`);
};
