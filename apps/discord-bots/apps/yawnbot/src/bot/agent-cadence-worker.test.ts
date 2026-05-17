/**
 * 소비자 워커 cadence 회귀 테스트 (KAR-018-X, slot A).
 *
 * 생산자의 짝 — 도메인 워커가 자기 prefix TASK 를 pull→claim→tier3→
 * #team-bus 보고. 순수(selectWorkerCores/buildWorkerPrompt) + 주입
 * deps 로 IO 격리(실 claude·실 scan·실 claim 없이 분기 전수 잠금).
 * 계약 불변식: draft 워커 inert / claim 레이스 시 다음 후보 / 실패=release.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  selectWorkerCores,
  buildWorkerPrompt,
  runWorkerConsumerOnce,
  armKill,
  disarmKill,
  resetWorkerStatus,
  type WorkerCore,
} from './agent-cadence';
import type { CoreDef } from '../services/agent-core';

function core(over: Partial<CoreDef> & { id: string }): CoreDef {
  return {
    id: over.id,
    role: over.role ?? 'r',
    status: over.status ?? 'draft',
    defaultSkin: over.defaultSkin ?? '',
    emoji: over.emoji ?? '🛠',
    displayName: over.displayName ?? over.id,
    body: over.body ?? 'body',
    frontmatter: over.frontmatter ?? {},
  };
}

const env = () => ({ MEMO_REPO_PATH: '/tmp/memo' }) as NodeJS.ProcessEnv;

beforeEach(() => {
  disarmKill();
  resetWorkerStatus();
});

describe('selectWorkerCores (순수)', () => {
  it('kind:worker + status:active + domain → 워커', () => {
    const defs = [
      core({ id: 'wm-worker', status: 'active', frontmatter: { kind: 'worker', domain: 'wm' } }),
    ];
    const w = selectWorkerCores(defs);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ coreId: 'wm-worker', domain: 'WM', machine: 'any' });
  });

  it('atlas/echo(kind 미설정) = 워커 아님', () => {
    const defs = [
      core({ id: 'atlas', status: 'active', frontmatter: { role: 'infra' } }),
      core({ id: 'echo', status: 'active', frontmatter: {} }),
    ];
    expect(selectWorkerCores(defs)).toHaveLength(0);
  });

  it('draft 워커 = inert (사람 가동 승인 전)', () => {
    const defs = [
      core({ id: 'wm-worker', status: 'draft', frontmatter: { kind: 'worker', domain: 'WM' } }),
    ];
    expect(selectWorkerCores(defs)).toHaveLength(0);
  });

  it('domain 누락 워커 = 제외 (라우팅 불가)', () => {
    const defs = [
      core({ id: 'x', status: 'active', frontmatter: { kind: 'worker' } }),
      null,
    ];
    expect(selectWorkerCores(defs)).toHaveLength(0);
  });

  it('machine 어피니티 보존', () => {
    const defs = [
      core({ id: 'kl-worker', status: 'active', frontmatter: { kind: 'worker', domain: 'KL', machine: 'desktop' } }),
    ];
    expect(selectWorkerCores(defs)[0].machine).toBe('desktop');
  });
});

describe('buildWorkerPrompt (순수)', () => {
  it('대상 TASK id·파일 + autopilot 안전 룰셋 포함', () => {
    const p = buildWorkerPrompt({ id: 'TASK-WM-119', file: 'memo/wm/tasks/x.md' }, 'MISSION');
    expect(p).toContain('TASK-WM-119');
    expect(p).toContain('memo/wm/tasks/x.md');
    expect(p).toContain('Draft PR');
    expect(p).toMatch(/merge.*master.*force.*금지|force-push/);
    expect(p).toContain('MISSION');
  });
});

const W: WorkerCore = { coreId: 'wm-worker', domain: 'WM', machine: 'any', label: '🛠 WmWorker' };

describe('runWorkerConsumerOnce (주입 IO)', () => {
  it('killed → 호출 0', async () => {
    armKill();
    const r = await runWorkerConsumerOnce(env(), { listWorkers: () => [W] });
    expect(r).toBe('killed');
  });

  it('워커 없음 → no-workers', async () => {
    const r = await runWorkerConsumerOnce(env(), { listWorkers: () => [] });
    expect(r).toBe('no-workers');
  });

  it('후보 없음 → idle', async () => {
    const r = await runWorkerConsumerOnce(env(), {
      listWorkers: () => [W],
      scan: () => [],
      notify: () => {},
    });
    expect(r).toBe('wm-worker:idle');
  });

  it('idle 가시화: 첫 idle 은 #team-bus 알림, 동일 반복은 dedupe (KAR-018-Y)', async () => {
    const notified: string[] = [];
    const deps = {
      listWorkers: () => [W],
      scan: () => [],
      notify: (m: string) => {
        notified.push(m);
      },
    };
    await runWorkerConsumerOnce(env(), deps); // 1회: 알림
    await runWorkerConsumerOnce(env(), deps); // 2회: 동일 idle = dedupe
    await runWorkerConsumerOnce(env(), deps); // 3회: 여전히 dedupe
    expect(notified).toHaveLength(1);
    expect(notified[0]).toContain('대기');
    expect(notified[0]).toContain('WM');
    // 상태 변화(작업 생김) 시 재알림 — 다른 상태면 dedupe 해제
    const deps2 = {
      listWorkers: () => [W],
      scan: () => [{ id: 'TASK-WM-9', file: 'f' }],
      claim: () => true,
      spawn: async () => ({ status: 'done' }),
      notify: (m: string) => {
        notified.push(m);
      },
    };
    await runWorkerConsumerOnce(env(), deps2);
    expect(notified).toHaveLength(2);
    expect(notified[1]).toContain('TASK-WM-9');
  });

  it('후보→claim ok→spawn done → 보고 + done', async () => {
    const notified: string[] = [];
    const claimed: string[] = [];
    const r = await runWorkerConsumerOnce(env(), {
      listWorkers: () => [W],
      scan: () => [{ id: 'TASK-WM-119', file: 'f.md' }],
      claim: (id) => { claimed.push(id); return true; },
      spawn: async () => ({ status: 'done' }),
      notify: (m) => notified.push(m),
      missionText: 'M',
    });
    expect(r).toBe('wm-worker:done:TASK-WM-119');
    expect(claimed).toEqual(['TASK-WM-119']);
    expect(notified[0]).toContain('TASK-WM-119');
    expect(notified[0]).toContain('🛠 WmWorker');
  });

  it('claim 레이스 — 첫 후보 실패 시 다음 후보', async () => {
    const tried: string[] = [];
    const r = await runWorkerConsumerOnce(env(), {
      listWorkers: () => [W],
      scan: () => [
        { id: 'TASK-WM-1', file: 'a' },
        { id: 'TASK-WM-2', file: 'b' },
      ],
      claim: (id) => { tried.push(id); return id === 'TASK-WM-2'; },
      spawn: async () => ({ status: 'done' }),
      notify: () => {},
    });
    expect(tried).toEqual(['TASK-WM-1', 'TASK-WM-2']);
    expect(r).toBe('wm-worker:done:TASK-WM-2');
  });

  it('전 후보 claim 실패 → claim-lost (spawn 0)', async () => {
    let spawned = false;
    const r = await runWorkerConsumerOnce(env(), {
      listWorkers: () => [W],
      scan: () => [{ id: 'TASK-WM-1', file: 'a' }],
      claim: () => false,
      spawn: async () => { spawned = true; return { status: 'done' }; },
      notify: () => {},
    });
    expect(r).toBe('wm-worker:claim-lost');
    expect(spawned).toBe(false);
  });

  it('spawn 실패 → release 호출 + 실패 보고', async () => {
    const released: string[] = [];
    const notified: string[] = [];
    const r = await runWorkerConsumerOnce(env(), {
      listWorkers: () => [W],
      scan: () => [{ id: 'TASK-WM-9', file: 'f' }],
      claim: () => true,
      release: (id) => released.push(id),
      spawn: async () => ({ status: 'error' }),
      notify: (m) => notified.push(m),
    });
    expect(r).toBe('wm-worker:error');
    expect(released).toEqual(['TASK-WM-9']);
    expect(notified[0]).toContain('점유 해제');
  });

  it('MEMO_REPO_PATH 부재 → no-memo-root', async () => {
    const r = await runWorkerConsumerOnce({} as NodeJS.ProcessEnv, {
      listWorkers: () => [W],
    });
    expect(r).toBe('no-memo-root');
  });
});
