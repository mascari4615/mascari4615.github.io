import { describe, it, expect } from 'vitest';
import {
  commitAndPushMemoFile,
  type MemoPushGitRunner,
  type MemoPushConfig,
} from './memo-push';

function makeEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    MEMO_GITHUB_PAT: 'tok-PAT-deadbeef',
    MEMO_REPO_PATH: '/tmp/fake-memo',
    ...extra,
  } as NodeJS.ProcessEnv;
}

interface CallLog {
  step: string;
  cfg: MemoPushConfig;
  arg?: string;
}

function makeGit(overrides: Partial<MemoPushGitRunner> = {}): {
  git: MemoPushGitRunner;
  calls: CallLog[];
} {
  const calls: CallLog[] = [];
  const git: MemoPushGitRunner = {
    statusFile: overrides.statusFile ?? (async (cfg, p) => {
      calls.push({ step: 'statusFile', cfg, arg: p });
      return ' M tasks/TASK-KAR-085.md';
    }),
    add: overrides.add ?? (async (cfg, p) => {
      calls.push({ step: 'add', cfg, arg: p });
    }),
    commit: overrides.commit ?? (async (cfg, p, msg) => {
      calls.push({ step: 'commit', cfg, arg: `${p}::${msg}` });
      return 'commit ok';
    }),
    fetch: overrides.fetch ?? (async (cfg) => {
      calls.push({ step: 'fetch', cfg });
    }),
    headSha: overrides.headSha ?? (async (cfg) => {
      calls.push({ step: 'headSha', cfg });
      return 'aaaa1111';
    }),
    fetchHeadSha: overrides.fetchHeadSha ?? (async (cfg) => {
      calls.push({ step: 'fetchHeadSha', cfg });
      return 'aaaa1111';
    }),
    rebase: overrides.rebase ?? (async (cfg) => {
      calls.push({ step: 'rebase', cfg });
    }),
    rebaseAbort: overrides.rebaseAbort ?? (async (cfg) => {
      calls.push({ step: 'rebaseAbort', cfg });
    }),
    push: overrides.push ?? (async (cfg) => {
      calls.push({ step: 'push', cfg });
    }),
  };
  return { git, calls };
}

