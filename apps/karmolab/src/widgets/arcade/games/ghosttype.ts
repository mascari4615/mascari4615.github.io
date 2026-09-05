/**
 * 유령 타자 대결. 같은 글을 나란히 친다 (change.arcade-absorbs-play 단계 3)
 *
 * 놀이터의 유령 타자를 오락실 판으로. 글은 첫 수 `load` 가 싣고(주인이 고른 글 하나), 모두가 같은 글을
 * 친다. 자리마다 앞에서부터 맞게 친 글자 수가 곧 달린 거리. 다 치면 그 자리는 끝. 점수는 타수(분당 타건).
 * 옛 놀이의 유령(앞선 기록의 재생)은 오락실의 어제의 나 자리가 맡음. 최고 기록의 수를 시각대로 다시 두므로
 * 유령이 옆 줄에서 같이 달림
 *
 * 한글 타수는 자소 단위. 된소리는 시프트 조합이라 한 번
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';

export interface GtState {
  text: string;
  /** 글 전체의 타건 수. 타수 셈의 분자 */
  strokes: number;
  startedAt: number;
  /** 이 시각을 넘기면 못 친 자리도 끝 */
  endsAt: number;
  /** 자리별 앞에서부터 맞게 친 글자 수 */
  progress: number[];
  /** 자리별 다 친 시각. 아직이면 -1 */
  doneAt: number[];
}
export type GtAction = { kind: 'load'; text: string } | { kind: 'type'; n: number };

export const MAX_TEXT = 240;
export const MIN_TEXT = 10;
/** 첫 사람이 다 친 뒤 나머지에게 주는 시간 */
const GRACE_MS = 20000;
/** 아무도 못 치면 여기서 끝 */
const LIMIT_MS = 180000;

const compoundVowel: Record<string, number> = { ㅘ: 2, ㅙ: 3, ㅚ: 2, ㅝ: 2, ㅞ: 3, ㅟ: 2, ㅢ: 2 };
const compoundFinal: Record<string, number> = { ㄳ: 2, ㄵ: 2, ㄶ: 2, ㄺ: 2, ㄻ: 2, ㄼ: 2, ㄽ: 2, ㄾ: 2, ㄿ: 2, ㅄ: 2 };
const medialTable = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const finalTable = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';

/** 그 글을 치려면 몇 번 눌러야 하는가 */
export function keystrokes(s: string): number {
  let n = 0;
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const i = code - 0xac00;
      const medialJamo = medialTable[Math.floor(i / 28) % 21];
      const finalJamo = finalTable[i % 28];
      n += 1;
      n += compoundVowel[medialJamo] || 1;
      if (finalJamo !== ' ') n += compoundFinal[finalJamo] || 1;
    } else {
      n += 1;
    }
  }
  return n;
}

/** 앞에서부터 n 글자를 치는 데 든 타건 수 나누기 걸린 시간. 분당 */
export function cpmOf(text: string, chars: number, ms: number): number {
  if (ms <= 0) return 0;
  return Math.round((keystrokes(text.slice(0, chars)) / ms) * 60000);
}

export const ghosttype: GameDef<GtState, GtAction> = {
  id: 'ghosttype',
  seats: [1, 4],
  rounds: 1,
  realtime: true,

  init(ctx: GameCtx): GtState {
    return { text: '', strokes: 0, startedAt: -1, endsAt: ctx.now + LIMIT_MS, progress: ctx.seats.map(() => 0), doneAt: ctx.seats.map(() => -1) };
  },

  canAct(s, seat) {
    if (!s.text) return seat === 0;
    return s.doneAt[seat] < 0;
  },

  reduce(s, a, seat, ctx) {
    if (!a || typeof a !== 'object') return s;
    if (!s.text) {
      if (seat !== 0 || a.kind !== 'load' || typeof a.text !== 'string') return s;
      const text = a.text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
      if (text.length < MIN_TEXT) return s;
      return { ...s, text, strokes: keystrokes(text), startedAt: ctx.now, endsAt: ctx.now + LIMIT_MS };
    }
    if (a.kind !== 'type' || !Number.isInteger(a.n)) return s;
    if (seat < 0 || seat >= s.progress.length || s.doneAt[seat] >= 0) return s;
    if (ctx.now >= s.endsAt) return s;
    const n = Math.max(s.progress[seat], Math.min(s.text.length, a.n));
    if (n === s.progress[seat]) return s;
    const progress = s.progress.slice();
    progress[seat] = n;
    const doneAt = s.doneAt.slice();
    let endsAt = s.endsAt;
    if (n >= s.text.length) {
      doneAt[seat] = ctx.now;
      /* 첫 사람이 다 치면 나머지는 잠깐만 더 */
      if (s.doneAt.every((d) => d < 0)) endsAt = Math.min(endsAt, ctx.now + GRACE_MS);
    }
    return { ...s, progress, doneAt, endsAt };
  },

  tick(s) {
    return s;
  },

  outcome(s, ctx): Outcome {
    if (!s.text) return { over: false };
    const all = s.doneAt.every((d) => d >= 0);
    if (!all && ctx.now < s.endsAt) return { over: false };
    /* 점수는 타수. 못 다 친 자리는 친 데까지의 타수 */
    const scores = s.progress.map((p, i) => cpmOf(s.text, p, (s.doneAt[i] >= 0 ? s.doneAt[i] : ctx.now) - s.startedAt));
    const top = Math.max(...scores);
    const who = scores.indexOf(top);
    return { over: true, scores, note: { key: 'arcade.ghosttype.note', params: { who: ctx.seats[who]?.name ?? '', cpm: String(top) }, sound: 'win' } };
  },

  /** 봇은 분당 180~420 타건쯤. 글자마다 걸리는 시간을 씨앗으로 정하고 그 시각이 되면 한 글자 */
  bot(s, seat, ctx): BotMove<GtAction> | null {
    if (!s.text) {
      if (seat !== 0) return null;
      return { action: { kind: 'load', text: 'the quick brown fox jumps over the lazy dog and keeps running' }, delayMs: 200 };
    }
    if (s.doneAt[seat] >= 0) return null;
    const done = s.progress[seat];
    if (done >= s.text.length) return null;
    /* 손 빠르기는 씨앗에서. 자리 번호로 버릇을 정하지 않음 (test:arcade 규칙) */
    const perStroke = 140 + ctx.rng() * 200;
    const wait = keystrokes(s.text[done]) * perStroke;
    return { action: { kind: 'type', n: done + 1 }, delayMs: wait };
  }
};
