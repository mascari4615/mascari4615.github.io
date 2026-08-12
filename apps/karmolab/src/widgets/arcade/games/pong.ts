/**
 * 탁구 — 라켓 한 줄, 공 하나 (TASK-KL-242)
 *
 * 에어하키와 같은 「동시 실시간」인데 몸이 훨씬 좁다: 라켓은 **한 줄 위에서만** 움직인다.
 * 그래서 수가 「어디로 갈까」가 아니라 **「공을 어느 지점으로 받을까」**가 된다 — 가장자리로
 * 받으면 크게 꺾이고 가운데로 받으면 곧게 간다. 그 한 줄이 이 놀이의 전부다.
 *
 * 랠리가 길어질수록 공이 빨라진다. 안 그러면 잘하는 둘이 붙었을 때 판이 안 끝난다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

export const W = 80;
export const H = 120;
export const PAD = 14;
const PAD_T = 2;
const BALL = 1.6;
const TARGET = 5;
const MAX_V = 2.6;
/**
 * 판 시간 상한.
 *
 * 랠리가 길수록 공을 빠르게 했는데 **상한에 걸리면 거기서 평형**이 된다 — 잘 받는 둘이 붙으면
 * 영영 주고받는다(봇끼리 붙였더니 안 끝났다). 시간이 다 되면 점수가 앞선 쪽이 이긴다.
 */
const LIMIT_MS = 150000;

export interface PongState {
  ball: { x: number; y: number; vx: number; vy: number };
  /** 이 시각을 넘기면 끝 */
  endsAt: number;
  /** 자리별 라켓 가운데 x */
  pad: number[];
  score: number[];
  over: boolean;
}

/** 「라켓을 여기로」 — 에어하키와 같은 결(누름이 아니라 자리). 다만 x 하나뿐이다. */
export type PongAction = { x: number };

function serve(dir: number, rng: () => number): PongState['ball'] {
  return { x: W / 2, y: H / 2, vx: (rng() - 0.5) * 1.2, vy: dir * 1.1 };
}

export const pong: GameDef<PongState, PongAction> = {
  id: 'pong',
  seats: [2, 2],
  rounds: 1,
  realtime: true,

  init(ctx) {
    return {
      ball: serve(ctx.rng() < 0.5 ? 1 : -1, ctx.rng),
      pad: [W / 2, W / 2],
      score: [0, 0],
      endsAt: ctx.now + LIMIT_MS,
      over: false
    };
  },

  canAct(s, seat) {
    return !s.over && seat >= 0 && seat < 2;
  },

  reduce(s, a, seat) {
    if (s.over || typeof a?.x !== 'number') return s;
    const x = Math.max(PAD / 2, Math.min(W - PAD / 2, a.x));
    return { ...s, pad: s.pad.map((v, i) => (i === seat ? x : v)) };
  },

  tick(s, ctx) {
    if (s.over) return s;
    if (ctx.now >= s.endsAt) return { ...s, over: true };
    const b = { ...s.ball };
    b.x += b.vx;
    b.y += b.vy;

    if (b.x < BALL) { b.x = BALL; b.vx = Math.abs(b.vx); }
    if (b.x > W - BALL) { b.x = W - BALL; b.vx = -Math.abs(b.vx); }

    /* 라켓 — 자리0은 아래(y 큼), 자리1은 위. */
    const check = (seat: number, lineY: number, dir: number): boolean => {
      const near = dir > 0 ? b.y >= lineY - PAD_T : b.y <= lineY + PAD_T;
      if (!near) return false;
      const dx = b.x - s.pad[seat];
      if (Math.abs(dx) > PAD / 2 + BALL) return false;
      /* **맞은 지점이 각도를 정한다** — 가장자리일수록 크게 꺾인다. 그게 이 놀이의 수다. */
      b.y = lineY - dir * (PAD_T + BALL);
      const speed = Math.min(MAX_V, Math.hypot(b.vx, b.vy) * 1.05);
      const angle = (dx / (PAD / 2 + BALL)) * 0.9;
      b.vx = Math.sin(angle) * speed;
      b.vy = -dir * Math.cos(angle) * speed;
      return true;
    };

    check(0, H - 4, 1);
    check(1, 4, -1);

    /* 뒤로 지나가면 점수. */
    let score = s.score;
    if (b.y > H) {
      score = [s.score[0], s.score[1] + 1];
      const over = score[1] >= TARGET;
      return { ...s, score, over, ball: serve(-1, Math.random) };
    }
    if (b.y < 0) {
      score = [s.score[0] + 1, s.score[1]];
      const over = score[0] >= TARGET;
      return { ...s, score, over, ball: serve(1, Math.random) };
    }

    return { ...s, ball: b };
  },

  outcome(s, ctx): Outcome {
    if (!s.over) return { over: false };
    if (s.score[0] === s.score[1]) {
      return { over: true, scores: [0, 0], note: { key: 'arcade.pong.draw', params: { n: String(s.score[0]) } } };
    }
    const win = s.score[0] > s.score[1] ? 0 : 1;
    return {
      over: true,
      scores: win === 0 ? [1, 0] : [0, 1],
      note: {
        key: 'arcade.pong.win',
        params: {
          who: ctx.seats[win]?.name ?? '',
          a: String(Math.max(...s.score)),
          b: String(Math.min(...s.score))
        }
      }
    };
  },

  bot(s, seat): BotMove<PongAction> | null {
    if (s.over) return null;
    /* 공을 따라가되 조금 늦다. 딱 붙어 다니면 사람이 한 점도 못 낸다. */
    const target = s.ball.x + (Math.random() - 0.5) * 6;
    const x = s.pad[seat] + (target - s.pad[seat]) * 0.32;
    return { action: { x }, delayMs: 60 };
  }
};
