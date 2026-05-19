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
  formatEvolutionSummary,
  normalizeHealthEvents,
  normalizeTraceEvents,
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

    expect(readTraceEntries(env())).toHaveLength(2);
    const events = collectEvolutionEvents(env(), signals, issues, Date.parse('2026-05-19T01:00:00Z'));
    expect(events.map((e) => e.code)).toContain('worker-no-artifact');
    expect(events.map((e) => e.code)).toContain('proposal-parse-fail');

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
  });

  it('runs an observatory tick, appends only fresh events, and notifies summary', () => {
    const notes: string[] = [];
    appendTrace({ ts: '2026-05-19T00:00:00Z', core: 'wm-worker', reason: 'worker TASK-WM-001 done-no-artifact' });

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

    expect(first.observed).toBe(3);
    expect(first.appended).toBe(3);
    expect(second.observed).toBe(3);
    expect(second.appended).toBe(0);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('worker-no-artifact');
  });

  it('is a no-op without MEMO_REPO_PATH', () => {
    expect(evolutionLedgerPath({} as NodeJS.ProcessEnv)).toBe('');
    expect(tracePath({} as NodeJS.ProcessEnv)).toBe('');
    appendEvolutionEvents({} as NodeJS.ProcessEnv, normalizeHealthEvents(signals, issues));
  });
});
