/**
 * 작은 쇼기 — 잡은 말을 내 말로 다시 놓는다 (TASK-KL-242)
 *
 * 체커·오목과 같은 「차례·보드」인데 규칙 하나가 판을 완전히 바꾼다: **잡은 말이 사라지지 않고
 * 내 손에 들어온다.** 그래서 말이 줄지 않고, 판이 좁아질수록 오히려 수가 늘어난다.
 *
 * 5×5 로 줄였다(클럽하우스의 「미니 쇼기」와 같은 크기). 승부는 **왕을 잡으면 끝** —
 * 외통 판정은 처음 온 사람에게 설명하기 어렵고, 왕을 잡는 쪽이 눈에 바로 보인다.
 *
 * 말: 왕(K) 금(G) 은(S) 비(R) 각(B) 보(P). 승격은 넣지 않았다 — 규칙 하나를 더 얹으면
 * 첫 판에서 배울 것이 두 배가 된다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

export const N = 5;

/** 1~6 = 자리0의 왕·금·은·비·각·보, 음수는 자리1의 것 */
export type Piece = number;
export const KING = 1, GOLD = 2, SILVER = 3, ROOK = 4, BISHOP = 5, PAWN = 6;

export interface ShogiState {
  board: Piece[];
  /** 자리별로 손에 든 말 (종류 번호들) */
  hand: number[][];
  turn: number;
  won: number;
  last: number;
  /** 아무 일 없이 흐른 수 — 안 끝나는 판을 막는다 */
  idle: number;
}

export type ShogiAction =
  | { kind: 'move'; from: number; to: number }
  | { kind: 'drop'; piece: number; to: number };

const xy = (c: number): [number, number] => [c % N, Math.floor(c / N)];
const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= N || y >= N ? -1 : y * N + x);
const ownerOf = (p: Piece): number => (p === 0 ? -1 : p > 0 ? 0 : 1);
const kindOf = (p: Piece): number => Math.abs(p);

/** 각 말이 갈 수 있는 곳. 위쪽(자리0)은 -y 로 나아간다. */
export function reach(board: Piece[], from: number): number[] {
  const p = board[from];
  if (!p) return [];
  const me = ownerOf(p);
  const fwd = me === 0 ? -1 : 1;
  const [x, y] = xy(from);
  const out: number[] = [];
  const step = (dx: number, dy: number): void => {
    const c = at(x + dx, y + dy);
    if (c >= 0 && ownerOf(board[c]) !== me) out.push(c);
  };
  const slide = (dx: number, dy: number): void => {
    for (let k = 1; k < N; k++) {
      const c = at(x + dx * k, y + dy * k);
      if (c < 0) break;
      if (ownerOf(board[c]) === me) break;
      out.push(c);
      if (board[c] !== 0) break;
    }
  };

  switch (kindOf(p)) {
    case KING:
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) step(dx, dy);
      break;
    case GOLD:
      for (const [dx, dy] of [[0,fwd],[1,fwd],[-1,fwd],[1,0],[-1,0],[0,-fwd]]) step(dx, dy);
      break;
    case SILVER:
      for (const [dx, dy] of [[0,fwd],[1,fwd],[-1,fwd],[1,-fwd],[-1,-fwd]]) step(dx, dy);
      break;
    case ROOK:
      slide(1, 0); slide(-1, 0); slide(0, 1); slide(0, -1);
      break;
    case BISHOP:
      slide(1, 1); slide(1, -1); slide(-1, 1); slide(-1, -1);
      break;
    case PAWN:
      step(0, fwd);
      break;
  }
  return out;
}

