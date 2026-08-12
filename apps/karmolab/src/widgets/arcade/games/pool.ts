/**
 * 당구 — 흰 공으로 쳐서 구멍에 넣는다 (TASK-KL-242)
 *
 * 컬링·볼링과 같은 물리를 쓰지만 판이 다르다: **네 벽이 다 튕기고, 구멍 여섯 개가 공을 삼킨다.**
 * 그리고 처음으로 **친 사람이 계속 친다** — 넣으면 한 번 더, 못 넣으면 넘긴다.
 *
 * 규칙은 줄였다: 번호도 색도 없이 **먼저 다섯 개를 넣는 쪽**이 이긴다. 흰 공을 빠뜨리면
 * 다시 놓고 차례를 넘긴다(원래 놀이의 「파울」 자리). 처음 온 사람이 규칙을 안 배워도 되게.
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';

export const W = 100;
export const H = 180;
export const BALL_R = 3.4;
/** 구멍 — 네 모서리와 긴 변 가운데 둘 */
export const POCKETS: Array<[number, number]> = [
  [4, 4], [W - 4, 4], [4, H - 4], [W - 4, H - 4], [3, H / 2], [W - 3, H / 2]
];
const POCKET_R = 6.4;
const FRICTION = 0.985;
const STOP_V = 0.03;
/** 이만큼 넣으면 이긴다 */
const TARGET = 5;
/**
 * 판 전체가 이만큼 치면 끝난다.
 *
 * **끝나는 조건이 「다 넣기」뿐이면 안 끝나는 판이 생긴다** — 공이 서로 막고 앉으면 아무도 못
 * 넣고 무한히 친다(봇끼리 붙였더니 실제로 안 끝났다). 조각 맞추기·체커에서 겪은 것과 같은 자리다.
 */
const MAX_SHOTS = 40;

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 흰 공인가 */
  cue: boolean;
  /** 들어갔나 */
  in?: boolean;
}

export interface PoolState {
  balls: Ball[];
  turn: number;
  /** 자리별 넣은 수 */
  potted: number[];
  moving: boolean;
  won: number;
  /** 지금까지 친 횟수 */
  shots: number;
}

export type PoolAction = { aim: number; power: number };

function rack(ctx: GameCtx): Ball[] {
  const out: Ball[] = [{ x: W / 2, y: H - 40, vx: 0, vy: 0, cue: true }];
  /* 삼각으로 세운다. 자리를 씨앗으로 아주 조금 흔들어 매번 같은 판이 안 되게. */
  const gap = BALL_R * 2.05;
  let n = 0;
  for (let row = 0; row < 4 && n < 10; row++) {
    for (let i = 0; i <= row && n < 10; i++, n++) {
      out.push({
        x: W / 2 + (i - row / 2) * gap + (ctx.rng() - 0.5) * 0.3,
        y: 46 + row * gap * 0.87,
        vx: 0,
        vy: 0,
        cue: false
      });
    }
  }
  return out;
}

/** 한 걸음. 컬링과 같은 규율 — 고정 시간, 순수 함수. */
export function stepPhysics(balls: Ball[]): { balls: Ball[]; moving: boolean; pocketed: Ball[] } {
  const out = balls.map((b) => ({ ...b }));
  const pocketed: Ball[] = [];

  for (const b of out) {
    if (b.in) continue;
    b.x += b.vx;
    b.y += b.vy;
    b.vx *= FRICTION;
    b.vy *= FRICTION;
    if (Math.hypot(b.vx, b.vy) < STOP_V) { b.vx = 0; b.vy = 0; }
    if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx) * 0.82; }
    if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx) * 0.82; }
    if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy) * 0.82; }
    if (b.y > H - BALL_R) { b.y = H - BALL_R; b.vy = -Math.abs(b.vy) * 0.82; }

    for (const [px, py] of POCKETS) {
      if (Math.hypot(b.x - px, b.y - py) < POCKET_R) {
        b.in = true;
        b.vx = 0;
        b.vy = 0;
        pocketed.push(b);
        break;
      }
    }
  }

  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      if (a.in || b.in) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= BALL_R * 2 || d === 0) continue;
      const nx = dx / d, ny = dy / d;
      const push = (BALL_R * 2 - d) / 2;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      const p = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (p <= 0) continue;
      a.vx -= p * nx; a.vy -= p * ny;
      b.vx += p * nx; b.vy += p * ny;
    }
  }

  return { balls: out, moving: out.some((b) => !b.in && (b.vx !== 0 || b.vy !== 0)), pocketed };
}

