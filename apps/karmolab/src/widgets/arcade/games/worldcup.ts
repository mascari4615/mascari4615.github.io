/**
 * 이상형 월드컵. 둘 중 하나만 고르고, 이긴 쪽만 올라간다 (change.arcade-absorbs-play 단계 1)
 *
 * 정답이 없는 첫 판. 고르는 사람이 곧 답이다. 그래서 규칙은 셈만 한다: 대진, 다음 판, 부전승.
 * 이긴 자리 없음. 끝나면 자리마다 우승자 하나, 둘이 같은 표를 돌렸으면 두 길의 겹침 셈
 *
 * 표(항목 이름과 그림)는 규칙이 모른다. 첫 수 `load` 가 실어 온다. 그래서 다시보기가 표 저장소
 * 없이도 돈다. 섞는 것은 씨앗. 같은 씨앗에 같은 표면 같은 대진이다(둘이 같이 하기).
 *
 * 항목은 번호. 이름은 `runners` 에 한 번, 대진과 기록은 번호만. 128강을 이름으로 적으면
 * 판 하나가 수십 KB, 방과 다시보기에 못 실음
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';

export interface WcRunner {
  name: string;
  img: string;
}

/** 한 대결. 몇 강에서 누가 누구를 이겼나 (번호) */
export interface WcMatch {
  win: number;
  lose: number;
  round: number;
}

/** 자리 하나의 대진. 둘이 같이 하면 자리마다 제 길을 간다 */
export interface WcLane {
  queue: number[];
  winners: number[];
  pair: [number, number] | null;
  roundOf: number;
  matches: WcMatch[];
  /** 우승 번호. 아직이면 -1 */
  champion: number;
}

export interface WcState {
  phase: 'pick' | 'play' | 'done';
  /** 어느 표였나. 통계와 자랑이 읽는다. `sharedId` 가 비면 안 올라간 표 */
  pack: { key: string; title: string; sharedId: string } | null;
  size: number;
  runners: WcRunner[];
  lanes: WcLane[];
}

export type WcAction =
  | { kind: 'load'; key: string; title: string; sharedId?: string; size: number; runners: WcRunner[] }
  | { kind: 'pick'; side: 0 | 1 };

export const MIN_RUNNERS = 4;
export const MAX_ROUND = 128;

/** 몇 강까지 할 수 있나. 표 크기가 정한다. 넷은 되어야 놀이가 된다 */
export function roundChoices(count: number): number[] {
  const out: number[] = [];
  for (let size = MIN_RUNNERS; size <= MAX_ROUND; size *= 2) if (size <= count) out.push(size);
  return out;
}

