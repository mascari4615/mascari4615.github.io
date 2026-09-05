/**
 * 높은 쪽 고르기. 둘 중 큰 쪽만 고르는 연승 놀이 (change.arcade-absorbs-play 단계 3)
 *
 * 놀이터의 높은 쪽 고르기를 오락실 판으로. 표(항목 이름, 그림, 숫자 칸)는 첫 수 `load` 가 싣고,
 * 그 순간 씨앗으로 **대진 사슬**을 미리 짠다: 이긴 쪽이 자리에 남고 새 상대가 오며, 겨루는 칸은
 * 판마다 바뀜. 사슬은 값이 정하므로 누가 무엇을 고르든 같음. 그래서 같은 방의 모두가 같은 문제를
 * 제 속도로 풀고, 틀리는 순간 그 자리는 끝. 연승이 곧 점수
 *
 * 오락실의 하이로우(`highlow`)는 카드 놀이라 다른 판
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';

export interface HiField {
  key: string;
  label: string;
  unit?: string;
}
export interface HiItem {
  n: string;
  i: string;
  v: Record<string, number>;
}
/** 한 판. 칸 `f` 로 `a` 와 `b` 를 견줌. `a` 는 앞 판에서 남은 쪽 */
export interface HiPair {
  f: string;
  a: number;
  b: number;
}
export interface HiLane {
  /** 몇 째 판인가 */
  at: number;
  streak: number;
  /** 틀려서 끝났나 */
  out: boolean;
  /** 마지막으로 고른 판과 그 결과. 화면이 값을 세어 올리는 데 씀 */
  last: { pair: HiPair; side: 0 | 1; win: boolean } | null;
}
export interface HiState {
  pack: { title: string; fields: HiField[]; items: HiItem[] } | null;
  pairs: HiPair[];
  lanes: HiLane[];
}
export type HiAction =
  | { kind: 'load'; title: string; fields: HiField[]; items: HiItem[] }
  | { kind: 'pick'; side: 0 | 1 };

export const CHAIN = 60;
export const ITEM_CAP = 400;

const isField = (v: unknown): v is HiField => !!v && typeof v === 'object' && typeof (v as HiField).key === 'string';
const isItem = (v: unknown): v is HiItem => {
  const it = v as HiItem | null;
  return !!it && typeof it === 'object' && typeof it.n === 'string' && !!it.v && typeof it.v === 'object';
};

/** 대진 사슬. 이긴 쪽이 남고, 칸은 판마다 바뀌고, 같은 값끼리는 안 붙임 */
export function chainOf(rng: () => number, fields: HiField[], items: HiItem[], length: number): HiPair[] {
  const usable = fields.filter((f) => items.filter((x) => x.v[f.key] !== undefined).length >= 2);
  if (!usable.length) return [];
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const out: HiPair[] = [];
  let left = -1;
  let prevField = '';
  for (let i = 0; i < length; i++) {
    const others = usable.filter((f) => f.key !== prevField);
    const f = others.length ? pick(others) : usable[0];
    const pool = items.map((_, k) => k).filter((k) => items[k].v[f.key] !== undefined);
    if (pool.length < 2) break;
    let a = left >= 0 && items[left].v[f.key] !== undefined ? left : pick(pool);
    let b = -1;
    for (let tries = 0; tries < 50; tries++) {
      b = pick(pool);
      if (b !== a && items[b].v[f.key] !== items[a].v[f.key]) break;
      b = -1;
    }
    if (b < 0) {
      /* 이 칸으로는 짝을 못 찾음. 다른 시작으로 */
      a = pick(pool);
      for (let tries = 0; tries < 50 && b < 0; tries++) {
        const c = pick(pool);
        if (c !== a && items[c].v[f.key] !== items[a].v[f.key]) b = c;
      }
      if (b < 0) break;
    }
    out.push({ f: f.key, a, b });
    left = items[a].v[f.key] > items[b].v[f.key] ? a : b;
    prevField = f.key;
  }
  return out;
}

