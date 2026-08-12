/**
 * 체커 — 뛰어넘어 잡고, 끝줄에 닿으면 왕이 된다 (TASK-KL-242)
 *
 * 앞의 보드 게임들과 다른 점: **한 수가 두 칸을 가리킨다**(어디서 어디로). 그리고 잡으면
 * 연달아 더 뛸 수 있어 **차례가 안 끝날 수도** 있다 — 짝 맞추기의 「한 번 더」와 같은 자리지만,
 * 이쪽은 조건이 판 위에 있다(더 뛸 곳이 있으면 계속).
 *
 * 잡을 수 있으면 반드시 잡는 규칙(강제 점프)은 넣지 않았다. 처음 온 사람이 「왜 이 수가 안 되지」로
 * 막히는 자리라, 오락실 첫 판에는 안 맞는다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

export const N = 8;

/** 1·2 = 그냥 말, 3·4 = 왕(각각 자리 0·1의 것) */
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
   * **왕 둘이 남으면 판이 영영 안 끝난다** — 서로 맴돌기만 하고 아무 일도 안 일어난다
   * (봇끼리 붙였더니 실제로 안 끝났다). 체스의 50수 규칙과 같은 자리다.
   */
  idle: number;
}

export type CheckersAction = { from: number; to: number };

const owner = (v: number): number => (v === 0 ? -1 : v === 1 || v === 3 ? 0 : 1);
const isKing = (v: number): boolean => v >= 3;
const xy = (c: number): [number, number] => [c % N, Math.floor(c / N)];
const idx = (x: number, y: number): number => (x < 0 || y < 0 || x >= N || y >= N ? -1 : y * N + x);

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

  bot(s, seat): BotMove<CheckersAction> | null {
    if (s.won !== -1 || s.turn !== seat) return null;
    const moves = s.chain >= 0 ? movesFrom(s.board, s.chain, true) : allMoves(s.board, seat);
    if (!moves.length) return null;

    /* 뛰는 수를 먼저, 그중 왕이 되는 수를 더 좋아한다. 그 외에는 앞으로 미는 수. */
    const value = (m: CheckersAction): number => {
      let v = isJump(m) ? 20 : 0;
      const [, ty] = xy(m.to);
      if (!isKing(s.board[m.from]) && ((seat === 0 && ty === 0) || (seat === 1 && ty === N - 1))) v += 15;
      v += seat === 0 ? N - ty : ty;
      /* 가장자리는 안 잡힌다 */
      const [tx] = xy(m.to);
      if (tx === 0 || tx === N - 1) v += 2;
      return v + Math.random() * 2;
    };
    const best = moves.reduce((a, b) => (value(b) > value(a) ? b : a), moves[0]);
    return { action: best, delayMs: 600 + Math.random() * 700 };
  }
};
