/**
 * 박동(Pulse) — 시계만으로 결정되는 방송의 밑바탕.
 *
 * 이 감성의 원본은 트위터 봇들이다. `@3letter_` 는 10분마다 세 글자를 던지고,
 * `@big_ben_clock` 은 정각마다 BONG 을 시각 수만큼 치고, `@everyword` 는 영어 사전을
 * 7년에 걸쳐 한 단어씩 다 소진했다. 공통점은 **아무 의미 없는 것을 아주 규칙적으로** 라는 것.
 *
 * 여기서는 그걸 서버 없이 한다. 모든 박동은 **시각의 순수 함수**다 —
 * `내용 = f(방송 id, 박동 번호)`. 그래서 세 가지가 공짜로 따라온다:
 *
 *   ① 같은 순간에 접속한 사람은 **전부 같은 것**을 본다 (동기화 장치가 없는데도)
 *   ② **지난 박동**을 되감을 수 있다 (아무것도 저장 안 했는데도)
 *   ③ **다음 박동**을 미리 볼 수 있다 (정해져 있으니까)
 *
 * 방송을 하나 더 만드는 일 = `channels.ts` 에 `Channel` 하나 추가. 그게 전부다.
 */

/** 한 번의 박동이 내보내는 것. */
export interface Beat {
  /** 큰 글씨로 보이는 몸통 */
  text: string;
  /** 아래 작은 글씨 (없어도 된다) */
  sub?: string;
  /** 자간·줄이 의미를 갖는 몸통 (칸 그림·눈금 막대) — 고정폭으로, 줄바꿈 그대로 */
  mono?: boolean;
}

/** 방송 하나. */
export interface Channel {
  id: string;
  name: string;
  /** 카드 왼쪽 위 글자 그림 (이모지 1자) */
  glyph: string;
  /** 한 박동의 길이(ms) */
  period: number;
  /** 이 방송이 뭐 하는 건지 한 줄 */
  blurb: string;
  /** 이 감성의 원본이 뭐였는지 한 줄 (계보를 지운 채로 만들면 재미의 절반이 사라진다) */
  lineage: string;
  /**
   * 박동 눈금을 **이곳 시각**에 맞출지. 하루·정각처럼 사람이 체감하는 경계를 쓰는 방송은 true.
   * (기본값은 epoch 기준 = 세계 어디서나 같은 순간에 갈린다)
   */
  local?: boolean;
  /** 박동 번호 → 내용. 같은 번호면 언제 물어도 같은 답이 나와야 한다. */
  beat(tick: number): Beat;
  /** 나만의 박동 (지원하는 방송만). `@3letter_` 의 「팔로우하면 너만의 세 글자」 자리. */
  personal?(seed: string): Beat;
}

/* ── 결정적 난수 ────────────────────────────────────────────────
   저장도 통신도 없이 「모두가 같은 것을 본다」를 지탱하는 유일한 부품.
   씨앗이 같으면 어느 기계에서든 같은 수열이 나와야 하므로 Math.random 은 못 쓴다. */

/** FNV-1a — 문자열 조각들을 32비트 씨앗 하나로. */
export function seedOf(...parts: Array<string | number>): number {
  const s = parts.join(':');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — 씨앗 하나에서 0~1 수열. */
export function rngOf(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 방송 id + 박동 번호(또는 아무 조각)로 바로 난수기를 얻는 지름길. */
export function rngFor(...parts: Array<string | number>): () => number {
  return rngOf(seedOf(...parts));
}

export function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

/* ── 박동 눈금 ────────────────────────────────────────────────── */

/** 이곳 시각과 UTC 의 차이(ms). 하루 경계를 이곳 자정에 맞출 때 쓴다. */
export function localShift(when: number): number {
  return -new Date(when).getTimezoneOffset() * 60000;
}

/** 그 순간이 몇 번째 박동인지. */
export function tickOf(ch: Channel, ms: number): number {
  const shift = ch.local ? localShift(ms) : 0;
  return Math.floor((ms + shift) / ch.period);
}

/** 그 박동이 시작된 시각. */
export function tickStart(ch: Channel, tick: number): number {
  const naive = tick * ch.period;
  return ch.local ? naive - localShift(naive) : naive;
}

/** 다음 박동까지 얼마나 남았나 (0~1 = 이번 박동이 얼마나 지났나). */
export function tickProgress(ch: Channel, ms: number): number {
  const start = tickStart(ch, tickOf(ch, ms));
  return Math.min(1, Math.max(0, (ms - start) / ch.period));
}

/* ── 보여주기용 잔손질 ─────────────────────────────────────────── */

const PAD = (n: number): string => String(n).padStart(2, '0');

/** 「3분 20초」처럼 남은 시간을 사람 말로. */
export function humanLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 ${PAD(s % 60)}초`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 ${PAD(m % 60)}분`;
  return `${Math.floor(h / 24)}일 ${PAD(h % 24)}시간`;
}

/** 「08-09 14:20」 — 박동이 나온 시각. */
export function stampOf(ms: number, withDate = false): string {
  const d = new Date(ms);
  const clock = `${PAD(d.getHours())}:${PAD(d.getMinutes())}`;
  if (!withDate) return clock;
  return `${PAD(d.getMonth() + 1)}-${PAD(d.getDate())} ${clock}`;
}

/** 「YYYY-MM-DD」 */
export function dateOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${PAD(d.getMonth() + 1)}-${PAD(d.getDate())}`;
}

/** ▓▓▓▓▓░░░░░ — 눈금 막대. */
export function bar(ratio: number, width = 14): string {
  const filled = Math.round(Math.min(1, Math.max(0, ratio)) * width);
  return '▓'.repeat(filled) + '░'.repeat(width - filled);
}

export const MINUTE = 60000;
export const HOUR = 3600000;
export const DAY = 86400000;
