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
  voicedWorkerSpeak,
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

  it('idle = trace-only, #team-bus 발화 X — 실 활동만 발화 (KAR-075)', async () => {
    const notified: string[] = [];
    const deps = {
      listWorkers: () => [W],
      scan: () => [],
      notify: (m: string) => {
        notified.push(m);
      },
    };
    // idle 3회: 비-이벤트 → Discord post 0 (producer-idle-null 정합,
    // 사용자 "이렇게 말하는 것좀 고쳐봐" — 3워커 '대기·쿨다운' 도배 해소).
    const r1 = await runWorkerConsumerOnce(env(), deps);
    await runWorkerConsumerOnce(env(), deps);
    await runWorkerConsumerOnce(env(), deps);
    expect(notified).toHaveLength(0); // 스팸 0
    expect(r1).toContain('idle'); // ground-truth = 반환/trace 에 보존(무손실)
    // 실 활동(작업 착수)은 여전히 발화 — heartbeat 아닌 의미활동.
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
    expect(notified).toHaveLength(1);
    expect(notified[0]).toContain('TASK-WM-9');
  });

  it('후보→claim ok→spawn done → 보고 + done', async () => {
    const notified: string[] = [];
    const claimed: string[] = [];
    const r = await runWorkerConsumerOnce(env(), {
      listWorkers: () => [W],
      scan: () => [{ id: 'TASK-WM-119', file: 'f.md' }],
      claim: (id) => { claimed.push(id); return true; },
      setupWorktree: () => ({ cwd: 'w', repoRoot: 'r', wtDir: 'w', branch: 'b' }),
      spawn: async () => ({ status: 'done' }),
      branchPushed: () => true, // origin 브랜치 실재 = claim 확정
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
      setupWorktree: () => ({ cwd: 'w', repoRoot: 'r', wtDir: 'w', branch: 'b' }),
      spawn: async () => ({ status: 'done' }),
      branchPushed: () => true,
      notify: () => {},
    });
    expect(tried).toEqual(['TASK-WM-1', 'TASK-WM-2']);
    expect(r).toBe('wm-worker:done:TASK-WM-2');
  });

  it('claim-confirm: done 이나 origin 브랜치 미푸시 → release·재시도(드레인 방지)', async () => {
    const released: string[] = [];
    const notified: string[] = [];
    const r = await runWorkerConsumerOnce(env(), {
      listWorkers: () => [W],
      scan: () => [{ id: 'TASK-WM-9', file: 'f.md' }],
      claim: () => true,
      release: (id) => released.push(id),
      setupWorktree: () => ({ cwd: 'w', repoRoot: 'r', wtDir: 'w', branch: 'b' }),
      spawn: async () => ({ status: 'done' }),
      branchPushed: () => false, // 산출 0 (스펙없음/blocked)
      notify: (m) => notified.push(m),
    });
    expect(r).toBe('wm-worker:done-no-artifact:TASK-WM-9');
    expect(released).toEqual(['TASK-WM-9']);
    expect(notified[0]).toContain('미푸시');
  });

  it('cooldown: no-artifact task 즉시 재pick 안 함 — 다른 후보 회전, 전부면 cooldown-all (degenerate 무한루프 차단, prod WM-084 실증)', async () => {
    const deps = {
      listWorkers: () => [W],
      claim: () => true,
      release: () => {},
      setupWorktree: () => ({ cwd: 'w', repoRoot: 'r', wtDir: 'w', branch: 'b' }),
      spawn: async () => ({ status: 'done' as const }),
      branchPushed: () => false, // 항상 미푸시 (영구 환경 blocker 모사)
      notify: () => {},
    };
    // 1틱: 후보 [A,B], A claim→no-artifact→cooldown
    const r1 = await runWorkerConsumerOnce(env(), {
      ...deps,
      scan: () => [
        { id: 'TASK-WM-1', file: 'a' },
        { id: 'TASK-WM-2', file: 'b' },
      ],
    });
    expect(r1).toBe('wm-worker:done-no-artifact:TASK-WM-1');
    // 2틱: 동일 후보 — A 는 cooldown 이라 skip, B 선택(무한 A 재pick X)
    const r2 = await runWorkerConsumerOnce(env(), {
      ...deps,
      scan: () => [
        { id: 'TASK-WM-1', file: 'a' },
        { id: 'TASK-WM-2', file: 'b' },
      ],
    });
    expect(r2).toBe('wm-worker:done-no-artifact:TASK-WM-2');
    // 3틱: 둘 다 cooldown → cooldown-all idle (무음 X, blocker 가시화)
    const r3 = await runWorkerConsumerOnce(env(), {
      ...deps,
      scan: () => [
        { id: 'TASK-WM-1', file: 'a' },
        { id: 'TASK-WM-2', file: 'b' },
      ],
    });
    expect(r3).toBe('wm-worker:cooldown-all');
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

// KAR-079: 원문 footer = Discord spoiler + budget 완화 회귀.
// 날조 가드(KL-061) 불변: voiced 가 사실 못 지우게 raw ground-truth 동봉.
describe('voicedWorkerSpeak — 원문 footer spoiler/budget (KAR-079)', () => {
  beforeEach(() => resetWorkerStatus());

  const capture = () => {
    const lines: string[] = [];
    const speak = async (_id: string, text: string) => {
      lines.push(text);
      return true;
    };
    return { lines, speak };
  };

  it('voiced 성공 → 원문이 Discord spoiler(||..||)로 감싸짐 + 200자 하드컷 폐기', async () => {
    const { lines, speak } = capture();
    const longStatus = 'WmWorker ▶ TASK-WM-010-A ' + 'x'.repeat(800);
    await voicedWorkerSpeak('c1', longStatus, speak, async () => 'voiced 보고');
    const out = lines[0];
    expect(out).toContain('· 원문: ||');
    expect(out.endsWith('||')).toBe(true);
    // 200자 하드컷 폐기 — spoiler 안 raw 가 옛 상한(200) 초과
    const raw = out.slice(out.indexOf('||') + 2, out.lastIndexOf('||'));
    expect(raw.length).toBeGreaterThan(200);
  });

  it('Discord 2000자 한계 — 극단 길이 status 도 총길이 ≤ 2000', async () => {
    const { lines, speak } = capture();
    const huge = 'A'.repeat(9000);
    await voicedWorkerSpeak('c1', huge, speak, async () => 'B'.repeat(3000));
    expect(lines[0].length).toBeLessThanOrEqual(2000);
  });

  it("status 내 '|' 는 '¦' 치환 → spoiler 조기종료 방지", async () => {
    const { lines, speak } = capture();
    await voicedWorkerSpeak('c1', 'a||b|c 보고', speak, async () => 'v');
    const out = lines[0];
    const raw = out.slice(out.indexOf('||') + 2, out.lastIndexOf('||'));
    expect(raw).not.toContain('|');
    expect(raw).toContain('¦');
  });

  it('voice 실패 → raw status 폴백 (스포일러 X, 날조 가드 불요 경로)', async () => {
    const { lines, speak } = capture();
    await voicedWorkerSpeak('c1', 'raw 그대로 보고', speak, async () => {
      throw new Error('voice down');
    });
    expect(lines[0]).toBe('raw 그대로 보고');
    expect(lines[0]).not.toContain('||');
  });

  it('동일 status 연속 → dedupe (speak 1회)', async () => {
    const { lines, speak } = capture();
    const v = async () => 'voiced';
    await voicedWorkerSpeak('c1', '같은 보고', speak, v);
    await voicedWorkerSpeak('c1', '같은 보고', speak, v);
    expect(lines.length).toBe(1);
  });
});
