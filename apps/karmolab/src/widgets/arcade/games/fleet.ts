/**
 * 함대 찾기. 안 보이는 판을 두들긴다 (TASK-KL-242)
 *
 * 여기까지의 게임은 대부분 **판이 다 보였다**. 이건 반대다. 남의 판은 안 보이고, 두들겨서
 * 알아낸 것만 남는다. 커널의 `redact` 자리(자리마다 다른 판을 내려보내는 이음매)를 정면으로
 * 쓰는 게임이라, 그 자리가 진짜 되는지 확인하는 게임이기도 하다.
 *
 * 배치는 자동이다. 배 놓기 단계를 두면 판 시작까지 일 분이 넘고, 무엇보다 봇이 채운 방에서
 * 사람 혼자 배를 놓고 있는 그림이 이상하다.
 *
 * **맞히면 한 번 더**. 맞은 다음이 제일 재밌는 순간인데 거기서 차례를 넘기면 김이 샌다.
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';
import { grid } from '../grid';

export const N = 8;
const FLEET = [4, 3, 3, 2];

export interface FleetState {
  /** 자리별 배가 놓인 칸. **`redact` 가 남의 것을 지운다** */
  ships: number[][];
  /** 자리별 판에 남은 자국: 0 없음, 1 빗나감, 2 맞음 (이건 모두에게 보인다) */
  mark: number[][];
  alive: boolean[];
  turn: number;
  /** 마지막 한 방. 화면이 짚어 준다 */
  last: { by: number; at: number; cell: number; hit: boolean } | null;
  over: boolean;
}

export type FleetAction = { at: number; cell: number };

const { xy } = grid(N);

/** 배를 다 놓는다. 겹치면 다시 고른다. */
function place(rng: () => number): number[] {
  const used = new Set<number>();
  const out: number[] = [];
  for (const len of FLEET) {
    for (let tries = 0; tries < 500; tries++) {
      const horiz = rng() < 0.5;
      const x = Math.floor(rng() * (horiz ? N - len + 1 : N));
      const y = Math.floor(rng() * (horiz ? N : N - len + 1));
      const cells = Array.from({ length: len }, (_, k) => (y + (horiz ? 0 : k)) * N + x + (horiz ? k : 0));
      if (cells.some((c) => used.has(c))) continue;
      cells.forEach((c) => used.add(c));
      out.push(...cells);
      break;
    }
  }
  return out;
}

/** 이 자리 배가 다 가라앉았나 */
const sunk = (s: FleetState, seat: number): boolean =>
  s.ships[seat].length > 0 && s.ships[seat].every((c) => s.mark[seat][c] === 2);

/** 다음에 둘 자리. 가라앉은 자리는 건너뛴다. */
function nextSeat(s: FleetState, from: number): number {
  for (let k = 1; k <= s.alive.length; k++) {
    const i = (from + k) % s.alive.length;
    if (s.alive[i]) return i;
  }
  return from;
}

