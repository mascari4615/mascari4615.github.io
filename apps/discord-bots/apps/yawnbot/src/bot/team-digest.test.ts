import { describe, it, expect } from 'vitest';
import { buildDigestText, filterEventsByWindow } from './team-digest';
import type { EvolutionEvent } from './evolution-observatory';
import type { Portfolio } from './team-portfolio';
import type { HealthSignals, HealthIssue } from './system-health';

const NOW_MS = Date.parse('2026-05-20T12:00:00Z'); // KST 21:00
const WINDOW_MS = 12 * 3600_000;

function baseSignals(): HealthSignals {
  return {
    traceStalenessHrs: 0.5,
    progressStale: true,
    workerFailRatio: null,
    traceErrorCount: 0,
  };
}

function ev(partial: Partial<EvolutionEvent> & Pick<EvolutionEvent, 'code' | 'source' | 'severity' | 'subject'>): EvolutionEvent {
  return {
    ts: new Date(NOW_MS - 3600_000).toISOString(),
    detail: partial.detail ?? '',
    metrics: partial.metrics ?? [{ name: 'count', value: 1 }],
    evidence: partial.evidence ?? '',
    ...partial,
  };
}

const EMPTY_PORTFOLIO: Portfolio = { projects: [] };

describe('filterEventsByWindow', () => {
  it('keeps events inside window, drops stale and unparseable ts', () => {
    const events: EvolutionEvent[] = [
      ev({ ts: new Date(NOW_MS - 3600_000).toISOString(), code: 'core-promoted', source: 'self-augment', severity: 'info', subject: 'atlas' }),
      ev({ ts: new Date(NOW_MS - 48 * 3600_000).toISOString(), code: 'core-promoted', source: 'self-augment', severity: 'info', subject: 'old' }),
      ev({ ts: 'not-a-date', code: 'noise', source: 'trace', severity: 'warn', subject: 'x' }),
    ];
    const sinceMs = NOW_MS - WINDOW_MS;
    const kept = filterEventsByWindow(events, sinceMs);
    expect(kept).toHaveLength(1);
    expect(kept[0].subject).toBe('atlas');
  });
});

