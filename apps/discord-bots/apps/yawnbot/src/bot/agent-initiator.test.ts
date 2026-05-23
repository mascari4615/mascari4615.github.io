/**
 * agent-initiator unit test (TASK-KAR-018-INIT) — 신호 매핑·dedupe·ledger 결정성.
 *
 * 합성 검증: gatherSignals stub → mapIssuesToProposals → ledger append → dedupe
 * 윈도우 검증. LLM 무관 = 날조 0.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildTaskSeedBody,
  mapIssuesToProposals,
  readLedger,
  runInitiatorOnce,
  writeCoreSpecDraft,
  type ProposalKind,
} from './agent-initiator';
import type { HealthSignals } from './system-health';

let root: string;
function env(): NodeJS.ProcessEnv {
  return { MEMO_REPO_PATH: root } as NodeJS.ProcessEnv;
}

const healthyStub = (): HealthSignals => ({
  traceStalenessHrs: 0,
  progressStale: false,
  workerFailRatio: 0,
  traceErrorCount: 0,
  brokenLoopTaskCount: 0,
});

const progressStaleStub = (): HealthSignals => ({
  ...healthyStub(),
  progressStale: true,
});

const workerFailStub = (): HealthSignals => ({
  ...healthyStub(),
  workerFailRatio: 0.9,
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'init-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('mapIssuesToProposals — 순수 결정적 매핑', () => {
  it('progress-stale → new-project', () => {
    const props = mapIssuesToProposals([
      { severity: 'critical', code: 'progress-stale', detail: 'x' },
    ]);
    expect(props).toHaveLength(1);
    expect(props[0].kind).toBe<ProposalKind>('new-project');
    expect(props[0].score).toBe(0.8);
  });

  it('worker-fail-critical → new-core', () => {
    const props = mapIssuesToProposals([
      { severity: 'critical', code: 'worker-fail-critical', detail: 'x' },
    ]);
    expect(props[0].kind).toBe<ProposalKind>('new-core');
  });

  it('cadence-stale → refactor', () => {
    const props = mapIssuesToProposals([
      { severity: 'warn', code: 'cadence-slow', detail: 'x' },
    ]);
    expect(props[0].kind).toBe<ProposalKind>('refactor');
  });

  it('빈 issue → 빈 후보', () => {
    expect(mapIssuesToProposals([])).toEqual([]);
  });

  it('같은 kind 다중 issue = 1 후보 + rootCodes 다중 + max score', () => {
    const props = mapIssuesToProposals([
      { severity: 'warn', code: 'cadence-slow', detail: 'a' },
      { severity: 'critical', code: 'broken-loop', detail: 'b' },
    ]);
    expect(props).toHaveLength(1);
    expect(props[0].kind).toBe<ProposalKind>('refactor');
    expect(props[0].rootCodes).toEqual(['cadence-slow', 'broken-loop']);
    expect(props[0].score).toBe(0.8);
  });
});

describe('runInitiatorOnce — 진입점', () => {
  it('healthy → no-signal label, ledger 미생성', () => {
    const r = runInitiatorOnce(env(), {
      gatherSignals: healthyStub,
      seedTasks: false,
    });
    expect(r.label).toBe('init:no-signal');
    expect(r.appended).toBe(0);
    expect(readLedger(root)).toEqual([]);
  });

  it('progress-stale 1회 → new-project 1건 ledger (seedTasks: false, deliberate: false)', () => {
    const r = runInitiatorOnce(env(), {
      gatherSignals: progressStaleStub,
      seedTasks: false,
      deliberate: false,
    });
    expect(r.label).toBe('init:proposed:1');
    expect(r.appended).toBe(1);
    expect(r.candidates[0].kind).toBe<ProposalKind>('new-project');
    const ledger = readLedger(root);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe('proposal');
    expect(ledger[0].status).toBe('draft');
  });

  it('같은 신호 24h 안 두 번 → 두 번째는 dedupe (seedTasks: false)', () => {
    const now = Date.parse('2026-05-23T00:00:00Z');
    const r1 = runInitiatorOnce(env(), {
      gatherSignals: progressStaleStub,
      nowMs: now,
      seedTasks: false,
    });
    expect(r1.appended).toBe(1);
    const r2 = runInitiatorOnce(env(), {
      gatherSignals: progressStaleStub,
      nowMs: now + 60_000,
      seedTasks: false,
    });
    expect(r2.appended).toBe(0);
    expect(r2.deduped).toBe(1);
    expect(r2.label).toBe('init:all-deduped:1');
    expect(readLedger(root)).toHaveLength(1);
  });

  it('같은 신호 25h 후 → dedupe 윈도우 만료, 재발의 OK (seedTasks: false)', () => {
    const now = Date.parse('2026-05-23T00:00:00Z');
    runInitiatorOnce(env(), {
      gatherSignals: progressStaleStub,
      nowMs: now,
      seedTasks: false,
    });
    const r2 = runInitiatorOnce(env(), {
      gatherSignals: progressStaleStub,
      nowMs: now + 25 * 3_600_000,
      seedTasks: false,
    });
    expect(r2.appended).toBe(1);
    expect(readLedger(root)).toHaveLength(2);
  });

  it('다중 kind 동시 = 다중 ledger entries (seedTasks: false)', () => {
    const both = (): HealthSignals => ({
      ...healthyStub(),
      progressStale: true,
      workerFailRatio: 0.9,
    });
    const r = runInitiatorOnce(env(), {
      gatherSignals: both,
      seedTasks: false,
    });
    expect(r.appended).toBe(2);
    const ledger = readLedger(root);
    const kinds = new Set(ledger.map((e) => e.kind));
    expect(kinds.has('new-project')).toBe(true);
    expect(kinds.has('new-core')).toBe(true);
  });

  it('MEMO_REPO_PATH 부재 = no-memo-root label, ledger 미시도', () => {
    const r = runInitiatorOnce({} as NodeJS.ProcessEnv, {
      gatherSignals: progressStaleStub,
      seedTasks: false,
    });
    expect(r.label).toBe('init:no-memo-root');
    expect(r.appended).toBe(0);
  });

  it('notify hook = appended > 0 시 1회 호출, 헤드라인에 발의 카운트 + 마커', () => {
    const messages: string[] = [];
    const r = runInitiatorOnce(env(), {
      gatherSignals: progressStaleStub,
      notify: (m) => messages.push(m),
      seedTasks: false,
    });
    expect(r.appended).toBe(1);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('📜');
    expect(messages[0]).toContain('새 발의 1건');
    expect(messages[0]).toContain('initiator');
  });

  it('notify hook = appended 0 (전부 dedupe) 시 미호출 (사용자 노이즈 차단)', () => {
    const messages: string[] = [];
    const now = Date.parse('2026-05-23T00:00:00Z');
    runInitiatorOnce(env(), {
      gatherSignals: progressStaleStub,
      notify: (m) => messages.push(m),
      nowMs: now,
      seedTasks: false,
    });
    expect(messages).toHaveLength(1);
    runInitiatorOnce(env(), {
      gatherSignals: progressStaleStub,
      notify: (m) => messages.push(m),
      nowMs: now + 60_000,
      seedTasks: false,
    });
    expect(messages).toHaveLength(1);
  });
});

describe('buildTaskSeedBody — frontmatter + 본문 결정성', () => {
  it('new-project kind = 신프로젝트 타이틀 + status:seed + parent + 발화 인용', () => {
    const { filename, content } = buildTaskSeedBody(
      {
        kind: 'new-project',
        rootCodes: ['progress-stale'],
        score: 0.8,
        headline: '📜 발의 (신프로젝트): 팀 전진 0 신호 [progress-stale]',
        rationale: '근거 issue: progress-stale',
      },
      127,
      '2026-05-23T01:00:00Z',
    );
    expect(filename).toMatch(/^TASK-KAR-127-/);
    expect(filename.endsWith('.md')).toBe(true);
    expect(content).toContain('id: TASK-KAR-127');
    expect(content).toContain('status: seed');
    expect(content).toContain('parent: TASK-KAR-018-INIT');
    expect(content).toContain('initiator-auto');
    expect(content).toContain('신프로젝트');
    expect(content).toContain('[INITIATOR-AUTO]');
    expect(content).toContain('사용자 발화'); // task-quality-gate 의 발화 인용 통과
  });

  it('new-core kind = 새 역할 코어 타이틀 + 결핍 직무 추론 단계', () => {
    const { content } = buildTaskSeedBody(
      {
        kind: 'new-core',
        rootCodes: ['worker-fail-critical'],
        score: 0.8,
        headline: '📜 발의 (새 역할 코어): 반복 실패 [worker-fail-critical]',
        rationale: '근거 issue: worker-fail-critical',
      },
      128,
      '2026-05-23T01:00:00Z',
    );
    expect(content).toContain('새 역할 코어');
    expect(content).toContain('결핍 직무 추론');
  });
});

describe('runInitiatorOnce — deliberation handoff (출력 layer #3)', () => {
  it('progress-stale 1건 → proposals.jsonl envelope 1건 append (readLatestProposal 호환)', () => {
    const r = runInitiatorOnce(env(), {
      gatherSignals: progressStaleStub,
      seedTasks: false, // ledger 영향 단순화
    });
    expect(r.deliberationIds).toHaveLength(1);
    expect(r.label).toContain('+deliberate:1');
    const envelopePath = path.join(root, '.claude', 'proposals.jsonl');
    expect(fs.existsSync(envelopePath)).toBe(true);
    const lines = fs.readFileSync(envelopePath, 'utf-8').trim().split(/\r?\n/);
    expect(lines).toHaveLength(1);
    const env0 = JSON.parse(lines[0]);
    // readLatestProposal 가 읽는 필드 호환
    expect(env0.id).toMatch(/^initiator-/);
    expect(env0.envelope.payload.title).toBeTruthy();
    expect(env0.envelope.payload.body).toContain('[INITIATOR-AUTO]');
    expect(env0.envelope.projectId).toBe('kar-018');
  });

  it('AGENT_INIT_DELIBERATE=0 = deliberation 비활성', () => {
    const r = runInitiatorOnce(
      { ...env(), AGENT_INIT_DELIBERATE: '0' } as NodeJS.ProcessEnv,
      { gatherSignals: progressStaleStub, seedTasks: false },
    );
    expect(r.deliberationIds).toEqual([]);
    const envelopePath = path.join(root, '.claude', 'proposals.jsonl');
    expect(fs.existsSync(envelopePath)).toBe(false);
  });

  it('다중 kind accepted = 다중 envelope append', () => {
    const both = (): HealthSignals => ({
      ...healthyStub(),
      progressStale: true,
      workerFailRatio: 0.9,
    });
    const r = runInitiatorOnce(env(), {
      gatherSignals: both,
      seedTasks: false,
    });
    expect(r.deliberationIds).toHaveLength(2);
    const lines = fs
      .readFileSync(path.join(root, '.claude', 'proposals.jsonl'), 'utf-8')
      .trim()
      .split(/\r?\n/);
    expect(lines).toHaveLength(2);
  });
});

describe('writeCoreSpecDraft — new-core kind 시 core.md draft 자동 생성', () => {
  it('worker-fail-critical → triage-worker id + role 추론', () => {
    const cid = writeCoreSpecDraft(
      root,
      {
        kind: 'new-core',
        rootCodes: ['worker-fail-critical'],
        score: 0.8,
        headline: '📜 발의 (새 역할 코어): 반복 실패',
        rationale: 'x',
      },
      '2026-05-23T01:00:00Z',
    );
    expect(cid).toBe('triage-worker');
    const coreMd = fs.readFileSync(
      path.join(root, '.claude', 'agents', 'triage-worker', 'core.md'),
      'utf-8',
    );
    expect(coreMd).toContain('id: triage-worker');
    expect(coreMd).toContain('status: draft');
    expect(coreMd).toContain('created_by: initiator');
    expect(coreMd).toContain('[INITIATOR-AUTO]');
    // mem/README.md 도 박힘
    expect(
      fs.existsSync(
        path.join(root, '.claude', 'agents', 'triage-worker', 'mem', 'README.md'),
      ),
    ).toBe(true);
  });

  it('cadence-stale → cadence-monitor id', () => {
    const cid = writeCoreSpecDraft(
      root,
      {
        kind: 'new-core',
        rootCodes: ['cadence-stale'],
        score: 0.8,
        headline: 'x',
        rationale: 'x',
      },
      '2026-05-23T01:00:00Z',
    );
    expect(cid).toBe('cadence-monitor');
  });

  it('non-new-core kind = null (no-op)', () => {
    const cid = writeCoreSpecDraft(
      root,
      {
        kind: 'new-project',
        rootCodes: ['progress-stale'],
        score: 0.8,
        headline: 'x',
        rationale: 'x',
      },
      '2026-05-23T01:00:00Z',
    );
    expect(cid).toBeNull();
  });

  it('id 충돌 시 -2 suffix', () => {
    // 기존 triage-worker 디렉토리 박아 충돌 유도
    fs.mkdirSync(path.join(root, '.claude', 'agents', 'triage-worker'), {
      recursive: true,
    });
    const cid = writeCoreSpecDraft(
      root,
      {
        kind: 'new-core',
        rootCodes: ['worker-fail-critical'],
        score: 0.8,
        headline: 'x',
        rationale: 'x',
      },
      '2026-05-23T01:00:00Z',
    );
    expect(cid).toBe('triage-worker-2');
  });
});

describe('runInitiatorOnce — seed writer 통합 (default ON)', () => {
  it('progress-stale 1건 → ledger 2 entries (proposal + seeded) + TASK 파일 1개 + tickerseed 인용', () => {
    const messages: string[] = [];
    const r = runInitiatorOnce(env(), {
      gatherSignals: progressStaleStub,
      notify: (m) => messages.push(m),
    });
    expect(r.appended).toBe(1);
    expect(r.seededTaskFiles).toHaveLength(1);
    expect(r.label).toContain('+seeded:1');
    const ledger = readLedger(root);
    expect(ledger).toHaveLength(2);
    expect(ledger[0].type).toBe('proposal');
    expect(ledger[1].type).toBe('seeded');
    expect(ledger[1].seededTaskFile).toBeDefined();
    // 실 파일 존재
    const taskPath = path.join(root, 'tasks', ledger[1].seededTaskFile!);
    expect(fs.existsSync(taskPath)).toBe(true);
    // ticker 가 시드 파일 인용
    expect(messages[0]).toContain('자동 시드된 TASK 파일');
    expect(messages[0]).toContain(ledger[1].seededTaskFile!);
  });

  it('AGENT_INIT_SEED_TASKS=0 = seed writer 비활성 (ledger=1, 파일 X)', () => {
    const r = runInitiatorOnce(
      { ...env(), AGENT_INIT_SEED_TASKS: '0' } as NodeJS.ProcessEnv,
      { gatherSignals: progressStaleStub },
    );
    expect(r.appended).toBe(1);
    expect(r.seededTaskFiles).toEqual([]);
    expect(readLedger(root)).toHaveLength(1);
  });

  it('seq 충돌 = +1 retry (KAR-127 존재 시 KAR-128 사용)', () => {
    // 기존 KAR-127 파일 박아 충돌 유도
    fs.mkdirSync(path.join(root, 'tasks'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'tasks', 'TASK-KAR-127-existing.md'),
      'placeholder',
    );
    const r = runInitiatorOnce(env(), { gatherSignals: progressStaleStub });
    expect(r.seededTaskFiles).toHaveLength(1);
    // 신규 시드는 128+ (race retry)
    expect(r.seededTaskFiles![0]).toMatch(/^TASK-KAR-12[8-9]/);
  });
});
