/**
 * 나라별 공휴일 (TASK-KL-203 S13)
 *
 * 영업일 계산은 **주말만 빼서는 안 맞는다** — 쉬는 날을 알아야 한다. 그런데 쉬는 날은 나라마다
 * 다르다. 한국 공휴일만 담아 두면 이 도구는 한국에서만 쓸 수 있는 도구다.
 *
 * 규칙은 세 가지뿐이라 표로 담긴다:
 *  ① `fixed` — 매년 같은 날 (1/1, 12/25)
 *  ② `nth`   — 그 달의 몇째 무슨 요일 (미국 추수감사절 = 11월 넷째 목요일, `nth: -1` 이면 마지막)
 *  ③ `dated` — 해마다 날짜가 달라 **계산으로 못 내는 것** (한국 설날·추석, 일본 춘분·추분).
 *              담지 않은 해는 **모른다고 말한다** — 조용히 틀린 날짜를 내놓는 것보다 낫다.
 *
 * 대체공휴일은 나라마다 규칙이 달라(한국=겹치면 다음 평일, 일본=일요일이면 다음 평일,
 * 미국=토요일이면 앞 금요일·일요일이면 다음 월요일) 나라마다 함수로 둔다.
 *
 * 이름은 **열쇠**로 담는다 — 화면이 자기 말로 붙인다. 여기서 「설날」이라고 못 박으면
 * 일본어 화면에서도 「설날」이 나온다.
 */

export type Rule =
  | { kind: 'fixed'; m: number; d: number; key: string }
  | { kind: 'nth'; m: number; weekday: number; nth: number; key: string }
  | { kind: 'dated'; y: number; m: number; d: number; key: string };

export interface Calendar {
  /** 이 나라 공휴일을 **아는 해**. 밖이면 화면이 「모른다」고 말한다. */
  knownYears: number[];
  rules: Rule[];
  /** 겹침·주말 대체를 얹는다. 이미 잡힌 날은 `taken` 에 들어 있다. */
  substitute?: (year: number, taken: Map<string, string>) => void;
}

const k = (y: number, m: number, d: number): string => `${y}-${m}-${d}`;

/** 그 달의 n째 무슨 요일 (n<0 이면 뒤에서 센다). */
function nthWeekday(year: number, month: number, weekday: number, nth: number): number {
  if (nth > 0) {
    const first = new Date(year, month - 1, 1).getDay();
    return 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7;
  }
  const lastDate = new Date(year, month, 0);
  const back = (lastDate.getDay() - weekday + 7) % 7;
  return lastDate.getDate() - back;
}

/* ── 한국 ────────────────────────────────────────────
 * 음력 명절·부처님오신날은 계산으로 못 낸다. 임시공휴일(2025-01-27 내수 진작)도 규칙 밖이라
 * 표에 없으면 그해 영업일이 하루씩 틀어진다 — 실제로 빠져 있었다. */
const KR_DATED: Array<[number, number, number, string]> = [
  [2024, 2, 9, 'seollalEve'], [2024, 2, 10, 'seollal'], [2024, 2, 11, 'seollalEve'], [2024, 2, 12, 'substitute'],
  [2024, 4, 10, 'election'], [2024, 5, 15, 'buddha'],
  [2024, 9, 16, 'chuseokEve'], [2024, 9, 17, 'chuseok'], [2024, 9, 18, 'chuseokEve'],
  [2025, 1, 27, 'temporary'], [2025, 1, 28, 'seollalEve'], [2025, 1, 29, 'seollal'], [2025, 1, 30, 'seollalEve'],
  [2025, 3, 3, 'substitute'], [2025, 5, 5, 'buddha'], [2025, 5, 6, 'substitute'],
  [2025, 10, 5, 'chuseokEve'], [2025, 10, 6, 'chuseok'], [2025, 10, 7, 'chuseokEve'], [2025, 10, 8, 'substitute'],
  [2026, 2, 16, 'seollalEve'], [2026, 2, 17, 'seollal'], [2026, 2, 18, 'seollalEve'], [2026, 3, 2, 'substitute'],
  [2026, 5, 24, 'buddha'], [2026, 5, 25, 'substitute'], [2026, 8, 17, 'substitute'],
  [2026, 9, 24, 'chuseokEve'], [2026, 9, 25, 'chuseok'], [2026, 9, 26, 'chuseokEve'], [2026, 10, 5, 'substitute'],
  [2027, 2, 6, 'seollalEve'], [2027, 2, 7, 'seollal'], [2027, 2, 8, 'seollalEve'], [2027, 2, 9, 'substitute'],
  [2027, 5, 13, 'buddha'],
  [2027, 9, 14, 'chuseokEve'], [2027, 9, 15, 'chuseok'], [2027, 9, 16, 'chuseokEve']
];