const emptyLane = (): HiLane => ({ at: 0, streak: 0, out: false, last: null });

export const higher: GameDef<HiState, HiAction> = {
  id: 'higher',
  seats: [1, 4],
  rounds: 1,

  init(ctx: GameCtx): HiState {
    return { pack: null, pairs: [], lanes: ctx.seats.map(() => emptyLane()) };
  },

  canAct(s, seat) {
    if (!s.pack) return seat === 0;
    const l = s.lanes[seat];
    return !!l && !l.out && l.at < s.pairs.length;
  },

  reduce(s, a, seat, ctx) {
    if (!a || typeof a !== 'object') return s;
    if (!s.pack) {
      if (seat !== 0 || a.kind !== 'load') return s;
      if (typeof a.title !== 'string' || !Array.isArray(a.fields) || !Array.isArray(a.items)) return s;
      const fields = a.fields.filter(isField);
      let items = a.items.filter(isItem).map((it) => ({ n: it.n, i: typeof it.i === 'string' ? it.i : '', v: it.v }));
      if (items.length > ITEM_CAP) {
        const order = items.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(ctx.rng() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
        items = order.slice(0, ITEM_CAP).map((i) => items[i]);
      }
      const pairs = chainOf(ctx.rng, fields, items, CHAIN);
      if (!pairs.length) return s;
      return { pack: { title: a.title, fields, items }, pairs, lanes: s.lanes.map(() => emptyLane()) };
    }
    if (a.kind !== 'pick' || (a.side !== 0 && a.side !== 1)) return s;
    const l = s.lanes[seat];
    if (!l || l.out || l.at >= s.pairs.length) return s;
    const pair = s.pairs[l.at];
    const chosen = s.pack.items[a.side === 0 ? pair.a : pair.b];
    const other = s.pack.items[a.side === 0 ? pair.b : pair.a];
    const win = chosen.v[pair.f] > other.v[pair.f];
    const lane: HiLane = { at: l.at + 1, streak: win ? l.streak + 1 : l.streak, out: !win, last: { pair, side: a.side, win } };
    return { ...s, lanes: s.lanes.map((x, i) => (i === seat ? lane : x)) };
  },

  outcome(s, ctx): Outcome {
    if (!s.pack) return { over: false };
    const done = s.lanes.every((l) => l.out || l.at >= s.pairs.length);
    if (!done) return { over: false };
    const scores = s.lanes.map((l) => l.streak);
    const top = Math.max(...scores);
    const who = scores.indexOf(top);
    return { over: true, scores, note: { key: 'arcade.higher.note', params: { who: ctx.seats[who]?.name ?? '', n: String(top) }, sound: top > 0 ? 'win' : 'lose' } };
  },

  /** 봇은 열에 일곱을 맞힘. 늘 맞히면 이길 수 없고 늘 틀리면 겨룰 이유가 없음 */
  bot(s, seat, ctx): BotMove<HiAction> | null {
    if (!s.pack) {
      if (seat !== 0) return null;
      const items: HiItem[] = ['a', 'b', 'c', 'd', 'e'].map((n, i) => ({ n, i: '', v: { size: i * 3 + 1, mass: (i * 7) % 5 } }));
      return { action: { kind: 'load', title: 'bot', fields: [{ key: 'size', label: 'size' }, { key: 'mass', label: 'mass' }], items }, delayMs: 200 };
    }
    const l = s.lanes[seat];
    if (!l || l.out || l.at >= s.pairs.length) return null;
    const pair = s.pairs[l.at];
    const aWins = s.pack.items[pair.a].v[pair.f] > s.pack.items[pair.b].v[pair.f];
    const right = ctx.rng() < 0.7;
    const side: 0 | 1 = (aWins ? 0 : 1) === 0 ? (right ? 0 : 1) : right ? 1 : 0;
    return { action: { kind: 'pick', side }, delayMs: 700 + ctx.rng() * 900 };
  }
};
