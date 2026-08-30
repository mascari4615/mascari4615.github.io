/**
 * 오목. 차례가 있는 보드 (TASK-KL-242)
 *
 * 반응 측정이 동시, 짧게, 여럿이라면 이쪽은 차례, 길게, 둘이다. 커널 하나가 이 둘을 다
 * 담으면 나머지 49개는 그 사이 어딘가다. 그래서 첫 사이클의 게임 둘은 일부러 정반대로 골랐다.
 *
 * **판 크기와 규칙은 시작할 때 고른다** (`ctx.opts`). 15줄이 오목의 표준이고, 19줄은 바둑판
 * 그대로이며, 9줄은 한 판이 짧다. 고른 값은 상태에 옮겨 적는다. 그래야 화면과 다시보기가
 * 판을 다시 그릴 때 그 값을 어디서 또 찾아오지 않아도 됨
 *
 * 렌주(금수)를 켜면 흑만 세 가지를 못 둔다: 삼삼, 사사, 장목. 흑이 먼저 두는 게임이라
 * 금수가 없으면 흑이 유리하다는 것이 오목의 오래된 결론. 표준 대회 규칙이 이 셋
 * 금수는 **둘 수 없게 막는다**(둔 순간 패배로 하지 않는다). 규칙을 외우지 않은 사람이
 * 영문도 모르고 지는 것보다, 그 자리가 안 눌리는 편이 배우기 쉬움
 */
import { bestOf } from '../pick-best';
import type { GameDef, BotMove, GameOpts } from '../types';
import { think, LEVELS, type Level } from './gomoku-engine';

export interface GomokuState {
  /** 0 = 빈 칸, 1 = 첫째 자리, 2 = 둘째 자리 */
  board: number[];
  /** 한 줄에 몇 점인가 (9, 15, 19). 화면이 이 값으로 격자를 그린다 */
  n: number;
  /** 렌주 금수를 보나 (흑 삼삼, 사사, 장목 금지) */
  renju: boolean;
  turn: number;
  /** 이긴 자리 (없으면 -1), 판이 다 차면 -2 */
  won: number;
  /** 마지막에 둔 칸 (화면이 표시한다) */
  last: number;
  /** 흑이 지금 못 두는 자리. 화면이 표시하고 봇이 피한다. 렌주가 꺼져 있으면 빈 배열 */
  banned: number[];
  /** 수당 제한시간(초). 0 이면 없음. 시작할 때 고른다 */
  limit: number;
  /** 이번 차례가 끝나는 커널 시각(ms). 제한이 없으면 -1 */
  turnEndsAt: number;
  /** 시간을 넘겨 진 자리. 없으면 -1 */
  timedOut: number;
}

export type GomokuAction = { cell: number };

/** 고를 수 있는 판. 9 = 짧은 판, 15 = 오목 표준, 19 = 바둑판 그대로 */
export const SIZES = [9, 15, 19] as const;
export type Size = (typeof SIZES)[number];
export const DEFAULT_SIZE: Size = 15;

/** 예전 화면이 `N` 하나만 알던 시절의 이름. 새 코드는 상태의 `n` 을 본다 */
export const N = DEFAULT_SIZE;
const NEED = 5;
const DIRS: Array<[number, number]> = [[1, 0], [0, 1], [1, 1], [1, -1]];

/** 고른 값 읽기. 모르는 값이 오면 표준으로 되돌린다 (그물망 너머에서 아무 값이나 온다) */
/** 봇 단계. 기본 3(학도). 1 은 둘레 아무 데나, 5 는 여섯 수 앞과 VCF */
export const DEFAULT_LEVEL: Level = 3;
export function levelOf(opts: GameOpts): Level {
  const v = Number(opts.ai);
  return (LEVELS as readonly number[]).indexOf(v) >= 0 ? (v as Level) : DEFAULT_LEVEL;
}

/** 수당 제한시간. 없음이 기본. 혼자 노는 판에서 시계가 재촉하면 놀이가 아니라 시험이다 */
export const LIMITS = [0, 30, 60, 120] as const;
export function limitOf(opts: GameOpts): number {
  const v = Number(opts.limit);
  return (LIMITS as readonly number[]).indexOf(v) >= 0 ? v : 0;
}

export function sizeOf(opts: GameOpts): Size {
  const v = Number(opts.size);
  return (SIZES as readonly number[]).indexOf(v) >= 0 ? (v as Size) : DEFAULT_SIZE;
}

/**
 * 화점. 판마다 자리가 다름
 *
 * 9줄은 3선에 네 귀와 천원, 15줄은 4선에 네 귀와 천원. 19줄은 바둑판 그대로라 변에도 넷을
 * 더해 아홉이다. 손으로 열아홉 줄을 적어 두면 판을 하나 더 넣는 날 그 표가 어긋남
 */