/* ── 일본 ────────────────────────────────────────────
 * 춘분·추분은 천문 계산이라 해마다 다르다(3/20 또는 21, 9/22 또는 23) — `dated` 로 담는다.
 * 振替休日: 공휴일이 일요일이면 그 다음 평일이 쉰다. */
const JP_DATED: Array<[number, number, number, string]> = [
  [2024, 3, 20, 'jpVernal'], [2024, 9, 22, 'jpAutumnal'],
  [2025, 3, 20, 'jpVernal'], [2025, 9, 23, 'jpAutumnal'],
  [2026, 3, 20, 'jpVernal'], [2026, 9, 23, 'jpAutumnal'],
  [2027, 3, 21, 'jpVernal'], [2027, 9, 23, 'jpAutumnal']
];

export const CALENDARS: Record<string, Calendar> = {
  KR: {
    knownYears: [2024, 2025, 2026, 2027],
    rules: [
      { kind: 'fixed', m: 1, d: 1, key: 'newYear' },
      { kind: 'fixed', m: 3, d: 1, key: 'krMarchFirst' },
      { kind: 'fixed', m: 5, d: 5, key: 'krChildren' },
      { kind: 'fixed', m: 6, d: 6, key: 'krMemorial' },
      { kind: 'fixed', m: 8, d: 15, key: 'krLiberation' },
      { kind: 'fixed', m: 10, d: 3, key: 'krFoundation' },
      { kind: 'fixed', m: 10, d: 9, key: 'krHangul' },
      { kind: 'fixed', m: 12, d: 25, key: 'christmas' },
      ...KR_DATED.map(([y, m, d, key]) => ({ kind: 'dated', y, m, d, key }) as Rule)
    ]
  },

  JP: {
    knownYears: [2024, 2025, 2026, 2027],
    rules: [
      { kind: 'fixed', m: 1, d: 1, key: 'newYear' },
      { kind: 'nth', m: 1, weekday: 1, nth: 2, key: 'jpComingOfAge' },
      { kind: 'fixed', m: 2, d: 11, key: 'jpFoundation' },
      { kind: 'fixed', m: 2, d: 23, key: 'jpEmperor' },
      { kind: 'fixed', m: 4, d: 29, key: 'jpShowa' },
      { kind: 'fixed', m: 5, d: 3, key: 'jpConstitution' },
      { kind: 'fixed', m: 5, d: 4, key: 'jpGreenery' },
      { kind: 'fixed', m: 5, d: 5, key: 'jpChildren' },
      { kind: 'nth', m: 7, weekday: 1, nth: 3, key: 'jpMarine' },
      { kind: 'fixed', m: 8, d: 11, key: 'jpMountain' },
      { kind: 'nth', m: 9, weekday: 1, nth: 3, key: 'jpRespect' },
      { kind: 'nth', m: 10, weekday: 1, nth: 2, key: 'jpSports' },
      { kind: 'fixed', m: 11, d: 3, key: 'jpCulture' },
      { kind: 'fixed', m: 11, d: 23, key: 'jpLabor' },
      ...JP_DATED.map(([y, m, d, key]) => ({ kind: 'dated', y, m, d, key }) as Rule)
    ],
    /* 振替休日 — 일요일에 걸린 공휴일은 다음 평일로 옮겨 쉰다. */
    substitute(year, taken) {
      for (const key of [...taken.keys()]) {
        const [y, m, d] = key.split('-').map(Number);
        if (y !== year) continue;
        const at = new Date(y, m - 1, d);
        if (at.getDay() !== 0) continue;
        const next = new Date(y, m - 1, d);
        do {
          next.setDate(next.getDate() + 1);
        } while (taken.has(k(next.getFullYear(), next.getMonth() + 1, next.getDate())));
        taken.set(k(next.getFullYear(), next.getMonth() + 1, next.getDate()), 'jpSubstitute');
      }
    }
  },

  US: {
    knownYears: [],
    rules: [
      { kind: 'fixed', m: 1, d: 1, key: 'newYear' },
      { kind: 'nth', m: 1, weekday: 1, nth: 3, key: 'usMlk' },
      { kind: 'nth', m: 2, weekday: 1, nth: 3, key: 'usPresidents' },
      { kind: 'nth', m: 5, weekday: 1, nth: -1, key: 'usMemorial' },
      { kind: 'fixed', m: 6, d: 19, key: 'usJuneteenth' },
      { kind: 'fixed', m: 7, d: 4, key: 'usIndependence' },
      { kind: 'nth', m: 9, weekday: 1, nth: 1, key: 'usLabor' },
      { kind: 'nth', m: 10, weekday: 1, nth: 2, key: 'usColumbus' },
      { kind: 'fixed', m: 11, d: 11, key: 'usVeterans' },
      { kind: 'nth', m: 11, weekday: 4, nth: 4, key: 'usThanksgiving' },
      { kind: 'fixed', m: 12, d: 25, key: 'christmas' }
    ],
    /* 연방 공휴일이 주말에 걸리면 **가장 가까운 평일**을 쉰다(토→앞 금요일, 일→다음 월요일). */
    substitute(year, taken) {
      for (const key of [...taken.keys()]) {
        const [y, m, d] = key.split('-').map(Number);
        if (y !== year) continue;
        const at = new Date(y, m - 1, d);
        const day = at.getDay();
        if (day !== 0 && day !== 6) continue;
        const moved = new Date(y, m - 1, d + (day === 6 ? -1 : 1));
        taken.set(k(moved.getFullYear(), moved.getMonth() + 1, moved.getDate()), 'usObserved');
      }
    }
  }
};

