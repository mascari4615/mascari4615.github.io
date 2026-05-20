/**
 * KAR-018-PUSH-CLOSURE Phase 1 — 봇 산출물 git push 일반화 함수.
 *
 * 근본: 봇이 자율 생산한 산출물(자기수술 시드 / 워커 outcome / evolution
 * ledger / core memory)이 prod 노트북 memo 워킹트리 untracked 로만 누적 →
 * 데스크톱·다른 Claude 세션·origin 미도달 substrate-split. 본 모듈 = 그
 * substrate→surface 다리. memo-sync.ts (fetch+reset 소비-only) 의 push
 * 방향 보완.
 *
 * 안전 envelope:
 *  - **race 회피** — fetch + (local != FETCH_HEAD 면 rebase) + abort-on-conflict.
 *    충돌 시 'skipped:race' 반환 (다음 cadence tick 재시도).
 *  - **pathspec 만** — `git add -- <file>` + `git commit -- <file>` (KAR-025
 *    intra-file foreign session 격리 정합). 다른 dirty 휩쓸기 0.
 *  - **비차단** — 호출부가 try/catch 로 감싸 tick 비차단.
 *  - **author 명시** — `git -c user.name -c user.email` 봇 식별 (yawnbot).
 *  - **dryRun mode** — 테스트 / 출시 검증용 (commit 만, push 안 함).
 *  - **토큰 masking** — error 메시지에서 PAT 가 새지 않도록.
 *
 * pre-flight scope check: 호출 측에서 startup 1회 (별도 함수).
 */

import { execFile } from 'child_process';

// canonical owner = lowercase 'mascari4615' (사용자명 케이스 변경됨, 2026-05).
// REST API 는 케이스 일치 필요 → 'Mascari4615/memo' = HTTP 404.
// git remote 는 자동 리다이렉트하지만 API 는 안 함.
const DEFAULT_REPO_SLUG = 'mascari4615/memo';
const DEFAULT_BRANCH = 'main';
const DEFAULT_AUTHOR_NAME = 'yawnbot';
const DEFAULT_AUTHOR_EMAIL = 'noreply@yawnbot.mascari4615.com';
const DEFAULT_TIMEOUT_MS = 30_000;
const SHORT_TIMEOUT_MS = 15_000;

export type MemoPushOutcome =
  | 'pushed'
  | 'skipped:no-token'
  | 'skipped:no-path'
  | 'skipped:no-change'
  | 'skipped:race'
  | 'skipped:dryrun'
  | 'error';

export interface MemoPushResult {
  outcome: MemoPushOutcome;
  detail?: string;
  pushedSha?: string;
}

export interface MemoPushConfig {
  token: string;
  memoRepoPath: string;
  repoSlug: string;
  branch: string;
  authorName: string;
  authorEmail: string;
}

export interface MemoPushGitRunner {
  /** `git status --porcelain -- <relPath>` — 빈 출력=변경 0. */
  statusFile(cfg: MemoPushConfig, relPath: string): Promise<string>;
  /** `git add -- <relPath>` — pathspec 만. */
  add(cfg: MemoPushConfig, relPath: string): Promise<void>;
  /** `git commit -c user.name/email -- <relPath> -F <messageFile>` — pathspec commit. */
  commit(cfg: MemoPushConfig, relPath: string, message: string): Promise<string>;
  /** `git fetch <authUrl> <branch>`. */
  fetch(cfg: MemoPushConfig): Promise<void>;
  /** `git rev-parse HEAD`. */
  headSha(cfg: MemoPushConfig): Promise<string>;
  /** `git rev-parse FETCH_HEAD`. */
  fetchHeadSha(cfg: MemoPushConfig): Promise<string>;
  /** `git rebase FETCH_HEAD` — conflict 시 throw. */
  rebase(cfg: MemoPushConfig): Promise<void>;
  /** `git rebase --abort` — conflict 보류. */
  rebaseAbort(cfg: MemoPushConfig): Promise<void>;
  /** `git push <authUrl> HEAD:<branch>`. */
  push(cfg: MemoPushConfig): Promise<void>;
}

export interface MemoPushDeps {
  token?: string;
  memoRepoPath?: string;
  repoSlug?: string;
  branch?: string;
  authorName?: string;
  authorEmail?: string;
  git?: MemoPushGitRunner;
  dryRun?: boolean;
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
}