export function starPoints(n: number): number[] {
  const edge = n <= 9 ? 2 : 3;
  const mid = (n - 1) / 2;
  const lines = [edge, n - 1 - edge];
  const out: number[] = [];
  for (const y of lines) for (const x of lines) out.push(y * n + x);
  if (!Number.isInteger(mid)) return out;
  out.push(mid * n + mid);
  /* 변의 넷은 바둑판에만 있다. 15줄 오목판에 찍으면 낯선 판이 된다 */
  if (n >= 19) for (const v of lines) out.push(v * n + mid, mid * n + v);
  return out;
}

function at(b: number[], n: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= n || y >= n) return -1;
  return b[y * n + x];
}

/** 이 방향으로 이어진 내 돌 수 (놓은 칸 포함). */
function runLen(b: number[], n: number, cell: number, who: number, dx: number, dy: number): number {
  const x = cell % n;
  const y = Math.floor(cell / n);
  let total = 1;
  for (const sgn of [1, -1]) {
    for (let k = 1; ; k++) {
      if (at(b, n, x + dx * k * sgn, y + dy * k * sgn) !== who) break;
      total += 1;
    }
  }
  return total;
}

/**
 * 이 칸에 두었을 때 이겼나.
 *
 * 렌주에서 **흑은 정확히 다섯**. 여섯 이상은 장목이라 금수. 백은 여섯도 이김
 * 렌주를 껐으면 둘 다 다섯 이상이면 이김
 */
function wins(b: number[], n: number, cell: number, who: number, renju: boolean): boolean {
  const exact = renju && who === 1;
  for (const [dx, dy] of DIRS) {
    const len = runLen(b, n, cell, who, dx, dy);
    if (exact ? len === NEED : len >= NEED) return true;
  }
  return false;
}

/** 한 방향에서 이 수가 만든 줄의 길이와 양 끝이 열렸나. */
function shape(b: number[], n: number, cell: number, who: number, dx: number, dy: number): { len: number; open: number } {
  const x = cell % n;
  const y = Math.floor(cell / n);
  let len = 1;
  let open = 0;
  for (const sgn of [1, -1]) {
    let k = 1;
    for (; ; k++) {
      if (at(b, n, x + dx * k * sgn, y + dy * k * sgn) !== who) break;
      len += 1;
    }
    if (at(b, n, x + dx * k * sgn, y + dy * k * sgn) === 0) open += 1;
  }
  return { len, open };
}

/**
 * 렌주 금수인가. **흑만** 봄
 *
 * 셋 중 하나면 금수다: 장목(여섯 이상), 사사(이 수로 사가 둘 이상), 삼삼(열린 삼이 둘 이상).
 * 다만 **이 수로 정확히 다섯이면 이긴 수라 금수 아님**. 이기는 수가 금수면 게임이 안 끝남
 *
 * 정식 렌주의 되돌이 판정(금수점으로 만든 삼은 삼이 아니다)까지는 안 본다. 한 수 앞만 보는
 * 판정이고, 실제로 갈리는 자리는 드물다. 이 한계는 `README` 가 아니라 여기 적어 둠
 */
function bannedFor(b: number[], n: number, cell: number, renju: boolean): boolean {
  if (!renju) return false;
  const who = 1;
  const next = b.slice();
  next[cell] = who;

  let five = false;
  let over = false;
  let fours = 0;
  let openThrees = 0;

  for (const [dx, dy] of DIRS) {
    const len = runLen(next, n, cell, who, dx, dy);
    if (len === NEED) five = true;
    if (len > NEED) over = true;
  }
  if (five) return false;
  if (over) return true;

  for (const [dx, dy] of DIRS) {
    if (makesFour(next, n, cell, dx, dy)) fours += 1;
    else if (makesOpenThree(next, n, cell, dx, dy)) openThrees += 1;
  }
  return fours >= 2 || openThrees >= 2;
}

/** 이 방향에서 사인가. 빈 칸 하나만 더 채우면 정확히 다섯이 된다. */
function makesFour(b: number[], n: number, cell: number, dx: number, dy: number): boolean {
  for (const e of gaps(b, n, cell, dx, dy)) {
    const t = b.slice();
    t[e] = 1;
    if (runLen(t, n, e, 1, dx, dy) === NEED) return true;
  }
  return false;
}

/** 이 방향에서 열린 삼인가. 빈 칸 하나를 채우면 양쪽이 열린 사가 된다. */
function makesOpenThree(b: number[], n: number, cell: number, dx: number, dy: number): boolean {
  for (const e of gaps(b, n, cell, dx, dy)) {
    const t = b.slice();
    t[e] = 1;
    const sh = shape(t, n, e, 1, dx, dy);
    if (sh.len === NEED - 1 && sh.open === 2) return true;
  }
  return false;
}

