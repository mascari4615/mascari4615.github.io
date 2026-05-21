/**
 * 워커 decision-needed escalate 회귀 테스트 (TASK-KAR-018-ESC).
 *
 * 근본: 워커가 *사용자 결정 필요* task(type:design / agentic escalate
 * 마커)를 픽해 미푸시면, 종전엔 실패와 동일 silent release+30min
 * cooldown 으로 붕괴 → 사용자가 디코서 결정할 기회 자체가 안 생기고
 * 30분마다 churn(prod WM-010-A 2회 실증). fix = 그 케이스를 #team-bus
 * (agent-thread-router 가 TASK id 로 per-TASK 스레드 라우팅)로 escalate.
 *
 * 불변식(회귀 0): 일반 에러/no-op(type≠design·마커 없음)은 종전
 * release+no-artifact-cooldown 동작 *절대 불변*.
 *
 * FS 격리 = tmpdir(spec frontmatter 읽기). git·claude·Discord 무호출
 * (setupWorktree/spawn/branchPushed/speak 전부 주입).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  runWorkerConsumerOnce,
  detectDecisionNeeded,
  ESCALATE_MARKER,
  buildWorkerPrompt,
  disarmKill,
  resetWorkerStatus,
  type WorkerCore,
} from './agent-cadence';

const W: WorkerCore = {
  coreId: 'wm-worker',
  domain: 'WM',
  machine: 'any',
  label: '🛠 WmWorker',
};

let root: string;

beforeEach(() => {
  disarmKill();
  resetWorkerStatus();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'esc-'));
});

/** memoRoot 상대 경로에 스펙 작성, 그 상대경로 반환(chosen.file 용). */
function writeSpec(relFile: string, frontmatter: string): string {
  const abs = path.join(root, relFile);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `---\n${frontmatter}\n---\n\n## 본문\n`, 'utf-8');
  return relFile;
}

const env = () => ({ MEMO_REPO_PATH: root }) as NodeJS.ProcessEnv;

describe('detectDecisionNeeded (순수)', () => {
  it('frontmatter type: design → true', () => {
    expect(
      detectDecisionNeeded('---\nid: X\ntype: design\n---\n본문', undefined),
    ).toBe(true);
  });
  it('frontmatter type: decision → true', () => {
    expect(detectDecisionNeeded('---\ntype: decision\n---', undefined)).toBe(
      true,
    );
  });
  it('frontmatter type: fix → false (일반 작업)', () => {
    expect(detectDecisionNeeded('---\ntype: fix\n---\n본문', undefined)).toBe(
      false,
    );
  });
  it('frontmatter 없음 → false', () => {
    expect(detectDecisionNeeded('type: design (본문일 뿐)', undefined)).toBe(
      false,
    );
  });
  it('본문에 type:design 우연 등장 → false (frontmatter 블록만)', () => {
    expect(
      detectDecisionNeeded('---\ntype: fix\n---\ntype: design 언급', undefined),
    ).toBe(false);
  });
  it('리포트에 escalate 마커 → true (type 무관, 견고 OR)', () => {
    expect(
      detectDecisionNeeded(
        '---\ntype: fix\n---',
        `${ESCALATE_MARKER}\n선택지: A / B`,
      ),
    ).toBe(true);
  });
  it('스펙·리포트 둘 다 신호 없음 → false', () => {
    expect(detectDecisionNeeded('---\ntype: fix\n---', '그냥 완료 보고')).toBe(
      false,
    );
  });
  it('스펙 undefined + 마커 없음 → false', () => {
    expect(detectDecisionNeeded(undefined, '완료')).toBe(false);
  });
});

describe('buildWorkerPrompt — escalate 마커 지시 포함', () => {
  it('프롬프트가 ESCALATE_MARKER 토큰 사용을 지시', () => {
    const p = buildWorkerPrompt(
      { id: 'TASK-WM-010-A', file: 'f.md' },
      'MISSION',
    );
    expect(p).toContain(ESCALATE_MARKER);
    expect(p).toMatch(/선택지/);
  });
});

