/**
 * 낚시. 기다렸다가, 당긴다 (TASK-KL-242)
 *
 * 다트가 흔들리는 겨눔을 멈추는 놀이였다면 이건 **기다리는 놀이**다. 아무 일도 안 일어나는
 * 동안 손가락을 참는 것이 수고, 입질이 오면 짧은 창 안에 당겨야 한다.
 *
 * 그래서 이 게임에서만 **아무것도 안 하는 것이 옳은 때가 있다.** 앞의 서른은 늘 뭔가 할 수
 * 있었다(못 두면 그건 막힌 것이었다). 여기서는 지금은 가만히 있는 게 맞다가 규칙이다.
 *
 * 씨앗으로 정해진 시각에 입질이 온다. 난수로 그때그때 뽑으면 창마다 다른 때에 물어
 * 여럿이 할 때 내가 본 것과 맞은 것이 갈린다(다트에서 배운 자리).
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';

/** 몇 마리까지 잡나 */
const CASTS = 5;
/**
 * 입질이 온 뒤 이 안에 당겨야 한다. 크기가 클수록 짧다 (레퍼런스 2026-09-03: Minecraft Java 1~2초, Bedrock 0.5초 사이)
 * 크기 1 은 1.18초, 41 은 0.5초
 */
export const windowOf = (size: number): number => Math.max(500, 1200 - size * 17);
/** 헛입질 한 번이 찌를 잠그는 시간 */
export const NIBBLE_MS = 300;
/** 긴장 바 높이. 트랙의 25% (Stardew 레벨 0 은 17%) */
export const BAR_H = 0.28;
/** 진행도. 바 안이면 오르고 밖이면 내림 (초당) */
const PROG_UP = 0.25;
const PROG_DOWN = 0.3;

export interface Fish {
  /** 이름 번호 (화면이 말 묶음에서 꺼낸다) */
  kind: number;
  /** 크기 = 점수 */
  size: number;
}

/** 긴장 단계. 물었다고 끝이 아니라 바 안에 물고기를 붙들어야 한다 (레퍼런스 2026-09-03: Stardew 의 긴장 바) */
export interface Fight {
  /** 물고기 자리 0~1 (0 이 아래) */
  fish: number;
  /** 바 아래끝 0~1 */
  bar: number;
  vel: number;
  /** 진행도 0~1. 1 이면 잡음, 0 이면 놓침 */
  prog: number;
  hold: boolean;
  /** 한 번도 바 밖으로 안 나갔나. 잡으면 x1.5 */
  perfect: boolean;
  /** 물고기 움직임 씨앗과 진폭. 큰 물고기가 더 튄다 */
  seed: number;
  amp: number;
  /** 마지막 tick 시각 */
  at: number;
  /** 시작 시각 */
  since: number;
}

export interface FishState {
  /** 자리별로 잡은 것 */
  caught: Fish[][];
  /** 자리별 헛입질 시각들. 진짜 입질 전에 찌가 살짝 잠김. 그때 당기면 회차 소진 */
  nibbleAt: number[][];
  /** 자리별 긴장 단계 (없으면 null) */
  fight: Array<Fight | null>;
  /** 자리별 남은 기회 */
  left: number[];
  /** 자리별: 지금 드리운 줄이 물리는 시각 (0 = 안 드리움) */
  biteAt: number[];
  /** 자리별: 이번에 걸릴 물고기 */
  next: Fish[];
  /** 자리별 마지막 결과. 2 완벽하게 잡음, 1 잡음, -1 놓침, 0 없음 */
  last: number[];
  over: boolean;
}

export type FishAction = { kind: 'cast' } | { kind: 'pull' } | { kind: 'hold'; on: boolean };

/** 물고기 종류 수. 화면이 넣어 준다. */
let KINDS = 5;
export function useFishKinds(n: number): void {
  KINDS = Math.max(1, n);
}

function rollFish(rng: () => number): Fish {
  const kind = Math.floor(rng() * KINDS);
  /* 작은 것이 흔하고 큰 것이 드물다. 세제곱으로 눌러 준다. */
  const r = rng();
  return { kind, size: Math.max(1, Math.round(r * r * r * 40) + 1) };
}

