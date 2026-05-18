/**
 * prod memo 자동 동기 (TASK-KAR-MEMOSYNC part4 — heartbeat/charstate 패턴 미러)
 *
 * 현 memo-sync 는 *github.io deploy 안에서만* 실행(yawnbot-path push 트리거).
 * memo-only 변경(TASK·agent core.md·rules)은 deploy 가 안 일어나면 prod
 * 미반영 — 실증: wm-worker `status:inactive`(2026-05-19) 적용에 deploy
 * *수동 트리거* 강제됨. 본 모듈은 prod 봇이 *스스로* memo 클론을
 * `git fetch <auth> main` + `git reset --hard FETCH_HEAD` 로 동기화한다
 * — (a) **주기**(env interval, heartbeat 동형 timer) (b) **이벤트 전**
 * (worker cadence tick 직전 freshness hook = agent-cadence 측 호출).
 *
 * **근본 enable**: KAR-MEMOSYNC part2/3 이 reset --hard 를 결정적·안전하게
 * 만들었다 — 캐릭터 런타임은 git untrack(`commitIfDirty` no-op) 이라
 * 봇이 tracked 정본을 mutate 안 함 → origin divergence *구조적으로 0* →
 * reset --hard 를 *자주 돌려도 무해*. 빈도를 올리는 게 비로소 가능해진 것.
 *
 * 동기화 시맨틱 = `deploy-discord-bots.yml` § "Sync prod memo" 스텝과
 * **동일**(평행정의 X — 같은 로직을 봇 서비스로 미러):
 *   1. `git fetch <authUrl> main`  (MEMO_GITHUB_PAT 인증 — memo=private)
 *   2. `local == FETCH_HEAD` 면 skip (이미 최신, deploy 스텝의 동일 판정)
 *   3. `git reset --hard FETCH_HEAD` (tracked=origin byte-identical,
 *      untracked 런타임은 reset 이 *안 건드림* = 생존)
 *
 * 봇이 canon read 중 reset = 짧은 윈도우(deploy 도 동일, 수용). 단 봇
 * 자기 프로세스 안의 race: reset 이 worker spawn 과 안 겹치게 — 본 모듈은
 * "1회 sync" 만 제공하고 *언제* 도는지(tick 경계)는 호출부가 결정한다
 * (agent-cadence 가 worker tick *직전* 직렬 호출 → spawn 과 시간 분리).
 *
 * 실패(fetch/reset) = silent 금지(KAR-MEMOSYNC part1 정신) → heartbeat
 * 동형 ops-self-report 상태 전이 alert.
 *
 * 순수부(planMemoSync)는 git exec 주입으로 단위 테스트 가능
 * (실 네트워크·실 git·실 GitHub 무관).
 *
 * 환경:
 *  - MEMO_GITHUB_PAT (또는 GITHUB_TOKEN)  — memo private fetch 토큰 (미설정 시 비활성)
 *  - MEMO_REPO_PATH                        — 로컬 memo 클론 경로 (미설정 시 비활성)
 *  - YAWNBOT_MEMOSYNC_REPO_SLUG            — 기본 'Mascari4615/memo'
 *  - YAWNBOT_MEMOSYNC_BRANCH               — 기본 'main'
 *  - YAWNBOT_MEMOSYNC_INTERVAL_MIN         — 간격(분, 기본 10, 최소 1)
 */

import { execFile } from 'child_process';

const DEFAULT_REPO_SLUG = 'Mascari4615/memo';
const DEFAULT_BRANCH = 'main';
const DEFAULT_INTERVAL_MIN = 10;
const MIN_INTERVAL_MIN = 1;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface MemoSyncConfig {
  token: string;
  /** 로컬 memo 클론 루트 (git -C 대상). */
  memoRepoPath: string;
  /** `owner/repo`. 기본 'Mascari4615/memo'. */
  repoSlug: string;
  /** 동기 대상 브랜치. 기본 'main'. */
  branch: string;
}

