/**
 * 대회. 다섯 판을 이어서, 같은 사람들과 (TASK-KL-264)
 *
 * 클럽하우스 51 의 알맹이는 게임 51개가 아니라 **그중 몇 개로 겨루는 한 자리**다.
 * 한 판씩 따로 하면 51개는 그냥 목록이지만, 다섯 판을 이어 붙이면 그게 저녁 한때가 된다.
 *
 * 셈법이 이 파일의 전부다. 게임마다 점수의 뜻이 다르다. 제기는 많이 찰수록, 반응 측정은
 * 빠를수록, 오목은 이기면 1. **그래서 점수를 더하면 안 된다.** 대신 매 판 **등수**만 본다:
 * 1등 3점, 2등 1점, 나머지 0. 클럽하우스도, 마리오 파티도 같은 자리에서 같은 답을 냈다.
 *
 * 같이 노는 사람들은 다섯 판 내내 그대로다. 또 깜냥한테 졌다가 되려면 깜냥이 다음 판에도
 * 있어야 한다.
 */
import type { Kind } from './meta';
import type { BotPersona } from './bots';
import { PARTY } from './seating';
import { ranks } from './rank';

export { PARTY };

export const ROUNDS = 5;
/* 대회 인원 = 오락실 인원. 정본은 `seating.ts`. 대회만의 수가 아니다(로비에서 혼자 열어도
   같은 수로 앉는다). 판마다 인원이 바뀌면 점수표가 성립하지 않으므로 셋이 앉는 판만 고른다. */
/** 등수 점수. 1등 3, 2등 1, 나머지 0. */
const PRIZE = [3, 1];

export interface TourState {
  games: string[];
  /** 지금 몇 번째 판인가 (0부터) */
  at: number;
  /** 자리별 누적 점수 */
  points: number[];
  /** 다섯 판을 함께 할 사람들 */
  crew: BotPersona[];
}

/**
 * 다섯 판을 뽑는다. **갈래를 돌려 가며** 뽑아 비슷한 것만 이어지지 않게 한다 . 
 * 보드 다섯 판이면 그건 대회가 아니라 시험이다.
 */
export function pickGames(
  all: Array<{ id: string; kind: Kind; seats: [number, number] }>,
  rng: () => number = Math.random
): string[] {
  /* 셋이 앉을 수 있는 판만. 둘만 앉는 판(오목, 바둑)은 대회에서 한 사람을 쉬게 만든다. */
  const fit = all.filter((g) => g.seats[0] <= PARTY && g.seats[1] >= PARTY);
  const order: Kind[] = ['quick', 'board', 'sport', 'card', 'puzzle'];
  const out: string[] = [];
  for (let i = 0; i < ROUNDS; i++) {
    const kind = order[i % order.length];
    const pool = fit.filter((g) => g.kind === kind && !out.includes(g.id));
    const from = pool.length ? pool : fit.filter((g) => !out.includes(g.id));
    if (!from.length) break;
    out.push(from[Math.floor(rng() * from.length)].id);
  }
  return out;
}

/**
 * 한 판이 끝났다. **등수로** 점수를 준다. 같은 점수면 같은 등수(둘 다 1등이면 둘 다 3점).
 * 판마다 점수의 뜻이 달라서 raw 점수를 더하면 제기 한 판이 대회 전체를 정해 버린다.
 */
export function award(state: TourState, scores: number[]): TourState {
  /* 등수 셈은 `rank.ts` 한 곳. 결과 화면과 여기가 갈리면 화면엔 2등인데 점수는 0인 판이 난다. */
  const order = ranks(scores);
  const points = state.points.map((p, i) => {
    /* 그 판에 안 앉은 자리는 **0점도 아니고 등수도 없다.** 없는 점수를 0으로 치면
       안 나온 사람이 꼴찌가 되는데, 그건 셈이 아니라 사고다. */
    if (i >= scores.length) return p;
    return p + (PRIZE[order[i]] ?? 0);
  });
  return { ...state, points, at: state.at + 1 };
}

export const isOver = (s: TourState): boolean => s.at >= s.games.length;