function resolveConfig(env: NodeJS.ProcessEnv, deps: MemoPushDeps): MemoPushConfig | null {
  const token = deps.token ?? env.MEMO_GITHUB_PAT?.trim() ?? env.GITHUB_TOKEN?.trim() ?? '';
  const memoRepoPath = deps.memoRepoPath ?? env.MEMO_REPO_PATH?.trim() ?? '';
  if (!token || !memoRepoPath) return null;
  return {
    token,
    memoRepoPath,
    repoSlug: deps.repoSlug ?? env.YAWNBOT_MEMOSYNC_REPO_SLUG?.trim() ?? DEFAULT_REPO_SLUG,
    branch: deps.branch ?? env.YAWNBOT_MEMOSYNC_BRANCH?.trim() ?? DEFAULT_BRANCH,
    authorName: deps.authorName ?? env.YAWNBOT_PUSH_AUTHOR_NAME?.trim() ?? DEFAULT_AUTHOR_NAME,
    authorEmail: deps.authorEmail ?? env.YAWNBOT_PUSH_AUTHOR_EMAIL?.trim() ?? DEFAULT_AUTHOR_EMAIL,
  };
}

function authUrl(cfg: MemoPushConfig): string {
  return `https://x-access-token:${cfg.token}@github.com/${cfg.repoSlug}.git`;
}

function maskToken(msg: string, token: string): string {
  if (!token) return msg;
  return msg.split(token).join('***');
}

/**
 * 실 git GitRunner — child_process.execFile 기반. memo-sync.ts createGitRunner
 * 와 동형이되 push 방향에 필요한 명령 추가 (status / add / commit / rebase /
 * rebaseAbort / push).
 */
export function createMemoPushGitRunner(): MemoPushGitRunner {
  const run = (
    cfg: MemoPushConfig,
    args: string[],
    timeoutMs: number,
  ): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      execFile(
        'git',
        ['-C', cfg.memoRepoPath, ...args],
        {
          timeout: timeoutMs,
          encoding: 'utf-8',
          windowsHide: true,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        },
        (err, stdout, stderr) => {
          if (err) {
            const raw = `${err.message}${stderr ? ` :: ${stderr}` : ''}`;
            reject(new Error(maskToken(raw, cfg.token)));
            return;
          }
          resolve(String(stdout).trim());
        },
      );
    });

  return {
    statusFile(cfg, relPath) {
      return run(cfg, ['status', '--porcelain', '--', relPath], SHORT_TIMEOUT_MS);
    },
    async add(cfg, relPath) {
      await run(cfg, ['add', '--', relPath], SHORT_TIMEOUT_MS);
    },
    async commit(cfg, relPath, message) {
      const out = await run(
        cfg,
        [
          '-c', `user.name=${cfg.authorName}`,
          '-c', `user.email=${cfg.authorEmail}`,
          'commit',
          '-m', message,
          '--', relPath,
        ],
        DEFAULT_TIMEOUT_MS,
      );
      return out;
    },
    async fetch(cfg) {
      await run(cfg, ['fetch', authUrl(cfg), cfg.branch], DEFAULT_TIMEOUT_MS);
    },
    headSha(cfg) {
      return run(cfg, ['rev-parse', 'HEAD'], SHORT_TIMEOUT_MS);
    },
    fetchHeadSha(cfg) {
      return run(cfg, ['rev-parse', 'FETCH_HEAD'], SHORT_TIMEOUT_MS);
    },
    async rebase(cfg) {
      await run(cfg, ['rebase', 'FETCH_HEAD'], DEFAULT_TIMEOUT_MS);
    },
    async rebaseAbort(cfg) {
      await run(cfg, ['rebase', '--abort'], SHORT_TIMEOUT_MS);
    },
    async push(cfg) {
      await run(cfg, ['push', authUrl(cfg), `HEAD:${cfg.branch}`], DEFAULT_TIMEOUT_MS);
    },
  };
}

/**
 * KAR-018-PUSH-CLOSURE 후속 — startup pre-flight: MEMO_GITHUB_PAT 가 memo
 * repo 에 push 권한 가졌는지 GitHub API 로 검증. push fail 의 KL-073 동형
 * silent 패턴 (token 있으나 scope 부족 → 매 cadence tick 'error') 회피.
 *
 * - token 없음 → ok=false (push 비활성, 사용자 secret 박기 필요)
 * - HTTP fail → ok=false (network or invalid token)
 * - GET /repos/<slug> 성공 + permissions.push=true → canPush=true (GREEN)
 * - permissions.push=false → canPush=false (read scope만, push 부족)
 *
 * `x-oauth-scopes` 헤더는 classic PAT 에만 — fine-grained PAT 는 빈 출력
 * 이라 `permissions.push` 가 정본 판단 기준. (fine-grained 의 Pull requests:
 * Write + Contents: Write 가 push 권한.)
 */
export interface MemoPushScopeResult {
  ok: boolean;
  canPush?: boolean;
  scopes?: string;
  error?: string;
}