/**
 * git 호출 추상화 (테스트 주입). 모든 메서드는 cwd=memoRepoPath 에서 도는
 * git 서브커맨드 1회를 수행하고, 실패는 throw (호출부가 상태 전이로 환산).
 * 토큰은 fetch URL 안에만 들어가고 어디에도 인쇄하지 않는다.
 */
export interface GitRunner {
  /** `git fetch <authUrl> <branch>` — 실패 throw. */
  fetch(cfg: MemoSyncConfig): Promise<void>;
  /** `git rev-parse HEAD` → 현 로컬 커밋 SHA. */
  headSha(cfg: MemoSyncConfig): Promise<string>;
  /** `git rev-parse FETCH_HEAD` → 직전 fetch 가 가리킨 SHA. */
  fetchHeadSha(cfg: MemoSyncConfig): Promise<string>;
  /** `git reset --hard FETCH_HEAD` — 실패 throw. */
  resetHard(cfg: MemoSyncConfig): Promise<void>;
}

export interface MemoSyncPlan {
  /** 이미 최신(local == FETCH_HEAD) → reset 생략. */
  skip: boolean;
  /** 동기 전 로컬 SHA (로그용, 7자 trim). */
  localSha: string;
  /** fetch 가 가리킨 원격 SHA (로그용, 7자 trim). */
  remoteSha: string;
}

/**
 * 순수 계획: fetch 후 local/FETCH_HEAD SHA 를 비교해 skip 판정.
 * 부수효과는 GitRunner.fetch(IO) 1회뿐 — reset 여부만 *결정*한다.
 * deploy 스텝의 `if ($local -eq $remote) { ...exit 0 }` 와 동일 판정.
 */
export async function planMemoSync(
  cfg: MemoSyncConfig,
  git: GitRunner,
): Promise<MemoSyncPlan> {
  await git.fetch(cfg);
  const local = (await git.headSha(cfg)).trim();
  const remote = (await git.fetchHeadSha(cfg)).trim();
  const short = (s: string): string => (s.length >= 7 ? s.slice(0, 7) : s);
  return {
    skip: local !== '' && local === remote,
    localSha: short(local),
    remoteSha: short(remote),
  };
}

/**
 * 1회 동기: fetch → skip 판정 → 변경 시 reset --hard.
 * 반환 = 사람이 읽는 결과 사유 (성공). 실패는 throw.
 * deploy "Sync prod memo" 스텝의 결정적 시퀀스와 동일.
 */
export async function syncMemoOnce(
  cfg: MemoSyncConfig,
  git: GitRunner,
  logger: Pick<Console, 'log' | 'warn' | 'error'>,
): Promise<string> {
  const plan = await planMemoSync(cfg, git);
  if (plan.skip) {
    logger.log(`[MemoSync] 이미 최신 (${plan.localSha})`);
    return `최신 (${plan.localSha})`;
  }
  await git.resetHard(cfg);
  logger.log(
    `[MemoSync] reset --hard ${plan.localSha} -> ${plan.remoteSha} (prod==origin, 런타임 untracked 보존)`,
  );
  return `동기 ${plan.localSha} -> ${plan.remoteSha}`;
}

export interface MemoSyncAlert {
  /** true = unhealthy→healthy 복구, false = healthy→unhealthy 장애. */
  healthy: boolean;
  reason: string;
}

interface TickResult {
  healthy: boolean;
}

/**
 * 1 tick: 동기 시도 → 성공/실패를 *상태 전이* 로 환산해 alert.
 * prevHealthy=null(첫 tick) 은 실패일 때만 alert (첫 성공=무음).
 * heartbeat.runHeartbeatTick 동형.
 */