/** 한 회차의 끝. 잡았으면 담고(완벽은 x1.5), 아니면 놓침. 다음 물고기를 뽑는다 */
function finishCast(s: FishState, seat: number, ctx: GameCtx, ok: boolean, perfect: boolean): FishState {
  const fish = s.next[seat];
  const got: Fish = perfect ? { ...fish, size: Math.round(fish.size * 1.5) } : fish;
  const caught = ok ? s.caught.map((c, i) => (i === seat ? [...c, got] : c)) : s.caught;
  const left = s.left.map((v, i) => (i === seat ? Math.max(0, v - 1) : v));
  return {
    ...s,
    caught,
    left,
    over: left.every((n) => n <= 0),
    biteAt: s.biteAt.map((v, i) => (i === seat ? 0 : v)),
    nibbleAt: s.nibbleAt.map((v, i) => (i === seat ? [] : v)),
    fight: s.fight.map((x, i) => (i === seat ? null : x)),
    next: s.next.map((f, i) => (i === seat ? rollFish(ctx.rng) : f)),
    last: s.last.map((v, i) => (i === seat ? (ok ? (perfect ? 2 : 1) : -1) : v))
  };
}

export const fishing: GameDef<FishState, FishAction> = {
  id: 'fishing',
  seats: [1, 4],
  rounds: 1,
  realtime: true,

  init(ctx: GameCtx) {
    return {
      caught: ctx.seats.map(() => []),
      left: ctx.seats.map(() => CASTS),
      biteAt: ctx.seats.map(() => 0),
      nibbleAt: ctx.seats.map(() => []),
      fight: ctx.seats.map(() => null),
      next: ctx.seats.map(() => rollFish(ctx.rng)),
      last: ctx.seats.map(() => 0),
      over: false
    };
  },

  canAct(s, seat) {
    return !s.over && (s.left[seat] ?? 0) > 0;
  },

  reduce(s, a, seat, ctx) {
    if (s.over || (s.left[seat] ?? 0) <= 0) return s;

    if (a?.kind === 'cast') {
      if (s.biteAt[seat] !== 0) return s;
      /* 0.8초에서 3.0초 뒤에 문다. 그 앞에 헛입질 0~4번(간격 0.6~1.5초). 언제인지는 **미리 정해 둔다**. 그래야 모두가 같은 때를 본다 */
      const wait = 800 + ctx.rng() * 2200;
      const bite = ctx.now + wait;
      const nibbles: number[] = [];
      const n = Math.floor(ctx.rng() * 5);
      let at = bite;
      for (let k = 0; k < n; k += 1) {
        at -= 600 + ctx.rng() * 900;
        if (at < ctx.now + 300) break;
        nibbles.unshift(at);
      }
      return {
        ...s,
        biteAt: s.biteAt.map((v, i) => (i === seat ? bite : v)),
        nibbleAt: s.nibbleAt.map((v, i) => (i === seat ? nibbles : v)),
        last: s.last.map((v, i) => (i === seat ? 0 : v))
      };
    }

    if (a?.kind === 'hold') {
      const f = s.fight[seat];
      if (!f || f.hold === !!a.on) return s;
      return { ...s, fight: s.fight.map((x, i) => (i === seat ? { ...(x as Fight), hold: !!a.on } : x)) };
    }

    if (a?.kind !== 'pull') return s;
    if (s.fight[seat]) return s;
    const bite = s.biteAt[seat];
    if (bite === 0) return s;

    const fish = s.next[seat];
    const ok = ctx.now >= bite && ctx.now <= bite + windowOf(fish.size);
    if (ok) {
      /* 창 안에 당겼다. 이제 긴장 단계. 작은 것은 살살, 큰 것은 튄다 */
      const diff = 15 + fish.size * 2;
      const fight: Fight = { fish: 0.5, bar: 0.35, vel: 0, prog: 0.35, hold: false, perfect: true, seed: ctx.rng() * 1000, amp: 0.06 + diff * 0.0019, at: ctx.now, since: ctx.now };
      return { ...s, fight: s.fight.map((x, i) => (i === seat ? fight : x)), nibbleAt: s.nibbleAt.map((v, i) => (i === seat ? [] : v)) };
    }
    return finishCast(s, seat, ctx, false, false);
  },

  /** 창을 놓치면 물고기가 달아난다. 안 당기고 버티는 것도 실패다. 긴장 단계는 여기서 한 걸음씩 */
  tick(s, ctx) {
    if (s.over) return s;
    let out = s;
    s.biteAt.forEach((b, i) => {
      if (b === 0 || out.fight[i] || ctx.now <= b + windowOf(s.next[i].size)) return;
      out = finishCast(out, i, ctx, false, false);
    });
    out.fight.forEach((f, i) => {
      if (!f) return;
      const dt = Math.min(0.1, Math.max(0, (ctx.now - f.at) / 1000));
      if (dt <= 0) return;
      const t = ctx.now / 1000;
      /* 물고기. 느린 물결에 빠른 튐을 얹음. 큰 것일수록 진폭이 큼 (Dart 움직임) */
      const fish = Math.max(0, Math.min(1, 0.5 + Math.sin(t * 0.9 + f.seed) * 0.3 + Math.sin(t * 2.9 + f.seed * 2) * f.amp));
      /* 바. 누르면 오르고 놓으면 내림. 물속이라 속도가 빨리 죽는다(감쇠). 안 죽이면 바가 튕겨 봇도 사람도 못 잡음 (실측 0/166) */
      let vel = (f.vel + (f.hold ? 4.0 : -4.0) * dt) * Math.pow(0.08, dt);
      vel = Math.max(-1.2, Math.min(1.2, vel));
      let bar = f.bar + vel * dt;
      if (bar < 0) { bar = 0; vel = 0; }
      if (bar > 1 - BAR_H) { bar = 1 - BAR_H; vel = 0; }
      const inBar = fish >= bar && fish <= bar + BAR_H;
      const prog = f.prog + (inBar ? PROG_UP : -PROG_DOWN) * dt;
      const nextFight: Fight = { ...f, fish, bar, vel, prog: Math.max(0, Math.min(1, prog)), perfect: f.perfect && inBar, at: ctx.now };
      /* 10초가 넘으면 진행도 반으로 가름. 물고기와 바가 서로 쫓기만 하는 판이 안 끝나지 않게 */
      const timeUp = ctx.now - f.since >= 10000;
      if (prog >= 1 || (timeUp && prog >= 0.5)) out = finishCast({ ...out, fight: out.fight.map((x, k) => (k === i ? nextFight : x)) }, i, ctx, true, nextFight.perfect);
      else if (prog <= 0 || timeUp) out = finishCast({ ...out, fight: out.fight.map((x, k) => (k === i ? nextFight : x)) }, i, ctx, false, false);
      else out = { ...out, fight: out.fight.map((x, k) => (k === i ? nextFight : x)) };
    });
    return out;
  },

  outcome(s, ctx): Outcome {
    if (!s.over) return { over: false };
    const scores = s.caught.map((c) => c.reduce((a, f) => a + f.size, 0));
    const top = Math.max(...scores);
    const winners = ctx.seats.filter((_, i) => scores[i] === top);
    return {
      over: true,
      scores,
      note: { key: 'arcade.fish.win', params: { who: winners.map((w) => w.name).join(', '), n: String(top) } }
    };
  },

  bot(s, seat, ctx): BotMove<FishAction> | null {
    if (s.over || (s.left[seat] ?? 0) <= 0) return null;
    const f = s.fight[seat];
    if (f) {
      /* 긴장 단계. 물고기가 바 가운데보다 위면 당김. 사람처럼 조금 늦게 */
      const want = f.fish > f.bar + BAR_H / 2 + f.vel * 0.25;
      /* 같으면 아무것도 안 함(커널이 매 칸 다시 물음). 다르면 사람 손만큼 늦게 */
      return want === f.hold ? null : { action: { kind: 'hold', on: want }, delayMs: 60 + ctx.rng() * 100 };
    }
    if (s.biteAt[seat] === 0) return { action: { kind: 'cast' }, delayMs: 600 + ctx.rng() * 600 };
    /* 입질까지 기다렸다가 당긴다. 사람처럼 조금 늦고, 가끔 너무 이르다. */
    const wait = Math.max(0, s.biteAt[seat] - ctx.now);
    const early = ctx.rng() < 0.18;
    return {
      action: { kind: 'pull' },
      delayMs: early ? Math.max(0, wait - 500 - ctx.rng() * 600) : wait + 150 + ctx.rng() * 500
    };
  }
};
