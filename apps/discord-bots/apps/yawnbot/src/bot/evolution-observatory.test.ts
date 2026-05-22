import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  appendEvolutionEvents,
  collectEvolutionEvents,
  appendNewEvolutionEvents,
  eventFingerprint,
  evolutionLedgerPath,
  buildEvolutionStatsDigest,
  formatEvolutionSummary,
  formatEvolutionTicker,
  formatRecentEvolutionForDiscovery,
  runEvolutionStatsDigestOnce,
  shouldRunStatsDigest,
  statsDigestStatePath,
  readStatsDigestState,
  writeStatsDigestState,
  normalizeHealthEvents,
  normalizePromotionEvents,
  normalizeTraceEvents,
  promotionTracePath,
  readPromotionEntries,
  readTraceEntries,
  summarizeRecentEvolutionEvents,
  runEvolutionObservatoryOnce,
  summarizeEvolutionEvents,
  tracePath,
  type TraceEntry,
} from './evolution-observatory';
import type { HealthIssue, HealthSignals } from './system-health';

let root: string;
const env = () => ({ MEMO_REPO_PATH: root }) as NodeJS.ProcessEnv;

const signals: HealthSignals = {
  traceStalenessHrs: 3,
  progressStale: true,
  workerFailRatio: 0.75,
  traceErrorCount: 2,
  brokenLoopTaskCount: 0,
};

const issues: HealthIssue[] = [
  {
    severity: 'warn',
    code: 'progress-stale',
    detail: 'No active project has progress.',
  },
  {
    severity: 'critical',
    code: 'worker-fail-critical',
    detail: 'Worker failure ratio is high.',
  },
];

function appendTrace(entry: TraceEntry): void {
  const filePath = tracePath(env());
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');
}

function appendPromotion(entry: Record<string, unknown>): void {
  const filePath = promotionTracePath(env());
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'evo-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('normalizeHealthEvents', () => {
  it('turns health issues into stable evolution events with metrics', () => {
    const events = normalizeHealthEvents(signals, issues, Date.parse('2026-05-19T00:00:00Z'));
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      ts: '2026-05-19T00:00:00.000Z',
      code: 'progress-stale',
      severity: 'warn',
      source: 'health',
    });
    expect(events[1].severity).toBe('critical');
    expect(events[1].metrics.some((m) => m.name === 'workerFailRatio')).toBe(true);
  });
});

describe('normalizeTraceEvents', () => {
  it('extracts no-artifact and failed worker events from trace reasons', () => {
    const events = normalizeTraceEvents([
      { ts: '2026-05-19T00:00:00Z', core: 'wm-worker', reason: 'worker TASK-WM-001 done-no-artifact branch/x' },
      { ts: '2026-05-19T00:01:00Z', core: 'kar-worker', reason: 'worker TASK-KAR-002 error branch/y' },
      { ts: '2026-05-19T00:02:00Z', core: 'kl-worker', reason: 'worker TASK-KL-003 done branch/z' },
    ]);
    expect(events.map((e) => e.code)).toEqual([
      'worker-no-artifact',
      'worker-failed',
    ]);
    expect(events[0].severity).toBe('critical');
  });

  it('extracts proposal parse, duplicate, and project citation failures', () => {
    const events = normalizeTraceEvents([
      { reason: 'producer parse-fail invalid json' },
      { reason: 'duplicate proposal dedup skipped' },
      { reason: 'proposal projectId missing' },
      { type: 'error', core: 'cadence', reason: 'unexpected throw' },
    ]);
    expect(events.map((e) => e.code)).toEqual([
      'proposal-parse-fail',
      'proposal-duplicate',
      'proposal-project-missing',
      'trace-error',
    ]);
  });
});

describe('normalizePromotionEvents', () => {
  it('turns self-augmentation promote/revert records into evolution events', () => {
    const events = normalizePromotionEvents([
      {
        ts: '2026-05-19T00:00:00Z',
        coreId: 'scout',
        action: 'promoted',
        reason: '구조검증+비충돌 PASS',
      },
      {
        ts: '2026-05-19T00:10:00Z',
        coreId: 'scout',
        action: 'reverted',
        reason: 'done 비율 0/4(0.00) < 0.34 — 퇴행',
      },
    ]);
    expect(events.map((e) => e.code)).toEqual(['core-promoted', 'core-reverted']);
    expect(events[0]).toMatchObject({
      severity: 'info',
      source: 'self-augment',
      subject: 'scout',
    });
    expect(events[1].severity).toBe('critical');
  });
});

