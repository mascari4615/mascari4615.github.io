/**
 * 박동(Pulse) — 시계만으로 결정되는 방송의 밑바탕.
 *
 * 이 감성의 원본은 트위터 봇들이다. `@3letter_` 는 10분마다 세 글자를 던지고,
 * `@big_ben_clock` 은 정각마다 BONG 을 시각 수만큼 치고, `@everyword` 는 영어 사전을
 * 7년에 걸쳐 한 단어씩 다 소진했다. 공통점은 **아무 의미 없는 것을 아주 규칙적으로** 라는 것.
 *
 * 여기서는 그걸 서버 없이 한다. 모든 박동은 **시각의 순수 함수**다 —
 * `내용 = f(방송 id, 박동 번호)`. 그래서 둘이 공짜로 따라온다:
 *
 *   ① 같은 순간에 접속한 사람은 **전부 같은 것**을 본다 (동기화 장치가 없는데도)
 *   ② **지난 박동**을 되감을 수 있다 (아무것도 저장 안 했는데도)
 *
 * 다음 박동도 계산할 수 있지만 **절대 안 보여준다.** 이 갈래의 알맹이는 기다림이다 —
 * 다음에 뭐가 올지 알면 볼 이유가 사라진다. 계산이 되는 것과 보여 주는 것은 다른 문제다.
 * (한 번 미리보기를 달았다가 걷어냈다. 감성이 죽는다 — 사용자 지적, 2026-08-09)
 *
 * 방송을 하나 더 만드는 일 = `channels.ts` 에 `Channel` 하나 추가. 그게 전부다.
 */
import { t } from '../../lib/i18n';

/** 화면이 쥐여 주는 색. 방송이 제 색을 박으면 밝은 테마에서 안 보인다. */
export interface Ink {
  bg: string;
  fg: string;
  dim: string;
  accent: string;
}

/**
 * 카드 얼굴을 직접 그리는 붓.
 * 이 갈래의 알짜(별밭·어항·뜰·나방·지도)는 전부 **그림**이다 — 글자로는 흉내가 안 난다.
 * 순수 함수여야 한다: 같은 `rand` 수열이면 같은 그림. (그래야 되감기가 성립한다)
 */
export type Paint = (
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  rand: () => number,
  ink: Ink
) => void;

/** 한 번의 박동이 내보내는 것. */
export interface Beat {
  /** 한 줄 요약 — 타임라인·되감기·미리보기가 쓴다. 그림 방송도 반드시 있어야 한다. */
  line: string;
  /** 아래 작은 글씨 (없어도 된다) */
  sub?: string;
  /** 자간·줄이 의미를 갖는 몸통 (눈금 막대) — 고정폭으로, 줄바꿈 그대로 */
  mono?: boolean;
  /**
   * 이 박동이 **사건**일 때 붙는 한마디 (「진짜 단어다」).
   * 뜻 없는 글자가 계속 흐르다가 우연히 진짜 낱말이 되는 순간이 이 갈래의 전부다 —
   * 표식이 없으면 그 순간이 그냥 지나가고, 공유할 거리도 사라진다.
   */
  mark?: string;
  /** 있으면 카드 얼굴을 이걸로 그린다. 없으면 `line` 을 큰 활자로. */
  paint?: Paint;
  /**
   * 있으면 이 박동은 **소리로 온다**. 종의 「BONG」은 글자로 적으면 아무 뜻도 없다 —
   * 소리가 본체고 글자는 자막이다.
   */
  sound?: (ac: AudioContext, at: number) => void;
}

/** 벤토 격자에서 이 방송이 차지하는 칸. 그림은 넓게, 신호는 좁게. */
export type Tile = 'wide' | 'tall' | 'big' | 'unit';

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
  /** 벤토에서의 크기 (기본 `unit`) */
  tile?: Tile;
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
  if (s < 60) return t('pulse.left.s', { s });
  const m = Math.floor(s / 60);
  if (m < 60) return t('pulse.left.ms', { m, s: PAD(s % 60) });
  const h = Math.floor(m / 60);
  if (h < 24) return t('pulse.left.hm', { h, m: PAD(m % 60) });
  return t('pulse.left.dh', { d: Math.floor(h / 24), h: PAD(h % 24) });
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

export const MINUTE = 60000;
export const HOUR = 3600000;
export const DAY = 86400000;
