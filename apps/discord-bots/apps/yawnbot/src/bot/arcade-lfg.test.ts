/**
 * 채널이 언제 부르고 언제 안 부르나 (change.arcade-online)
 *
 * - 부르는 것보다 **안 부르는 것**. 도배가 한 번 나면 그 채널은 다시 안 읽힘
 * - 시계는 인자. 30분을 진짜로 안 기다림
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { tryCall, resetLfg, WARMUP_MS, COOLDOWN_MS, PER_HOUR } from './arcade-lfg';

const T0 = 1_700_000_000_000;

beforeEach(() => resetLfg());

/** 실제로 부른 것으로 치려면 한 번 통과시켜야 함. 통과가 곧 기록 */
function call(game: string, at: number): string {
  return tryCall(game, WARMUP_MS, at);
}

describe('등급전 부르기', () => {
  it('서자마자는 안 부른다', () => {
    expect(tryCall('gomoku', 0, T0)).toBe('early');
    expect(tryCall('gomoku', WARMUP_MS - 1, T0)).toBe('early');
    expect(tryCall('gomoku', WARMUP_MS, T0)).toBe('ok');
  });

  it('같은 놀이는 30분 안에 두 번 안 부른다', () => {
    expect(call('gomoku', T0)).toBe('ok');
    expect(call('gomoku', T0 + COOLDOWN_MS - 1)).toBe('cooldown');
    expect(call('gomoku', T0 + COOLDOWN_MS)).toBe('ok');
  });

  it('놀이가 다르면 따로 센다', () => {
    expect(call('gomoku', T0)).toBe('ok');
    expect(call('yacht', T0 + 1000)).toBe('ok');
  });

  it('한 시간에 넉 장까지', () => {
    for (let i = 0; i < PER_HOUR; i++) expect(call('game' + i, T0 + i * 1000)).toBe('ok');
    expect(call('other', T0 + 5000)).toBe('hourly');
    /* 한 시간이 지나면 다시 */
    expect(call('other', T0 + 60 * 60_000 + 1)).toBe('ok');
  });

  it('안 부른 판은 장부에 안 남는다. 이른 것이 시간당 상한을 먹으면 안 됨', () => {
    for (let i = 0; i < 10; i++) tryCall('gomoku', 0, T0 + i);
    expect(call('gomoku', T0 + 100)).toBe('ok');
  });
});