export async function runMemoSyncTick(
  cfg: MemoSyncConfig,
  prevHealthy: boolean | null,
  deps: {
    git: GitRunner;
    alert?: (event: MemoSyncAlert) => void;
    logger: Pick<Console, 'log' | 'warn' | 'error'>;
  },
): Promise<TickResult> {
  const { git, alert, logger } = deps;
  let healthy: boolean;
  let reason: string;
  try {
    reason = await syncMemoOnce(cfg, git, logger);
    healthy = true;
  } catch (e: unknown) {
    healthy = false;
    reason = `memo 동기 실패: ${e instanceof Error ? e.message : String(e)}`;
  }

  if (!healthy) {
    logger.warn(`[MemoSync] ${reason}`);
  }

  if (prevHealthy !== healthy) {
    if (prevHealthy === null && healthy) {
      // 첫 tick 정상 → alert 없음
    } else if (healthy) {
      alert?.({ healthy: true, reason: `memo 동기 복구 — ${reason}` });
    } else {
      alert?.({ healthy: false, reason });
    }
  }
  return { healthy };
}

/**
 * 인증 URL 조립 — 토큰은 URL 안에만, 로그/에러 어디에도 인쇄 X.
 * deploy 스텝과 동일: `https://x-access-token:<PAT>@github.com/<slug>.git`.
 */
function authUrl(cfg: MemoSyncConfig): string {
  return `https://x-access-token:${cfg.token}@github.com/${cfg.repoSlug}.git`;
}

/** 에러 메시지에서 토큰이 새지 않도록 마스킹. */
function maskToken(msg: string, token: string): string {
  if (!token) return msg;
  return msg.split(token).join('***');
}

/**
 * 실 git GitRunner — `child_process.execFile('git', ...)` 기반.
 * cwd=memoRepoPath, GIT_TERMINAL_PROMPT=0 (자격증명 프롬프트로 hang 절대 X,
 * 실패=즉시 throw — deploy 스텝과 동일 안전). agent-cadence 의 execSync
 * git 패턴과 동형이되 비차단 위해 execFile(async).
 */
export function createGitRunner(): GitRunner {
  const run = (
    cfg: MemoSyncConfig,
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
    async fetch(cfg) {
      await run(cfg, ['fetch', authUrl(cfg), cfg.branch], DEFAULT_TIMEOUT_MS);
    },
    headSha(cfg) {
      return run(cfg, ['rev-parse', 'HEAD'], 15_000);
    },
    fetchHeadSha(cfg) {
      return run(cfg, ['rev-parse', 'FETCH_HEAD'], 15_000);
    },
    async resetHard(cfg) {
      await run(cfg, ['reset', '--hard', 'FETCH_HEAD'], DEFAULT_TIMEOUT_MS);
    },
  };
}

export interface MemoSyncDeps {
  /** memo private fetch 토큰. 미설정 시 비활성. */
  token: string | undefined;
  /** 로컬 memo 클론 루트. 미설정 시 비활성. */
  memoRepoPath: string | undefined;
  /** `owner/repo`. 기본 'Mascari4615/memo'. */
  repoSlug?: string;
  /** 동기 대상 브랜치. 기본 'main'. */
  branch?: string;
  /** 동기 간격(분). 기본 10, 최소 1. */
  intervalMin?: number;
  /** git runner (테스트 주입). 기본 createGitRunner(). */
  git?: GitRunner;
  /** 상태 전이 시 호출되는 알림. */
  alert?: (event: MemoSyncAlert) => void;
  /** 로그 sink (테스트 주입). 기본 console. */
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
}

export interface MemoSyncHandle {
  /** 즉시 1회 tick (테스트·수동 트리거용). */
  tickNow: () => Promise<void>;
  /**
   * 이벤트 전 freshness 보장 — "마지막 sync 후 maxAgeMs 경과면 1회 sync".
   * 기존 tick 비차단(실패=계속, best-effort). agent-cadence 의 worker
   * cadence tick *직전* 호출(pre-tick staleness 가드 — 워커가 항상 fresh
   * memo 로 픽). 동시 실행 안 겹치게 in-flight 1개로 직렬화.
   */
  ensureFresh: (maxAgeMs: number) => Promise<void>;
  /** interval 해제. */
  stop: () => void;
}

let activeStop: (() => void) | null = null;

