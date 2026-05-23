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
  mapIssuesToProposals,
  readLedger,
  runInitiatorOnce,
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
    const r = runInitiatorOnce(env(), { gatherSignals: healthyStub });
    expect(r.label).toBe('init:no-signal');
    expect(r.appended).toBe(0);
    expect(readLedger(root)).toEqual([]);
  });

  it('progress-stale 1회 → new-project 1건 ledger', () => {
    const r = runInitiatorOnce(env(), { gatherSignals: progressStaleStub });
    expect(r.label).toBe('init:proposed:1');
    expect(r.appended).toBe(1);
    expect(r.candidates[0].kind).toBe<ProposalKind>('new-project');
    const ledger = readLedger(root);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe('proposal');
    expect(ledger[0].status).toBe('draft');
  });

  it('같은 신호 24h 안 두 번 → 두 번째는 dedupe', () => {
    const now = Date.parse('2026-05-23T00:00:00Z');
    const r1 = runInitiatorOnce(env(), {
      gatherSignals: progressStaleStub,
      nowMs: now,
    });
    expect(r1.appended).toBe(1);
    const r2 = runInitiatorOnce(env(), {
      gatherSignals: progressStaleStub,
      nowMs: now + 60_000, // 1분 후
    });
    expect(r2.appended).toBe(0);
    expect(r2.deduped).toBe(1);
    expect(r2.label).toBe('init:all-deduped:1');
    expect(readLedger(root)).toHaveLength(1);
  });

  it('같은 신호 25h 후 → dedupe 윈도우 만료, 재발의 OK', () => {
    const now = Date.parse('2026-05-23T00:00:00Z');
    runInitiatorOnce(env(), { gatherSignals: progressStaleStub, nowMs: now });
    const r2 = runInitiatorOnce(env(), {
      gatherSignals: progressStaleStub,
      nowMs: now + 25 * 3_600_000,
    });
    expect(r2.appended).toBe(1);
    expect(readLedger(root)).toHaveLength(2);
  });

  it('다중 kind 동시 = 다중 ledger entries', () => {
    const both = (): HealthSignals => ({
      ...healthyStub(),
      progressStale: true,
      workerFailRatio: 0.9,
    });
    const r = runInitiatorOnce(env(), { gatherSignals: both });
    expect(r.appended).toBe(2);
    const ledger = readLedger(root);
    const kinds = new Set(ledger.map((e) => e.kind));
    expect(kinds.has('new-project')).toBe(true);
    expect(kinds.has('new-core')).toBe(true);
  });

  it('MEMO_REPO_PATH 부재 = no-memo-root label, ledger 미시도', () => {
    const r = runInitiatorOnce({} as NodeJS.ProcessEnv, {
      gatherSignals: progressStaleStub,
    });
    expect(r.label).toBe('init:no-memo-root');
    expect(r.appended).toBe(0);
  });

  it('notify hook = appended > 0 시 1회 호출, 헤드라인에 발의 카운트 + 마커', () => {
    const messages: string[] = [];
    const r = runInitiatorOnce(env(), {
      gatherSignals: progressStaleStub,
      notify: (m) => messages.push(m),
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
    });
    expect(messages).toHaveLength(1);
    runInitiatorOnce(env(), {
      gatherSignals: progressStaleStub,
      notify: (m) => messages.push(m),
      nowMs: now + 60_000,
    });
    expect(messages).toHaveLength(1); // 두 번째는 dedupe = silent
  });
});
