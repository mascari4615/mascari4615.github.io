/**
 * 상한이 **세는 것**과 **거르는 것** (change.copresence-hardening 3단계).
 *
 * 시간을 실제로 흘려보내지 않는다 — 1초를 기다리는 시험은 검사가 아니라 지연이다.
 */
import { describe, expect, it } from 'vitest';
import { MOVE_LIMIT, OP_MAX_BYTES, RoomLimiter, opTooBig } from './room-limits';

describe('RoomLimiter', () => {
  it('몰아 쓰기까지는 통과하고 그 다음이 막힌다', () => {
    const limiter = new RoomLimiter(MOVE_LIMIT);
    const now = 1_000_000;
    for (let i = 0; i < MOVE_LIMIT.burst; i += 1) expect(limiter.take('a', now)).toBe(true);
    expect(limiter.take('a', now)).toBe(false);
  });

  it('시간이 지나면 그만큼 다시 찬다', () => {
    const limiter = new RoomLimiter({ rate: 10, burst: 10 });
    const now = 1_000_000;
    for (let i = 0; i < 10; i += 1) limiter.take('a', now);
    expect(limiter.take('a', now)).toBe(false);
    expect(limiter.take('a', now + 100)).toBe(true); // 0.1초 = 한 개
    expect(limiter.take('a', now + 100)).toBe(false);
  });

  it('참가자마다 따로 센다 — 한 사람의 폭주가 옆자리를 안 벌한다', () => {
    const limiter = new RoomLimiter({ rate: 1, burst: 1 });
    const now = 1_000_000;
    expect(limiter.take('room:a', now)).toBe(true);
    expect(limiter.take('room:a', now)).toBe(false);
    expect(limiter.take('room:b', now)).toBe(true);
  });

  it('오래 안 쓴 물통은 버린다 — 방문자 수만큼 쌓이면 그게 새는 자리다', () => {
    const limiter = new RoomLimiter({ rate: 1, burst: 1 });
    limiter.take('a', 1_000_000);
    limiter.sweep(1_000_000 + 61_000);
    expect(limiter.size).toBe(0);
  });
});

describe('opTooBig', () => {
  it('보통 편집 연산은 통과한다', () => {
    expect(opTooBig({ key: 'memo-1', ops: [{ type: 'ins', ch: 'ㄱ', at: 3 }] })).toBe(null);
  });

  it('너무 큰 것은 크기로 막는다', () => {
    expect(opTooBig({ text: 'x'.repeat(OP_MAX_BYTES + 1) })).toBe('size');
  });

  it('너무 깊은 것은 깊이로 막는다 — 받는 쪽 브라우저가 먼저 죽는다', () => {
    let deep: unknown = 'bottom';
    for (let i = 0; i < 20; i += 1) deep = { deep };
    expect(opTooBig(deep)).toBe('depth');
  });

  it('순환 참조는 잴 수 없으므로 막는다', () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(opTooBig(loop)).toBe('depth');
  });
});