/**
 * 그 나라 그 해의 쉬는 날 → `날짜열쇠 → 이름열쇠`.
 * 나라를 모르면 빈 표 — 주말만 빼고 센다(틀린 공휴일을 지어내는 것보다 낫다).
 */
export function holidayKeys(regionCode: string, year: number): Map<string, string> {
  const cal = CALENDARS[regionCode];
  const out = new Map<string, string>();
  if (!cal) return out;
  for (const r of cal.rules) {
    if (r.kind === 'fixed') out.set(k(year, r.m, r.d), r.key);
    else if (r.kind === 'nth') out.set(k(year, r.m, nthWeekday(year, r.m, r.weekday, r.nth)), r.key);
    else if (r.y === year) out.set(k(r.y, r.m, r.d), r.key);
  }
  cal.substitute?.(year, out);
  return out;
}

/** 이 나라 공휴일을 **아는 해**인가. `knownYears` 가 비면 규칙만으로 다 나오므로 늘 안다. */
export function knowsYear(regionCode: string, year: number): boolean {
  const cal = CALENDARS[regionCode];
  if (!cal) return false;
  return !cal.knownYears.length || cal.knownYears.includes(year);
}

/** 그 나라 달력을 아예 가지고 있나. */
export function hasCalendar(regionCode: string): boolean {
  return !!CALENDARS[regionCode];
}
