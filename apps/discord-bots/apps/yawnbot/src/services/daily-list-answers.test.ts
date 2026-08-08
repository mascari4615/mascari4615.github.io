/**
 * 전부대기 집계 (TASK-KL-197) — 비율이 거짓말을 안 하는지만 본다.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DailyListStore, MIN_SAMPLE } from './daily-list-answers';

const tmpStore = (): DailyListStore =>
  new DailyListStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'daily-list-')), 'state.json'));

describe('DailyListStore', () => {
  it('표본이 적으면 비율을 안 준다 — 세 명이 푼 문제의 8% 는 숫자가 아니라 소음이다', () => {
    const store = tmpStore();
    store.report('pokemon', 'gen=1', ['리자몽']);
    expect(store.shares('pokemon', 'gen=1').shares).toBeNull();
    for (let i = 1; i < MIN_SAMPLE; i += 1) store.report('pokemon', 'gen=1', ['리자몽']);
    expect(store.shares('pokemon', 'gen=1').shares).toEqual({ 리자몽: 1 });
  });

  it('같은 이름을 두 번 쳐도 한 판은 한 번이다', () => {
    const store = tmpStore();
    for (let i = 0; i < MIN_SAMPLE; i += 1) store.report('lol', 'roles=서포터', ['소라카', '소라카', ' 소라카 ']);
    const { people, shares } = store.shares('lol', 'roles=서포터');
    expect(people).toBe(MIN_SAMPLE);
    // 「소라카」와 「 소라카 」는 같은 이름이다(양끝 공백은 사람이 안 세는 차이다).
    expect(shares?.소라카).toBe(1);
  });

  it('덜 나온 이름일수록 비율이 낮다', () => {
    const store = tmpStore();
    for (let i = 0; i < 10; i += 1) store.report('genshin', 'element=물', i < 9 ? ['푸리나', '탐닉'] : ['탐닉']);
    const { shares } = store.shares('genshin', 'element=물');
    expect(shares?.탐닉).toBe(1);
    expect(shares?.푸리나).toBeCloseTo(0.9);
  });

  it('저장했다 다시 읽어도 셈이 남는다', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'daily-list-')), 'state.json');
    const first = new DailyListStore(file);
    for (let i = 0; i < MIN_SAMPLE; i += 1) first.report('pokemon', 'gen=2', ['마릴']);
    expect(new DailyListStore(file).shares('pokemon', 'gen=2').people).toBe(MIN_SAMPLE);
  });
});
