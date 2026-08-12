/**
 * 한붓그리기 — 선을 한 번도 안 떼고 다 지난다 (TASK-KL-242)
 *
 * 조각 맞추기·지뢰 찾기와 같은 갈래(같은 문제를 나눠 주고 경주)지만, 여기서는 **문제를 만드는
 * 것 자체가 어렵다** — 아무렇게나 선을 그으면 대개 못 그리는 그림이 나온다.
 *
 * 그래서 **답부터 만든다.** 아무 데나 걷다가 지나온 길을 그림으로 삼으면, 그 걸음이 곧 정답이라
 * 반드시 풀린다. 문제를 무작위로 뽑고 「풀리나?」를 검사하는 쪽은 느리고 가끔 못 만든다.
 * (조각 맞추기에서 「맞춘 판에서 거꾸로 민다」와 같은 수법이다.)
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';

export const W = 5;
export const H = 5;
const EDGES = 12;
const LIMIT_MS = 120000;

export interface Edge {
  a: number;
  b: number;
}

export interface StrokeState {
  /** 그려야 할 선들 */
  edges: Edge[];
  /** 자리별로 그린 선 번호 */
  drawn: number[][];
  /** 자리별 지금 붓 끝이 있는 점 (아직 안 시작이면 -1) */
  at: number[];
  /** 다 그린 자리 (아직이면 -1) */
  won: number;
  endsAt: number;
  over: boolean;
}

export type StrokeAction = { edge: number };

const key = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** **답부터 만든다** — 아무 데나 걸어 다닌 자취를 그림으로 삼는다. 그러면 반드시 풀린다. */
function makePuzzle(ctx: GameCtx): Edge[] {
  for (let tries = 0; tries < 40; tries++) {
    const seen = new Set<string>();
    const edges: Edge[] = [];
    let at = Math.floor(ctx.rng() * W * H);
    for (let n = 0; n < EDGES * 4 && edges.length < EDGES; n++) {
      const x = at % W;
      const y = Math.floor(at / W);
      const nbr: number[] = [];
      if (x > 0) nbr.push(at - 1);
      if (x < W - 1) nbr.push(at + 1);
      if (y > 0) nbr.push(at - W);
      if (y < H - 1) nbr.push(at + W);
      const next = nbr[Math.floor(ctx.rng() * nbr.length)];
      const k = key(at, next);
      if (!seen.has(k)) {
        seen.add(k);
        edges.push({ a: at, b: next });
      }
      at = next;
    }
    if (edges.length === EDGES) return edges;
  }
  return [{ a: 0, b: 1 }];
}

export const onestroke: GameDef<StrokeState, StrokeAction> = {
  id: 'onestroke',
  seats: [1, 4],
  rounds: 1,
  realtime: true,

  init(ctx) {
    return {
      edges: makePuzzle(ctx),
      drawn: ctx.seats.map(() => []),
      at: ctx.seats.map(() => -1),
      won: -1,
      endsAt: ctx.now + LIMIT_MS,
      over: false
    };
  },

  canAct(s, seat) {
    return !s.over && s.won === -1 && !!s.drawn[seat];
  },

  reduce(s, a, seat) {
    if (s.over || s.won !== -1) return s;
    const i = a?.edge;
    if (!Number.isInteger(i) || i < 0 || i >= s.edges.length) return s;
    const mine = s.drawn[seat];
    if (!mine || mine.includes(i)) return s;

    const e = s.edges[i];
    const here = s.at[seat];
    /* 첫 선은 아무 데서나. 그다음부터는 **붓 끝에 닿아 있어야** 한다. */
    if (here >= 0 && e.a !== here && e.b !== here) return s;
    const next = here < 0 ? e.b : e.a === here ? e.b : e.a;

    const drawn = s.drawn.map((d, k) => (k === seat ? [...d, i] : d));
    const at = s.at.map((v, k) => (k === seat ? next : v));
    const done = drawn[seat].length === s.edges.length;
    return { ...s, drawn, at, won: done ? seat : -1, over: done };
  },

  tick(s, ctx) {
    if (s.over || ctx.now < s.endsAt) return s;
    return { ...s, over: true };
  },

  outcome(s, ctx): Outcome {
    if (!s.over) return { over: false };
    if (s.won >= 0) {
      return {
        over: true,
        scores: ctx.seats.map((_, i) => (i === s.won ? 1 : 0)),
        note: { key: 'arcade.stroke.win', params: { who: ctx.seats[s.won]?.name ?? '' } }
      };
    }
    /* 시간이 다 됐다 — 많이 그린 쪽. */
    const counts = s.drawn.map((d) => d.length);
    const top = Math.max(...counts);
    const winners = ctx.seats.filter((_, i) => counts[i] === top);
    return {
      over: true,
      scores: counts,
      note: { key: 'arcade.stroke.timeup', params: { who: winners.map((w) => w.name).join(', '), n: String(top) } }
    };
  },

  bot(s, seat): BotMove<StrokeAction> | null {
    if (s.over || s.won !== -1) return null;
    const mine = s.drawn[seat] ?? [];
    const here = s.at[seat];
    const can = s.edges
      .map((e, i) => ({ e, i }))
      .filter(({ e, i }) => !mine.includes(i) && (here < 0 || e.a === here || e.b === here));
    if (!can.length) return null;
    /* 봇은 앞을 안 읽는다 — 닿는 선 중 아무거나. 사람이 이길 자리가 있어야 한다. */
    const pick = can[Math.floor(Math.random() * can.length)];
    return { action: { edge: pick.i }, delayMs: 700 + Math.random() * 700 };
  }
};
