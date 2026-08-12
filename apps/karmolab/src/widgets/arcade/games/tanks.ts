/**
 * 탱크 — 언덕 너머로 쏜다 (TASK-KL-242)
 *
 * 컬링·볼링·당구가 **바닥을 미끄러지는** 물리였다면 이건 **날아가는** 물리다 — 중력이 있고,
 * 땅이 울퉁불퉁하고, 맞은 자리가 파인다. 그래서 판이 쏠 때마다 조금씩 달라진다.
 *
 * 각도와 세기 둘을 고르고 쏜다. 빗나가면 **어디에 떨어졌는지 보고 고쳐 쏘는 것**이 이 놀이다 —
 * 그래서 지난 탄착점을 화면이 남겨 둔다(안 남기면 「감으로 또 찍기」가 된다).
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';

export const W = 100;
export const H = 60;
const G = 0.16;
const HP = 3;

export interface Shell {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface TanksState {
  /** 땅 높이 (x 마다) */
  ground: number[];
  /** 자리별 x 자리 */
  tank: number[];
  hp: number[];
  turn: number;
  /** 날아가는 중인 포탄 */
  shell: Shell | null;
  /** 마지막으로 떨어진 자리 — 화면이 남겨 준다 */
  marks: Array<{ x: number; y: number }>;
  over: boolean;
}

export type TanksAction = { angle: number; power: number };

/** 언덕 — 씨앗으로 만든 부드러운 굴곡. 매번 다른 판이라야 외운 각도가 안 통한다. */
function makeGround(ctx: GameCtx): number[] {
  const a = 6 + ctx.rng() * 8;
  const b = 4 + ctx.rng() * 6;
  const p1 = ctx.rng() * Math.PI * 2;
  const p2 = ctx.rng() * Math.PI * 2;
  return Array.from({ length: W }, (_, x) =>
    Math.max(6, Math.min(H - 10,
      18 + Math.sin(x / 17 + p1) * a + Math.sin(x / 7 + p2) * b))
  );
}

const groundAt = (g: number[], x: number): number => g[Math.max(0, Math.min(W - 1, Math.round(x)))];

export const tanks: GameDef<TanksState, TanksAction> = {
  id: 'tanks',
  seats: [2, 2],
  rounds: 1,
  realtime: true,

  init(ctx) {
    const ground = makeGround(ctx);
    return {
      ground,
      tank: [10, W - 10],
      hp: [HP, HP],
      turn: 0,
      shell: null,
      marks: [],
      over: false
    };
  },

  canAct(s, seat) {
    return !s.over && !s.shell && s.turn === seat;
  },

  reduce(s, a, seat) {
    if (s.over || s.shell || s.turn !== seat) return s;
    const angle = typeof a?.angle === 'number' ? a.angle : NaN;
    const power = typeof a?.power === 'number' ? a.power : NaN;
    if (!Number.isFinite(angle) || !Number.isFinite(power)) return s;

    const ang = Math.max(5, Math.min(85, angle)) * (Math.PI / 180);
    const pw = Math.max(0.2, Math.min(1, power));
    /* 45도에서 날아가는 거리 = v²/g. 두 탱크 사이가 80칸이므로 v 가 3.6 은 돼야 닿는다 —
       처음엔 최대 2.6 으로 잡아 **아무리 세게 쏴도 절반도 못 갔다**(봇끼리 붙였더니 안 끝났다). */
    const speed = 1.6 + pw * 2.8;
    const dir = seat === 0 ? 1 : -1;
    const x = s.tank[seat];
    return {
      ...s,
      shell: {
        x: x + dir * 2,
        y: groundAt(s.ground, x) + 2,
        vx: Math.cos(ang) * speed * dir,
        vy: Math.sin(ang) * speed
      }
    };
  },

  tick(s, ctx) {
    if (s.over || !s.shell) return s;
    let sh: Shell | null = { ...s.shell };
    let ground = s.ground;
    let hp = s.hp;
    let marks = s.marks;
    let turn = s.turn;

    for (let n = 0; n < 8 && sh; n++) {
      sh.x += sh.vx;
      sh.y += sh.vy;
      sh.vy -= G;

      /* 판 밖으로 나가면 그냥 사라진다(빗나감). */
      if (sh.x < 0 || sh.x > W - 1 || sh.y < -5) {
        marks = [...marks.slice(-4), { x: Math.max(0, Math.min(W - 1, sh.x)), y: 0 }];
        sh = null;
        turn = 1 - s.turn;
        break;
      }

      /* 상대에게 맞았나 — 탱크는 두 칸 폭이다. */
      const foe = 1 - s.turn;
      if (Math.abs(sh.x - s.tank[foe]) < 3 && sh.y <= groundAt(ground, sh.x) + 3) {
        hp = hp.map((v, i) => (i === foe ? v - 1 : v));
        marks = [...marks.slice(-4), { x: sh.x, y: sh.y }];
        sh = null;
        turn = foe;
        break;
      }

      /* 땅에 닿으면 파인다 — 다음 판이 조금 달라진다. */
      if (sh.y <= groundAt(ground, sh.x)) {
        const hit = Math.round(sh.x);
        ground = ground.map((g, x) => {
          const d = Math.abs(x - hit);
          return d < 4 ? Math.max(2, g - (4 - d) * 0.8) : g;
        });
        marks = [...marks.slice(-4), { x: sh.x, y: sh.y }];
        sh = null;
        turn = 1 - s.turn;
        break;
      }
    }

    const over = hp.some((v) => v <= 0);
    void ctx;
    return { ...s, ground, hp, marks, shell: sh, turn, over };
  },

  outcome(s, ctx): Outcome {
    if (!s.over) return { over: false };
    const win = s.hp[0] > 0 ? 0 : 1;
    return {
      over: true,
      scores: ctx.seats.map((_, i) => (i === win ? 1 : 0)),
      note: { key: 'arcade.tanks.win', params: { who: ctx.seats[win]?.name ?? '', n: String(s.hp[win]) } }
    };
  },

  bot(s, seat): BotMove<TanksAction> | null {
    if (s.over || s.shell || s.turn !== seat) return null;
    /* 거리에 맞춰 어림잡고 손이 떨린다 — 맞히는 데 두세 발 걸린다(사람과 비슷하게). */
    /* 45도 사거리 = v²/g 이므로 필요한 v 는 √(거리×g). 거기서 세기를 거꾸로 푼다. */
    const dist = Math.abs(s.tank[1 - seat] - s.tank[seat]);
    const want = Math.sqrt(dist * 0.16);
    const power = Math.max(0.2, Math.min(1, (want - 1.6) / 2.8 + (Math.random() - 0.5) * 0.16));
    const angle = 45 + (Math.random() - 0.5) * 22;
    return { action: { angle, power }, delayMs: 900 + Math.random() * 700 };
  }
};