export const pool: GameDef<PoolState, PoolAction> = {
  id: 'pool',
  seats: [1, 4],
  rounds: 1,
  realtime: true,

  init(ctx) {
    return { balls: rack(ctx), turn: 0, potted: ctx.seats.map(() => 0), moving: false, won: -1, shots: 0 };
  },

  canAct(s, seat) {
    return s.won === -1 && !s.moving && s.turn === seat;
  },

  reduce(s, a, seat) {
    if (s.won !== -1 || s.moving || s.turn !== seat) return s;
    const aim = typeof a?.aim === 'number' ? a.aim : NaN;
    const power = typeof a?.power === 'number' ? a.power : NaN;
    if (!Number.isFinite(aim) || !Number.isFinite(power)) return s;

    const cue = s.balls.find((b) => b.cue && !b.in);
    if (!cue) return s;
    const pw = Math.max(0.15, Math.min(1, power));
    const speed = 1.4 + pw * 3.4;
    const balls = s.balls.map((b) =>
      b === cue ? { ...b, vx: Math.sin(aim) * speed, vy: -Math.cos(aim) * speed } : { ...b }
    );
    return { ...s, balls, moving: true, shots: s.shots + 1 };
  },

  tick(s, ctx) {
    if (!s.moving || s.won !== -1) return s;
    let balls = s.balls;
    let moving = true;
    let gained = 0;
    let scratch = false;
    for (let n = 0; n < 12 && moving; n++) {
      const r = stepPhysics(balls);
      balls = r.balls;
      moving = r.moving;
      for (const b of r.pocketed) {
        if (b.cue) scratch = true;
        else gained++;
      }
    }

    const potted = gained ? s.potted.map((v, i) => (i === s.turn ? v + gained : v)) : s.potted;
    if (moving) return { ...s, balls, potted };

    /* 흰 공이 빠졌으면 다시 놓고 넘긴다 — 원래 놀이의 파울 자리.
     *
     * `scratch` 플래그만 보지 않고 **판 위에 흰 공이 있나**로 판단한다. 한 tick 안에서 여러 걸음을
     * 밟기 때문에 빠진 사실이 플래그에 안 남는 경우가 있고, 그러면 칠 공이 없어 판이 영영 안 끝난다
     * (봇 단독 검사에서 가끔 안 끝났다 — 「가끔」이 곧 이 자리였다). */
    const cueGone = !balls.some((b) => b.cue && !b.in);
    let next = balls;
    if (scratch || cueGone) {
      next = balls.map((b) => (b.cue ? { ...b, x: W / 2, y: H - 40, vx: 0, vy: 0, in: false } : b));
    }
    const won = potted.findIndex((n) => n >= TARGET);
    /* 넣었으면 한 번 더. 못 넣었거나 파울이면 다음 사람. */
    const keep = gained > 0 && !scratch && !cueGone;
    const turn = keep ? s.turn : (s.turn + 1) % ctx.seats.length;
    return { ...s, balls: next, potted, moving: false, turn, won };
  },

  outcome(s, ctx): Outcome {
    if (s.won === -1) {
      /* 칠 공이 없거나 오래 쳤으면 그때까지 많이 넣은 쪽. */
      const left = s.balls.filter((b) => !b.cue && !b.in).length;
      if (left > 0 && s.shots < MAX_SHOTS) return { over: false };
      if (s.moving) return { over: false };
      const top = Math.max(...s.potted);
      const winners = ctx.seats.filter((_, i) => s.potted[i] === top);
      return {
        over: true,
        scores: s.potted,
        note: { key: 'arcade.pool.win', params: { who: winners.map((w) => w.name).join(', '), n: String(top) } }
      };
    }
    return {
      over: true,
      scores: ctx.seats.map((_, i) => (i === s.won ? 1 : 0)),
      note: { key: 'arcade.pool.win', params: { who: ctx.seats[s.won]?.name ?? '', n: String(s.potted[s.won]) } }
    };
  },

  bot(s, seat): BotMove<PoolAction> | null {
    if (s.won !== -1 || s.moving || s.turn !== seat) return null;
    const cue = s.balls.find((b) => b.cue && !b.in);
    if (!cue) return null;
    const target = s.balls.find((b) => !b.cue && !b.in);
    if (!target) return null;
    /* 제일 가까운 공을 향해 친다. 조준이 살짝 어긋나야 사람도 이긴다. */
    const ang = Math.atan2(target.x - cue.x, cue.y - target.y) + (Math.random() - 0.5) * 0.14;
    return { action: { aim: ang, power: 0.5 + Math.random() * 0.4 }, delayMs: 800 + Math.random() * 700 };
  }
};
