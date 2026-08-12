/**
 * 볼링 — 열 개를 쓰러뜨린다 (TASK-KL-242)
 *
 * 컬링과 같은 물리(미끄러지고 부딪히는 원)를 쓰지만 노는 결이 다르다: **남과 안 부딪힌다.**
 * 각자 제 레인에서 던지고, 쓰러뜨린 수만 겨룬다 — 여럿이 해도 순서를 기다릴 뿐 서로 안 막는다.
 *
 * 점수는 볼링 원래 셈(스트라이크·스페어 보너스)을 그대로 쓴다. 열 프레임은 오락실 한 판에
 * 너무 길어서 **세 프레임**으로 줄였다 — 규칙은 진짜, 길이만 오락실에 맞췄다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

/** 레인 폭·길이 (컬링과 같은 좌표계 — 화면이 두 게임을 같은 방식으로 그린다) */
export const W = 60;
export const H = 200;
export const BALL_R = 4;
export const PIN_R = 1.9;
/** 핀이 서는 자리 (삼각형 열 개) */
export const PIN_SPOTS: Array<[number, number]> = (() => {
  const out: Array<[number, number]> = [];
  /* 지름의 두 배 넘게 벌린다 — 실제 볼링이 그렇고(지름 12cm·간격 30cm), 붙여 놓으면
     가까이서 봤을 때 열 개가 한 덩어리 벽으로 보인다(스크린샷으로 확인). */
  const gap = 8.6;
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i <= row; i++) {
      out.push([W / 2 + (i - row / 2) * gap, 34 - row * gap * 0.87]);
    }
  }
  return out;
})();

const FRAMES = 3;
const FRICTION = 0.992;
const STOP_V = 0.03;

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 핀은 가볍다 — 공에 밀린다 */
  pin: boolean;
  /** 쓰러졌나 */
  down?: boolean;
}

export interface BowlingState {
  bodies: Body[];
  turn: number;
  /** 자리별 프레임마다 굴린 결과 (쓰러뜨린 수) */
  rolls: number[][];
  /** 이번 프레임에서 몇 번째 투구인가 (0 또는 1) */
  ball: number;
  moving: boolean;
  done: boolean;
}

export type BowlingAction = { aim: number; power: number };

function freshPins(): Body[] {
  return PIN_SPOTS.map(([x, y]) => ({ x, y, vx: 0, vy: 0, pin: true }));
}

/** 한 걸음. 컬링과 같은 규율 — 프레임이 아니라 고정 시간이 판을 굴린다. */
export function stepPhysics(bodies: Body[]): { bodies: Body[]; moving: boolean } {
  const out = bodies.map((b) => ({ ...b }));
  for (const b of out) {
    if (b.down) continue;
    b.x += b.vx;
    b.y += b.vy;
    b.vx *= FRICTION;
    b.vy *= FRICTION;
    if (Math.hypot(b.vx, b.vy) < STOP_V) { b.vx = 0; b.vy = 0; }
    /* 도랑 — 옆으로 나가면 그 공/핀은 빠진다 */
    if (b.x < 2 || b.x > W - 2) b.down = true;
  }

  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      if (a.down || b.down) continue;
      const ra = a.pin ? PIN_R : BALL_R;
      const rb = b.pin ? PIN_R : BALL_R;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= ra + rb || d === 0) continue;
      const nx = dx / d, ny = dy / d;
      const push = (ra + rb - d) / 2;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      const p = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (p <= 0) continue;
      /* 공은 무겁다 — 핀에 부딪혀도 거의 안 느려진다. 그래야 한 번에 여럿이 넘어간다. */
      const wa = a.pin ? 1 : 0.15;
      const wb = b.pin ? 1 : 0.15;
      a.vx -= p * nx * wa; a.vy -= p * ny * wa;
      b.vx += p * nx * wb; b.vy += p * ny * wb;
      /* 밀린 핀은 쓰러진 것으로 본다 */
      if (a.pin && Math.hypot(a.vx, a.vy) > 0.15) a.down = true;
      if (b.pin && Math.hypot(b.vx, b.vy) > 0.15) b.down = true;
    }
  }

  const alive = out.filter((b) => b.y > -8 && b.y < H + 8);
  return { bodies: alive, moving: alive.some((b) => !b.down && (b.vx !== 0 || b.vy !== 0)) };
}

const standing = (bodies: Body[]): number => bodies.filter((b) => b.pin && !b.down).length;

