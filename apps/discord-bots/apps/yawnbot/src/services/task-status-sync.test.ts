/**
 * task-status-sync 단위 테스트 — TASK-KAR-092 (v2 PR-title 직접 파싱).
 *
 * 결정적: FS · push 둘 다 mock. 실 git/file IO 0.
 * Windows path 안전: path.join 으로 키 정규화 (backslash vs forward).
 */
import { describe, it, expect, vi } from 'vitest';
import * as path from 'node:path';
import {
  syncTaskStatusOnPrMerge,
  extractTaskIds,
  type TaskStatusSyncDeps,
} from './task-status-sync';
import type { MemoPushResult } from './memo-push';

const MEMO = '/fake/memo';
const env = { MEMO_REPO_PATH: MEMO };
const j = (...parts: string[]): string => path.join(MEMO, ...parts);

/** in-memory FS — files = absolute path → content. dirs = path → string[]. */
function makeFakeFs(setup: { files?: Record<string, string>; dirs?: Record<string, string[]> } = {}) {
  const files = { ...(setup.files ?? {}) };
  const dirs = { ...(setup.dirs ?? {}) };
  return {
    files,
    dirs,
    impl: {
      existsSync: (p: string) => p in files || p in dirs,
      readdirSync: (p: string) => dirs[p] ?? [],
      readFileSync: (p: string, _enc: 'utf-8') => {
        if (!(p in files)) throw new Error(`ENOENT ${p}`);
        return files[p];
      },
      writeFileSync: (p: string, data: string, _enc: 'utf-8') => {
        files[p] = data;
      },
    },
  };
}

function makeDeps(opts: {
  files?: Record<string, string>;
  dirs?: Record<string, string[]>;
  pushOutcomes?: MemoPushResult[];
}): TaskStatusSyncDeps & { fakeFs: ReturnType<typeof makeFakeFs> } {
  const fakeFs = makeFakeFs(opts);
  const pushOutcomes = opts.pushOutcomes ?? [];
  let i = 0;
  return {
    fakeFs,
    fs: fakeFs.impl,
    push: vi.fn(async () => pushOutcomes[i++] ?? { outcome: 'pushed', pushedSha: 'abc1234' }),
    logger: { log: () => {}, warn: () => {} },
  };
}

describe('extractTaskIds', () => {
  it('PR title 단일 TASK', () => {
    expect(extractTaskIds('feat(TASK-KAR-018-LT-W2): cooldown ladder')).toEqual([
      'TASK-KAR-018-LT-W2',
    ]);
  });
  it('여러 TASK + body 합쳐서', () => {
    const text = 'feat(TASK-WM-067): unity build\nrefs TASK-KL-070, TASK-WM-067';
    expect(extractTaskIds(text)).toEqual(['TASK-WM-067', 'TASK-KL-070']);
  });
  it('TASK- prefix 없으면 매칭 X', () => {
    expect(extractTaskIds('KAR-018: something')).toEqual([]);
  });
  it('빈 텍스트', () => {
    expect(extractTaskIds('')).toEqual([]);
  });
});

