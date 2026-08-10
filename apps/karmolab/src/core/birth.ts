/**
 * 생일 정보 — 알맹이 (TASK-KL-088 / S1)
 *
 * 생년월일 하나에서 사람들이 실제로 궁금해하는 건 여러 개다 — 만 나이, 띠, 별자리,
 * 무슨 요일에 태어났는지, 다음 생일까지 며칠, 태어난 지 며칠째.
 *
 * MCP 로 내놓는 이유(B등급): **한국 나이가 세 개**다. 2023-06 만 나이 통일 뒤에도 연 나이가
 * 법에 남아 있어서(병역·청소년보호법) 「몇 살이냐」의 답이 쓰는 곳마다 다르다. LLM 은 이걸
 * 뭉뚱그리거나 옛 규칙으로 답한다. 띠·별자리도 경계에서 자주 틀린다.
 *
 * 「오늘」은 인자로 받는다 — 알맹이가 시계를 직접 보면 같은 입력에 답이 매번 달라져 시험이 못 잡는다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'birth',
  ops: {
    info: {
      desc:
        'From a birth date: the three Korean ages (international / year-age / traditional), zodiac,' +
        ' star sign, weekday born, days lived, next birthday. Korea still uses all three ages in different' +
        ' laws, so all three are returned.' +
        ' / 한국식 나이 3종·띠·별자리·태어난 요일·산 날수·다음 생일.',
      in: { date: 'string' },
      out: 'string'
    }
  }
};

const ZODIAC_KO = ['원숭이', '닭', '개', '돼지', '쥐', '소', '호랑이', '토끼', '용', '뱀', '말', '양'];

/** [시작 월, 시작 일, 이름] — 그 날짜부터 다음 항목 전날까지 */
const SIGNS: Array<[number, number, string]> = [
  [1, 20, 'aquarius'],
  [2, 19, 'pisces'],
  [3, 21, 'aries'],
  [4, 20, 'taurus'],
  [5, 21, 'gemini'],
  [6, 22, 'cancer'],
  [7, 23, 'leo'],
  [8, 23, 'virgo'],
  [9, 23, 'libra'],
  [10, 23, 'scorpio'],
  [11, 22, 'sagittarius'],
  [12, 22, 'capricorn']
];

/** 달마다 정해진 탄생석 — 상위 계산기들이 대개 함께 준다. */
export const GEMS_KO = ['가넷', '자수정', '아쿠아마린', '다이아몬드', '에메랄드', '진주', '루비', '페리도트', '사파이어', '오팔', '토파즈', '터키석'];

export const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 몇 번째 별자리인가 (`SIGNS` 의 자리, 0=물병자리 … 11=염소자리). */
export function signIndexOf(month: number, day: number): number {
  let found = 11; // 염소자리 — 12/22 ~ 1/19
  for (let i = 0; i < SIGNS.length; i++) {
    const [sm, sd] = SIGNS[i];
    if (month > sm || (month === sm && day >= sd)) found = i;
  }
  if (month === 1 && day < 20) found = 11;
  return found;
}

export function signOf(month: number, day: number): string {
  return signKo(signIndexOf(month, day));
}

export function zodiacKo(index: number): string {
  return ZODIAC_KO[index] ?? '';
}

export function signKo(index: number): string {
  return ({
    0: '물병자리',
    1: '물고기자리',
    2: '양자리',
    3: '황소자리',
    4: '쌍둥이자리',
    5: '게자리',
    6: '사자자리',
    7: '처녀자리',
    8: '천칭자리',
    9: '전갈자리',
    10: '사수자리',
    11: '염소자리'
  } as Record<number, string>)[index] ?? '';
}

export function weekdayKo(index: number): string {
  return WEEKDAYS_KO[index] ?? '';
}

export function gemKo(month: number): string {
  return GEMS_KO[month - 1] ?? '';
}

