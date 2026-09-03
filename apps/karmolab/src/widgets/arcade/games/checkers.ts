/**
 * 체커. 뛰어넘어 잡고, 끝줄에 닿으면 왕이 된다 (TASK-KL-242)
 *
 * 앞의 보드 게임들과 다른 점: **한 수가 두 칸을 가리킨다**(어디서 어디로). 그리고 잡으면
 * 연달아 더 뛸 수 있어 **차례가 안 끝날 수도** 있다. 짝 맞추기의 한 번 더와 같은 자리지만,
 * 이쪽은 조건이 판 위에 있다(더 뛸 곳이 있으면 계속).
 *
 * 잡을 수 있으면 반드시 잡는 규칙(강제 점프)은 넣지 않았다. 처음 온 사람이 왜 이 수가 안 되지로
 * 막히는 자리라, 오락실 첫 판에는 안 맞는다.
 */
import type { GameDef, BotMove, Outcome } from '../types';
import { grid } from '../grid';

/** 봇 단계 1~5. 시작 화면의 상대 고르기 (`setups.ts`). 안 고르면 3 */
export const levelOf = (opts: { ai?: number | boolean }): number => {
  const v = Number(opts.ai);
  return v >= 1 && v <= 5 ? Math.round(v) : 3;
};

/* 깊이 7 은 판당 17초(실측). 5 면 판당 1초 안 */
const CHK_DEPTH = [0, 0, 0, 2, 4, 5];
/** 한 수 놓은 판. 뛰었고 더 뛸 수 있으면 같은 사람이 이어 둠(`again`) */
function chkApply(b: number[], a: CheckersAction, seat: number): { board: number[]; again: number } {
  const board = b.slice();
  board[a.to] = board[a.from];
  board[a.from] = 0;
  const jumped = isJump(a);
  if (jumped) board[(a.from + a.to) / 2] = 0;
  const [, ty] = xy(a.to);
  let crowned = false;
  if (!isKing(board[a.to]) && ((seat === 0 && ty === 0) || (seat === 1 && ty === N - 1))) {
    board[a.to] = seat === 0 ? 3 : 4;
    crowned = true;
  }
  const again = jumped && !crowned && movesFrom(board, a.to, true).length ? a.to : -1;
  return { board, again };
}
/** 재료. 말 1, 왕 2.5, 앞으로 나간 만큼 0.05, 왕은 가운데일수록, 그리고 둘 수 있는 수(기동력) 0.08 */
function chkEval(b: number[], me: number): number {
  let v = 0;
  for (let i = 0; i < b.length; i += 1) {
    const o = owner(b[i]);
    if (o < 0) continue;
    const [x, y] = xy(i);
    const adv = o === 0 ? (N - 1 - y) : y;
    const center = isKing(b[i]) ? (3.5 - Math.abs(x - 3.5)) * 0.06 + (3.5 - Math.abs(y - 3.5)) * 0.06 : 0;
    const val = (isKing(b[i]) ? 2.5 : 1) + adv * 0.05 + center;
    v += o === me ? val : -val;
  }
  v += (allMoves(b, me).length - allMoves(b, 1 - me).length) * 0.08;
  return v;
}
function chkSearch(b: number[], me: number, toMove: number, chain: number, depth: number, alpha: number, beta: number): number {
  const moves = chain >= 0 ? movesFrom(b, chain, true) : allMoves(b, toMove);
  if (!moves.length) return toMove === me ? -500 : 500;
  if (depth <= 0) return chkEval(b, me);
  const mine = toMove === me;
  let best = mine ? -Infinity : Infinity;
  for (const m of moves) {
    const r = chkApply(b, m, toMove);
    const v = r.again >= 0
      ? chkSearch(r.board, me, toMove, r.again, depth, alpha, beta)
      : chkSearch(r.board, me, 1 - toMove, -1, depth - 1, alpha, beta);
    if (mine) { best = Math.max(best, v); alpha = Math.max(alpha, best); } else { best = Math.min(best, v); beta = Math.min(beta, best); }
    if (beta <= alpha) break;
  }
  return best;
}

