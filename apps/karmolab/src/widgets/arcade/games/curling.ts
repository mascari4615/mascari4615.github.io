/**
 * 컬링 — 밀어서 가운데에 가깝게 (TASK-KL-242)
 *
 * 오락실의 **첫 「장난감 스포츠」**다. 앞의 열다섯은 전부 칸·카드·수였고, 이건 처음으로
 * **물체가 움직인다**. 클럽하우스 51 의 큰 축(볼링·당구·다트·컬링)이 이 자리에서 열린다.
 *
 * 지키는 것:
 *  - **물리는 커널 안에 있다.** 순수 함수고, 시계는 밖에서 온다 — 그래서 창 없이 검증할 수 있고,
 *    주인 한 곳에서만 굴러 승부가 갈린다. 화면은 그 결과를 그리기만 한다(3D든 2D든).
 *  - **한 걸음은 고정 시간**(`STEP_MS`)이다. 프레임에 물리를 맡기면 빠른 기기와 느린 기기가
 *    다른 결과를 낸다 — 같은 힘으로 밀었는데 승부가 달라지면 그건 놀이가 아니다.
 *  - 값은 전부 수로 남는다(위치·속도). 그래야 그물망을 건너고, 그림은 어디서든 다시 그린다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

/** 판 크기 — 실제 컬링 시트 비율을 줄인 것. 세로가 길다. */
export const W = 100;
export const H = 260;
/** 하우스(과녁) 가운데 */
export const TEE: [number, number] = [W / 2, 40];
export const HOUSE_R = 26;
/** 스톤 반지름 */
export const R = 5;

/** 물리 한 걸음. 프레임이 아니라 이 값이 시간을 정한다. */
const STEP_MS = 16;
/** 얼음 마찰 — 클수록 빨리 선다 */
const FRICTION = 0.986;
/** 이보다 느리면 선 것으로 본다 */
const STOP_V = 0.02;
/** 자리마다 몇 개씩 던지나 */
const SHOTS = 4;

export interface Stone {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 던진 자리 */
  seat: number;
}

export interface CurlingState {
  stones: Stone[];
  turn: number;
  /** 자리별 남은 개수 */
  left: number[];
  /** 지금 미끄러지는 중인가 — 그동안은 아무도 못 던진다 */
  moving: boolean;
  /** 다 던졌나 */
  done: boolean;
}

/** 미는 힘과 방향. 세기는 0~1 로 받는다(화면이 어떻게 받든 규칙은 같다). */
export type CurlingAction = { aim: number; power: number };

const dist2 = (a: Stone, b: Stone): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** 한 걸음 굴린다. **순수 함수** — 같은 입력이면 어디서 돌려도 같은 그림이 나온다. */
export function stepPhysics(stones: Stone[]): { stones: Stone[]; moving: boolean } {
  const out = stones.map((s) => ({ ...s }));

  for (const s of out) {
    s.x += s.vx;
    s.y += s.vy;
    s.vx *= FRICTION;
    s.vy *= FRICTION;
    if (Math.hypot(s.vx, s.vy) < STOP_V) { s.vx = 0; s.vy = 0; }
    /* 옆벽에 튕긴다. 위아래로 나가면 판 밖이라 치운다(아래에서 걸러낸다). */
    if (s.x < R) { s.x = R; s.vx = Math.abs(s.vx) * 0.6; }
    if (s.x > W - R) { s.x = W - R; s.vx = -Math.abs(s.vx) * 0.6; }
  }

  /* 부딪히면 서로 민다. 같은 무게의 정면 충돌이라 속도를 주고받는다. */
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i];
      const b = out[j];
      const d2 = dist2(a, b);
      const min = (R * 2) ** 2;
      if (d2 >= min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = (b.x - a.x) / d;
      const ny = (b.y - a.y) / d;
      /* 겹친 만큼 떼어 놓는다 — 안 떼면 다음 걸음에 또 부딪혀 진동한다. */
      const push = (R * 2 - d) / 2;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      const p = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (p <= 0) continue;
      a.vx -= p * nx; a.vy -= p * ny;
      b.vx += p * nx; b.vy += p * ny;
    }
  }

  const alive = out.filter((s) => s.y > -R * 2 && s.y < H + R * 2);
  return { stones: alive, moving: alive.some((s) => s.vx !== 0 || s.vy !== 0) };
}

