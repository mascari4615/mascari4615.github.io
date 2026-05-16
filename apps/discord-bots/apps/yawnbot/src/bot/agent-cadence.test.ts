/**
 * agent-cadence 순수부 행동 테스트 (KAR-018-B slice-3).
 * tracer-bullet: kill switch / parseCadenceWork / runCadenceOnce 행동.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  armKill,
  disarmKill,
  isKilled,
  parseCadenceWork,
  runCadenceOnce,
} from './agent-cadence';
import { SessionRegistry, type Tier3Deps } from './dispatcher';

afterEach(() => disarmKill()); // 모듈 전역 — 누수 방지

describe('kill switch (③ 사람·!kill)', () => {
  it('기본은 비활성', () => {
    expect(isKilled()).toBe(false);
  });
  it('arm → 활성, disarm → 복귀', () => {
    armKill();
    expect(isKilled()).toBe(true);
    disarmKill();
    expect(isKilled()).toBe(false);
  });
});

describe('parseCadenceWork — objectives.md 파서 (순수)', () => {
  const row = (id: string, align: string, status: string) =>
    `| ${id} | 목표X | self-task:x | ${align} | ${status} | - | - |`;

  it('active + 정렬 있는 행 → Tier3Request', () => {
    const w = parseCadenceWork(['헤더', row('OBJ-001', '§1', 'active')].join('\n'));
    expect(w).not.toBeNull();
    expect(w!.prompt).toContain('OBJ-001');
    expect(w!.prompt).toContain('§1');
  });

  it('active 지만 정렬 공백 = drift 차단 → null (skip)', () => {
    expect(parseCadenceWork(row('OBJ-002', '  ', 'active'))).toBeNull();
  });

  it('active 아닌 status = 선정 안 함', () => {
    expect(parseCadenceWork(row('OBJ-003', '§1', 'proposed'))).toBeNull();
  });

  it('표 행 없으면 null', () => {
    expect(parseCadenceWork('# 제목\n\n본문뿐')).toBeNull();
  });
});

describe('runCadenceOnce — tick (kill → pick → spawnTier3)', () => {
  function deps(runImpl = vi.fn().mockResolvedValue('ok')): Tier3Deps {
    return {
      thisMachine: 'any',
      reserve: () => true,
      run: runImpl,
      registry: new SessionRegistry(),
    };
  }

  it('kill 상태면 spawn 안 하고 killed', async () => {
    armKill();
    const d = deps();
    const r = await runCadenceOnce(d, () => ({ core: 'c', machine: 'any', prompt: 'p' }));
    expect(r).toBe('killed');
    expect(d.run).not.toHaveBeenCalled();
  });

  it('할 일 없으면 idle (spawn 안 함)', async () => {
    const d = deps();
    const r = await runCadenceOnce(d, () => null);
    expect(r).toBe('idle');
    expect(d.run).not.toHaveBeenCalled();
  });

  it('work 있으면 spawnTier3 → done', async () => {
    const d = deps();
    const r = await runCadenceOnce(d, () => ({ core: 'atlas', machine: 'any', prompt: 'work' }));
    expect(r).toBe('done');
    expect(d.run).toHaveBeenCalledTimes(1);
  });
});
