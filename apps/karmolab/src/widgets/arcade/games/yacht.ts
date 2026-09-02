/**
 * 주사위 요트. 굴리고, 남기고, 어디에 적을지 고른다 (TASK-KL-242)
 *
 * 커널에서 **판 중에 무작위를 뽑는 첫 게임**이다. 앞의 열 개는 시작할 때 한 번만 뽑았고,
 * 그래서 난수를 부를 때마다 새로 만들어도 아무도 안 아팠다. 이 게임이 그 구멍을 드러냈다.
 * (커널이 판마다 난수 하나를 만들어 이어 쓰도록 고쳤다.)
 *
 * 세 번까지 굴린다. 굴린 주사위는 **전부 손(남김)에 들어오고**, 다시 굴릴 것만 내린다(클럽하우스 51 과 같은
 * 손 모델. 2026-08-30 사용자 결정. 전에는 반대). 마지막에 **아직 안 쓴 칸 하나**에 적기
 * 열두 칸을 다 채우면 끝. 위 여섯 칸 합이 63 이상이면 덤 35점(원래 규칙 그대로).
 */
import type { GameDef, BotMove, Outcome } from '../types';
import { decide, clampLevel, type Level } from './yacht-engine';
import { castByName } from '../cast';

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
  /** 이 판의 차례 제한(초). 0이면 친선 무제한 */
  limit: number;
  /** 현재 차례의 마감 시각. 제한이 없거나 판이 끝났으면 -1 */
  turnEndsAt: number;
  /** 시간을 넘겨 점수표가 0으로 닫힌 자리 */
  forfeited: boolean[];
  /** 가장 최근에 시간을 넘긴 자리. 없으면 -1 */
  timedOut: number;
}

export type YachtAction = { kind: 'roll' } | { kind: 'keep'; index: number } | { kind: 'write'; cat: Cat };

const emptySheet = (): Record<Cat, number | null> =>
  Object.fromEntries(CATS.map((c) => [c, null])) as Record<Cat, number | null>;

const limitOf = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const hasOpen = (sheet: Record<Cat, number | null> | undefined): boolean =>
  !!sheet && CATS.some((cat) => sheet[cat] === null);

const nextSeat = (sheets: YachtState['sheet'], forfeited: boolean[], seat: number): number => {
  let next = seat;
  for (let i = 0; i < sheets.length; i += 1) {
    next = (next + 1) % sheets.length;
    if (!forfeited[next] && hasOpen(sheets[next])) return next;
  }
  return seat;
};

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