/** 이 수 둘레 네 칸 안의 빈 자리. 사와 삼은 이만큼 안에서만 만들어진다. */
function gaps(b: number[], n: number, cell: number, dx: number, dy: number): number[] {
  const x = cell % n;
  const y = Math.floor(cell / n);
  const out: number[] = [];
  for (let k = -(NEED - 1); k <= NEED - 1; k++) {
    if (k === 0) continue;
    const nx = x + dx * k;
    const ny = y + dy * k;
    if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
    if (b[ny * n + nx] === 0) out.push(ny * n + nx);
  }
  return out;
}

/** 지금 흑이 못 두는 자리 전부. 화면이 표시하고 봇이 피한다. */
function bannedList(b: number[], n: number, renju: boolean): number[] {
  if (!renju) return [];
  const out: number[] = [];
  for (let c = 0; c < n * n; c++) {
    if (b[c] !== 0) continue;
    /* 돌 하나 없는 자리는 금수가 될 수 없다. 225칸을 전부 재면 한 수마다 몇 만 번을 돈다 */
    if (!nearStone(b, n, c, 2)) continue;
    if (bannedFor(b, n, c, renju)) out.push(c);
  }
  return out;
}

/** 이 칸 둘레 `r` 안에 돌이 있나. */
function nearStone(b: number[], n: number, cell: number, r: number): boolean {
  const x = cell % n;
  const y = Math.floor(cell / n);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (at(b, n, x + dx, y + dy) > 0) return true;
    }
  }
  return false;
}

/**
 * 한 줄 모양의 값어치. **이번 수로 끝나는 것이 먼저다.**
 *
 * 막는 값을 살짝 낮게 두어 먼저 이기러 간다로 두었더니 두 봇이 같은 함수를 쓰는 바람에
 * 선수가 한 수 차이로 늘 이겼다(저울 실측 200판). 그래서 값을 셋으로 못 박는다:
 * ① 지금 내가 이긴다 ② 안 막으면 지금 진다 ③ 나머지. ②를 ③ 어디보다도 크게 둠
 */
function shapeScore(len: number, open: number): number {
  if (len >= NEED) return 1e7;
  if (len === 4) return open >= 1 ? 1e6 : 0;
  if (len === 3) return open === 2 ? 1e5 : open === 1 ? 1e3 : 0;
  if (len === 2) return open === 2 ? 1e2 : open === 1 ? 10 : 0;
  return open === 2 ? 5 : open === 1 ? 1 : 0;
}

/** 이 칸의 값어치. 내 줄을 길게 만들수록, 남의 줄을 끊을수록 크다. */
function score(b: number[], n: number, cell: number, who: number, renju: boolean): number {
  const mine = b.slice();
  mine[cell] = who;
  if (wins(mine, n, cell, who, renju)) return 1e9;

  const foe = 3 - who;
  const theirs = b.slice();
  theirs[cell] = foe;
  if (wins(theirs, n, cell, foe, renju)) return 1e8;

  let total = 0;
  for (const [dx, dy] of DIRS) {
    const a = shape(mine, n, cell, who, dx, dy);
    const d = shape(theirs, n, cell, foe, dx, dy);
    total += shapeScore(a.len, a.open);
    /* 남의 줄을 막는 값은 내 줄을 잇는 값보다 살짝 낮게. 그래야 먼저 이기러 간다 */
    total += 0.9 * shapeScore(d.len, d.open);
  }
  /* 가운데가 길이 많다 */
  const mid = (n - 1) / 2;
  return total - (Math.abs((cell % n) - mid) + Math.abs(Math.floor(cell / n) - mid)) * 0.5;
}

