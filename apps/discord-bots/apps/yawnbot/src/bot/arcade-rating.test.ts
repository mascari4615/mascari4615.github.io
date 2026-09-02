/**
 * 점수가 놀이마다 다른 방식으로 움직이는가 (change.arcade-online 2번)
 *
 * - 한 방식으로 박으면 야추(3~4인 순위전)가 못 탐. 그 갈림이 여기서 지켜지는가
 * - 이긴 쪽이 오르고 진 쪽이 내리며, 둘의 합이 크게 안 새는가
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { applyResult as applyOutcome, mmrOf, pairFactor, ratingOf, recordOf, resetPairs, resetRatings, roomOf } from './arcade-rating';
import { rulesFor } from './arcade-ranked/registry';
import { seedStoredRatingForTest } from './arcade-ranked/rating-store';

const applyResult = (game: string, ranks: string[], draw = false) =>
  applyOutcome(game, { placements: draw ? [ranks] : ranks.map((id) => [id]) });

/* 진짜 장부를 안 건드림. 임시 자리로 돌림 */
beforeAll(() => {
  process.env.ARCADE_RATING_FILE = path.join(os.tmpdir(), 'arcade-ratings-test.json');
  process.env.ARCADE_PAIR_FILE = path.join(os.tmpdir(), 'arcade-pairs-test.json');
});
beforeEach(() => {
  resetRatings();
  resetPairs();
});

describe('점수 방식', () => {
  it('오목과 야추만 명시적으로 등록하고 기본 정책은 두지 않는다', () => {
    expect(rulesFor('gomoku')?.supportedSeats).toEqual(new Set([2]));
    expect(rulesFor('yacht')?.supportedSeats).toEqual(new Set([2, 3, 4]));
    expect(rulesFor('yacht')?.moveLimitSec).toBe(60);
    expect(rulesFor('someboard')).toBeNull();
  });

  it('미등록 게임과 미지원 야추 인원은 계산하지 않는다', () => {
    expect(() => applyOutcome('someboard', { placements: [['a'], ['b']] })).toThrow('unsupported_ranked_game');
    expect(() => applyOutcome('yacht', { placements: [['a'], ['b'], ['c'], ['d'], ['e']] })).toThrow('unsupported_seats:5');
    expect(ratingOf('yacht', 'a')).toBe(1500);
  });

  it('처음은 1500, 초심 방', () => {
    expect(ratingOf('gomoku', 'a')).toBe(1500);
    expect(roomOf(1500)).toBe('beginner');
    expect(roomOf(1600)).toBe('upper');
  });

  it('ELO: 이긴 쪽이 오르고 진 쪽이 그만큼 내린다', () => {
    const out = applyResult('gomoku', ['a', 'b']);
    expect(out[0].delta).toBeGreaterThan(0);
    expect(out[1].delta).toBeLessThan(0);
    /* 같은 점수끼리면 준 만큼 받음. 반올림 오차 1점까지 */
    expect(Math.abs(out[0].delta + out[1].delta)).toBeLessThanOrEqual(1);
    expect(recordOf('gomoku', 'a').wins).toBe(1);
    expect(recordOf('gomoku', 'b').wins).toBe(0);
  });

  it('ELO: 약한 쪽을 이기면 덜 오른다', () => {
    for (let i = 0; i < 6; i++) applyResult('gomoku', ['strong', 'weak']);
    const strong = ratingOf('gomoku', 'strong');
    const before = ratingOf('gomoku', 'weak');
    const out = applyResult('gomoku', ['strong', 'weak']);
    expect(strong).toBeGreaterThan(before);
    expect(out[0].delta).toBeLessThan(20);
  });

  it('ELO 무승부: 같은 점수면 둘 다 그대로, 이긴 횟수도 안 는다', () => {
    const out = applyResult('gomoku', ['a', 'b'], true);
    expect(Math.abs(out[0].delta)).toBeLessThanOrEqual(1);
    expect(recordOf('gomoku', 'a').wins).toBe(0);
    expect(recordOf('gomoku', 'a').games).toBe(1);
  });

  it('순위점: 1위가 가장 많이 오르고 등수대로 준다', () => {
    const out = applyResult('yacht', ['1st', '2nd', '3rd', '4th']);
    expect(out[0].delta).toBeGreaterThan(out[1].delta);
    expect(out[1].delta).toBeGreaterThan(out[2].delta);
    expect(out[2].delta).toBeGreaterThanOrEqual(out[3].delta);
    /* 초심 방은 꼴찌 감점 없음 (작혼 초심 강등 없음과 같은 뜻) */
    expect(out[3].delta).toBe(0);
  });

  it('공동 순위는 점유한 자리의 평균 점수를 받는다', () => {
    const out = applyOutcome('yacht', { placements: [['a', 'b'], ['c'], ['d']] });
    expect(out.map((row) => row.delta)).toEqual([35, 35, 5, 0]);
    expect(recordOf('yacht', 'a').wins).toBe(0);
    expect(recordOf('yacht', 'b').wins).toBe(0);
  });

  it('2, 3, 4인 어느 자리의 동률도 점유 자리 평균을 쓴다', () => {
    const cases = [
      { placements: [['a', 'b']], deltas: [15, 15] },
      { placements: [['a', 'b'], ['c']], deltas: [25, 25, 0] },
      { placements: [['a'], ['b', 'c']], deltas: [40, 5, 5] },
      { placements: [['a'], ['b', 'c'], ['d']], deltas: [50, 12.5, 12.5, 0] },
      { placements: [['a'], ['b'], ['c', 'd']], deltas: [50, 20, 2.5, 2.5] }
    ];
    for (const row of cases) {
      resetRatings();
      resetPairs();
      expect(applyOutcome('yacht', { placements: row.placements }).map((item) => item.delta)).toEqual(row.deltas);
    }
  });

  it('전원 공동 순위는 같은 점수를 받고 매칭 점수 합은 보존된다', () => {
    const out = applyOutcome('yacht', { placements: [['a', 'b', 'c', 'd']] });
    expect(out.map((row) => row.delta)).toEqual([18.75, 18.75, 18.75, 18.75]);
    expect(out.reduce((sum, row) => sum + (row.mmrDelta ?? 0), 0)).toBeCloseTo(0, 10);
    expect(['a', 'b', 'c', 'd'].map((id) => mmrOf('yacht', id))).toEqual([1500, 1500, 1500, 1500]);
  });

  it('표시 점수와 매칭 점수는 서로 다른 장부다', () => {
    applyOutcome('yacht', { placements: [['a'], ['b'], ['c'], ['d']] });
    expect(ratingOf('yacht', 'a')).toBe(1550);
    expect(mmrOf('yacht', 'a')).toBeGreaterThan(1500);
    expect(mmrOf('yacht', 'a')).not.toBe(ratingOf('yacht', 'a'));
  });

  it('옛 야추 점수는 표시 점수로 보존하고 MMR은 새로 시작한다', () => {
    seedStoredRatingForTest('yacht', 'old', { rating: 1675, games: 12, wins: 4 });
    expect(recordOf('yacht', 'old')).toEqual({ rating: 1675, mmr: 1500, games: 12, wins: 4 });
  });

  it('순위점: 윗방은 꼴찌가 깎인다', () => {
    /* 1위를 윗방으로 올린 뒤 그 방 표를 씀 */
    for (let i = 0; i < 3; i++) applyResult('yacht', ['top', 'x', 'y', 'z']);
    expect(roomOf(ratingOf('yacht', 'top'))).toBe('upper');
    const out = applyResult('yacht', ['top', 'x', 'y', 'z']);
    expect(out[3].delta).toBeLessThan(0);
  });

  it('놀이마다 따로 센다. 오목 점수가 야추 방을 안 정한다', () => {
    for (let i = 0; i < 12; i++) applyResult('gomoku', ['a', 'b']);
    expect(ratingOf('gomoku', 'a')).toBeGreaterThan(1500);
    expect(ratingOf('yacht', 'a')).toBe(1500);
  });

  it('점수는 바닥 아래로 안 간다', () => {
    for (let i = 0; i < 200; i++) applyResult('gomoku', ['win', 'lose']);
    expect(ratingOf('gomoku', 'lose')).toBeGreaterThanOrEqual(100);
  });
});