/** 자리의 사람이 단계를 정한다. 오목과 같은 대응(1~2 링, 3~4 알리사, 5 욘). 사람이 아니면 시작 옵션 */
export function levelOf(seatName: string, ai: unknown): Level {
  const c = castByName(seatName);
  if (c?.slug === 'yawn') return 5;
  if (c?.slug === 'alisa') return 4;
  if (c?.slug === 'ling') return 2;
  return clampLevel(ai);
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
    const limit = limitOf(ctx.opts.limit);
    return {
      dice: Array.from({ length: DICE }, () => Math.floor(ctx.rng() * 6) + 1),
      keep: new Array(DICE).fill(true),
      rolled: 1,
      turn: 0,
      sheet: ctx.seats.map(() => emptySheet()),
      limit,
      turnEndsAt: limit ? ctx.now + limit * 1000 : -1,
      forfeited: ctx.seats.map(() => false),
      timedOut: -1
    };
  },

  clocked: true,
  tick(s, ctx) {
    if (!s.limit || ctx.now < s.turnEndsAt) return s;
    const forfeited = s.forfeited.map((value, seat) => seat === s.turn ? true : value);
    const sheet = s.sheet.map((current, seat) => seat === s.turn
      ? Object.fromEntries(CATS.map((cat) => [cat, current[cat] ?? 0])) as Record<Cat, number | null>
      : current);
    const turn = nextSeat(sheet, forfeited, s.turn);
    return {
      ...s,
      sheet,
      forfeited,
      timedOut: s.turn,
      turn,
      dice: Array.from({ length: DICE }, () => Math.floor(ctx.rng() * 6) + 1),
      keep: new Array(DICE).fill(true),
      rolled: 1,
      turnEndsAt: turn === s.turn ? -1 : ctx.now + s.limit * 1000
    };
  },

  canAct(s, seat) {
    const mine = s.sheet[seat];
    /* 내 열두 칸이 다 차면 내 판은 끝. 남의 빈 칸은 내 차례의 근거가 아니다 */
    return s.turn === seat && !s.forfeited[seat] && hasOpen(mine);
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
      /* 굴린 것도 손에 들어온다. 다음에 다시 굴릴 것은 다시 내려야 한다 */
      return { ...s, dice, keep: new Array(DICE).fill(true), rolled: s.rolled + 1 };
    }

    if (kind === 'write') {
      const cat = a.cat;
      if (!CATS.includes(cat)) return s;
      const mine = s.sheet[seat];
      if (!mine || mine[cat] !== null) return s;

      const sheet = s.sheet.map((sh, i) => (i === seat ? { ...sh, [cat]: scoreOf(cat, s.dice) } : sh));
      /* 다 적은 자리는 건너뛴다. 안 건너뛰면 그 자리에서 차례가 멈춰 판이 안 끝난다(2026-08-31 실측:
         두 판째에 한 칸이 남은 채 세 자리가 굴리기만 반복했다) */
      const next = nextSeat(sheet, s.forfeited, seat);
      return {
        ...s,
        sheet,
        turn: next,
        dice: Array.from({ length: DICE }, () => Math.floor(ctx.rng() * 6) + 1),
        keep: new Array(DICE).fill(true),
        rolled: 1,
        turnEndsAt: next === seat ? -1 : (s.limit ? ctx.now + s.limit * 1000 : -1)
      };
    }

    return s;
  },

  outcome(s, ctx): Outcome {
    const active = s.forfeited.filter((value) => !value).length;
    if (active > 1 && s.sheet.some((sh, seat) => !s.forfeited[seat] && hasOpen(sh))) return { over: false };
    const scores = s.sheet.map((sheet, seat) => s.forfeited[seat] ? -1 : totalOf(sheet));
    const top = Math.max(...scores);
    const winners = ctx.seats.filter((_, i) => scores[i] === top);
    return {
      over: true,
      scores,
      note:
        s.timedOut >= 0 && active <= 1
          ? { key: 'arcade.yacht.timeout', params: { who: ctx.seats[s.timedOut]?.name ?? '' } }
          : winners.length === ctx.seats.length
          ? { key: 'arcade.yacht.draw', params: { n: String(top) } }
          : { key: 'arcade.yacht.win', params: { who: winners.map((w) => w.name).join(', '), n: String(top) } }
    };
  },

  bot(s, seat, ctx): BotMove<YachtAction> | null {
    if (s.turn !== seat) return null;
    const mine = s.sheet[seat];
    if (!mine) return null;
    const open = CATS.filter((c) => mine[c] === null);
    if (!open.length) return null;

    /* 머리는 `yacht-engine.ts`. 단계는 자리에 앉은 사람이 정한다(링 2, 알리사 4, 욘 5). 사람이 아니면 시작 옵션 */
    const d = decide(s.dice, mine, ROLLS - s.rolled, levelOf(ctx.seats[seat]?.name ?? '', ctx.opts.ai), ctx.rng);
    if (d.write) return { action: { kind: 'write', cat: d.write }, delayMs: 600 + ctx.rng() * 500 };
    /* 남길 것을 하나씩 맞춘다. 사람이 하나씩 내리는 것처럼 보인다 */
    const wrong = s.keep.findIndex((k, i) => k !== d.keep[i]);
    if (wrong >= 0) return { action: { kind: 'keep', index: wrong }, delayMs: 250 + ctx.rng() * 250 };
    return { action: { kind: 'roll' }, delayMs: 500 + ctx.rng() * 400 };
  }
};