describe('runWorkerConsumerOnce — decision-needed escalate (KAR-018-ESC)', () => {
  it('(a) type:design + 미푸시 → escalated, release, speak(스킨)·TASK id 포함, no-artifact-cooldown 미사용', async () => {
    const file = writeSpec('wm/tasks/TASK-WM-010-A.md', 'id: WM-010-A\ntype: design');
    const released: string[] = [];
    const spoken: string[] = [];
    const r = await runWorkerConsumerOnce(env(), {
      listWorkers: () => [W],
      scan: () => [{ id: 'TASK-WM-010-A', file }],
      claim: () => true,
      release: (id) => released.push(id),
      setupWorktree: () => ({ cwd: 'w', repoRoot: 'r', wtDir: 'w', branch: 'b' }),
      spawn: async () => ({ status: 'done', text: '선택지: A안 / B안 중 결정 필요' }),
      branchPushed: () => false, // 미푸시 (사용자 결정 필요라 push 안 됨)
      speak: async (_c, t) => {
        spoken.push(t);
        return true;
      },
      voice: async () => '', // raw 폴백 (날조 가드 — 원문 그대로)
      missionText: 'M',
    });
    expect(r).toBe('wm-worker:escalated:TASK-WM-010-A');
    expect(released).toEqual(['TASK-WM-010-A']); // 점유 해제(다른 task 회전)
    // KAR-018(2026-05-21): spoken[0] = 🤖 착수, spoken[-1] = escalate outcome.
    expect(spoken).toHaveLength(2);
    const outcome = spoken.at(-1) ?? '';
    // agent-thread-router.extractTaskId 가 라우팅하려면 TASK id 문자열 필수
    expect(outcome).toContain('TASK-WM-010-A');
    expect(outcome).toContain('🛠 WmWorker'); // 스킨 정체 발화
    expect(outcome).toContain('사용자 결정 필요');
    // agentic 옵션 리포트 동봉(사용자가 그 스레드서 보고 결정)
    expect(outcome).toContain('선택지: A안 / B안');
  });

  it('(a2) 리포트 escalate 마커만 있어도(type=fix) escalate — 견고 OR', async () => {
    const file = writeSpec('wm/tasks/TASK-WM-200.md', 'id: WM-200\ntype: fix');
    const spoken: string[] = [];
    const r = await runWorkerConsumerOnce(env(), {
      listWorkers: () => [W],
      scan: () => [{ id: 'TASK-WM-200', file }],
      claim: () => true,
      release: () => {},
      setupWorktree: () => ({ cwd: 'w', repoRoot: 'r', wtDir: 'w', branch: 'b' }),
      spawn: async () => ({
        status: 'done',
        text: `${ESCALATE_MARKER} 비가역 결정 발견 — 선택지: 유지 / 폐기`,
      }),
      branchPushed: () => false,
      speak: async (_c, t) => {
        spoken.push(t);
        return true;
      },
      voice: async () => '',
    });
    expect(r).toBe('wm-worker:escalated:TASK-WM-200');
    expect(spoken[0]).toContain('TASK-WM-200');
  });

  it('(b) 일반 에러/no-op(type=fix·마커 없음) + 미푸시 → 종전 done-no-artifact 동작 *불변* (회귀 0)', async () => {
    const file = writeSpec('wm/tasks/TASK-WM-300.md', 'id: WM-300\ntype: fix');
    const released: string[] = [];
    const spoken: string[] = [];
    const r = await runWorkerConsumerOnce(env(), {
      listWorkers: () => [W],
      scan: () => [{ id: 'TASK-WM-300', file }],
      claim: () => true,
      release: (id) => released.push(id),
      setupWorktree: () => ({ cwd: 'w', repoRoot: 'r', wtDir: 'w', branch: 'b' }),
      spawn: async () => ({ status: 'done', text: '코드 변경했으나 push 실패' }),
      branchPushed: () => false,
      speak: async (_c, t) => {
        spoken.push(t);
        return true;
      },
      voice: async () => '',
    });
    // 종전 코드와 동일: done-no-artifact + 미푸시 메시지 + release.
    expect(r).toBe('wm-worker:done-no-artifact:TASK-WM-300');
    expect(released).toEqual(['TASK-WM-300']);
    // KAR-018(2026-05-21): spoken[0] = 🤖 착수, spoken[-1] = outcome 메시지.
    const outcome = spoken.at(-1) ?? '';
    expect(outcome).toContain('미푸시');
    expect(outcome).not.toContain('사용자 결정 필요');
  });

  it('(b2) spawn 에러(status=error) → 종전 release+에러보고 *불변* (escalate 경로 미진입)', async () => {
    const file = writeSpec('wm/tasks/TASK-WM-400.md', 'id: WM-400\ntype: design');
    const released: string[] = [];
    const spoken: string[] = [];
    // 주의: type:design 이어도 status!=='done' 이면 escalate 분기 자체에
    // 안 들어감(종전 에러 경로 그대로) — 회귀 0 확인.
    const r = await runWorkerConsumerOnce(env(), {
      listWorkers: () => [W],
      scan: () => [{ id: 'TASK-WM-400', file }],
      claim: () => true,
      release: (id) => released.push(id),
      setupWorktree: () => ({ cwd: 'w', repoRoot: 'r', wtDir: 'w', branch: 'b' }),
      spawn: async () => ({ status: 'error', error: 'claude 실패' }),
      speak: async (_c, t) => {
        spoken.push(t);
        return true;
      },
      voice: async () => '',
    });
    expect(r).toBe('wm-worker:error');
    expect(released).toEqual(['TASK-WM-400']);
    // KAR-018(2026-05-21): spoken[0] = 🤖 착수, spoken[-1] = 점유 해제 outcome.
    const outcome = spoken.at(-1) ?? '';
    expect(outcome).toContain('점유 해제');
    expect(outcome).not.toContain('사용자 결정 필요');
  });

  it('(c) escalate dedupe — 같은 task 다음 틱 재escalate 도배 X (escalate-cooldown 윈도우 skip)', async () => {
    const file = writeSpec('wm/tasks/TASK-WM-010-A.md', 'id: WM-010-A\ntype: design');
    const spoken: string[] = [];
    const deps = {
      listWorkers: () => [W],
      scan: () => [{ id: 'TASK-WM-010-A', file }],
      claim: () => true,
      release: () => {},
      setupWorktree: () => ({
        cwd: 'w',
        repoRoot: 'r',
        wtDir: 'w',
        branch: 'b',
      }),
      spawn: async () => ({
        status: 'done' as const,
        text: '선택지: A / B',
      }),
      branchPushed: () => false,
      speak: async (_c: string, t: string) => {
        spoken.push(t);
        return true;
      },
      voice: async () => '',
    };
    // 1틱: escalate. KAR-018(2026-05-21): 🤖 착수 + escalate outcome = 2 발화.
    const r1 = await runWorkerConsumerOnce(env(), deps);
    expect(r1).toBe('wm-worker:escalated:TASK-WM-010-A');
    expect(spoken).toHaveLength(2);
    // 2틱: 동일 task 만 후보 → escalate-cooldown 으로 skip → cooldown-all
    //      (#team-bus 재escalate 도배 X — 착수/outcome 추가 발화 0)
    const r2 = await runWorkerConsumerOnce(env(), deps);
    expect(r2).toBe('wm-worker:cooldown-all');
    expect(spoken).toHaveLength(2); // 도배 0 (dedupe 작동 — 추가 발화 없음)
  });

  it('(c2) escalate 후 *다른* task 는 정상 회전(escalate-cooldown 은 그 task 한정)', async () => {
    const fDesign = writeSpec('wm/tasks/TASK-WM-010-A.md', 'type: design');
    const fOther = writeSpec('wm/tasks/TASK-WM-500.md', 'type: fix');
    const spoken: string[] = [];
    const base = {
      listWorkers: () => [W],
      claim: () => true,
      release: () => {},
      setupWorktree: () => ({
        cwd: 'w',
        repoRoot: 'r',
        wtDir: 'w',
        branch: 'b',
      }),
      branchPushed: (_r: string, _b: string) => true, // 정상 push
      speak: async (_c: string, t: string) => {
        spoken.push(t);
        return true;
      },
      voice: async () => '',
    };
    // 1틱: design task escalate
    const r1 = await runWorkerConsumerOnce(env(), {
      ...base,
      scan: () => [{ id: 'TASK-WM-010-A', file: fDesign }],
      spawn: async () => ({ status: 'done' as const, text: '선택지 A/B' }),
      branchPushed: () => false,
    });
    expect(r1).toBe('wm-worker:escalated:TASK-WM-010-A');
    // 2틱: design 은 cooldown 이지만 다른 task(WM-500)는 정상 done
    const r2 = await runWorkerConsumerOnce(env(), {
      ...base,
      scan: () => [
        { id: 'TASK-WM-010-A', file: fDesign },
        { id: 'TASK-WM-500', file: fOther },
      ],
      spawn: async () => ({ status: 'done' as const, text: '완료' }),
    });
    expect(r2).toBe('wm-worker:done:TASK-WM-500');
  });
});