describe('syncTaskStatusOnPrMerge (v2 PR-title)', () => {
  it('MEMO_REPO_PATH 없음 = no-memo-root', async () => {
    const r = await syncTaskStatusOnPrMerge({}, { prTitle: 'feat(TASK-KAR-001): x' });
    expect(r.outcome).toBe('no-memo-root');
    expect(r.summaryLine).toBe('');
  });

  it('PR title 에 TASK 없음 = no-task-mentioned', async () => {
    const deps = makeDeps({});
    const r = await syncTaskStatusOnPrMerge(env, { prTitle: 'chore: bump deps' }, deps);
    expect(r.outcome).toBe('no-task-mentioned');
  });

  it('TASK 언급되지만 파일 없음 = no-active', async () => {
    const dirs: Record<string, string[]> = {};
    dirs[j('tasks')] = [];
    const deps = makeDeps({ dirs });
    const r = await syncTaskStatusOnPrMerge(env, { prTitle: 'feat(TASK-KAR-001): x' }, deps);
    expect(r.outcome).toBe('no-active');
  });

  it('파일 있으나 status 가 done = no-active (no-op)', async () => {
    const dirs: Record<string, string[]> = {};
    const files: Record<string, string> = {};
    dirs[j('tasks')] = ['TASK-KAR-001-foo.md'];
    files[j('tasks', 'TASK-KAR-001-foo.md')] = '---\nid: TASK-KAR-001\nstatus: done\n---\n';
    const deps = makeDeps({ dirs, files });
    const r = await syncTaskStatusOnPrMerge(env, { prTitle: 'feat(TASK-KAR-001): x' }, deps);
    expect(r.outcome).toBe('no-active');
  });

  it('ready → done 1건 = synced + summaryLine + 파일 갱신', async () => {
    const dirs: Record<string, string[]> = {};
    const files: Record<string, string> = {};
    dirs[j('tasks')] = ['TASK-KAR-018-LT-W2-foo.md'];
    files[j('tasks', 'TASK-KAR-018-LT-W2-foo.md')] =
      '---\nid: TASK-KAR-018-LT-W2\nstatus: ready\npriority: high\n---\n# body\n';
    const deps = makeDeps({ dirs, files });
    const r = await syncTaskStatusOnPrMerge(
      env,
      { prNumber: 125, prTitle: 'feat(TASK-KAR-018-LT-W2): cooldown ladder' },
      deps,
    );
    expect(r.outcome).toBe('synced');
    expect(r.pushed).toBe(1);
    expect(r.summaryLine).toContain('📝 TASK status 자동 갱신 1건');
    expect(r.summaryLine).toContain('TASK-KAR-018-LT-W2 ready→done');
    expect(deps.fakeFs.files[j('tasks', 'TASK-KAR-018-LT-W2-foo.md')]).toContain('status: done');
  });

  it('여러 TASK + 여러 dir 검색', async () => {
    const dirs: Record<string, string[]> = {};
    const files: Record<string, string> = {};
    dirs[j('tasks')] = ['TASK-KAR-001-a.md'];
    dirs[j('wm', 'tasks')] = ['TASK-WM-067-b.md'];
    files[j('tasks', 'TASK-KAR-001-a.md')] = '---\nstatus: ready\n---\n';
    files[j('wm', 'tasks', 'TASK-WM-067-b.md')] = '---\nstatus: seed\n---\n';
    const deps = makeDeps({ dirs, files });
    const r = await syncTaskStatusOnPrMerge(
      env,
      { prTitle: 'feat(TASK-KAR-001 + TASK-WM-067): combined fix' },
      deps,
    );
    expect(r.outcome).toBe('synced');
    expect(r.pushed).toBe(2);
  });

  it('skipped:race = partial + summary 에 skip 표시', async () => {
    const dirs: Record<string, string[]> = {};
    const files: Record<string, string> = {};
    dirs[j('tasks')] = ['TASK-KAR-001-a.md', 'TASK-KAR-002-b.md'];
    files[j('tasks', 'TASK-KAR-001-a.md')] = '---\nstatus: ready\n---\n';
    files[j('tasks', 'TASK-KAR-002-b.md')] = '---\nstatus: ready\n---\n';
    const deps = makeDeps({
      dirs,
      files,
      pushOutcomes: [
        { outcome: 'pushed', pushedSha: 'abc' },
        { outcome: 'skipped:race', detail: 'rebase conflict' },
      ],
    });
    const r = await syncTaskStatusOnPrMerge(
      env,
      { prTitle: 'feat(TASK-KAR-001 + TASK-KAR-002): x' },
      deps,
    );
    expect(r.outcome).toBe('partial');
    expect(r.pushed).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.summaryLine).toContain('skip 1');
  });

  it('push error 캡처, throw X', async () => {
    const dirs: Record<string, string[]> = {};
    const files: Record<string, string> = {};
    dirs[j('tasks')] = ['TASK-KAR-003-c.md'];
    files[j('tasks', 'TASK-KAR-003-c.md')] = '---\nstatus: ready\n---\n';
    const deps = makeDeps({ dirs, files, pushOutcomes: [{ outcome: 'error', detail: 'auth fail' }] });
    const r = await syncTaskStatusOnPrMerge(env, { prTitle: 'feat(TASK-KAR-003): x' }, deps);
    expect(r.outcome).toBe('partial');
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]).toContain('TASK-KAR-003');
    expect(r.summaryLine).toBe('');
  });

  it('PR body 에서도 TASK 추출', async () => {
    const dirs: Record<string, string[]> = {};
    const files: Record<string, string> = {};
    dirs[j('tasks')] = ['TASK-KAR-004-d.md'];
    files[j('tasks', 'TASK-KAR-004-d.md')] = '---\nstatus: ready\n---\n';
    const deps = makeDeps({ dirs, files });
    const r = await syncTaskStatusOnPrMerge(
      env,
      { prTitle: 'chore: refactor', prBody: 'Closes TASK-KAR-004' },
      deps,
    );
    expect(r.outcome).toBe('synced');
    expect(r.pushed).toBe(1);
  });
});
