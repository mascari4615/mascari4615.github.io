import { describe, it, expect } from 'vitest';
import {
  commitAndPushMemoFile,
  checkMemoPushScope,
  resolveConfig,
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

  it('checkMemoPushScope — no token returns ok=false', async () => {
    const result = await checkMemoPushScope({} as NodeJS.ProcessEnv);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('missing');
  });

  it('checkMemoPushScope — permissions.push=true returns canPush=true', async () => {
    const env = makeEnv();
    const fakeFetch = (async () => ({
      ok: true,
      headers: { get: (k: string) => (k === 'x-oauth-scopes' ? 'repo, workflow' : null) },
      json: async () => ({ permissions: { push: true, pull: true, admin: false } }),
    })) as unknown as typeof fetch;
    const result = await checkMemoPushScope(env, { fetchImpl: fakeFetch });
    expect(result.ok).toBe(true);
    expect(result.canPush).toBe(true);
    expect(result.scopes).toContain('repo');
  });

  it('checkMemoPushScope — permissions.push=false returns canPush=false', async () => {
    const env = makeEnv();
    const fakeFetch = (async () => ({
      ok: true,
      headers: { get: () => null },
      json: async () => ({ permissions: { push: false, pull: true, admin: false } }),
    })) as unknown as typeof fetch;
    const result = await checkMemoPushScope(env, { fetchImpl: fakeFetch });
    expect(result.ok).toBe(true);
    expect(result.canPush).toBe(false);
  });

  it('checkMemoPushScope — HTTP 401 returns ok=false', async () => {
    const env = makeEnv();
    const fakeFetch = (async () => ({
      ok: false,
      status: 401,
      headers: { get: () => null },
      json: async () => ({ message: 'Bad credentials' }),
    })) as unknown as typeof fetch;
    const result = await checkMemoPushScope(env, { fetchImpl: fakeFetch });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('401');
  });

  it('checkMemoPushScope — network error returns masked error', async () => {
    const env = makeEnv();
    const fakeFetch = (async () => {
      throw new Error('ENOTFOUND tok-PAT-deadbeef should be masked');
    }) as unknown as typeof fetch;
    const result = await checkMemoPushScope(env, { fetchImpl: fakeFetch });
    expect(result.ok).toBe(false);
    expect(result.error).not.toContain('tok-PAT-deadbeef');
    expect(result.error).toContain('***');
  });

  it('handles mixed-slash path (env=forward, abs=backslash) — Windows prod 실 버그 회귀', async () => {
    const env = {
      MEMO_GITHUB_PAT: 'tok',
      MEMO_REPO_PATH: 'C:/Users/masca/repos/karmoddrine/memo', // forward (env)
    } as NodeJS.ProcessEnv;
    const { git, calls } = makeGit();
    const result = await commitAndPushMemoFile(
      env,
      'C:\\Users\\masca\\repos\\karmoddrine\\memo\\.claude\\evolution-events.jsonl', // backslash (path.join Windows)
      'msg',
      { git },
    );
    expect(result.outcome).toBe('pushed');
    const addCall = calls.find((c) => c.step === 'add');
    expect(addCall?.arg).toBe('.claude/evolution-events.jsonl');
  });

  it('rejects path outside memo root even with mixed slashes', async () => {
    const env = {
      MEMO_GITHUB_PAT: 'tok',
      MEMO_REPO_PATH: 'C:/Users/masca/repos/karmoddrine/memo',
    } as NodeJS.ProcessEnv;
    const { git } = makeGit();
    const result = await commitAndPushMemoFile(
      env,
      'C:\\Users\\masca\\repos\\karmoddrine\\OTHER\\file.md',
      'msg',
      { git },
    );
    expect(result.outcome).toBe('skipped:no-path');
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

// TASK-KAR-094 — resolveConfig 회귀 방지. 2026-05-20~21 prod 에서 같은 패턴
// 버그 2번 발생: `??` 가드가 빈 문자열을 통과시켜 repoSlug="" / branch="" 로
// 깨졌다. 근본 = defaults.txt `KEY=` 라인이 process.env 에 빈 문자열로
// 주입됨. `??` (nullish-only) → `||` (falsy-incl-empty) 가드가 정답.
describe('resolveConfig — defaults.txt 빈 문자열 폴백 회귀', () => {
  const baseEnv = {
    MEMO_GITHUB_PAT: 'tok-PAT-deadbeef',
    MEMO_REPO_PATH: '/tmp/fake-memo',
  };

  it('returns null when token missing (no PAT, no GITHUB_TOKEN)', () => {
    const env = { MEMO_REPO_PATH: '/tmp/fake-memo' } as NodeJS.ProcessEnv;
    expect(resolveConfig(env, {})).toBeNull();
  });

  it('returns null when memoRepoPath missing', () => {
    const env = { MEMO_GITHUB_PAT: 'tok' } as NodeJS.ProcessEnv;
    expect(resolveConfig(env, {})).toBeNull();
  });

  it('repoSlug — env undefined → DEFAULT_REPO_SLUG', () => {
    const cfg = resolveConfig(baseEnv as NodeJS.ProcessEnv, {});
    expect(cfg?.repoSlug).toBe('mascari4615/memo');
  });

  it('repoSlug — env="" (defaults.txt 빈 라인) → DEFAULT_REPO_SLUG (← 회귀 핵심)', () => {
    const env = { ...baseEnv, YAWNBOT_MEMOSYNC_REPO_SLUG: '' } as NodeJS.ProcessEnv;
    const cfg = resolveConfig(env, {});
    expect(cfg?.repoSlug).toBe('mascari4615/memo');
  });

  it('repoSlug — env="   " (whitespace-only) → DEFAULT_REPO_SLUG', () => {
    const env = { ...baseEnv, YAWNBOT_MEMOSYNC_REPO_SLUG: '   ' } as NodeJS.ProcessEnv;
    const cfg = resolveConfig(env, {});
    expect(cfg?.repoSlug).toBe('mascari4615/memo');
  });

  it('repoSlug — env 정상값 → 그 값 사용', () => {
    const env = { ...baseEnv, YAWNBOT_MEMOSYNC_REPO_SLUG: 'OtherOwner/other-repo' } as NodeJS.ProcessEnv;
    const cfg = resolveConfig(env, {});
    expect(cfg?.repoSlug).toBe('OtherOwner/other-repo');
  });

  it('repoSlug — deps 명시 → env 무시', () => {
    const env = { ...baseEnv, YAWNBOT_MEMOSYNC_REPO_SLUG: 'env/slug' } as NodeJS.ProcessEnv;
    const cfg = resolveConfig(env, { repoSlug: 'deps/slug' });
    expect(cfg?.repoSlug).toBe('deps/slug');
  });

  it('repoSlug — deps="" (빈 문자열) → env 폴백 (deps 도 같은 가드)', () => {
    const env = { ...baseEnv, YAWNBOT_MEMOSYNC_REPO_SLUG: 'env/slug' } as NodeJS.ProcessEnv;
    const cfg = resolveConfig(env, { repoSlug: '' });
    expect(cfg?.repoSlug).toBe('env/slug');
  });

  it('repoSlug — deps="" + env="" → DEFAULT_REPO_SLUG', () => {
    const env = { ...baseEnv, YAWNBOT_MEMOSYNC_REPO_SLUG: '' } as NodeJS.ProcessEnv;
    const cfg = resolveConfig(env, { repoSlug: '' });
    expect(cfg?.repoSlug).toBe('mascari4615/memo');
  });

  it('branch — env undefined → DEFAULT_BRANCH', () => {
    const cfg = resolveConfig(baseEnv as NodeJS.ProcessEnv, {});
    expect(cfg?.branch).toBe('main');
  });

  it('branch — env="" (defaults.txt 빈 라인) → DEFAULT_BRANCH (← 회귀 핵심)', () => {
    const env = { ...baseEnv, YAWNBOT_MEMOSYNC_BRANCH: '' } as NodeJS.ProcessEnv;
    const cfg = resolveConfig(env, {});
    expect(cfg?.branch).toBe('main');
  });

  it('branch — env 정상값 → 그 값 사용', () => {
    const env = { ...baseEnv, YAWNBOT_MEMOSYNC_BRANCH: 'develop' } as NodeJS.ProcessEnv;
    const cfg = resolveConfig(env, {});
    expect(cfg?.branch).toBe('develop');
  });

  it('branch — deps 명시 → env 무시', () => {
    const env = { ...baseEnv, YAWNBOT_MEMOSYNC_BRANCH: 'env-branch' } as NodeJS.ProcessEnv;
    const cfg = resolveConfig(env, { branch: 'deps-branch' });
    expect(cfg?.branch).toBe('deps-branch');
  });

  it('branch — deps="" → env 폴백', () => {
    const env = { ...baseEnv, YAWNBOT_MEMOSYNC_BRANCH: 'env-branch' } as NodeJS.ProcessEnv;
    const cfg = resolveConfig(env, { branch: '' });
    expect(cfg?.branch).toBe('env-branch');
  });

  it('authorName — env="" → DEFAULT_AUTHOR_NAME', () => {
    const env = { ...baseEnv, YAWNBOT_PUSH_AUTHOR_NAME: '' } as NodeJS.ProcessEnv;
    const cfg = resolveConfig(env, {});
    expect(cfg?.authorName).toBe('yawnbot');
  });

  it('authorName — env 정상값 → 그 값', () => {
    const env = { ...baseEnv, YAWNBOT_PUSH_AUTHOR_NAME: 'custom-bot' } as NodeJS.ProcessEnv;
    const cfg = resolveConfig(env, {});
    expect(cfg?.authorName).toBe('custom-bot');
  });

  it('authorName — deps 명시 → env 무시', () => {
    const env = { ...baseEnv, YAWNBOT_PUSH_AUTHOR_NAME: 'env-bot' } as NodeJS.ProcessEnv;
    const cfg = resolveConfig(env, { authorName: 'deps-bot' });
    expect(cfg?.authorName).toBe('deps-bot');
  });

  it('authorEmail — env="" → DEFAULT_AUTHOR_EMAIL', () => {
    const env = { ...baseEnv, YAWNBOT_PUSH_AUTHOR_EMAIL: '' } as NodeJS.ProcessEnv;
    const cfg = resolveConfig(env, {});
    expect(cfg?.authorEmail).toBe('noreply@yawnbot.mascari4615.com');
  });

  it('authorEmail — env 정상값 → 그 값', () => {
    const env = { ...baseEnv, YAWNBOT_PUSH_AUTHOR_EMAIL: 'bot@example.com' } as NodeJS.ProcessEnv;
    const cfg = resolveConfig(env, {});
    expect(cfg?.authorEmail).toBe('bot@example.com');
  });

  it('authorEmail — deps 명시 → env 무시', () => {
    const env = { ...baseEnv, YAWNBOT_PUSH_AUTHOR_EMAIL: 'env@example.com' } as NodeJS.ProcessEnv;
    const cfg = resolveConfig(env, { authorEmail: 'deps@example.com' });
    expect(cfg?.authorEmail).toBe('deps@example.com');
  });

  it('token — env MEMO_GITHUB_PAT="" + GITHUB_TOKEN 정상 → GITHUB_TOKEN 사용', () => {
    const env = {
      MEMO_GITHUB_PAT: '',
      GITHUB_TOKEN: 'fallback-tok',
      MEMO_REPO_PATH: '/tmp/fake-memo',
    } as NodeJS.ProcessEnv;
    const cfg = resolveConfig(env, {});
    expect(cfg?.token).toBe('fallback-tok');
  });

  it('전체 통합 — env 빈 문자열 4개 (defaults.txt 시드 시나리오) → 모두 DEFAULT', () => {
    const env = {
      MEMO_GITHUB_PAT: 'tok',
      MEMO_REPO_PATH: '/tmp/fake-memo',
      YAWNBOT_MEMOSYNC_REPO_SLUG: '',
      YAWNBOT_MEMOSYNC_BRANCH: '',
      YAWNBOT_PUSH_AUTHOR_NAME: '',
      YAWNBOT_PUSH_AUTHOR_EMAIL: '',
    } as NodeJS.ProcessEnv;
    const cfg = resolveConfig(env, {});
    expect(cfg).not.toBeNull();
    expect(cfg?.repoSlug).toBe('mascari4615/memo');
    expect(cfg?.branch).toBe('main');
    expect(cfg?.authorName).toBe('yawnbot');
    expect(cfg?.authorEmail).toBe('noreply@yawnbot.mascari4615.com');
  });
});