describe('buildDigestText', () => {
  it('renders header with KST time and window hours', () => {
    const out = buildDigestText({
      events: [],
      portfolio: EMPTY_PORTFOLIO,
      signals: baseSignals(),
      issues: [],
      windowMs: WINDOW_MS,
      nowMs: NOW_MS,
    });
    expect(out).toMatch(/🧬 \*\*팀 진화 12h 다이제스트\*\* — 2026-05-20 21:00 KST/);
    expect(out).toContain('(active 프로젝트 없음)');
  });

  it('flags portfolio stagnation when progressLog has zero entries in window', () => {
    const portfolio: Portfolio = {
      projects: [
        {
          id: 'wm',
          title: 'Witch-Mendokusai',
          northStar: '팬 100',
          weight: 100,
          status: 'active',
          currentObjective: {
            text: 'HomeInside hub',
            openedTs: new Date(NOW_MS - 48 * 3600_000).toISOString(),
          },
          progressLog: [],
        },
        {
          id: 'agent-team',
          title: '에이전트 팀 인프라',
          northStar: '살아있는 팀',
          weight: 40,
          status: 'active',
          instrumental: true,
          progressLog: [],
        },
      ],
    };
    const out = buildDigestText({
      events: [],
      portfolio,
      signals: baseSignals(),
      issues: [],
      windowMs: WINDOW_MS,
      nowMs: NOW_MS,
    });
    expect(out).toContain('Witch-Mendokusai (w100): +0 entry · ⚠ stalled 48h');
    expect(out).toContain('에이전트 팀 인프라 (w40 (도구적)): +0 entry');
    expect(out).toContain('**12h 동안 전 프로젝트 progressLog 정체** — 자가정비 외 실전진 0');
  });

  it('counts progressLog deltas inside window', () => {
    const portfolio: Portfolio = {
      projects: [
        {
          id: 'wm',
          title: 'WM',
          northStar: '팬 100',
          weight: 100,
          status: 'active',
          progressLog: [
            { ts: new Date(NOW_MS - 2 * 3600_000).toISOString(), projectId: 'wm', delta: 'A', evidence: 'pr-1' },
            { ts: new Date(NOW_MS - 6 * 3600_000).toISOString(), projectId: 'wm', delta: 'B', evidence: 'pr-2' },
            { ts: new Date(NOW_MS - 48 * 3600_000).toISOString(), projectId: 'wm', delta: 'OLD', evidence: 'pr-0' },
          ],
        },
      ],
    };
    const out = buildDigestText({
      events: [],
      portfolio,
      signals: baseSignals(),
      issues: [],
      windowMs: WINDOW_MS,
      nowMs: NOW_MS,
    });
    expect(out).toContain('WM (w100): +2 entry');
    expect(out).not.toContain('progressLog 정체');
  });

  it('summarizes self-augment promotion and regression counts', () => {
    const events: EvolutionEvent[] = [
      ev({ code: 'core-promoted', source: 'self-augment', severity: 'info', subject: 'newcore' }),
      ev({ code: 'core-promoted', source: 'self-augment', severity: 'info', subject: 'newcore' }),
      ev({ code: 'core-reverted', source: 'self-augment', severity: 'critical', subject: 'bad' }),
    ];
    const out = buildDigestText({
      events,
      portfolio: EMPTY_PORTFOLIO,
      signals: baseSignals(),
      issues: [],
      windowMs: WINDOW_MS,
      nowMs: NOW_MS,
    });
    expect(out).toContain('🧬 **자가증강 (LT-11)** — 승격 2 · 원복 1');
    expect(out).toContain('newcore');
    expect(out).toContain('bad');
  });

  it('shows zero-promotion line when no augment events', () => {
    const out = buildDigestText({
      events: [],
      portfolio: EMPTY_PORTFOLIO,
      signals: baseSignals(),
      issues: [],
      windowMs: WINDOW_MS,
      nowMs: NOW_MS,
    });
    expect(out).toContain('🧬 **자가증강 (LT-11)** — 승격 0 · 원복 0');
    expect(out).toContain('(12h 동안 코어 변동 0)');
  });

  it('summarizes health source events and current issues', () => {
    const events: EvolutionEvent[] = [
      ev({ code: 'trace-stale', source: 'health', severity: 'critical', subject: 'cadence' }),
      ev({ code: 'worker-fail-rate', source: 'health', severity: 'warn', subject: 'worker-pool' }),
    ];
    const issues: HealthIssue[] = [
      { severity: 'critical', code: 'trace-stale', detail: 'trace stale 30h' },
    ];
    const out = buildDigestText({
      events,
      portfolio: EMPTY_PORTFOLIO,
      signals: baseSignals(),
      issues,
      windowMs: WINDOW_MS,
      nowMs: NOW_MS,
    });
    expect(out).toContain('🔬 **자기수술 입력 (기둥4)** — critical 1 · warn 1');
    expect(out).toContain('[critical] trace-stale: trace stale 30h');
  });

  it('caps output length under 1900 chars', () => {
    const huge: EvolutionEvent[] = Array.from({ length: 200 }, (_, i) =>
      ev({
        code: 'worker-failed',
        source: 'trace',
        severity: 'warn',
        subject: `w${i}`,
        detail: 'x'.repeat(500),
      }),
    );
    const out = buildDigestText({
      events: huge,
      portfolio: EMPTY_PORTFOLIO,
      signals: baseSignals(),
      issues: [],
      windowMs: WINDOW_MS,
      nowMs: NOW_MS,
    });
    expect(out.length).toBeLessThanOrEqual(1900);
  });
});