describe('summary and ledger IO', () => {
  it('summarizes events by severity, code, source, and subject', () => {
    const events = [
      ...normalizeHealthEvents(signals, issues),
      ...normalizeTraceEvents([
        { core: 'wm-worker', reason: 'worker TASK-WM-001 done-no-artifact' },
        { core: 'wm-worker', reason: 'worker TASK-WM-002 error' },
      ]),
    ];
    const summary = summarizeEvolutionEvents(events);
    expect(summary.total).toBe(4);
    expect(summary.critical).toBe(2);
    expect(summary.byCode['worker-no-artifact']).toBe(1);
    expect(summary.bySubject['wm-worker']).toBe(2);
    expect(formatEvolutionSummary(summary)).toContain('total=4');
  });

  it('reads trace entries, collects normalized events, and appends a ledger', () => {
    appendTrace({ ts: '2026-05-19T00:00:00Z', core: 'wm-worker', reason: 'worker TASK-WM-001 done-no-artifact' });
    appendTrace({ ts: '2026-05-19T00:01:00Z', core: 'producer', reason: 'producer parse-fail invalid json' });
    appendPromotion({ ts: '2026-05-19T00:02:00Z', coreId: 'scout', action: 'promoted', reason: 'PASS' });

    expect(readTraceEntries(env())).toHaveLength(2);
    expect(readPromotionEntries(env())).toHaveLength(1);
    const events = collectEvolutionEvents(env(), signals, issues, Date.parse('2026-05-19T01:00:00Z'));
    expect(events.map((e) => e.code)).toContain('worker-no-artifact');
    expect(events.map((e) => e.code)).toContain('proposal-parse-fail');
    expect(events.map((e) => e.code)).toContain('core-promoted');

    appendEvolutionEvents(env(), events);
    const lines = fs.readFileSync(evolutionLedgerPath(env()), 'utf-8').trim().split(/\r?\n/);
    expect(lines).toHaveLength(events.length);
    expect(JSON.parse(lines[0]).code).toBe('progress-stale');
  });

  it('deduplicates ledger rows by stable event fingerprint', () => {
    const events = normalizeTraceEvents([
      { ts: '2026-05-19T00:00:00Z', core: 'wm-worker', reason: 'worker TASK-WM-001 done-no-artifact' },
    ]);
    expect(eventFingerprint(events[0])).toContain('worker-no-artifact');

    expect(appendNewEvolutionEvents(env(), events)).toHaveLength(1);
    expect(appendNewEvolutionEvents(env(), events)).toHaveLength(0);

    const lines = fs.readFileSync(evolutionLedgerPath(env()), 'utf-8').trim().split(/\r?\n/);
    expect(lines).toHaveLength(1);
    expect(summarizeRecentEvolutionEvents(env()).byCode['worker-no-artifact']).toBe(1);
    expect(formatRecentEvolutionForDiscovery(env())).toContain('worker-no-artifact');
  });

  it('runs an observatory tick, appends only fresh events, and notifies summary', () => {
    const notes: string[] = [];
    appendTrace({ ts: '2026-05-19T00:00:00Z', core: 'wm-worker', reason: 'worker TASK-WM-001 done-no-artifact' });
    appendPromotion({ ts: '2026-05-19T00:02:00Z', coreId: 'scout', action: 'promoted', reason: 'PASS' });

    const first = runEvolutionObservatoryOnce(env(), {
      healthSignals: signals,
      healthIssues: issues,
      notify: (message) => notes.push(message),
      nowMs: Date.parse('2026-05-19T01:00:00Z'),
    });
    const second = runEvolutionObservatoryOnce(env(), {
      healthSignals: signals,
      healthIssues: issues,
      notify: (message) => notes.push(message),
      nowMs: Date.parse('2026-05-19T01:01:00Z'),
    });

    expect(first.observed).toBe(4);
    expect(first.appended).toBe(4);
    expect(second.observed).toBe(4);
    expect(second.appended).toBe(0);
    expect(notes).toHaveLength(1);
    // ★ 진화 ticker: 사용자 정서 톤. promotion 마일스톤 + worker-no-artifact 진화 입력.
    expect(notes[0]).toContain('🧬');
    expect(notes[0]).toContain('scout');
    expect(notes[0]).toContain('worker-no-artifact');
    expect(notes[0]).toContain('📈');
  });

  it('formats evolution ticker — promotions get headline, others get rollup', () => {
    const events = [
      ...normalizePromotionEvents([
        { ts: '2026-05-20T00:00:00Z', coreId: 'scout', action: 'promoted', reason: 'PASS gates' },
      ]),
      ...normalizeTraceEvents([
        { ts: '2026-05-20T00:01:00Z', core: 'kar-worker', reason: 'worker TASK-KAR-9 done-no-artifact' },
        { ts: '2026-05-20T00:02:00Z', core: 'kar-worker', reason: 'worker TASK-KAR-10 done-no-artifact' },
      ]),
    ];
    const summary = summarizeEvolutionEvents(events);
    const ticker = formatEvolutionTicker(events, summary);
    expect(ticker).toContain('🧬');
    expect(ticker).toContain('«scout»');
    expect(ticker).toContain('PASS gates');
    expect(ticker).toContain('📈');
    expect(ticker).toContain('worker-no-artifact×2');
  });

  it('formats evolution ticker — revert is highlighted as 진화 퇴행', () => {
    const events = normalizePromotionEvents([
      { ts: '2026-05-20T00:00:00Z', coreId: 'scout', action: 'reverted', reason: 'regress=worker-no-artifact x3' },
    ]);
    const summary = summarizeEvolutionEvents(events);
    const ticker = formatEvolutionTicker(events, summary);
    expect(ticker).toContain('🩸');
    expect(ticker).toContain('«scout»');
    expect(ticker).toContain('진화 퇴행');
    expect(ticker).toContain('regress=worker-no-artifact');
  });

  it('formats evolution ticker — empty appended returns empty string', () => {
    expect(formatEvolutionTicker([], summarizeEvolutionEvents([]))).toBe('');
  });

  it('builds evolution stats digest — zero evolution honestly reports cron tone', () => {
    const nowMs = Date.parse('2026-05-20T12:00:00Z');
    const digest = buildEvolutionStatsDigest([], nowMs);
    expect(digest).toContain('📊 진화 stats');
    expect(digest).toContain('지난 7d');
    expect(digest).toContain('🦴');
    expect(digest).toContain('진화 0건');
    expect(digest).toContain('cron 톤 그대로');
  });

  it('builds evolution stats digest — counts promotions/reverts/worker stats in window', () => {
    const nowMs = Date.parse('2026-05-20T12:00:00Z');
    const events = [
      ...normalizePromotionEvents([
        { ts: '2026-05-19T00:00:00Z', coreId: 'scout', action: 'promoted', reason: 'PASS' },
        { ts: '2026-05-19T01:00:00Z', coreId: 'tinker', action: 'promoted', reason: 'PASS' },
        { ts: '2026-05-19T02:00:00Z', coreId: 'scout', action: 'reverted', reason: 'regress' },
      ]),
      ...normalizeTraceEvents([
        { ts: '2026-05-19T03:00:00Z', core: 'wm-worker', reason: 'worker TASK-WM-1 done-no-artifact' },
        { ts: '2026-05-19T03:01:00Z', core: 'kar-worker', reason: 'worker TASK-KAR-2 done-no-artifact' },
        { ts: '2026-05-19T03:02:00Z', core: 'kl-worker', reason: 'worker TASK-KL-3 error' },
      ]),
    ];
    const digest = buildEvolutionStatsDigest(events, nowMs);
    expect(digest).toContain('🧬 코어 승격 2');
    expect(digest).toContain('🩸 퇴행 1');
    expect(digest).toContain('no-artifact 2');
    expect(digest).toContain('failed 1');
    expect(digest).not.toContain('🦴');
  });

  it('builds evolution stats digest — events outside window excluded', () => {
    const nowMs = Date.parse('2026-05-20T12:00:00Z');
    const events = normalizePromotionEvents([
      { ts: '2026-05-01T00:00:00Z', coreId: 'old', action: 'promoted', reason: 'old' },
    ]);
    const digest = buildEvolutionStatsDigest(events, nowMs);
    expect(digest).toContain('🦴');
    expect(digest).toContain('진화 0건');
  });

  it('shouldRunStatsDigest — fresh env returns true, then false within interval', () => {
    const nowMs = Date.parse('2026-05-20T12:00:00Z');
    expect(shouldRunStatsDigest(env(), nowMs)).toBe(true);
    writeStatsDigestState(env(), { lastTs: new Date(nowMs).toISOString() });
    expect(shouldRunStatsDigest(env(), nowMs + 3600 * 1000)).toBe(false);
    expect(shouldRunStatsDigest(env(), nowMs + 25 * 3600 * 1000)).toBe(true);
  });

  it('runEvolutionStatsDigestOnce — sent on first call, gated on second within interval', () => {
    const notes: string[] = [];
    appendPromotion({ ts: '2026-05-19T00:00:00Z', coreId: 'scout', action: 'promoted', reason: 'PASS' });
    runEvolutionObservatoryOnce(env(), {
      healthSignals: signals,
      healthIssues: issues,
      nowMs: Date.parse('2026-05-19T01:00:00Z'),
    });
    const first = runEvolutionStatsDigestOnce(env(), {
      notify: (m) => notes.push(m),
      nowMs: Date.parse('2026-05-20T12:00:00Z'),
    });
    const second = runEvolutionStatsDigestOnce(env(), {
      notify: (m) => notes.push(m),
      nowMs: Date.parse('2026-05-20T13:00:00Z'),
    });
    expect(first).toBe('digest:sent');
    expect(second).toBe('digest:gated');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('📊 진화 stats');
    expect(notes[0]).toContain('🧬 코어 승격 1');
    // state file persisted
    const state = readStatsDigestState(env());
    expect(state?.lastTs).toContain('2026-05-20T12:00:00');
  });

  it('statsDigestStatePath — empty without MEMO_REPO_PATH', () => {
    expect(statsDigestStatePath({} as NodeJS.ProcessEnv)).toBe('');
    expect(readStatsDigestState({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('is a no-op without MEMO_REPO_PATH', () => {
    expect(evolutionLedgerPath({} as NodeJS.ProcessEnv)).toBe('');
    expect(tracePath({} as NodeJS.ProcessEnv)).toBe('');
    appendEvolutionEvents({} as NodeJS.ProcessEnv, normalizeHealthEvents(signals, issues));
  });
});