/**
 * memo 자동 동기 시작. token/memoRepoPath 미설정 시 경고 후 no-op
 * (heartbeat/charstate 와 동일 graceful 정책 — 동기 미설정으로 봇이
 * 깨지면 안 됨). 즉시 1회 후 interval 등록. 반환 handle 로 ensureFresh·stop.
 */
export function startMemoSync(deps: MemoSyncDeps): MemoSyncHandle | null {
  stopMemoSync();

  const token = deps.token?.trim();
  const memoRepoPath = deps.memoRepoPath?.trim();
  const logger = deps.logger ?? console;
  if (!token) {
    logger.warn('[MemoSync] MEMO_GITHUB_PAT 미설정 — memo 자동 동기 비활성');
    return null;
  }
  if (!memoRepoPath) {
    logger.warn('[MemoSync] MEMO_REPO_PATH 미설정 — memo 자동 동기 비활성');
    return null;
  }

  const cfg: MemoSyncConfig = {
    token,
    memoRepoPath,
    repoSlug: deps.repoSlug?.trim() || DEFAULT_REPO_SLUG,
    branch: deps.branch?.trim() || DEFAULT_BRANCH,
  };
  const git = deps.git ?? createGitRunner();
  const intervalMin = Math.max(
    MIN_INTERVAL_MIN,
    Number.isFinite(deps.intervalMin) && deps.intervalMin !== undefined
      ? Math.floor(deps.intervalMin)
      : DEFAULT_INTERVAL_MIN,
  );
  const intervalMs = intervalMin * 60 * 1000;

  let prevHealthy: boolean | null = null;
  let lastSyncAt = 0;
  // in-flight 직렬화: interval tick 과 ensureFresh(pre-tick) 가 동시에
  // git reset 을 돌리지 않도록 — 같은 promise 를 재사용.
  let inFlight: Promise<void> | null = null;

  const doTick = async (): Promise<void> => {
    const r = await runMemoSyncTick(cfg, prevHealthy, {
      git,
      alert: deps.alert,
      logger,
    });
    prevHealthy = r.healthy;
    lastSyncAt = Date.now();
  };

  const tickNow = async (): Promise<void> => {
    if (inFlight) {
      // 이미 진행 중인 sync 에 합류 (중복 reset 방지).
      await inFlight.catch(() => {});
      return;
    }
    inFlight = doTick().finally(() => {
      inFlight = null;
    });
    await inFlight.catch(() => {});
  };

  const ensureFresh = async (maxAgeMs: number): Promise<void> => {
    // 마지막 성공 sync 가 충분히 최근이면 skip (이벤트 전 노이즈 0).
    if (lastSyncAt !== 0 && Date.now() - lastSyncAt < maxAgeMs) return;
    // best-effort — 실패해도 호출부(worker tick) 비차단.
    await tickNow();
  };

  logger.log(
    `[MemoSync] memo 자동 동기 활성 (간격: ${intervalMin}분, ${cfg.repoSlug}@${cfg.branch}, ${cfg.memoRepoPath})`,
  );
  void tickNow();
  const timer = setInterval(() => void tickNow(), intervalMs);

  const stop = (): void => {
    clearInterval(timer);
    if (activeStop === stop) activeStop = null;
    if (activeHandle && activeHandle.stop === stop) activeHandle = null;
  };
  const handle: MemoSyncHandle = { tickNow, ensureFresh, stop };
  activeStop = stop;
  activeHandle = handle;
  return handle;
}

/**
 * 활성 핸들 — agent-cadence 의 pre-tick freshness hook 이 import 사이클
 * 없이 도달하기 위한 모듈 레벨 접근자(heartbeat 의 activeStop 패턴 확장).
 * 미설정/비활성 = null → 호출부 graceful no-op.
 */
let activeHandle: MemoSyncHandle | null = null;

/** 활성 memo-sync 핸들 (없으면 null). pre-tick freshness hook 용. */
export function getActiveMemoSyncHandle(): MemoSyncHandle | null {
  return activeHandle;
}

/** 활성 memo-sync interval 해제 (graceful shutdown). */
export function stopMemoSync(): void {
  if (activeStop) activeStop();
}
