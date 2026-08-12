/**
 * 에어하키 — 계속 움직이면서 계속 친다 (TASK-KL-242)
 *
 * 커널이 마지막으로 안 밟아 본 자리: **한 수가 「한 번」이 아니다.** 앞의 열아홉은 전부
 * 「두고 → 기다린다」였는데(다트조차 던지는 순간만 골랐다), 이건 손가락이 움직이는 내내
 * 수가 흐른다. 그래서 액션이 「패들을 여기로」다 — 누를 때가 아니라 **있는 자리**를 보낸다.
 *
 * 그물망을 생각하면 이게 맞다. 「눌렀다/뗐다」를 보내면 소식 하나가 늦을 때 패들이 벽에
 * 붙어 버리지만, **자리**를 보내면 늦게 온 소식은 그냥 낡은 자리일 뿐이라 다음 것이 덮는다.
 *
 * 먼저 다섯 골. 판이 안 끝나는 일이 없게 시간 상한도 둔다(앞선 네 게임에서 배운 자리).
 */
import type { GameDef, BotMove, Outcome } from '../types';

export const W = 80;
export const H = 140;
export const PUCK_R = 3;
export const PADDLE_R = 6;
/** 골대 폭 */
export const GOAL_W = 30;
const TARGET = 5;
const LIMIT_MS = 150000;
const FRICTION = 0.995;
const MAX_V = 4.2;

export interface AirState {
  puck: { x: number; y: number; vx: number; vy: number };
  /** 자리별 패들 자리 */
  paddles: Array<{ x: number; y: number }>;
  score: number[];
  /** 이 시각을 넘기면 끝 */
  endsAt: number;
  over: boolean;
}

/** 「패들을 여기로」 — 누름이 아니라 자리를 보낸다. */
export type AirAction = { x: number; y: number };

/** 그 자리가 이 사람의 진영인가. 반쪽을 넘어가면 안 된다. */
function clampTo(seat: number, x: number, y: number): { x: number; y: number } {
  const cx = Math.max(PADDLE_R, Math.min(W - PADDLE_R, x));
  const cy = seat === 0
    ? Math.max(H / 2 + PADDLE_R, Math.min(H - PADDLE_R, y))
    : Math.max(PADDLE_R, Math.min(H / 2 - PADDLE_R, y));
  return { x: cx, y: cy };
}

export const airhockey: GameDef<AirState, AirAction> = {
  id: 'airhockey',
  seats: [2, 2],
  rounds: 1,
  realtime: true,

  init(ctx) {
    return {
      puck: { x: W / 2, y: H / 2, vx: (ctx.rng() - 0.5) * 1.6, vy: ctx.rng() < 0.5 ? -1.4 : 1.4 },
      paddles: [
        { x: W / 2, y: H - 16 },
        { x: W / 2, y: 16 }
      ],
      score: [0, 0],
      endsAt: ctx.now + LIMIT_MS,
      over: false
    };
  },

  canAct(s, seat) {
    return !s.over && seat >= 0 && seat < 2;
  },

  reduce(s, a, seat) {
    if (s.over) return s;
    if (typeof a?.x !== 'number' || typeof a?.y !== 'number') return s;
    const at = clampTo(seat, a.x, a.y);
    return { ...s, paddles: s.paddles.map((p, i) => (i === seat ? at : p)) };
  },

  tick(s, ctx) {
    if (s.over) return s;
    if (ctx.now >= s.endsAt) return { ...s, over: true };

    const p = { ...s.puck };
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= FRICTION;
    p.vy *= FRICTION;

    /* 옆벽 */
    if (p.x < PUCK_R) { p.x = PUCK_R; p.vx = Math.abs(p.vx); }
    if (p.x > W - PUCK_R) { p.x = W - PUCK_R; p.vx = -Math.abs(p.vx); }

    /* 골대 — 가운데로 들어가면 골, 아니면 뒷벽에 튕긴다 */
    const inGoal = Math.abs(p.x - W / 2) < GOAL_W / 2;
    let score = s.score;
    let scored = false;
    if (p.y < PUCK_R) {
      if (inGoal) { score = [s.score[0] + 1, s.score[1]]; scored = true; }
      else { p.y = PUCK_R; p.vy = Math.abs(p.vy); }
    }
    if (p.y > H - PUCK_R) {
      if (inGoal) { score = [s.score[0], s.score[1] + 1]; scored = true; }
      else { p.y = H - PUCK_R; p.vy = -Math.abs(p.vy); }
    }

    if (scored) {
      const over = score.some((n) => n >= TARGET);
      return {
        ...s,
        score,
        over,
        puck: { x: W / 2, y: H / 2, vx: (Math.random() - 0.5) * 1.6, vy: Math.random() < 0.5 ? -1.4 : 1.4 }
      };
    }

    /* 패들에 부딪히면 튕긴다. 패들이 움직이던 방향으로 밀어 주지 않는다 —
       자리만 받으므로 속도를 모른다. 대신 맞은 지점에 따라 각이 갈린다(그게 이 놀이의 맛이다). */
    for (const pad of s.paddles) {
      const dx = p.x - pad.x;
      const dy = p.y - pad.y;
      const d = Math.hypot(dx, dy);
      if (d >= PUCK_R + PADDLE_R || d === 0) continue;
      const nx = dx / d, ny = dy / d;
      p.x = pad.x + nx * (PUCK_R + PADDLE_R);
      p.y = pad.y + ny * (PUCK_R + PADDLE_R);
      const speed = Math.max(1.6, Math.hypot(p.vx, p.vy) * 1.06);
      p.vx = nx * speed;
      p.vy = ny * speed;
    }

    const sp = Math.hypot(p.vx, p.vy);
    if (sp > MAX_V) { p.vx = (p.vx / sp) * MAX_V; p.vy = (p.vy / sp) * MAX_V; }
    /* 너무 느려지면 판이 멈춘 것처럼 보인다 — 최소 속도를 준다. */
    if (sp < 0.5) { const k = 0.5 / (sp || 1); p.vx *= k; p.vy *= k; }

    return { ...s, puck: p };
  },

  outcome(s, ctx): Outcome {
    if (!s.over) return { over: false };
    if (s.score[0] === s.score[1]) {
      return { over: true, scores: [0, 0], note: { key: 'arcade.air.draw', params: { n: String(s.score[0]) } } };
    }
    const win = s.score[0] > s.score[1] ? 0 : 1;
    return {
      over: true,
      scores: win === 0 ? [1, 0] : [0, 1],
      note: {
        key: 'arcade.air.win',
        params: { who: ctx.seats[win]?.name ?? '', a: String(Math.max(...s.score)), b: String(Math.min(...s.score)) }
      }
    };
  },

  bot(s, seat): BotMove<AirAction> | null {
    if (s.over) return null;
    /* 퍽을 따라간다. 조금 굼뜨게 — 딱 붙어 다니면 사람이 한 골도 못 넣는다. */
    const home = seat === 0 ? H - 16 : 16;
    const chase = (seat === 0 && s.puck.y > H / 2) || (seat === 1 && s.puck.y < H / 2);
    const pad = s.paddles[seat];
    const tx = chase ? s.puck.x : W / 2;
    const ty = chase ? s.puck.y + (seat === 0 ? 5 : -5) : home;
    const x = pad.x + (tx - pad.x) * 0.35;
    const y = pad.y + (ty - pad.y) * 0.35;
    return { action: { x, y }, delayMs: 60 };
  }
};
