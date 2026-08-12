/**
 * 주사위 요트 — 굴리고, 남기고, 어디에 적을지 고른다 (TASK-KL-242)
 *
 * 커널에서 **판 중에 무작위를 뽑는 첫 게임**이다. 앞의 열 개는 시작할 때 한 번만 뽑았고,
 * 그래서 난수를 부를 때마다 새로 만들어도 아무도 안 아팠다 — 이 게임이 그 구멍을 드러냈다.
 * (커널이 판마다 난수 하나를 만들어 이어 쓰도록 고쳤다.)
 *
 * 세 번까지 굴린다. 굴릴 때마다 남길 주사위를 고르고, 마지막에 **아직 안 쓴 칸 하나**에 적는다.
 * 열두 칸을 다 채우면 끝. 위 여섯 칸 합이 63 이상이면 덤 35점(원래 규칙 그대로).
 */
import type { GameDef, BotMove, Outcome } from '../types';

export const CATS = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'choice', 'fourkind', 'fullhouse', 'sstraight', 'lstraight', 'yacht'
] as const;
export type Cat = (typeof CATS)[number];

const DICE = 5;
const ROLLS = 3;

export interface YachtState {
  /** 지금 굴려 나온 눈 다섯 */
  dice: number[];
  /** 남겨 둔 자리 (다시 안 굴린다) */
  keep: boolean[];
  /** 이번 차례에 몇 번 굴렸나 */
  rolled: number;
  turn: number;
  /** 자리별 칸 점수. null = 아직 안 씀 */
  sheet: Array<Record<Cat, number | null>>;
}

export type YachtAction = { kind: 'roll' } | { kind: 'keep'; index: number } | { kind: 'write'; cat: Cat };

const emptySheet = (): Record<Cat, number | null> =>
  Object.fromEntries(CATS.map((c) => [c, null])) as Record<Cat, number | null>;

const counts = (d: number[]): number[] => {
  const c = new Array(7).fill(0);
  for (const v of d) c[v]++;
  return c;
};

/** 이 눈들을 이 칸에 적으면 몇 점인가. 규칙이 한곳에 모여 있어야 봇과 화면이 같은 값을 본다. */
export function scoreOf(cat: Cat, d: number[]): number {
  const c = counts(d);
  const sum = d.reduce((a, b) => a + b, 0);
  switch (cat) {
    case 'ones': return c[1] * 1;
    case 'twos': return c[2] * 2;
    case 'threes': return c[3] * 3;
    case 'fours': return c[4] * 4;
    case 'fives': return c[5] * 5;
    case 'sixes': return c[6] * 6;
    case 'choice': return sum;
    case 'fourkind': return c.some((n) => n >= 4) ? sum : 0;
    case 'fullhouse': return c.some((n) => n === 3) && c.some((n) => n === 2) ? sum : 0;
    case 'sstraight': {
      const has = (a: number[]): boolean => a.every((v) => c[v] > 0);
      return has([1, 2, 3, 4]) || has([2, 3, 4, 5]) || has([3, 4, 5, 6]) ? 15 : 0;
    }
    case 'lstraight': {
      const has = (a: number[]): boolean => a.every((v) => c[v] > 0);
      return has([1, 2, 3, 4, 5]) || has([2, 3, 4, 5, 6]) ? 30 : 0;
    }
    case 'yacht': return c.some((n) => n === DICE) ? 50 : 0;
  }
}

/** 위 여섯 칸이 63 이상이면 덤 35. */
export function totalOf(sheet: Record<Cat, number | null>): number {
  const upper = (['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'] as Cat[])
    .reduce((a, c) => a + (sheet[c] ?? 0), 0);
  const rest = (['choice', 'fourkind', 'fullhouse', 'sstraight', 'lstraight', 'yacht'] as Cat[])
    .reduce((a, c) => a + (sheet[c] ?? 0), 0);
  return upper + rest + (upper >= 63 ? 35 : 0);
}

