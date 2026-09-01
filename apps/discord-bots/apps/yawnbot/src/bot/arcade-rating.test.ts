/**
 * 점수가 놀이마다 다른 방식으로 움직이는가 (change.arcade-online 2번)
 *
 * - 한 방식으로 박으면 야추(3~4인 순위전)가 못 탐. 그 갈림이 여기서 지켜지는가
 * - 이긴 쪽이 오르고 진 쪽이 내리며, 둘의 합이 크게 안 새는가
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { applyResult, methodFor, pairFactor, ratingOf, recordOf, resetPairs, resetRatings, roomOf } from './arcade-rating';

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
  it('오목은 ELO, 야추는 순위점, 모르는 놀이는 자리 수로', () => {
    expect(methodFor('gomoku')).toBe('elo');
    expect(methodFor('yacht')).toBe('place');
    expect(methodFor('someboard', 2)).toBe('elo');
    expect(methodFor('someboard', 4)).toBe('place');
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
