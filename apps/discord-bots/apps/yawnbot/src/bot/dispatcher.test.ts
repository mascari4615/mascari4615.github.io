/**
 * dispatcher 코어 행동 테스트 (KAR-018-B slice-1).
 * tracer-bullet: public 인터페이스 행동 검증, 1테스트 1행동.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  decideTier,
  SessionRegistry,
  machineEligible,
  spawnTier3,
  type Tier3Deps,
} from './dispatcher';

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

describe('machineEligible — 머신 어피니티 (B-4)', () => {
  it('any/빈값은 어디서나 자격', () => {
    expect(machineEligible('any', 'laptop')).toBe(true);
    expect(machineEligible('', 'desktop')).toBe(true);
  });
  it('정확 일치만 자격 (desktop 코어는 laptop 에서 부적격)', () => {
    expect(machineEligible('desktop', 'desktop')).toBe(true);
    expect(machineEligible('desktop', 'laptop')).toBe(false);
  });
  it('cloud 패밀리 매칭 (cloud ↔ cloud-*)', () => {
    expect(machineEligible('cloud', 'cloud-kl')).toBe(true);
    expect(machineEligible('cloud-wm', 'cloud')).toBe(true);
  });
});

describe('spawnTier3 — 오케스트레이션 (B-1/2/4)', () => {
  function deps(over: Partial<Tier3Deps> = {}): Tier3Deps {
    return {
      thisMachine: 'laptop',
      reserve: () => true,
      run: vi.fn().mockResolvedValue('작업 완료'),
      registry: new SessionRegistry(),
      ...over,
    };
  }
  const req = { core: 'atlas', machine: 'any', prompt: 'do work' };

  it('자격·여유·예산 OK = run 실행 후 done', async () => {
    const d = deps();
    const res = await spawnTier3(req, d);
    expect(res).toEqual({ status: 'done', text: '작업 완료' });
    expect(d.run).toHaveBeenCalledWith(req);
  });

  it('머신 불일치 = wrong-machine, run 미실행 (다른 worker 가 드레인)', async () => {
    const d = deps();
    const res = await spawnTier3({ ...req, machine: 'desktop' }, d);
    expect(res.status).toBe('wrong-machine');
    expect(d.run).not.toHaveBeenCalled();
  });

  it('점유 중 = busy (per-agent 동시1)', async () => {
    const d = deps();
    d.registry.acquire('atlas');
    const res = await spawnTier3(req, d);
    expect(res.status).toBe('busy');
  });

  it('예산 거부 = budget-denied + expensive run 0 + release (KAR-018-Y Y-4 폭주차단 불변식)', async () => {
    const d = deps({ reserve: () => false });
    const res = await spawnTier3(req, d);
    expect(res.status).toBe('budget-denied');
    // ★ Y-4 핵심: verdict=stop/narrow(reserve=false) 시 비싼 agentic
    //   tier3(deps.run) 가 *절대 실행 안 됨* = 자율팀 폭주비용 차단.
    //   생산자·워커 둘 다 spawnTier3 경유 → 이 1 불변식이 양 축 커버.
    expect(d.run).not.toHaveBeenCalled();
    // 거부 경로도 registry release(acquire 후 finally) — 좀비 점유 X.
    expect(d.registry.isBusy('atlas')).toBe(false);
  });

  it('run 예외 = error, 그래도 release (bounded·좀비 X)', async () => {
    const d = deps({ run: vi.fn().mockRejectedValue(new Error('spawn 실패')) });
    const res = await spawnTier3(req, d);
    expect(res).toEqual({ status: 'error', error: 'spawn 실패' });
    expect(d.registry.isBusy('atlas')).toBe(false); // finally release
  });

  it('done 후에도 release (재acquire 가능)', async () => {
    const d = deps();
    await spawnTier3(req, d);
    expect(d.registry.isBusy('atlas')).toBe(false);
  });
});