export const yacht: GameDef<YachtState, YachtAction> = {
  id: 'yacht',
  seats: [2, 4],
  rounds: 1,

  init(ctx) {
    return {
      dice: Array.from({ length: DICE }, () => Math.floor(ctx.rng() * 6) + 1),
      keep: new Array(DICE).fill(false),
      rolled: 1,
      turn: 0,
      sheet: ctx.seats.map(() => emptySheet())
    };
  },

  canAct(s, seat) {
    return s.turn === seat && s.sheet.some((sh) => CATS.some((c) => sh[c] === null));
  },

  reduce(s, a, seat, ctx) {
    if (s.turn !== seat) return s;
    const kind = a?.kind;

    if (kind === 'keep') {
      const i = a.index;
      if (typeof i !== 'number' || i < 0 || i >= DICE) return s;
      const keep = s.keep.slice();
      keep[i] = !keep[i];
      return { ...s, keep };
    }

    if (kind === 'roll') {
      if (s.rolled >= ROLLS) return s;
      const dice = s.dice.map((v, i) => (s.keep[i] ? v : Math.floor(ctx.rng() * 6) + 1));
      return { ...s, dice, rolled: s.rolled + 1 };
    }

    if (kind === 'write') {
      const cat = a.cat;
      if (!CATS.includes(cat)) return s;
      const mine = s.sheet[seat];
      if (!mine || mine[cat] !== null) return s;

      const sheet = s.sheet.map((sh, i) => (i === seat ? { ...sh, [cat]: scoreOf(cat, s.dice) } : sh));
      const next = (seat + 1) % ctx.seats.length;
      return {
        sheet,
        turn: next,
        dice: Array.from({ length: DICE }, () => Math.floor(ctx.rng() * 6) + 1),
        keep: new Array(DICE).fill(false),
        rolled: 1
      };
    }

    return s;
  },

  outcome(s, ctx): Outcome {
    if (s.sheet.some((sh) => CATS.some((c) => sh[c] === null))) return { over: false };
    const scores = s.sheet.map(totalOf);
    const top = Math.max(...scores);
    const winners = ctx.seats.filter((_, i) => scores[i] === top);
    return {
      over: true,
      scores,
      note:
        winners.length === ctx.seats.length
          ? { key: 'arcade.yacht.draw', params: { n: String(top) } }
          : { key: 'arcade.yacht.win', params: { who: winners.map((w) => w.name).join(', '), n: String(top) } }
    };
  },

  bot(s, seat): BotMove<YachtAction> | null {
    if (s.turn !== seat) return null;
    const mine = s.sheet[seat];
    if (!mine) return null;
    const open = CATS.filter((c) => mine[c] === null);
    if (!open.length) return null;

    /* 아직 굴릴 수 있으면 **제일 많은 눈만 남기고** 다시 굴린다 — 단순하지만 사람처럼 보인다. */
    if (s.rolled < ROLLS) {
      const c = counts(s.dice);
      let best = 1;
      for (let v = 2; v <= 6; v++) if (c[v] >= c[best]) best = v;
      const wrong = s.dice.map((v, i) => ({ v, i })).find(({ v, i }) => (v === best) !== s.keep[i]);
      if (wrong) return { action: { kind: 'keep', index: wrong.i }, delayMs: 250 + Math.random() * 250 };
      return { action: { kind: 'roll' }, delayMs: 500 + Math.random() * 400 };
    }

    /* 다 굴렸으면 **제일 값진 칸**에 적는다. 0점만 남으면 위 칸부터 버린다(원래 사람도 그렇게 한다). */
    let pick = open[0];
    let bestV = -1;
    for (const c of open) {
      const v = scoreOf(c, s.dice);
      if (v > bestV) { bestV = v; pick = c; }
    }
    return { action: { kind: 'write', cat: pick }, delayMs: 600 + Math.random() * 500 };
  }
};
