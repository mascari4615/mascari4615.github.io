import { describe, it, expect } from 'vitest';
import {
  emptyState,
  getOrCreateShareKey,
  getOrCreateDevKey,
  guildIdForShareKey,
  guildIdForDevKey,
  normalizeState,
} from './server-stats';

describe('열쇠 두 개 (카드 / 개발 콘솔)', () => {
  it('카드 키와 개발 키는 다른 값이다', () => {
    const state = emptyState();
    expect(getOrCreateDevKey(state, 'g1')).not.toBe(getOrCreateShareKey(state, 'g1'));
  });

  it('카드 키로는 개발 콘솔이 안 열린다', () => {
    // 이게 이 분리의 전부다 — 카드를 남에게 줘도 속은 안 보여야 한다.
    const state = emptyState();
    const share = getOrCreateShareKey(state, 'g1');
    getOrCreateDevKey(state, 'g1');
    expect(guildIdForDevKey(state, share)).toBeNull();
  });

  it('개발 키로는 카드 주소가 안 열린다', () => {
    const state = emptyState();
    getOrCreateShareKey(state, 'g1');
    const dev = getOrCreateDevKey(state, 'g1');
    expect(guildIdForShareKey(state, dev)).toBeNull();
  });

  it('한 번 만든 개발 키는 그대로 유지된다', () => {
    const state = emptyState();
    const first = getOrCreateDevKey(state, 'g1');
    expect(getOrCreateDevKey(state, 'g1')).toBe(first);
  });

  it('서버마다 다른 개발 키를 갖는다', () => {
    const state = emptyState();
    expect(getOrCreateDevKey(state, 'g1')).not.toBe(getOrCreateDevKey(state, 'g2'));
  });

  it('저장본에서 되살아난다', () => {
    const state = emptyState();
    const dev = getOrCreateDevKey(state, 'g1');
    const restored = normalizeState(JSON.parse(JSON.stringify(state)));
    expect(guildIdForDevKey(restored, dev)).toBe('g1');
  });

  it('개발 키가 없던 옛 저장본도 그대로 읽힌다', () => {
    const restored = normalizeState({ guilds: {}, shares: { g1: 'abc' } } as never);
    expect(restored.devKeys).toEqual({});
    expect(guildIdForShareKey(restored, 'abc')).toBe('g1');
  });
});