export const minishogi: GameDef<ShogiState, ShogiAction> = {
  id: 'minishogi',
  seats: [2, 2],
  rounds: 1,

  init() {
    const board = new Array(N * N).fill(0);
    /* 아래가 자리0, 위가 자리1. */
    const back0 = [ROOK, BISHOP, SILVER, GOLD, KING];
    back0.forEach((k, i) => { board[(N - 1) * N + i] = k; });
    board[(N - 2) * N + N - 1] = PAWN;
    const back1 = [KING, GOLD, SILVER, BISHOP, ROOK];
    back1.forEach((k, i) => { board[i] = -k; });
    board[N] = -PAWN;
    return { board, hand: [[], []], turn: 0, won: -1, last: -1, idle: 0 };
  },

  canAct(s, seat) {
    return s.won === -1 && s.turn === seat;
  },

  reduce(s, a, seat) {
    if (s.won !== -1 || s.turn !== seat) return s;
    const sign = seat === 0 ? 1 : -1;

    if (a?.kind === 'drop') {
      const piece = a.piece;
      const to = a.to;
      if (!Number.isInteger(piece) || !Number.isInteger(to)) return s;
      if (to < 0 || to >= N * N || s.board[to] !== 0) return s;
      const hand = s.hand.map((h) => h.slice());
      const k = hand[seat].indexOf(piece);
      if (k < 0) return s;
      hand[seat].splice(k, 1);
      const board = s.board.slice();
      board[to] = piece * sign;
      return { ...s, board, hand, turn: 1 - seat, last: to, idle: s.idle + 1 };
    }

    if (a?.kind !== 'move') return s;
    const { from, to } = a;
    if (!Number.isInteger(from) || !Number.isInteger(to)) return s;
    if (from < 0 || from >= N * N || to < 0 || to >= N * N) return s;
    if (ownerOf(s.board[from]) !== seat) return s;
    if (!reach(s.board, from).includes(to)) return s;

    const board = s.board.slice();
    const taken = board[to];
    board[to] = board[from];
    board[from] = 0;

    const hand = s.hand.map((h) => h.slice());
    /* **잡은 말은 내 손에 들어온다** — 이 한 줄이 이 놀이의 전부다. */
    if (taken !== 0) hand[seat].push(kindOf(taken));

    const won = kindOf(taken) === KING ? seat : -1;
    const idle = taken === 0 ? s.idle + 1 : 0;
    /* 아무 일 없이 오래 끌면 비긴다(체커에서 배운 자리). */
    return { board, hand, turn: 1 - seat, won: won >= 0 ? won : idle >= 80 ? -2 : -1, last: to, idle };
  },

  outcome(s, ctx): Outcome {
    if (s.won === -1) return { over: false };
    if (s.won === -2) return { over: true, scores: [0, 0], note: { key: 'arcade.shogi.stale' } };
    return {
      over: true,
      scores: ctx.seats.map((_, i) => (i === s.won ? 1 : 0)),
      note: { key: 'arcade.shogi.win', params: { who: ctx.seats[s.won]?.name ?? '' } }
    };
  },

  bot(s, seat): BotMove<ShogiAction> | null {
    if (s.won !== -1 || s.turn !== seat) return null;
    const moves: Array<{ a: ShogiAction; v: number }> = [];

    s.board.forEach((p, from) => {
      if (ownerOf(p) !== seat) return;
      for (const to of reach(s.board, from)) {
        const taken = s.board[to];
        /* 왕을 잡을 수 있으면 그게 최고. 그다음은 값나가는 말. */
        const v = kindOf(taken) === KING ? 1000 : kindOf(taken) ? 10 + kindOf(taken) : 1;
        moves.push({ a: { kind: 'move', from, to }, v: v + Math.random() });
      }
    });
    /* 손에 든 말은 빈 칸 아무 데나 — 앞쪽에 두는 것을 조금 좋아한다. */
    (s.hand[seat] ?? []).forEach((piece) => {
      s.board.forEach((p, to) => {
        if (p !== 0) return;
        const [, y] = xy(to);
        const fwd = seat === 0 ? N - 1 - y : y;
        moves.push({ a: { kind: 'drop', piece, to }, v: 3 + fwd * 0.5 + Math.random() });
      });
    });

    if (!moves.length) return null;
    const best = moves.reduce((x, y2) => (y2.v > x.v ? y2 : x), moves[0]);
    return { action: best.a, delayMs: 600 + Math.random() * 700 };
  }
};