export async function checkMemoPushScope(
  env: NodeJS.ProcessEnv,
  deps: { fetchImpl?: typeof fetch; repoSlug?: string } = {},
): Promise<MemoPushScopeResult> {
  const token = env.MEMO_GITHUB_PAT?.trim() || env.GITHUB_TOKEN?.trim() || '';
  if (!token) {
    return { ok: false, error: 'MEMO_GITHUB_PAT (and GITHUB_TOKEN) missing' };
  }
  const slug = deps.repoSlug ?? env.YAWNBOT_MEMOSYNC_REPO_SLUG?.trim() ?? DEFAULT_REPO_SLUG;
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`https://api.github.com/repos/${slug}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'yawnbot-memo-push-preflight',
      },
    });
    if (!res.ok) {
      return {
        ok: false,
        error: maskToken(`HTTP ${res.status}`, token),
      };
    }
    const data = (await res.json()) as { permissions?: { push?: boolean } };
    const scopes = res.headers.get('x-oauth-scopes') || '';
    const canPush = data?.permissions?.push === true;
    return { ok: true, canPush, scopes };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: maskToken(msg.slice(0, 240), token) };
  }
}

function toRelPath(memoRoot: string, absPath: string): string | null {
  // Windows mixed-slash 안전: forward slash 로 정규화 후 비교.
  // 실 버그(2026-05-20 prod 진단): MEMO_REPO_PATH=`C:/Users/.../memo` (forward,
  // .env) ↔ path.join 결과=`C:\Users\...` (backslash, Windows native) → 단순
  // startsWith 비교 시 false → outcome:skipped:no-path → silent fail.
  const norm = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '');
  const root = norm(memoRoot);
  const target = norm(absPath);
  if (!target.startsWith(root + '/') && target !== root) return null;
  return target.slice(root.length).replace(/^\/+/, '');
}

/**
 * 산출물 1 파일을 memo repo origin/main 에 안전 도달.
 *
 *  1. token / memoRepoPath / file 실재 확인.
 *  2. statusFile → 변경 0 이면 'skipped:no-change'.
 *  3. fetch authUrl branch.
 *  4. local != FETCH_HEAD → rebase FETCH_HEAD. conflict → rebaseAbort + 'skipped:race'.
 *  5. add pathspec.
 *  6. commit pathspec (author/email 주입).
 *  7. dryRun? → 'skipped:dryrun'.
 *  8. push HEAD:branch → 'pushed' (or 'error' on push fail).
 *
 * 어느 단계 실패도 caller try/catch 비차단 — error 메시지는 토큰 mask.
 */
export async function commitAndPushMemoFile(
  env: NodeJS.ProcessEnv,
  absPath: string,
  message: string,
  deps: MemoPushDeps = {},
): Promise<MemoPushResult> {
  const cfg = resolveConfig(env, deps);
  if (!cfg) return { outcome: 'skipped:no-token', detail: 'MEMO_GITHUB_PAT or MEMO_REPO_PATH missing' };
  const rel = toRelPath(cfg.memoRepoPath, absPath);
  if (!rel) return { outcome: 'skipped:no-path', detail: `path outside memo root: ${absPath}` };
  const git = deps.git ?? createMemoPushGitRunner();
  const logger = deps.logger ?? console;

  try {
    const status = await git.statusFile(cfg, rel);
    if (!status.trim()) {
      return { outcome: 'skipped:no-change', detail: 'no diff for pathspec' };
    }
    await git.fetch(cfg);
    const [local, remote] = await Promise.all([
      git.headSha(cfg),
      git.fetchHeadSha(cfg),
    ]);
    if (local !== remote) {
      try {
        await git.rebase(cfg);
      } catch (rebaseErr) {
        const rmsg = rebaseErr instanceof Error ? rebaseErr.message : String(rebaseErr);
        try {
          await git.rebaseAbort(cfg);
        } catch {
          /* abort 실패 = working tree 가 이미 clean 일 수도. 다음 cadence tick 재시도 */
        }
        logger.warn(`[memo-push] rebase conflict — skip: ${rmsg.slice(0, 240)}`);
        return { outcome: 'skipped:race', detail: `rebase conflict: ${rmsg.slice(0, 240)}` };
      }
    }
    await git.add(cfg, rel);
    await git.commit(cfg, rel, message);
    if (deps.dryRun) {
      const sha = await git.headSha(cfg);
      return { outcome: 'skipped:dryrun', detail: 'commit only (dryRun=true)', pushedSha: sha };
    }
    await git.push(cfg);
    const sha = await git.headSha(cfg);
    logger.log(`[memo-push] pushed ${rel} -> ${sha.slice(0, 7)}`);
    return { outcome: 'pushed', pushedSha: sha };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[memo-push] error: ${msg.slice(0, 240)}`);
    return { outcome: 'error', detail: msg.slice(0, 240) };
  }
}