export const fleet: GameDef<FleetState, FleetAction> = {
  id: 'fleet',
  seats: [2, 4],
  rounds: 1,

  init(ctx: GameCtx) {
    return {
      ships: ctx.seats.map(() => place(ctx.rng)),
      mark: ctx.seats.map(() => new Array(N * N).fill(0)),
      alive: ctx.seats.map(() => true),
      turn: 0,
      last: null,
      over: false
    };
  },

  /** 남의 배가 어디 있는지는 아무에게도 안 보낸다. 자국만 간다. */
  redact(s, seat) {
    return { ...s, ships: s.ships.map((v, i) => (i === seat ? v : [])) };
  },

  canAct(s, seat) {
    return !s.over && s.alive[seat] && s.turn === seat;
  },

  reduce(s, a, seat) {
    if (s.over || s.turn !== seat || !s.alive[seat]) return s;
    const at = a?.at;
    const cell = a?.cell;
    if (!Number.isInteger(at) || at < 0 || at >= s.alive.length || at === seat) return s;
    if (!s.alive[at]) return s;
    if (!Number.isInteger(cell) || cell < 0 || cell >= N * N) return s;
    if (s.mark[at][cell] !== 0) return s;

    const hit = s.ships[at].includes(cell);
    const mark = s.mark.map((m, i) => (i === at ? m.map((v, k) => (k === cell ? (hit ? 2 : 1) : v)) : m));
    const next: FleetState = { ...s, mark, last: { by: seat, at, cell, hit } };
    if (sunk(next, at)) next.alive = s.alive.map((v, i) => (i === at ? false : v));
    /* 맞히면 한 번 더. 다만 그 자리를 다 가라앉혔으면 차례가 넘어간다. */
    const again = hit && next.alive[at];
    next.turn = again ? seat : nextSeat(next, seat);
    next.over = next.alive.filter(Boolean).length <= 1;
    return next;
  },

  outcome(s, ctx): Outcome {
    if (!s.over) {
      /* 판이 도는 중에도 **마지막 한 발**을 말로 낸다 (arcade-next 놀이마다의 소리).
         맞았는지는 이미 `last` 에 있다. 새로 만들지 않고 그걸 쓴다. 소리 이름만 붙이면
         껍데기가 울린다(게임은 소리 장치를 모른다). */
      if (!s.last) return { over: false };
      return {
        over: false,
        /* `at` 은 **화면에 안 쓰이는 값**이다(말 묶음이 {who} 만 쓴다). 소리를 두 번 안 울리려고
           껍데기가 말이 바뀌었나로 견주는데, 같은 사람이 연달아 빗나가면 말이 똑같아서
           두 번째가 안 운다. 발마다 달라지는 값을 하나 실어 그 자리를 막는다. */
        note: s.last.hit
          ? { key: 'arcade.fleet.hit', params: { who: ctx.seats[s.last.by]?.name ?? '', at: String(s.last.cell) }, sound: 'good' }
          : { key: 'arcade.fleet.miss', params: { who: ctx.seats[s.last.by]?.name ?? '', at: String(s.last.cell) }, sound: 'bad' }
      };
    }
    const win = s.alive.indexOf(true);
    return {
      over: true,
      /* 점수 = 살아남은 배 칸 수. 아슬아슬했는지 압도했는지가 남는다. */
      scores: ctx.seats.map((_, i) => s.ships[i].filter((c) => s.mark[i][c] !== 2).length),
      note: win >= 0
        ? { key: 'arcade.fleet.win', params: { who: ctx.seats[win]?.name ?? '' } }
        : { key: 'arcade.fleet.none' }
    };
  },

  bot(s, seat, ctx): BotMove<FleetAction> | null {
    if (s.over || s.turn !== seat || !s.alive[seat]) return null;
    const foes = s.alive.map((v, i) => (v && i !== seat ? i : -1)).filter((i) => i >= 0);
    if (!foes.length) return null;

    /* 이미 맞힌 자국 옆을 먼저 두들긴다. 배는 이어져 있으니까.
       그런 자국이 있는 상대를 먼저 보므로, 자연히 끝내러 가는 봇이 된다. */
    for (const at of foes) {
      const m = s.mark[at];
      for (let c = 0; c < N * N; c++) {
        if (m[c] !== 2) continue;
        const [x, y] = xy(c);
        const around = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as Array<[number, number]>)
          .map(([dx, dy]) => [x + dx, y + dy])
          .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < N && ny < N)
          .map(([nx, ny]) => ny * N + nx)
          .filter((k) => m[k] === 0);
        if (around.length) {
          return {
            action: { at, cell: around[Math.floor(ctx.rng() * around.length)] },
            delayMs: 450 + ctx.rng() * 450
          };
        }
      }
    }

    /* 아니면 아무 데나. 단 제일 짧은 배가 두 칸이라 **한 칸 건너**로만 찍는다.
       그래도 못 찾고 지나치는 배는 없고, 헛방이 절반으로 준다. */
    const at = foes[Math.floor(ctx.rng() * foes.length)];
    const m = s.mark[at];
    const free: number[] = [];
    const sparse: number[] = [];
    for (let c = 0; c < N * N; c++) {
      if (m[c] !== 0) continue;
      free.push(c);
      const [x, y] = xy(c);
      if ((x + y) % 2 === 0) sparse.push(c);
    }
    const pool = sparse.length ? sparse : free;
    if (!pool.length) return null;
    return { action: { at, cell: pool[Math.floor(ctx.rng() * pool.length)] }, delayMs: 600 + ctx.rng() * 700 };
  }
};