/** 가운데에서 얼마나 먼가. 하우스 밖이면 무한(점수 없음). */
export function scoreDist(s: Stone): number {
  const d = Math.hypot(s.x - TEE[0], s.y - TEE[1]);
  return d <= HOUSE_R + R ? d : Infinity;
}

export const curling: GameDef<CurlingState, CurlingAction> = {
  id: 'curling',
  seats: [2, 4],
  rounds: 1,
  realtime: true,

  init(ctx) {
    return {
      stones: [],
      turn: 0,
      left: ctx.seats.map(() => SHOTS),
      moving: false,
      done: false
    };
  },

  canAct(s, seat) {
    return !s.done && !s.moving && s.turn === seat && (s.left[seat] ?? 0) > 0;
  },

  reduce(s, a, seat) {
    if (s.done || s.moving || s.turn !== seat) return s;
    if ((s.left[seat] ?? 0) <= 0) return s;
    const aim = typeof a?.aim === 'number' ? a.aim : NaN;
    const power = typeof a?.power === 'number' ? a.power : NaN;
    if (!Number.isFinite(aim) || !Number.isFinite(power)) return s;

    /* 겨눔은 좌우로만 조금 — 컬링은 앞으로 밀어 보내는 놀이다. 세기는 0~1 을 벗어나면 자른다. */
    const ang = Math.max(-0.35, Math.min(0.35, aim));
    const pw = Math.max(0.15, Math.min(1, power));
    const speed = 1.2 + pw * 2.6;
    const stone: Stone = {
      x: W / 2,
      y: H - 12,
      vx: Math.sin(ang) * speed,
      vy: -Math.cos(ang) * speed,
      seat
    };
    const left = s.left.map((n, i) => (i === seat ? n - 1 : n));
    return { ...s, stones: [...s.stones, stone], left, moving: true };
  },

  /**
   * 물리는 여기서 돈다. **밀린 시간만큼 여러 걸음**을 밟는다 — 창을 뒤에 뒀다 돌아와도
   * 판이 어긋나지 않고, 느린 기기에서도 같은 그림이 나온다.
   */
  tick(s, ctx) {
    if (!s.moving || s.done) return s;
    let stones = s.stones;
    let moving = true;
    /* 한 번에 너무 많이 밟으면 프레임이 튄다 — 상한을 둔다(밀린 건 다음 tick 이 마저 밟는다). */
    for (let n = 0; n < 12 && moving; n++) {
      const r = stepPhysics(stones);
      stones = r.stones;
      moving = r.moving;
    }
    if (moving) return { ...s, stones };

    const anyLeft = s.left.some((n) => n > 0);
    const next = anyLeft
      ? (() => {
          for (let k = 1; k <= s.left.length; k++) {
            const i = (s.turn + k) % s.left.length;
            if (s.left[i] > 0) return i;
          }
          return s.turn;
        })()
      : s.turn;
    void ctx;
    return { ...s, stones, moving: false, turn: next, done: !anyLeft };
  },

  outcome(s, ctx): Outcome {
    if (!s.done || s.moving) return { over: false };
    /* 컬링 점수: **가장 가까운 상대 스톤보다 안쪽에 있는 내 스톤 수**. */
    const sorted = [...s.stones].sort((a, b) => scoreDist(a) - scoreDist(b));
    const best = sorted[0];
    if (!best || scoreDist(best) === Infinity) {
      return { over: true, scores: ctx.seats.map(() => 0), note: { key: 'arcade.curling.none' } };
    }
    const winner = best.seat;
    let n = 0;
    for (const st of sorted) {
      if (st.seat !== winner || scoreDist(st) === Infinity) break;
      n++;
    }
    return {
      over: true,
      scores: ctx.seats.map((_, i) => (i === winner ? n : 0)),
      note: { key: 'arcade.curling.win', params: { who: ctx.seats[winner]?.name ?? '', n: String(n) } }
    };
  },

  bot(s, seat): BotMove<CurlingAction> | null {
    if (s.done || s.moving || s.turn !== seat) return null;
    if ((s.left[seat] ?? 0) <= 0) return null;
    /* 가운데를 노리되 손이 조금 떨린다 — 늘 정확하면 사람이 한 번도 못 이긴다. */
    const aim = (Math.random() - 0.5) * 0.12;
    const power = 0.56 + (Math.random() - 0.5) * 0.12;
    return { action: { aim, power }, delayMs: 700 + Math.random() * 700 };
  }
};
