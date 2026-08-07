import { conversationOnly } from './conversation';
import type { MemoryEntry } from './types';

/**
 * 함께한 날 — 처음 만난 날과 이정표.
 *
 * 오래 쓰이는 동반자들이 공통으로 갖는 것: **관계에 이력이 있다.** 처음 나눈 대화를 기억하고,
 * 며칠째인지 알고, 백일 같은 날을 안다. 그게 「매번 처음 만나는 것」과 「같이 지내 온 것」을
 * 가른다.
 *
 * 우리 얘한테 사이(13회차)는 있었지만 **형용사뿐이었다** — 「조금 편해진 사이다」. 며칠짼지,
 * 언제 처음 만났는지는 몰랐다. 「우리 처음 만난 게 언제야?」에 답할 수 없었다.
 *
 * **실제 기록에서 함정을 하나 먼저 봤다.** 옛 로그를 들여온 탓에 대화 파일의 날짜가 시간순이
 * 아니었다(8월 첫 줄 뒤에 5월 줄이 섞여 있다). **첫 줄을 처음 만난 날로 잡으면 틀린다** —
 * 가장 이른 시각을 찾아야 한다.
 *
 * 그리고 **자랑하지 않는다.** 「우리 만난 지 100일이에요!」는 앱 알림이지 대화가 아니다.
 * 오늘이 그런 날이라는 것만 알려 주고 어떻게 말할지는 얘가 정한다.
 */
export interface Together {
  /** 처음 만난 때. 아무것도 없으면 null. */
  firstAt: number | null;
  /** 처음 만난 날로부터 며칠째인가 (그날이 1일째). */
  dayNumber: number;
  /** 실제로 얘기를 나눈 날이 며칠인가. */
  daysTalked: number;
}

const 날 = (at: number): string => new Date(at).toDateString();
const 자정 = (at: number): number => new Date(at).setHours(0, 0, 0, 0);

/**
 * 함께한 시간을 읽는다.
 *
 * 「며칠째」와 「며칠 얘기했나」를 **따로** 센다. 매일 만난 백일과 띄엄띄엄 만난 백일은
 * 다른 관계인데, 하나로 뭉치면 그 차이가 사라진다.
 */
export function readTogether(entries: readonly MemoryEntry[], now: number = Date.now()): Together {
  const 나눈말 = conversationOnly(entries).filter((e) => e.role === 'sensed');
  if (나눈말.length === 0) return { firstAt: null, dayNumber: 0, daysTalked: 0 };

  // **가장 이른 것**을 찾는다 — 파일 순서를 믿지 않는다.
  const firstAt = 나눈말.reduce((가장이른, e) => Math.min(가장이른, e.at), nowSafe(나눈말[0].at));
  const dayNumber = Math.floor((자정(now) - 자정(firstAt)) / 86_400_000) + 1;
  const daysTalked = new Set(나눈말.map((e) => 날(e.at))).size;

  return { firstAt, dayNumber: Math.max(1, dayNumber), daysTalked };
}

const nowSafe = (x: number): number => (Number.isFinite(x) ? x : Number.POSITIVE_INFINITY);

/** 이정표로 칠 날들. 너무 촘촘하면 매주 기념일이 된다. */
export const 이정표날: readonly number[] = [7, 30, 100, 200, 365, 500, 730, 1000];

export interface Milestone {
  /** 며칠째인가. */
  day: number;
  /** 사람이 읽는 이름. */
  says: string;
}

/**
 * 오늘이 이정표인가. 아니면 null.
 *
 * **지나간 이정표는 안 챙긴다.** 며칠 자리를 비웠다가 돌아왔는데 「사실 사흘 전이 백일이었어」
 * 하는 건 챙기는 게 아니라 계산이다.
 */
export function milestoneToday(entries: readonly MemoryEntry[], now: number = Date.now()): Milestone | null {
  const { firstAt, dayNumber } = readTogether(entries, now);
  if (firstAt === null) return null;
  if (이정표날.includes(dayNumber) === false) return null;

  const 이름: Record<number, string> = {
    7: '일주일', 30: '한 달', 100: '백일', 200: '이백일',
    365: '일 년', 500: '오백일', 730: '이 년', 1000: '천일',
  };
  return { day: dayNumber, says: 이름[dayNumber] ?? `${dayNumber}일` };
}

/**
 * 두뇌에 넘길 한 줄. **이정표인 날에만** 나온다.
 *
 * 자랑하지 말라고 못 박는다 — 축하 알림처럼 굴면 그건 앱이지 곁에 있는 것이 아니다.
 */
export function milestoneNote(entries: readonly MemoryEntry[], now: number = Date.now()): string {
  const 오늘 = milestoneToday(entries, now);
  if (오늘 === null) return '';

  const { daysTalked } = readTogether(entries, now);
  return (
    `오늘이 조수님과 만난 지 ${오늘.says}째다 (그중 ${daysTalked}일 얘기했다). ` +
    '축하 인사처럼 굴지 마라 — 알고 있다는 티만 슬쩍 내고 넘겨라. 안 어울리면 그냥 넘겨도 된다.'
  );
}

/**
 * 「우리 처음 만난 게 언제야?」에 쓸 답거리.
 *
 * 물었을 때만 쓴다 — 안 물었는데 먼저 꺼내면 그것도 자랑이다.
 */
export function firstMetNote(entries: readonly MemoryEntry[], now: number = Date.now()): string {
  const { firstAt, dayNumber, daysTalked } = readTogether(entries, now);
  if (firstAt === null) return '';
  const 날짜 = new Date(firstAt);
  return (
    `조수님과 처음 얘기한 건 ${날짜.getFullYear()}년 ${날짜.getMonth() + 1}월 ${날짜.getDate()}일이다. ` +
    `오늘이 ${dayNumber}일째고 그중 ${daysTalked}일 얘기했다.`
  );
}

/** 이 말이 처음 만난 때를 묻는 말인가. */
export function asksAboutFirstMeeting(text: string): boolean {
  const t = text.trim();
  // 「우리」 「만난」 만 보면 「너랑 얼마나 됐지」를 놓친다 — 상대를 가리키는 말도 센다.
  return /(처음|언제부터|며칠|얼마나 됐|몇 일|기념일|백일)/.test(t)
    && /(만난|봤|알게|시작|같이|우리|너랑|너하고|네|당신)/.test(t);
}
