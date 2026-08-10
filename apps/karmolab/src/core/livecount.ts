/**
 * 흐른 시간 세기 — 알맹이 (흡수 ⓐ 「라이브 카운터」)
 *
 * 「그날 이후 얼마나 지났나」를 **숫자가 계속 올라가는 모양**으로 보여 주는 것. 기념일·금연·
 * 출시일·입사일에 쓰인다. 남의 사이트에 있는 그건 대개 「세계 인구가 몇 명 늘었다」 같은
 * 남의 통계를 보여 주는데, 우리는 **사용자가 아는 값**만 쓴다 — 출처 없는 숫자는 안 보여 준다.
 *
 * ★ 여기가 틀리기 쉬운 자리 (그래서 알맹이로 뺐다):
 * ① 「몇 개월」은 달마다 길이가 달라 뺄셈으로 안 나온다. 1월 31일의 한 달 뒤는 2월 28일이다.
 * ② 미래 날짜면 「-3일」이 아니라 **남은 시간**이라고 말해야 한다.
 * ③ 비율 환산(하루 n번 → 지금까지 몇 번)은 어림이다. 어림이라고 적지 않으면 사람은 정확한
 *    값으로 받아들인다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'livecount',
  ops: {
    since: {
      desc:
        'How much time has passed since a moment (or remains until a future one), broken into' +
        ' years/months/days and total seconds. Calendar months are counted by calendar, not by' +
        ' dividing days — Jan 31 plus one month is Feb 28, not Mar 3.' +
        ' / 그 시각 이후 흐른 시간(미래면 남은 시간). 달은 달력대로 센다.',
      in: { at: 'string', now: 'string?' },
      out: 'string'
    },
    rate: {
      desc:
        'Project a per-day rate over the elapsed time — e.g. 3 cups of coffee a day since a date.' +
        ' The result is explicitly labelled an estimate, because it is one.' +
        ' / 하루 몇 번을 흐른 시간에 곱해 어림한다. 어림이라고 함께 적는다.',
      in: { at: 'string', perDay: 'number', unit: 'string?', now: 'string?' },
      out: 'string'
    }
  }
};

export interface Elapsed {
  /** 미래면 true — 「-3일」 대신 「3일 남음」으로 말해야 한다. */
  future: boolean;
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** 통째로 몇 초. 비율 환산은 이걸 쓴다. */
  totalSeconds: number;
  totalDays: number;
}

export type ElapsedTailKey = 'future' | 'past';

const DAY_MS = 86400000;

/**
 * 달력대로 센다.
 *
 * 「몇 개월」을 30일로 나누면 3월생과 2월생의 나이가 달라진다. 사람이 세는 방식은
 * **달을 하나씩 넘기는 것**이라, 여기서도 그렇게 한다.
 */
export function elapsed(from: Date, now: Date = new Date()): Elapsed {
  const future = from.getTime() > now.getTime();
  const [a, b] = future ? [now, from] : [from, now];

  let years = b.getFullYear() - a.getFullYear();
  let months = b.getMonth() - a.getMonth();
  let days = b.getDate() - a.getDate();

  let seconds = b.getSeconds() - a.getSeconds();
  let minutes = b.getMinutes() - a.getMinutes();
  let hours = b.getHours() - a.getHours();

  if (seconds < 0) {
    seconds += 60;
    minutes--;
  }
  if (minutes < 0) {
    minutes += 60;
    hours--;
  }
  if (hours < 0) {
    hours += 24;
    days--;
  }
  if (days < 0) {
    /* 전 달의 날 수를 빌린다 — 이 한 줄이 「30일로 나누기」와 갈리는 자리다. */
    const prevMonthDays = new Date(b.getFullYear(), b.getMonth(), 0).getDate();
    days += prevMonthDays;
    months--;
  }
  if (months < 0) {
    months += 12;
    years--;
  }

  const totalMs = Math.abs(b.getTime() - a.getTime());
  return {
    future,
    years,
    months,
    days,
    hours,
    minutes,
    seconds,
    totalSeconds: Math.floor(totalMs / 1000),
    totalDays: Math.floor(totalMs / DAY_MS)
  };
}

/** 사람이 읽는 한 줄. 0인 앞자리는 빼고 말한다 — 「0년 0개월 3일」은 읽기 나쁘다. */
export function humanElapsedParts(e: Elapsed): { parts: string[]; tailKey: ElapsedTailKey } {
  const parts: string[] = [];
  if (e.years > 0) parts.push(`${e.years}년`);
  if (e.months > 0) parts.push(`${e.months}개월`);
  if (e.days > 0) parts.push(`${e.days}일`);
  if (parts.length === 0) parts.push(`${e.hours}시간 ${e.minutes}분`);
  return { parts, tailKey: e.future ? 'future' : 'past' };
}

export function humanElapsed(e: Elapsed): string {
  const shaped = humanElapsedParts(e);
  const head = shaped.parts.join(' ');
  return shaped.tailKey === 'future' ? `${head} 남음` : `${head} 지남`;
}

/**
 * 하루 n번을 흐른 날수에 곱한다. **어림이다** — 그날 안 한 날도 있고 두 번 한 날도 있다.
 * 그래서 이 함수는 값만 주고, 「어림」이라는 말은 부르는 쪽이 반드시 붙인다(아래 `run` 참고).
 */
export function project(e: Elapsed, perDay: number): number {
  if (Number.isFinite(perDay) === false || perDay < 0) throw new Error('하루 횟수를 0 이상의 숫자로 주세요');
  return Math.floor((e.totalSeconds / 86400) * perDay);
}

export function detailKo(e: Elapsed): string {
  return `${e.years}년 ${e.months}개월 ${e.days}일 ${e.hours}시간 ${e.minutes}분 ${e.seconds}초`;
}

const parse = (raw: string, what: string): Date => {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new Error(`${what}을 읽을 수 없습니다 (2026-01-31 또는 ISO 8601)`);
  return d;
};

export const run: ToolRunner = (op, args) => {
  const at = parse(String(args.at ?? ''), '기준 시각');
  const now = args.now === undefined || args.now === '' ? new Date() : parse(String(args.now), '지금 시각');
  const e = elapsed(at, now);

  if (op === 'since') {
    return [
      humanElapsed(e),
      '',
      `총 ${e.totalDays.toLocaleString('ko-KR')}일 · ${e.totalSeconds.toLocaleString('ko-KR')}초`,
      `자세히: ${detailKo(e)}`,
      '',
      '※ 달은 달력대로 셉니다 (30일로 나누지 않습니다).'
    ].join('\n');
  }

  if (op === 'rate') {
    const perDay = Number(args.perDay);
    const unit = String(args.unit ?? '번');
    const total = project(e, perDay);
    return [
      `${total.toLocaleString('ko-KR')}${unit}`,
      '',
      `${humanElapsed(e)} · 하루 ${perDay}${unit} 기준`,
      '',
      '※ 어림입니다 — 안 한 날도, 두 번 한 날도 그대로 곱했습니다.'
    ].join('\n');
  }

  throw new Error(`livecount 에 「${op}」 는 없습니다`);
};
