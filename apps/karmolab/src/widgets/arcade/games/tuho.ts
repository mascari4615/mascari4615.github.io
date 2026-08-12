/**
 * 투호 — 항아리에 화살 넣기 (TASK-KL-242)
 *
 * 쉰한 번째, 마지막 게임. 윷놀이·제기차기와 같은 마당에서 나온 놀이라 셋이 한 묶음이 된다.
 *
 * 겨눔은 둘뿐이다 — **좌우 각도와 세기.** 다트가 「점을 맞히기」라면 투호는 **「거리를 맞히기」**다.
 * 세게 던지면 넘어가고 약하면 못 미친다. 그래서 화면도 위에서 내려다보지 않고 서서 본다 —
 * 멀고 가까움이 안 보이면 이 놀이는 성립하지 않는다.
 *
 * 항아리 아가리에 그대로 들어가면 2점, 귀(양옆 손잡이)에 걸치면 1점. 원래 투호에도 귀에
 * 거는 수가 따로 있다 — 아깝게 빗나간 것이 그냥 0점이면 판이 밋밋해진다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

/** 마당 크기 (판 좌표) */
export const W = 100;
export const H = 150;
/** 던지는 자리 */
export const FROM = { x: 50, y: 138 };
/** 항아리 */
export const POT = { x: 50, y: 42, r: 6.5 };
/** 귀 — 아가리 양옆 */
export const EAR_DX = 11;
export const EAR_R = 4.2;
/** 화살 하나가 날아가는 시간 */
const FLY_MS = 900;
const ARROWS = 5;

export interface Shot {
  x: number;
  y: number;
  /** 2 = 아가리, 1 = 귀, 0 = 빗나감 */
  worth: number;
  seat: number;
}

export interface TuhoState {
  turn: number;
  left: number[];
  score: number[];
  shots: Shot[];
  /** 지금 날아가는 화살 */
  fly: { from: { x: number; y: number }; to: { x: number; y: number }; at: number; seat: number } | null;
  over: boolean;
}

export type TuhoAction = { ang: number; pow: number };

const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);

/** 떨어진 자리의 점수 */
export function worthAt(x: number, y: number): number {
  if (dist(x, y, POT.x, POT.y) <= POT.r) return 2;
  if (dist(x, y, POT.x - EAR_DX, POT.y) <= EAR_R || dist(x, y, POT.x + EAR_DX, POT.y) <= EAR_R) return 1;
  return 0;
}

export const tuho: GameDef<TuhoState, TuhoAction> = {
  id: 'tuho',
  seats: [1, 6],
  rounds: 1,
  /* 화살이 날아가는 동안 시계가 돌아야 한다 — 차례 게임이지만 시간이 필요하다. */
  realtime: true,

  init(ctx) {
    return {
      turn: 0,
      left: ctx.seats.map(() => ARROWS),
      score: ctx.seats.map(() => 0),
      shots: [],
      fly: null,
      over: false
    };
  },

  canAct(s, seat) {
    return !s.over && !s.fly && s.turn === seat && s.left[seat] > 0;
  },

  reduce(s, a, seat, ctx) {
    if (s.over || s.fly || s.turn !== seat || s.left[seat] <= 0) return s;
    const ang = Number(a?.ang);
    const pow = Number(a?.pow);
    if (!Number.isFinite(ang) || !Number.isFinite(pow)) return s;
    const A = Math.min(1, Math.max(0, ang));
    const P = Math.min(1, Math.max(0, pow));

    /* 손이 흔들린다 — 같은 값을 눌러도 똑같이 안 간다. 씨앗에서 나오므로 손님 화면도 같다. */
    const shake = (ctx.rng() - 0.5) * 3.2;
    const lat = (A - 0.5) * 0.62;
    const range = 46 + P * 76 + shake;
    const to = {
      x: FROM.x + Math.sin(lat) * range,
      y: FROM.y - Math.cos(lat) * range
    };
    return { ...s, fly: { from: FROM, to, at: ctx.now + FLY_MS, seat } };
  },

  tick(s, ctx) {
    if (s.over || !s.fly || ctx.now < s.fly.at) return s;
    const { to, seat } = s.fly;
    const worth = worthAt(to.x, to.y);
    const left = s.left.map((v, i) => (i === seat ? v - 1 : v));
    const score = s.score.map((v, i) => (i === seat ? v + worth : v));
    const shots = [...s.shots, { x: to.x, y: to.y, worth, seat }];
    /* 다음 차례 — 화살이 남은 사람 중에서 */
    let turn = seat;
    for (let k = 1; k <= left.length; k++) {
      const i = (seat + k) % left.length;
      if (left[i] > 0) { turn = i; break; }
    }
    return { ...s, fly: null, left, score, shots, turn, over: left.every((v) => v <= 0) };
  },

  outcome(s, ctx): Outcome {
    if (!s.over) return { over: false };
    const top = Math.max(...s.score);
    const best = ctx.seats.filter((_, i) => s.score[i] === top);
    return {
      over: true,
      scores: s.score,
      note: { key: 'arcade.tuho.win', params: { who: best.map((w) => w.name).join(', '), n: String(top) } }
    };
  },

  bot(s, seat): BotMove<TuhoAction> | null {
    if (s.over || s.fly || s.turn !== seat || s.left[seat] <= 0) return null;
    /* 항아리로 곧장 가는 값을 거꾸로 풀고, 자리마다 다른 손버릇만큼 흔든다. */
    const want = dist(FROM.x, FROM.y, POT.x, POT.y);
    const pow = (want - 46) / 76;
    const sloppy = 0.05 + (seat % 4) * 0.028;
    return {
      action: {
        ang: 0.5 + (Math.random() - 0.5) * sloppy,
        pow: Math.min(1, Math.max(0, pow + (Math.random() - 0.5) * sloppy * 1.7))
      },
      delayMs: 700 + Math.random() * 700
    };
  }
};