export const gomoku: GameDef<GomokuState, GomokuAction> = {
  id: 'gomoku',
  seats: [2, 2],
  rounds: 1,

  init(ctx) {
    const n = sizeOf(ctx.opts);
    /* 안 고르면 켠다. 흑이 먼저 두는 게임에서 금수 없는 판은 선수가 유리하다 */
    const renju = ctx.opts.renju !== false;
    const limit = limitOf(ctx.opts);
    return { board: new Array(n * n).fill(0), n, renju, turn: 0, won: -1, last: -1, banned: [], limit, turnEndsAt: limit ? ctx.now + limit * 1000 : -1, timedOut: -1 };
  },

  /**
   * 시간은 커널 시계로(`clocked`). 제한을 넘기면 그 사람 패. 레퍼런스와 같음
   * 자동 착수는 시계가 사람 대신 두는 것이라 판이 남의 것
   */
  clocked: true,
  tick(s, ctx) {
    if (s.won !== -1 || !s.limit || ctx.now < s.turnEndsAt) return s;
    return { ...s, won: 1 - s.turn, timedOut: s.turn, turnEndsAt: -1 };
  },

  canAct(s, seat) {
    return s.won === -1 && s.turn === seat;
  },

  reduce(s, a, seat, ctx) {
    if (s.won !== -1 || s.turn !== seat) return s;
    if (a.cell < 0 || a.cell >= s.n * s.n || s.board[a.cell] !== 0) return s;
    const who = seat + 1;
    /* 금수는 못 두는 수다. 커널 계약대로 상태를 그대로 돌려준다 */
    if (who === 1 && bannedFor(s.board, s.n, a.cell, s.renju)) return s;
    const board = s.board.slice();
    board[a.cell] = who;
    const won = wins(board, s.n, a.cell, who, s.renju) ? seat : board.every((v) => v !== 0) ? -2 : -1;
    /* 다음 차례가 흑일 때만 금수 자리를 다시 센다. 백 차례에 세면 한 수마다 헛일이다 */
    const banned = won === -1 && 1 - seat === 0 ? bannedList(board, s.n, s.renju) : [];
    return { ...s, board, turn: 1 - seat, won, last: a.cell, banned, turnEndsAt: won === -1 && s.limit ? ctx.now + s.limit * 1000 : -1 };
  },

  outcome(s, ctx) {
    if (s.won === -1) return { over: false };
    if (s.won === -2) return { over: true, scores: [0, 0], note: { key: 'arcade.gomoku.full' } };
    if (s.timedOut >= 0) {
      return {
        over: true,
        scores: s.won === 0 ? [1, 0] : [0, 1],
        note: { key: 'arcade.gomoku.timeout', params: { who: ctx.seats[s.timedOut]?.name ?? '' } }
      };
    }
    return {
      over: true,
      scores: s.won === 0 ? [1, 0] : [0, 1],
      note: { key: 'arcade.gomoku.win', params: { who: ctx.seats[s.won]?.name ?? '' } }
    };
  },

  /** 방금 둔 수(`last`)로 다음에 다섯이 되는 빈 칸이 생겼나. 컷인의 리치 */
  cue(s, mover): 'four' | null {
    if (s.last < 0 || s.won !== -1) return null;
    const who = mover + 1;
    const n = s.n;
    const x = s.last % n;
    const y = Math.floor(s.last / n);
    for (const [dx, dy] of DIRS) {
      for (let k = -4; k <= 4; k += 1) {
        if (!k) continue;
        const cx = x + dx * k;
        const cy = y + dy * k;
        if (cx < 0 || cy < 0 || cx >= n || cy >= n) continue;
        const e = cy * n + cx;
        if (s.board[e] !== 0) continue;
        if (who === 1 && s.banned.indexOf(e) >= 0) continue;
        const t = s.board.slice();
        t[e] = who;
        if (wins(t, n, e, who, s.renju)) return 'four';
      }
    }
    return null;
  },

  bot(s, seat, ctx): BotMove<GomokuAction> | null {
    if (s.won !== -1 || s.turn !== seat) return null;
    const who = seat + 1;
    /* 단계별 엔진(`gomoku-engine.ts`). 아래 한 수 앞 점수는 엔진이 답을 못 낼 때의 안전망 */
    const cell = think({ board: s.board, n: s.n, who, renju: s.renju, banned: who === 1 ? s.banned : [], level: levelOf(ctx.opts), rng: ctx.rng });
    if (cell >= 0 && s.board[cell] === 0) return { action: { cell }, delayMs: 600 + ctx.rng() * 700 };
    /**
     * **둘 만한 자리만 본다.** 19줄이면 361칸. 한 칸마다 네 방향을 재면 한 수에 수천 번을 돎
     * 돌에서 두 칸 넘게 떨어진 자리는 값이 0에 가까움
     */
    const open: number[] = [];
    for (let c = 0; c < s.n * s.n; c++) {
      if (s.board[c] !== 0) continue;
      if (who === 1 && s.banned.indexOf(c) >= 0) continue;
      if (nearStone(s.board, s.n, c, 2)) open.push(c);
    }
    /* 첫 수는 둘레에 돌이 없다. 그때는 한가운데 */
    if (!open.length) {
      const mid = Math.floor(s.n / 2);
      const c = mid * s.n + mid;
      if (s.board[c] === 0) return { action: { cell: c }, delayMs: 600 + ctx.rng() * 700 };
      for (let i = 0; i < s.n * s.n; i++) if (s.board[i] === 0) open.push(i);
    }
    /* 동점이면 아무거나. 늘 앞칸을 고르면 후수가 매번 같은 자리로 끌려가 100% 진다
       (저울 실측, `pick-best.ts`). */
    const best = bestOf(open, (c) => score(s.board, s.n, c, who, s.renju), ctx.rng);
    if (best === undefined) return null;
    /* 생각하는 척. 즉답하면 사람이 아니라 벽에 두는 느낌이 든다. */
    return { action: { cell: best }, delayMs: 600 + ctx.rng() * 700 };
  }
};
