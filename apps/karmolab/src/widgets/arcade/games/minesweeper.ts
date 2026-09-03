/**
 * 지뢰 찾기 경주. 같은 밭을 놓고 누가 먼저 (TASK-KL-242)
 *
 * 조각 맞추기와 같은 수법: **혼자 하던 놀이를 같은 씨앗으로 나눠 주면 경주가 된다.**
 * 다만 이쪽은 먼저 끝내기가 아니라 **밟으면 죽는다**. 빠르기와 조심이 서로 반대라
 * 서두를수록 위험하다. 그 긴장이 혼자 할 때보다 여럿일 때 훨씬 크다.
 *
 * 밟으면 그 사람만 끝난다(남의 판은 그대로). 다 죽으면 그때까지 많이 연 사람이 이긴다.
 * 첫 수는 절대 지뢰가 아니다. 처음 누른 자리에서 밟고 끝나면 그건 놀이가 아니라 사고다.
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';

/* 기본 초급 9x9 지뢰 10. 시작 화면에서 중급 16x16 지뢰 40 을 고를 수 있음 (Windows 와 minesweeper.online 의 단계, 레퍼런스 2026-09-03) */
export const W = 9;
export const H = 9;
const MINES = 10;
const LIMIT_MS = 180000;
export const boardOf = (opts: { size?: number | boolean }): { w: number; h: number; mines: number; limit: number } =>
  Number(opts.size) === 16 ? { w: 16, h: 16, mines: 40, limit: 300000 } : { w: W, h: H, mines: MINES, limit: LIMIT_MS };

export interface SweepState {
  /** 판 크기와 지뢰 수 */
  w: number;
  h: number;
  mineCount: number;
  /** 자리별 판. 0 안 열림, 1 열림, 2 깃발 */
  seen: number[][];
  /** 지뢰 자리 (모두 같다). **`redact` 가 지운다** */
  mines: number[];
  /**
   * 칸마다 둘레 지뢰 수. 지뢰를 지우면 손님은 숫자를 못 그리므로 **숫자를 따로 보낸다** . 
   * 단 `redact` 가 **그 사람이 연 칸만** 남긴다(다 보내면 지뢰 자리를 되짚을 수 있다).
   */
  nums: number[];
  /** 자리별로 죽었나 */
  dead: boolean[];
  /** 방금 밟은 사람. 여럿이 동시에 파는 놀이라 매 칸마다 울리면 시끄럽다. 밟은 순간만 나른다. */
  boom?: number;
  /** 자리별 연 칸 수 */
  opened: number[];
  /** 자리별 누른 수. 열기와 깃발 둘 다. 효율은 3BV / 클릭 (minesweeper.online 의 잣대, 2026-09-03) */
  clicks: number[];
  /** 이 밭의 3BV. 빈 칸 덩어리 하나에 1, 덩어리에 안 붙은 숫자 칸마다 1 */
  bv3: number;
  endsAt: number;
  over: boolean;
}

export type SweepAction = { cell: number; flag?: boolean };

/** 3BV. 밭을 다 여는 데 필요한 최소 클릭 수. 순위 사이트가 판 난이도로 쓰는 값 */
export function bv3Of(mines: number[], w = W, h = H): number {
  const nums = mines.map((_, i) => around(mines, i, w, h));
  const seen = new Array(w * h).fill(false);
  let n = 0;
  for (let c = 0; c < w * h; c += 1) {
    if (mines[c] || nums[c] !== 0 || seen[c]) continue;
    /* 빈 칸 덩어리 하나. 둘레 숫자까지 같이 열림 */
    n += 1;
    const stack = [c];
    seen[c] = true;
    while (stack.length) {
      const k = stack.pop() as number;
      for (const nb of nbrs(k, w, h)) {
        if (mines[nb] || seen[nb]) continue;
        seen[nb] = true;
        if (nums[nb] === 0) stack.push(nb);
      }
    }
  }
  for (let c = 0; c < w * h; c += 1) if (!mines[c] && !seen[c]) n += 1;
  return n;
}

const nbrs = (c: number, w = W, h = H): number[] => {
  const x = c % w;
  const y = Math.floor(c / w);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx);
    }
  }
  return out;
};

/** 그 칸 둘레의 지뢰 수. 화면과 봇이 같은 값을 봐야 하므로 여기 둔다. */
export function around(mines: number[], c: number, w = W, h = H): number {
  return nbrs(c, w, h).filter((n) => mines[n]).length;
}

/** 빈 칸이면 이어서 펼친다. 한 칸씩 누르게 하면 지뢰밭이 노동이 된다. */
function flood(mines: number[], seen: number[], start: number, w: number, h: number): { seen: number[]; opened: number } {
  const out = seen.slice();
  const stack = [start];
  let opened = 0;
  while (stack.length) {
    const c = stack.pop() as number;
    if (out[c] === 1) continue;
    out[c] = 1;
    opened++;
    if (around(mines, c, w, h) === 0) for (const n of nbrs(c, w, h)) if (out[n] !== 1) stack.push(n);
  }
  return { seen: out, opened };
}

