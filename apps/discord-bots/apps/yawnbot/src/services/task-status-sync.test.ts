/**
 * task-status-sync 단위 테스트 — TASK-KAR-092.
 *
 * 행동: script + memo-push 주입 시 diffs 별 push + summaryLine 빌더.
 * 결정적: deps 전부 mock, FS·git·child_process 0 의존.
 */
import { describe, it, expect, vi } from 'vitest';
import { syncTaskStatusOnPrMerge, type TaskStatusSyncDeps } from './task-status-sync';
import type { MemoPushResult } from './memo-push';

const env = { MEMO_REPO_PATH: '/fake/memo' };

function makeDeps(opts: {
  scriptOut: string;
  scriptCode?: number;
  pushOutcomes?: MemoPushResult[];
}): TaskStatusSyncDeps {
  const pushOutcomes = opts.pushOutcomes ?? [];
  let i = 0;
  return {
    run: () => ({ code: opts.scriptCode ?? 0, out: opts.scriptOut }),
    push: vi.fn(async () => pushOutcomes[i++] ?? { outcome: 'pushed', pushedSha: 'abc1234' }),
    logger: { log: () => {}, warn: () => {} },
  };
}

describe('syncTaskStatusOnPrMerge', () => {
  it('no MEMO_REPO_PATH = no-memo-root', async () => {
    const r = await syncTaskStatusOnPrMerge({}, { prNumber: 1 });
    expect(r.outcome).toBe('no-memo-root');
    expect(r.summaryLine).toBe('');
  });

  it('script error = script-error', async () => {
    const deps = makeDeps({ scriptOut: 'boom', scriptCode: 1 });
    const r = await syncTaskStatusOnPrMerge(env, { prNumber: 1 }, deps);
    expect(r.outcome).toBe('script-error');
  });

  it('non-JSON output = parse-error', async () => {
    const deps = makeDeps({ scriptOut: 'not json' });
    const r = await syncTaskStatusOnPrMerge(env, { prNumber: 1 }, deps);
    expect(r.outcome).toBe('parse-error');
  });

  it('empty diffs = no-change + empty summaryLine', async () => {
    const deps = makeDeps({ scriptOut: JSON.stringify({ diffs: [] }) });
    const r = await syncTaskStatusOnPrMerge(env, { prNumber: 1 }, deps);
    expect(r.outcome).toBe('no-change');
    expect(r.pushed).toBe(0);
    expect(r.summaryLine).toBe('');
  });

  it('all pushed = synced + summaryLine with ids', async () => {
    const deps = makeDeps({
      scriptOut: JSON.stringify({
        diffs: [
          { id: 'TASK-KAR-018-LT-W1', current: 'ready', target: 'done', reason: 'r', file: 'tasks/a.md' },
          { id: 'TASK-WM-067', current: 'seed', target: 'in_progress', reason: 'r', file: 'wm/tasks/b.md' },
        ],
      }),
    });
    const r = await syncTaskStatusOnPrMerge(env, { prNumber: 124 }, deps);
    expect(r.outcome).toBe('synced');
    expect(r.pushed).toBe(2);
    expect(r.skipped).toBe(0);
    expect(r.summaryLine).toContain('📝 TASK status 자동 갱신 2건');
    expect(r.summaryLine).toContain('TASK-KAR-018-LT-W1 ready→done');
    expect(r.summaryLine).toContain('TASK-WM-067 seed→in_progress');
  });

  it('skipped:race = partial outcome + skip count in summary', async () => {
    const deps = makeDeps({
      scriptOut: JSON.stringify({
        diffs: [
          { id: 'TASK-KAR-001', current: 'ready', target: 'done', reason: 'r', file: 'tasks/a.md' },
          { id: 'TASK-KAR-002', current: 'ready', target: 'done', reason: 'r', file: 'tasks/b.md' },
        ],
      }),
      pushOutcomes: [
        { outcome: 'pushed', pushedSha: 'abc' },
        { outcome: 'skipped:race', detail: 'rebase conflict' },
      ],
    });
    const r = await syncTaskStatusOnPrMerge(env, { prNumber: 1 }, deps);
    expect(r.outcome).toBe('partial');
    expect(r.pushed).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.summaryLine).toContain('skip 1');
  });

  it('error result captures detail without throw', async () => {
    const deps = makeDeps({
      scriptOut: JSON.stringify({
        diffs: [
          { id: 'TASK-KAR-003', current: 'ready', target: 'done', reason: 'r', file: 'tasks/c.md' },
        ],
      }),
      pushOutcomes: [{ outcome: 'error', detail: 'auth fail' }],
    });
    const r = await syncTaskStatusOnPrMerge(env, { prNumber: 1 }, deps);
    expect(r.outcome).toBe('partial');
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]).toContain('TASK-KAR-003');
    expect(r.summaryLine).toBe('');
  });

  it('5+ pushed shows "외 N건" truncation', async () => {
    const diffs = Array.from({ length: 8 }, (_, i) => ({
      id: `TASK-KAR-${100 + i}`,
      current: 'ready', target: 'done', reason: 'r', file: `tasks/t${i}.md`,
    }));
    const deps = makeDeps({ scriptOut: JSON.stringify({ diffs }) });
    const r = await syncTaskStatusOnPrMerge(env, { prNumber: 1 }, deps);
    expect(r.summaryLine).toContain('외 3건');
  });
});
