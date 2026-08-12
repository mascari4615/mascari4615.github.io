/**
 * 반응 측정 — 실시간·동시·여러 명 (TASK-KL-242)
 *
 * 커널이 「동시에 손을 뻗는 게임」을 감당하는지 보여 주는 자리. 제한시간이 흐르고, 아무나
 * 먼저 맞히면 그 사람이 가져간다. 차례가 없다 = `canAct` 를 안 쓴다.
 *
 * 문제는 씨앗에서 나온다 — 같은 방에 있는 넷은 **같은 문제**를 본다. 다르면 시합이 아니다.
 * 판마다 제한시간이 줄어든다(와리오웨어: 설명을 읽을 틈이 없어야 재밌다).
 */
import type { GameDef, GameCtx, BotMove } from '../types';
import { pick, shuffle } from '../rng';

export interface ReflexState {
  order: string;
  choices: string[];
  answer: number;
  /** 이 시각을 넘기면 판이 끝난다 (커널 시계) */
  endsAt: number;
  startedAt: number;
  /** 자리별로 고른 것 — 아직 안 골랐으면 null */
  picks: Array<{ choice: number; at: number } | null>;
}

export type ReflexAction = { choice: number };

const LIMIT_START = 4000;
const LIMIT_STEP = 500;

const COLORS: Array<[string, string]> = [
  ['빨강', '#ef4444'], ['파랑', '#3b82f6'], ['초록', '#22c55e'],
  ['노랑', '#eab308'], ['보라', '#a855f7'], ['주황', '#f97316']
];

/** 판 만들기 — 세 갈래를 씨앗으로 고른다. */
function makeRound(ctx: GameCtx, limitMs: number): ReflexState {
  const kind = Math.floor(ctx.rng() * 3);
  let order = '';
  let choices: string[] = [];
  let answer = 0;

  if (kind === 0) {
    /* 큰 수 고르기 */
    const nums = new Set<number>();
    while (nums.size < 4) nums.add(Math.floor(ctx.rng() * 90) + 10);
    choices = [...nums].map(String);
    const max = Math.max(...[...nums]);
    answer = choices.indexOf(String(max));
    order = '큰 것!';
  } else if (kind === 1) {
    /* 더하기 */
    const a = Math.floor(ctx.rng() * 40) + 5;
    const b = Math.floor(ctx.rng() * 40) + 5;
    const sum = a + b;
    const set = new Set<number>([sum]);
    while (set.size < 4) set.add(sum + Math.floor(ctx.rng() * 18) - 9);
    choices = shuffle(ctx.rng, [...set]).map(String);
    answer = choices.indexOf(String(sum));
    order = `${a} + ${b}`;
  } else {
    /* 글자 말고 색을 골라라 — 글자와 색이 어긋난다(스트룹) */
    const target = pick(ctx.rng, COLORS);
    const rest = shuffle(ctx.rng, COLORS.filter((c) => c[0] !== target[0]));
    answer = Math.floor(ctx.rng() * 4);
    choices = [];
    const tint: string[] = [];
    for (let i = 0; i < 4; i++) {
      if (i === answer) { choices.push(rest[0][0]); tint.push(target[1]); }
      else { const c = rest[(i % 3) + 1] ?? rest[1]; choices.push(c[0]); tint.push(c[1]); }
    }
    order = `${target[0]} 색!`;
    /* 색은 화면이 알아야 하니 글자에 섞어 보낸다 — 상태는 그물망을 건너야 해서 통짜 값만 쓴다 */
    choices = choices.map((c, i) => `${c}\u0000${tint[i]}`);
  }

  return { order, choices, answer, startedAt: ctx.now, endsAt: ctx.now + limitMs, picks: ctx.seats.map(() => null) };
}

export const reflex: GameDef<ReflexState, ReflexAction> = {
  id: 'reflex',
  seats: [2, 8],
  rounds: 5,
  realtime: true,

  init(ctx) {
    /* 판이 갈수록 짧아진다 — 마지막 판은 1.5초다. 밑을 두는 이유: 0 으로 수렴하면
       사람이 손을 뻗기도 전에 끝나 시합이 아니라 화면 깜빡임이 된다. */
    return makeRound(ctx, Math.max(1500, LIMIT_START - ctx.round * LIMIT_STEP));
  },

  reduce(s, a, seat, ctx) {
    if (s.picks[seat]) return s;
    if (ctx.now > s.endsAt) return s;
    if (a.choice < 0 || a.choice >= s.choices.length) return s;
    const picks = s.picks.slice();
    picks[seat] = { choice: a.choice, at: ctx.now };
    return { ...s, picks };
  },

  tick(s) {
    return s;
  },

  outcome(s, ctx) {
    const everyone = s.picks.every((p) => p !== null);
    const timeUp = ctx.now >= s.endsAt;
    if (!everyone && !timeUp) return { over: false };

    /* 맞힌 사람 중 제일 빠른 한 명만 가져간다. 아무도 못 맞히면 아무도 못 가져간다. */
    let best = -1;
    let bestAt = Infinity;
    s.picks.forEach((p, i) => {
      if (p && p.choice === s.answer && p.at < bestAt) { best = i; bestAt = p.at; }
    });
    const scores = s.picks.map((_, i) => (i === best ? 1 : 0));
    return {
      over: true,
      scores,
      note:
        best < 0
          ? { key: 'arcade.reflex.none' }
          : {
              key: 'arcade.reflex.fastest',
              params: { who: ctx.seats[best]?.name ?? '', ms: String(Math.round(bestAt - s.startedAt)) }
            }
    };
  },

  bot(s, seat): BotMove<ReflexAction> | null {
    if (s.picks[seat]) return null;
    const limit = s.endsAt - s.startedAt;
    /* 사람처럼 — 가끔 틀리고 가끔 늦는다. 늘 맞히면 이길 수 없고 늘 틀리면 이길 이유가 없다. */
    const right = Math.random() < 0.72;
    const choice = right ? s.answer : (s.answer + 1 + Math.floor(Math.random() * 3)) % s.choices.length;
    return { action: { choice }, delayMs: 500 + Math.random() * Math.max(400, limit - 900) };
  }
};