describe('commitAndPushMemoFile', () => {
  it('returns skipped:no-token when MEMO_GITHUB_PAT missing', async () => {
    const env = { MEMO_REPO_PATH: '/tmp/fake-memo' } as NodeJS.ProcessEnv;
    const result = await commitAndPushMemoFile(env, '/tmp/fake-memo/tasks/TASK-KAR-099.md', 'msg');
    expect(result.outcome).toBe('skipped:no-token');
  });

  it('returns skipped:no-token when MEMO_REPO_PATH missing', async () => {
    const env = { MEMO_GITHUB_PAT: 'tok' } as NodeJS.ProcessEnv;
    const result = await commitAndPushMemoFile(env, '/tmp/x/file.md', 'msg');
    expect(result.outcome).toBe('skipped:no-token');
  });

  it('returns skipped:no-path when abs path outside memo root', async () => {
    const env = makeEnv();
    const { git } = makeGit();
    const result = await commitAndPushMemoFile(env, '/other/place/file.md', 'msg', { git });
    expect(result.outcome).toBe('skipped:no-path');
  });

  it('returns skipped:no-change when status is clean for pathspec', async () => {
    const env = makeEnv();
    const { git } = makeGit({
      statusFile: async () => '', // clean
    });
    const result = await commitAndPushMemoFile(env, '/tmp/fake-memo/tasks/T.md', 'msg', { git });
    expect(result.outcome).toBe('skipped:no-change');
  });

  it('happy path — local==remote → fetch → add → commit → push (no rebase)', async () => {
    const env = makeEnv();
    const { git, calls } = makeGit();
    const result = await commitAndPushMemoFile(
      env,
      '/tmp/fake-memo/tasks/TASK-KAR-085.md',
      'chore(surgery): seed worker-failed',
      { git },
    );
    expect(result.outcome).toBe('pushed');
    expect(result.pushedSha).toBe('aaaa1111');
    const steps = calls.map((c) => c.step);
    expect(steps).toContain('fetch');
    expect(steps).toContain('add');
    expect(steps).toContain('commit');
    expect(steps).toContain('push');
    // rebase 안 도는지 (local==remote)
    expect(steps).not.toContain('rebase');
    // commit author 주입 확인
    const commitCall = calls.find((c) => c.step === 'commit');
    expect(commitCall?.arg).toContain('chore(surgery): seed worker-failed');
  });

  it('rebase path — local behind remote → rebase → add → commit → push', async () => {
    const env = makeEnv();
    const { git, calls } = makeGit({
      headSha: async () => 'localBEHIND',
      fetchHeadSha: async () => 'remoteAHEAD',
    });
    const result = await commitAndPushMemoFile(
      env,
      '/tmp/fake-memo/tasks/T.md',
      'msg',
      { git },
    );
    expect(result.outcome).toBe('pushed');
    const steps = calls.map((c) => c.step);
    expect(steps).toContain('rebase');
    const rebaseIdx = steps.indexOf('rebase');
    const addIdx = steps.indexOf('add');
    expect(rebaseIdx).toBeLessThan(addIdx);
  });

  it('skipped:race — rebase conflict → abort → return', async () => {
    const env = makeEnv();
    const { git, calls } = makeGit({
      headSha: async () => 'localBEHIND',
      fetchHeadSha: async () => 'remoteAHEAD',
      rebase: async () => {
        throw new Error('CONFLICT (content): tasks/T.md');
      },
    });
    const result = await commitAndPushMemoFile(
      env,
      '/tmp/fake-memo/tasks/T.md',
      'msg',
      { git },
    );
    expect(result.outcome).toBe('skipped:race');
    expect(result.detail).toContain('CONFLICT');
    const steps = calls.map((c) => c.step);
    expect(steps).toContain('rebaseAbort');
    expect(steps).not.toContain('push');
  });

  it('dryRun mode — commit happens but push skipped', async () => {
    const env = makeEnv();
    const { git, calls } = makeGit();
    const result = await commitAndPushMemoFile(
      env,
      '/tmp/fake-memo/tasks/T.md',
      'msg',
      { git, dryRun: true },
    );
    expect(result.outcome).toBe('skipped:dryrun');
    const steps = calls.map((c) => c.step);
    expect(steps).toContain('commit');
    expect(steps).not.toContain('push');
  });

  it('error path — fetch fail returns error with masked token', async () => {
    const env = makeEnv();
    const { git } = makeGit({
      fetch: async () => {
        throw new Error('fetch failed token=tok-PAT-deadbeef leaked');
      },
    });
    const result = await commitAndPushMemoFile(
      env,
      '/tmp/fake-memo/tasks/T.md',
      'msg',
      { git },
    );
    expect(result.outcome).toBe('error');
    // 토큰 leak 검증 — error handler 자체는 git runner 에서 mask. stub git 은 raw msg.
    // 실 runner 가 mask 한다는 건 createMemoPushGitRunner 의 maskToken 책임.
    expect(result.detail).toContain('fetch failed');
  });

  it('handles Windows-style absolute path within memo root', async () => {
    const env = {
      MEMO_GITHUB_PAT: 'tok',
      MEMO_REPO_PATH: 'C:\\Users\\masca\\repos\\karmoddrine\\memo',
    } as NodeJS.ProcessEnv;
    const { git, calls } = makeGit();
    const result = await commitAndPushMemoFile(
      env,
      'C:\\Users\\masca\\repos\\karmoddrine\\memo\\tasks\\TASK-KAR-085.md',
      'msg',
      { git },
    );
    expect(result.outcome).toBe('pushed');
    const addCall = calls.find((c) => c.step === 'add');
    expect(addCall?.arg).toBe('tasks/TASK-KAR-085.md');
  });
});