export const N = 8;

/** 1, 2 = 그냥 말, 3, 4 = 왕(각각 자리 0, 1의 것) */
export interface CheckersState {
  board: number[];
  turn: number;
  /** 연달아 뛰는 중인 말의 자리. 없으면 -1 */
  chain: number;
  /** 이긴 자리 (-1 진행, -2 비김) */
  won: number;
  last: number;
  /**
   * 잡지도 왕이 되지도 않은 수가 몇 번 이어졌나.
   *
   * **왕 둘이 남으면 판이 영영 안 끝난다**. 서로 맴돌기만 하고 아무 일도 안 일어난다
   * (봇끼리 붙였더니 실제로 안 끝났다). 체스의 50수 규칙과 같은 자리다.
   */
  idle: number;
}

export type CheckersAction = { from: number; to: number };

const owner = (v: number): number => (v === 0 ? -1 : v === 1 || v === 3 ? 0 : 1);
const isKing = (v: number): boolean => v >= 3;
const { xy, idx } = grid(N);

/** 이 말이 갈 수 있는 곳들. `jumpOnly` 면 뛰는 수만. */
export function movesFrom(b: number[], from: number, jumpOnly = false): CheckersAction[] {
  const v = b[from];
  if (v === 0) return [];
  const me = owner(v);
  const [x, y] = xy(from);
  const dirs: Array<[number, number]> = isKing(v)
    ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
    : me === 0
      ? [[1, -1], [-1, -1]]
      : [[1, 1], [-1, 1]];

  const out: CheckersAction[] = [];
  for (const [dx, dy] of dirs) {
    const step = idx(x + dx, y + dy);
    const jump = idx(x + dx * 2, y + dy * 2);
    if (jump >= 0 && step >= 0 && b[step] !== 0 && owner(b[step]) !== me && b[jump] === 0) {
      out.push({ from, to: jump });
    } else if (!jumpOnly && step >= 0 && b[step] === 0) {
      out.push({ from, to: step });
    }
  }
  return out;
}

const allMoves = (b: number[], seat: number): CheckersAction[] =>
  b.flatMap((v, i) => (owner(v) === seat ? movesFrom(b, i) : []));

const isJump = (a: CheckersAction): boolean => Math.abs((a.to % N) - (a.from % N)) === 2;

/** 아무 일도 안 일어난 수가 이만큼 이어지면 비긴 것으로 본다. */
const IDLE_LIMIT = 60;