/** 볼링 셈 — 스트라이크는 다음 두 번, 스페어는 다음 한 번을 더 받는다. */
export function scoreOf(rolls: number[]): number {
  let total = 0;
  let i = 0;
  for (let f = 0; f < FRAMES; f++) {
    const a = rolls[i];
    if (a === undefined) break;
    if (a === 10) {
      total += 10 + (rolls[i + 1] ?? 0) + (rolls[i + 2] ?? 0);
      i += 1;
    } else {
      const b = rolls[i + 1] ?? 0;
      total += a + b === 10 ? 10 + (rolls[i + 2] ?? 0) : a + b;
      i += 2;
    }
  }
  return total;
}

export const bowling: GameDef<BowlingState, BowlingAction> = {
  id: 'bowling',
  seats: [1, 4],
  rounds: 1,
  realtime: true,

  init(ctx) {
    return {
      bodies: freshPins(),
      turn: 0,
      rolls: ctx.seats.map(() => []),
      ball: 0,
      moving: false,
      done: false
    };
  },

  canAct(s, seat) {
    return !s.done && !s.moving && s.turn === seat;
  },

  reduce(s, a, seat) {
    if (s.done || s.moving || s.turn !== seat) return s;
    const aim = typeof a?.aim === 'number' ? a.aim : NaN;
    const power = typeof a?.power === 'number' ? a.power : NaN;
    if (!Number.isFinite(aim) || !Number.isFinite(power)) return s;

    const ang = Math.max(-0.22, Math.min(0.22, aim));
    const pw = Math.max(0.3, Math.min(1, power));
    const speed = 2.2 + pw * 2.4;
    const ball: Body = {
      x: W / 2,
      y: H - 8,
      vx: Math.sin(ang) * speed,
      vy: -Math.cos(ang) * speed,
      pin: false
    };
    return { ...s, bodies: [...s.bodies.filter((b) => b.pin), ball], moving: true };
  },

  tick(s, ctx) {
    if (!s.moving || s.done) return s;
    let bodies = s.bodies;
    let moving = true;
    for (let n = 0; n < 12 && moving; n++) {
      const r = stepPhysics(bodies);
      bodies = r.bodies;
      moving = r.moving;
    }
    if (moving) return { ...s, bodies };

    /* 다 섰다 — 이번 투구에서 몇 개를 눕혔나 센다. */
    const before = s.ball === 0 ? 10 : 10 - (s.rolls[s.turn][s.rolls[s.turn].length - 1] ?? 0);
    const knocked = before - standing(bodies);
    const rolls = s.rolls.map((r, i) => (i === s.turn ? [...r, knocked] : r));

    const strike = s.ball === 0 && knocked === 10;
    const frameOver = strike || s.ball === 1;
    if (!frameOver) return { ...s, bodies, rolls, ball: 1, moving: false };

    /* 다음 사람 — 한 바퀴 돌면 프레임이 하나 지난다. */
    const seats = ctx.seats.length;
    const next = (s.turn + 1) % seats;
    const framesDone = Math.min(...rolls.map((r) => {
      let f = 0;
      for (let i = 0; i < r.length; ) { if (r[i] === 10) { f++; i += 1; } else { f++; i += 2; } }
      return f;
    }));
    const done = framesDone >= FRAMES;
    return { ...s, bodies: freshPins(), rolls, ball: 0, moving: false, turn: next, done };
  },

  outcome(s, ctx): Outcome {
    if (!s.done) return { over: false };
    const scores = s.rolls.map(scoreOf);
    const top = Math.max(...scores);
    const winners = ctx.seats.filter((_, i) => scores[i] === top);
    return {
      over: true,
      scores,
      note:
        winners.length === ctx.seats.length
          ? { key: 'arcade.bowling.draw', params: { n: String(top) } }
          : { key: 'arcade.bowling.win', params: { who: winners.map((w) => w.name).join(', '), n: String(top) } }
    };
  },

  bot(s, seat): BotMove<BowlingAction> | null {
    if (s.done || s.moving || s.turn !== seat) return null;
    /* 가운데를 노리되 손이 떨린다 — 늘 스트라이크면 볼 맛이 없다. */
    const aim = (Math.random() - 0.5) * 0.09;
    const power = 0.7 + (Math.random() - 0.5) * 0.2;
    return { action: { aim, power }, delayMs: 800 + Math.random() * 700 };
  }
};