export const minesweeper: GameDef<SweepState, SweepAction> = {
  id: 'minesweeper',
  seats: [1, 4],
  rounds: 1,
  realtime: true,

  init(ctx: GameCtx) {
    const b = boardOf(ctx.opts);
    const mines = new Array(b.w * b.h).fill(0);
    let placed = 0;
    while (placed < b.mines) {
      const c = Math.floor(ctx.rng() * b.w * b.h);
      if (!mines[c]) { mines[c] = 1; placed++; }
    }
    return {
      w: b.w,
      h: b.h,
      mineCount: b.mines,
      seen: ctx.seats.map(() => new Array(b.w * b.h).fill(0)),
      mines,
      nums: mines.map((_, i) => around(mines, i, b.w, b.h)),
      dead: ctx.seats.map(() => false),
      opened: ctx.seats.map(() => 0),
      clicks: ctx.seats.map(() => 0),
      bv3: bv3Of(mines, b.w, b.h),
      endsAt: ctx.now + b.limit,
      over: false
    };
  },

  /** 지뢰 자리는 아무에게도 안 보낸다. 보내면 개발자 도구로 판이 다 보인다. */
  redact(s, seat) {
    const mine = s.seen[seat] ?? [];
    return {
      ...s,
      mines: s.mines.map(() => 0),
      nums: s.nums.map((v, i) => (mine[i] === 1 ? v : -1))
    };
  },

  canAct(s, seat) {
    return !s.over && !s.dead[seat];
  },

  reduce(s, a, seat, ctx) {
    if (s.over || s.dead[seat]) return s;
    const c = a?.cell;
    if (typeof c !== 'number' || c < 0 || c >= s.w * s.h) return s;
    const mine = s.seen[seat];
    if (!mine) return s;

    if (a.flag) {
      if (mine[c] === 1) return s;
      const seen = s.seen.map((row, i) => (i === seat ? row.map((v, k) => (k === c ? (v === 2 ? 0 : 2) : v)) : row));
      return { ...s, seen, clicks: s.clicks.map((v, i) => (i === seat ? v + 1 : v)) };
    }

    if (mine[c] !== 0) return s;

    /* 첫 수는 절대 지뢰가 아니다. 지뢰였으면 **다른 빈 칸으로 옮긴다**. 판 전체를 다시 짜면
       여럿이 서로 다른 밭을 보게 된다(같은 씨앗이라는 약속이 깨진다). */
    let mines = s.mines;
    if (s.opened[seat] === 0 && mines[c]) {
      const free = mines.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0 && i !== c);
      if (free.length) {
        mines = mines.slice();
        mines[c] = 0;
        /* 옮길 자리는 씨앗 난수로. 첫 빈 칸(인덱스 0 쪽)에 몰면 좌상단 밀도가 오름 */
        mines[free[Math.floor(ctx.rng() * free.length)]] = 1;
      }
    }
    const nums = mines === s.mines ? s.nums : mines.map((_, i) => around(mines, i, s.w, s.h));
    const bv3 = mines === s.mines ? s.bv3 : bv3Of(mines, s.w, s.h);
    const clicks = s.clicks.map((v, i) => (i === seat ? v + 1 : v));

    if (mines[c]) {
      const dead = s.dead.map((v, i) => (i === seat ? true : v));
      const seen = s.seen.map((row, i) => (i === seat ? row.map((v, k) => (k === c ? 1 : v)) : row));
      return { ...s, mines, nums, bv3, clicks, dead, seen, boom: seat, over: dead.every(Boolean) };
    }

    const r = flood(mines, mine, c, s.w, s.h);
    const seen = s.seen.map((row, i) => (i === seat ? r.seen : row));
    const opened = s.opened.map((v, i) => (i === seat ? v + r.opened : v));
    /* 지뢰 뺀 칸을 다 열었으면 그 사람 승. 판이 끝난다. */
    const cleared = opened[seat] >= s.w * s.h - s.mineCount;
    return { ...s, mines, nums, bv3, clicks, seen, opened, over: cleared };
  },

  tick(s, ctx) {
    if (s.over || ctx.now < s.endsAt) return s;
    return { ...s, over: true };
  },

  outcome(s, ctx): Outcome {
    if (!s.over) {
      /* 판이 안 끝나도 밟았다는 나른다. 이 놀이에서 사람이 제일 크게 느끼는 순간이다.
         뭉칠 걱정은 없다: 한 사람은 한 번만 밟는다(밟으면 그 사람 판은 끝난다). */
      if (s.boom === undefined) return { over: false };
      return {
        over: false,
        note: { key: 'arcade.mine.boom', params: { who: ctx.seats[s.boom]?.name ?? '' }, sound: 'bad' }
      };
    }
    const top = Math.max(...s.opened);
    const winners = ctx.seats.filter((_, i) => s.opened[i] === top);
    return {
      over: true,
      scores: s.opened,
      note: { key: 'arcade.mine.win', params: { who: winners.map((w) => w.name).join(', '), n: String(top) } }
    };
  },

  bot(s, seat, ctx): BotMove<SweepAction> | null {
    if (s.over || s.dead[seat]) return null;
    const mine = s.seen[seat];
    if (!mine) return null;
    const closed = mine.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
    if (!closed.length) return null;

    /* 봇도 지뢰 자리를 안 본다. 열린 칸의 숫자만 보고 안전한 칸을 찾는다.
       못 찾으면 아무 데나 눌러 죽기도 한다(사람과 같은 조건). */
    for (const c of mine.map((v, i) => (v === 1 ? i : -1)).filter((i) => i >= 0)) {
      const n = s.nums[c];
      if (n !== 0) continue;
      const shut = nbrs(c, s.w, s.h).filter((k) => mine[k] === 0);
      if (shut.length) return { action: { cell: shut[0] }, delayMs: 400 + ctx.rng() * 400 };
    }
    const pick = closed[Math.floor(ctx.rng() * closed.length)];
    return { action: { cell: pick }, delayMs: 500 + ctx.rng() * 600 };
  }
};