export const checkers: GameDef<CheckersState, CheckersAction> = {
  id: 'checkers',
  seats: [2, 2],
  rounds: 1,

  init() {
    const board = new Array(N * N).fill(0);
    for (let c = 0; c < N * N; c++) {
      const [x, y] = xy(c);
      if ((x + y) % 2 === 0) continue; /* 어두운 칸만 쓴다 */
      if (y < 3) board[c] = 2;
      if (y > 4) board[c] = 1;
    }
    return { board, turn: 0, chain: -1, won: -1, last: -1, idle: 0 };
  },

  canAct(s, seat) {
    return s.won === -1 && s.turn === seat;
  },

  reduce(s, a, seat) {
    if (s.won !== -1 || s.turn !== seat) return s;
    if (!a || typeof a.from !== 'number' || typeof a.to !== 'number') return s;
    if (owner(s.board[a.from]) !== seat) return s;
    /* 연달아 뛰는 중이면 그 말만 움직인다. */
    if (s.chain >= 0 && a.from !== s.chain) return s;

    const legal = movesFrom(s.board, a.from, s.chain >= 0);
    if (!legal.some((m) => m.to === a.to)) return s;

    const board = s.board.slice();
    board[a.to] = board[a.from];
    board[a.from] = 0;

    let jumped = false;
    if (isJump(a)) {
      jumped = true;
      const mid = (a.from + a.to) / 2;
      board[mid] = 0;
    }

    /* 끝줄에 닿으면 왕. 왕이 된 그 수로는 더 안 뛴다(원래 규칙). */
    const [, ty] = xy(a.to);
    let crowned = false;
    if (!isKing(board[a.to]) && ((seat === 0 && ty === 0) || (seat === 1 && ty === N - 1))) {
      board[a.to] = seat === 0 ? 3 : 4;
      crowned = true;
    }

    const more = jumped && !crowned && movesFrom(board, a.to, true).length > 0;
    const turn = more ? seat : 1 - seat;
    const chain = more ? a.to : -1;

    const idle = jumped || crowned ? 0 : s.idle + 1;

    /* 상대가 말이 없거나 둘 곳이 없으면 끝. 아무 일도 안 일어난 채 오래 끌어도 끝(비김). */
    let won = -1;
    if (!more) {
      const foe = 1 - seat;
      if (!board.some((v) => owner(v) === foe) || allMoves(board, foe).length === 0) won = seat;
      else if (idle >= IDLE_LIMIT) won = -2;
    }
    return { board, turn, chain, won, last: a.to, idle };
  },

  outcome(s, ctx): Outcome {
    if (s.won === -1) return { over: false };
    if (s.won === -2) return { over: true, scores: [0, 0], note: { key: 'arcade.checkers.stale' } };
    return {
      over: true,
      scores: ctx.seats.map((_, i) => (i === s.won ? 1 : 0)),
      note: { key: 'arcade.checkers.win', params: { who: ctx.seats[s.won]?.name ?? '' } }
    };
  },

  bot(s, seat, ctx): BotMove<CheckersAction> | null {
    if (s.won !== -1 || s.turn !== seat) return null;
    const moves = s.chain >= 0 ? movesFrom(s.board, s.chain, true) : allMoves(s.board, seat);
    if (!moves.length) return null;
    const level = levelOf(ctx.opts);
    const delay = 600 + ctx.rng() * 700;
    /* 1단계. 아무 데나 */
    if (level === 1) return { action: moves[Math.floor(ctx.rng() * moves.length)], delayMs: delay };
    /* 3단계부터 앞을 읽는다. 재료 평가 (레퍼런스 2026-09-03: 남들 6~12단계) */
    const depth = CHK_DEPTH[level] ?? 0;
    if (depth > 0) {
      let best = moves[0];
      let bestV = -Infinity;
      for (const m of moves) {
        const r = chkApply(s.board, m, seat);
        const v = (r.again >= 0
          ? chkSearch(r.board, seat, seat, r.again, depth, -Infinity, Infinity)
          : chkSearch(r.board, seat, 1 - seat, -1, depth - 1, -Infinity, Infinity)) + ctx.rng() * 0.01;
        if (v > bestV) { bestV = v; best = m; }
      }
      return { action: best, delayMs: delay };
    }

    /* 2단계. 뛰는 수를 먼저, 그중 왕이 되는 수를 더 좋아한다. 그 외에는 앞으로 미는 수. */
    const value = (m: CheckersAction): number => {
      let v = isJump(m) ? 20 : 0;
      const [, ty] = xy(m.to);
      if (!isKing(s.board[m.from]) && ((seat === 0 && ty === 0) || (seat === 1 && ty === N - 1))) v += 15;
      v += seat === 0 ? N - ty : ty;
      /* 가장자리는 안 잡힌다 */
      const [tx] = xy(m.to);
      if (tx === 0 || tx === N - 1) v += 2;
      return v + ctx.rng() * 2;
    };
    const best = moves.reduce((a, b) => (value(b) > value(a) ? b : a), moves[0]);
    return { action: best, delayMs: delay };
  }

};