/**
 * 같은 짝끼리 반복 (부스팅) 감쇠
 *
 * - 둘이 짜고 한쪽만 이겨 주면 점수를 얼마든지 올릴 수 있음
 * - 막지는 않고 이득을 깎음. 사람이 적어 같은 상대와 여러 판이 정상이기 때문
 */
describe('같은 짝 반복', () => {
  it('다섯 판까지는 그대로, 그 뒤 절반, 열 판부터 5분의 1', () => {
    expect(pairFactor('gomoku', ['a', 'b'])).toBe(1);
    for (let i = 0; i < 5; i++) applyResult('gomoku', ['a', 'b']);
    expect(pairFactor('gomoku', ['a', 'b'])).toBe(0.5);
    for (let i = 0; i < 5; i++) applyResult('gomoku', ['a', 'b']);
    expect(pairFactor('gomoku', ['a', 'b'])).toBe(0.2);
  });

  it('짝이 다르면 안 깎인다', () => {
    for (let i = 0; i < 12; i++) applyResult('gomoku', ['a', 'b']);
    expect(pairFactor('gomoku', ['a', 'c'])).toBe(1);
    expect(pairFactor('yacht', ['a', 'b'])).toBe(1);
  });

  it('사람 순서를 안 탄다', () => {
    for (let i = 0; i < 6; i++) applyResult('gomoku', ['a', 'b']);
    expect(pairFactor('gomoku', ['b', 'a'])).toBe(0.5);
  });

  it('열두 판째 오름폭이 첫 판보다 작다', () => {
    const first = applyResult('gomoku', ['a', 'b'])[0].delta;
    for (let i = 0; i < 10; i++) applyResult('gomoku', ['a', 'b']);
    const late = applyResult('gomoku', ['a', 'b'])[0].delta;
    expect(late).toBeLessThan(first);
    expect(late).toBeGreaterThan(0);
  });

  it('순위점도 같이 깎인다', () => {
    const first = applyResult('yacht', ['p', 'q', 'r', 's'])[0].delta;
    for (let i = 0; i < 10; i++) applyResult('yacht', ['p', 'q', 'r', 's']);
    const late = applyResult('yacht', ['p', 'q', 'r', 's'])[0].delta;
    expect(first).toBe(50);
    /* 열한 판을 이겨 윗방으로 올라감. 윗방 1위 60 의 5분의 1 */
    expect(late).toBe(12);
  });
});