export interface BirthInfo {
  /** 만 나이 — 생일이 지났으면 올해-태어난해, 아직이면 하나 뺀다. 2023-06 이후 기본. */
  age: number;
  /** 연 나이 — 올해 − 태어난 해. 병역·청소년보호법 등이 아직 쓴다. */
  yearAge: number;
  /** 세는 나이 — 연 나이 + 1. 예전 한국식. */
  koreanAge: number;
  /**
   * 위 넷의 **자리 번호**. 이름은 읽는 쪽이 정한다 (TASK-KL-203).
   *
   * 알맹이가 「쥐」·「물병자리」로 못을 박으면 그 이름은 한국어 하나뿐이고, 화면을 다른 말로
   * 옮기려면 되짚어 맞춰야 한다(그러다 하나 어긋나면 그 줄만 조용히 한국어로 남는다).
   * 번호로 주면 화면은 자기 말로 이름을 붙이고, 글로 답하는 쪽(MCP)은 위 이름을 그대로 쓴다.
   */
  zodiacIndex: number;
  signIndex: number;
  weekdayIndex: number;
  /** 태어난 달 (1-12) = 탄생석 자리이기도 하다. */
  month: number;
  /** 태어난 날부터 오늘까지 며칠째. */
  lived: number;
  /** 다음 생일까지 남은 날. 0 이면 오늘. */
  untilNext: number;
  nextBirthday: Date;
  /** 초등학교 입학 연도 (태어난 해 + 7). */
  schoolYear: number;
  /** 2009년 이전 1~2월생 = 예전엔 한 해 빨랐다. */
  earlyEntry: boolean;
  tenThousandth: Date;
}

/**
 * @param birth `YYYY-MM-DD`
 * @param now 「오늘」. 안 주면 지금 시계.
 */
export function birthInfo(birth: string, now: Date = new Date()): BirthInfo | null {
  const m0 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth.trim());
  if (m0 === null) return null;
  const y = Number(m0[1]);
  const m = Number(m0[2]);
  const d = Number(m0[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  const born = new Date(y, m - 1, d);
  // 2월 30일 같은 값은 Date 가 조용히 3월로 넘긴다 — 그걸 잡는다.
  if (born.getFullYear() !== y || born.getMonth() !== m - 1 || born.getDate() !== d) return null;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (born.getTime() > today.getTime()) return null;

  const passed = today.getMonth() + 1 > m || (today.getMonth() + 1 === m && today.getDate() >= d);
  const yearAge = today.getFullYear() - y;
  const age = passed ? yearAge : yearAge - 1;

  let next = new Date(today.getFullYear(), m - 1, d);
  if (next.getTime() < today.getTime()) next = new Date(today.getFullYear() + 1, m - 1, d);

  return {
    age,
    yearAge,
    koreanAge: yearAge + 1,
    zodiacIndex: y % 12,
    signIndex: signIndexOf(m, d),
    weekdayIndex: born.getDay(),
    month: m,
    lived: Math.floor((today.getTime() - born.getTime()) / 86400000),
    untilNext: Math.round((next.getTime() - today.getTime()) / 86400000),
    nextBirthday: next,
    schoolYear: y + 7,
    earlyEntry: m <= 2 && y < 2009,
    tenThousandth: new Date(born.getTime() + 10000 * 86400000)
  };
}

export const run: ToolRunner = (op, args, deps) => {
  if (op !== 'info') throw new Error(`birth 에 「${op}」 는 없습니다`);
  const now = deps?.now instanceof Date ? deps.now : new Date();
  const info = birthInfo(String(args.date ?? ''), now);
  if (info === null) throw new Error('생년월일을 YYYY-MM-DD 로 주세요 (미래 날짜·없는 날짜는 안 됩니다)');

  return [
    `만 나이: ${info.age}세  ← 2023-06 이후 기본`,
    `연 나이: ${info.yearAge}세  ← 올해 − 태어난 해 (병역·청소년보호법 등)`,
    `세는 나이: ${info.koreanAge}세  ← 예전 한국식`,
    `띠: ${zodiacKo(info.zodiacIndex)}띠`,
    `별자리: ${signKo(info.signIndex)}`,
    `태어난 요일: ${weekdayKo(info.weekdayIndex)}요일`,
    `산 날수: ${info.lived.toLocaleString('ko-KR')}일째`,
    info.untilNext === 0 ? '다음 생일: 오늘' : `다음 생일: ${info.untilNext}일 남음`,
    `탄생석: ${gemKo(info.month)}`
  ].join('\n');
};
