/**
 * 제기차기. 떨어지는 순간에만 발이 닿는다 (TASK-KL-242)
 *
 * 반응 측정이 신호 보고 누르기라면 이건 **리듬을 이어가기**다. 신호가 따로 없다 . 
 * 내가 찬 제기가 언제 내려오는지 보고, 그 순간에 다시 차야 한다. 한 번 찰 때마다 체공이
 * 짧아지고 닿는 틈도 좁아져서, 잘할수록 판이 빨라진다.
 *
 * 여럿이 해도 **서로 방해하지 않는다**. 각자 자기 제기를 찬다. 그래도 남의 개수가 옆에
 * 보이는 것만으로 충분히 경기가 된다(놀이터에서 실제로 그렇다).
 *
 * 못 차고 떨어뜨리면 끝. 마지막까지 남거나, 시간이 다 되면 많이 찬 사람이 이긴다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

/** 닿는 틈. 처음엔 넉넉하고 점점 좁아진다 */
const WIN_FROM = 300;
const WIN_TO = 130;
/** 체공 시간. 점점 짧아진다 */
const FLY_FROM = 1150;
const FLY_TO = 560;
/** 이만큼 지나도 안 차면 떨어진 것 */
const DROP = 120;
const LIMIT_MS = 60000;
/** 이 개수쯤에서 제일 빨라진다 */
const RAMP = 25;

export interface JegiState {
  alive: boolean[];
  count: number[];
  /** 자리별로 제기가 발에 닿는 시각 */
  landAt: number[];
  endsAt: number;
  over: boolean;
}

export type JegiAction = { kind: 'kick' };

const ease = (n: number): number => Math.min(1, n / RAMP);
/** 지금 개수에서의 체공 시간 */
export const flight = (n: number): number => FLY_FROM + (FLY_TO - FLY_FROM) * ease(n);
/** 지금 개수에서 발이 닿는 틈 (앞뒤로) */
export const window_ = (n: number): number => WIN_FROM + (WIN_TO - WIN_FROM) * ease(n);

export const jegi: GameDef<JegiState, JegiAction> = {
  id: 'jegi',
  seats: [1, 6],
  rounds: 1,
  realtime: true,

  init(ctx) {
    return {
      alive: ctx.seats.map(() => true),
      count: ctx.seats.map(() => 0),
      /* 첫 제기는 손으로 띄운다. 다 같은 순간에 시작한다. */
      landAt: ctx.seats.map(() => ctx.now + FLY_FROM),
      endsAt: ctx.now + LIMIT_MS,
      over: false
    };
  },

  canAct(s, seat) {
    return !s.over && s.alive[seat];
  },

  reduce(s, a, seat, ctx) {
    if (s.over || !s.alive[seat] || a?.kind !== 'kick') return s;
    const gap = Math.abs(ctx.now - s.landAt[seat]);
    if (gap > window_(s.count[seat])) {
      /* 너무 이르거나 늦었다. 헛발질도 떨어뜨린 것이다. */
      const alive = s.alive.map((v, i) => (i === seat ? false : v));
      return { ...s, alive, over: alive.every((v) => !v) };
    }
    const count = s.count.map((v, i) => (i === seat ? v + 1 : v));
    const landAt = s.landAt.map((v, i) => (i === seat ? ctx.now + flight(count[seat]) : v));
    return { ...s, count, landAt };
  },

  tick(s, ctx) {
    if (s.over) return s;
    /* 안 차고 흘려보낸 사람은 떨어뜨린 것 */
    const alive = s.alive.map((v, i) => (v && ctx.now > s.landAt[i] + window_(s.count[i]) + DROP ? false : v));
    const over = alive.every((v) => !v) || ctx.now >= s.endsAt;
    return alive.some((v, i) => v !== s.alive[i]) || over !== s.over ? { ...s, alive, over } : s;
  },

  outcome(s, ctx): Outcome {
    if (!s.over) return { over: false };
    const top = Math.max(...s.count);
    const best = ctx.seats.filter((_, i) => s.count[i] === top);
    return {
      over: true,
      scores: s.count,
      note: { key: 'arcade.jegi.win', params: { who: best.map((w) => w.name).join(', '), n: String(top) } }
    };
  },

  bot(s, seat, ctx): BotMove<JegiAction> | null {
    if (s.over || !s.alive[seat]) return null;
    /* 제기가 내려오는 그 시각을 겨눈다. 흔들림이 있어 언젠가는 놓친다.
     *
     * **발버릇을 자리 번호로 가르지 않는다.** 전에는 `((seat % 3) - 1) * 20` 이라 0번은 늘
     * 20ms 이르고 2번은 늘 늦었는데, 제기는 자리끼리 서로를 안 막는 **대칭** 놀이다 . 
     * 대칭인데 결과가 비대칭이면 그건 실력이 아니라 고장이다. 실제로 0번이 97% 이겼고
     * 평균 개수도 95.0 / 91.7 / 88.6 으로 자리 순서 그대로였다(저울 실측). 지우니 0.37 /
     * 0.33 / 0.30, 평균 91.7 / 91.7 / 91.6. 봇마다 다른 손버릇은 좌석 층이 따로 씌운다. */
    const shake = (ctx.rng() - 0.5) * window_(s.count[seat]) * 1.4;
    return { action: { kind: 'kick' }, delayMs: Math.max(0, s.landAt[seat] - ctx.now + shake) };
  }
};
