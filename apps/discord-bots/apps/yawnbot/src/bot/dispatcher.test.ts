/**
 * dispatcher 코어 행동 테스트 (KAR-018-B slice-1).
 * tracer-bullet: public 인터페이스 행동 검증, 1테스트 1행동.
 */
import { describe, it, expect } from 'vitest';
import { decideTier, SessionRegistry } from './dispatcher';

describe('decideTier — 3-tier 라우팅 정책', () => {
  it('상태 조회 = tier1 (spawn 0)', () => {
    expect(decideTier({ isStatusQuery: true, isHeavyWork: false })).toBe('tier1');
  });

  it('상태 조회가 무거운 작업보다 우선 (즉답 우선)', () => {
    expect(decideTier({ isStatusQuery: true, isHeavyWork: true })).toBe('tier1');
  });

  it('무거운 다단계 = tier3 (풀세션)', () => {
    expect(decideTier({ isStatusQuery: false, isHeavyWork: true })).toBe('tier3');
  });

  it('그 외 = tier2 (단발 -p)', () => {
    expect(decideTier({ isStatusQuery: false, isHeavyWork: false })).toBe('tier2');
  });
});

describe('SessionRegistry — per-agent 동시 1 (B-2)', () => {
  it('비점유 코어는 acquire 성공', () => {
    const r = new SessionRegistry();
    expect(r.acquire('atlas')).toBe(true);
    expect(r.isBusy('atlas')).toBe(true);
  });

  it('점유 중 코어는 재-acquire 거부 (동시 1 상한)', () => {
    const r = new SessionRegistry();
    r.acquire('atlas');
    expect(r.acquire('atlas')).toBe(false);
  });

  it('다른 코어는 서로 독립 점유', () => {
    const r = new SessionRegistry();
    expect(r.acquire('atlas')).toBe(true);
    expect(r.acquire('kafu')).toBe(true);
  });

  it('release 후 다시 acquire 가능 (bounded 세션 재사용)', () => {
    const r = new SessionRegistry();
    r.acquire('atlas');
    r.release('atlas');
    expect(r.acquire('atlas')).toBe(true);
  });

  it('reclaimDead 는 죽은 pid 코어만 회수, 살아있는 것·예약(null)은 보존', () => {
    const r = new SessionRegistry();
    r.acquire('dead');
    r.bindPid('dead', 111);
    r.acquire('alive');
    r.bindPid('alive', 222);
    r.acquire('reserved'); // pid 미바인딩(null) — spawn 전

    const reclaimed = r.reclaimDead((pid) => pid === 222); // 222만 alive

    expect(reclaimed).toEqual(['dead']);
    expect(r.isBusy('dead')).toBe(false);
    expect(r.isBusy('alive')).toBe(true);
    expect(r.isBusy('reserved')).toBe(true); // null = race 회피 보존
  });
});