function shuffle(rng: () => number, list: number[]): number[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const emptyLane = (): WcLane => ({ queue: [], winners: [], pair: null, roundOf: 0, matches: [], champion: -1 });

/** 다음 대결을 세운다. 홀수로 남으면 부전승(대결이 아니므로 기록에 안 남긴다) */
function advance(l: WcLane): WcLane {
  let queue = l.queue.slice();
  let winners = l.winners.slice();
  let roundOf = l.roundOf;
  for (;;) {
    if (queue.length >= 2) {
      const pair: [number, number] = [queue[0], queue[1]];
      return { ...l, queue: queue.slice(2), winners, pair, roundOf };
    }
    if (queue.length === 1) {
      winners = winners.concat(queue);
      queue = [];
    }
    if (winners.length <= 1) {
      return { ...l, queue: [], winners: [], pair: null, roundOf, champion: winners.length === 1 ? winners[0] : -1 };
    }
    queue = winners;
    winners = [];
    roundOf = queue.length;
  }
}

function laneOf(order: number[]): WcLane {
  return advance({ ...emptyLane(), queue: order.slice(), roundOf: order.length });
}

function choose(l: WcLane, side: 0 | 1): WcLane {
  if (!l.pair) return l;
  const win = l.pair[side];
  const lose = l.pair[side === 0 ? 1 : 0];
  return advance({
    ...l,
    pair: null,
    winners: l.winners.concat([win]),
    matches: l.matches.concat([{ win, lose, round: l.roundOf }])
  });
}

/**
 * 두 길 견주기. 같은 갈림길만: 같은 라운드에서 **같은 둘**이 붙은 대결.
 * 다른 대진의 판을 섞어 세면 일치율이 뜻 없는 수
 */
export function agreement(mine: WcMatch[], theirs: WcMatch[]): { same: number; compared: number; rate: number } {
  let same = 0;
  let compared = 0;
  for (const m of mine) {
    const twin = theirs.find(
      (x) => x.round === m.round && (x.win === m.win || x.win === m.lose) && (x.lose === m.win || x.lose === m.lose)
    );
    if (!twin) continue;
    compared += 1;
    if (twin.win === m.win) same += 1;
  }
  return { same, compared, rate: compared ? Math.round((same / compared) * 100) : 0 };
}

const isRunner = (v: unknown): v is WcRunner => {
  const r = v as WcRunner | null;
  return !!r && typeof r === 'object' && typeof r.name === 'string' && r.name.length > 0 && typeof r.img === 'string';
};

export const worldcup: GameDef<WcState, WcAction> = {
  id: 'worldcup',
  /* 혼자. 오락실은 빈 자리를 봇으로 채우는데(`seating.ts` 의 셋), 봇이 무작위로 고른 길과 견주는 것은
     뜻이 없다. 둘이 같은 대진을 각자 돌리고 견주는 판(옛 같이 하기)은 자리를 둘로 열 길이 생기면 그때.
     규칙은 이미 자리마다 제 길을 가도록 되어 있다 */
  seats: [1, 1],
  rounds: 1,

  init(ctx: GameCtx): WcState {
    return { phase: 'pick', pack: null, size: 0, runners: [], lanes: ctx.seats.map(() => emptyLane()) };
  },

  canAct(s, seat) {
    if (s.phase === 'pick') return seat === 0;
    if (s.phase === 'play') return !!s.lanes[seat]?.pair;
    return false;
  },

  reduce(s, a, seat, ctx) {
    if (!a || typeof a !== 'object') return s;
    if (s.phase === 'pick') {
      /* 표는 주인 자리만 싣는다. 손님이 다른 표를 실으면 둘이 다른 판을 돌게 된다 */
      if (seat !== 0 || a.kind !== 'load') return s;
      if (!Array.isArray(a.runners) || typeof a.key !== 'string' || typeof a.title !== 'string') return s;
      const runners = a.runners.filter(isRunner).slice(0, MAX_ROUND * 2);
      const choices = roundChoices(runners.length);
      if (!choices.length) return s;
      const size = choices.indexOf(a.size) >= 0 ? a.size : choices[choices.length - 1];
      /* 씨앗이 섞는다. 같은 씨앗, 같은 표면 같은 대진 */
      const order = shuffle(ctx.rng, runners.map((_, i) => i)).slice(0, size);
      const picked = order.map((i) => runners[i]);
      const seq = picked.map((_, i) => i);
      return {
        phase: 'play',
        pack: { key: a.key, title: a.title, sharedId: typeof a.sharedId === 'string' ? a.sharedId : '' },
        size,
        runners: picked,
        lanes: s.lanes.map(() => laneOf(seq))
      };
    }
    if (s.phase !== 'play' || a.kind !== 'pick') return s;
    if (a.side !== 0 && a.side !== 1) return s;
    const lane = s.lanes[seat];
    if (!lane || !lane.pair) return s;
    const lanes = s.lanes.map((l, i) => (i === seat ? choose(l, a.side) : l));
    const done = lanes.every((l) => l.champion >= 0);
    return { ...s, lanes, phase: done ? 'done' : 'play' };
  },

  outcome(s): Outcome {
    if (s.phase !== 'done') return { over: false };
    /* 이긴 자리는 없다. 끝낸 자리 모두 1. 둘이면 비김으로 서고 알림이 겹침을 말한다 */
    const scores = s.lanes.map(() => 1);
    if (s.lanes.length >= 2) {
      const { rate } = agreement(s.lanes[0].matches, s.lanes[1].matches);
      return { over: true, scores, note: { key: 'arcade.worldcup.note.same', params: { rate: String(rate) }, sound: 'win' } };
    }
    const champion = s.runners[s.lanes[0]?.champion ?? -1];
    return { over: true, scores, note: { key: 'arcade.worldcup.note.champion', params: { name: champion?.name ?? '' }, sound: 'win' } };
  },

  /**
   * 봇은 표를 모름. 첫 자리 봇은 이름뿐인 넷을 싣고, 고를 때는 씨앗대로.
   * 사람이 앉으면 안 돎. `test:arcade` 의 "봇만으로 끝까지 간다" 가 이 판도 재는 조건
   */
  bot(s, seat, ctx): BotMove<WcAction> | null {
    if (s.phase === 'pick') {
      if (seat !== 0) return null;
      const runners = Array.from({ length: MIN_RUNNERS }, (_, i) => ({ name: 'r' + (i + 1), img: '' }));
      return { action: { kind: 'load', key: 'bot', title: 'bot', size: MIN_RUNNERS, runners }, delayMs: 200 };
    }
    if (s.phase !== 'play' || !s.lanes[seat]?.pair) return null;
    return { action: { kind: 'pick', side: ctx.rng() < 0.5 ? 0 : 1 }, delayMs: 300 };
  }
};
