/**
 * yawnbot 캐릭터 런타임 내구 스냅샷 (TASK-KAR-CHARSTATE — heartbeat 패턴 미러)
 *
 * KAR-MEMOSYNC part2 가 캐릭터 런타임 상태(mood/relationship/.active/memory
 * logs 등)를 git untrack → prod memo divergence 동결은 해소됐으나 git 백업·
 * 이력·머신간 복원이 사라졌다. 본 모듈은 그 상태를 *단일-writer 내구
 * 스냅샷*으로 복원한다 — divergence 0 을 유지하며 durable.
 *
 * 설계 = `heartbeat.ts`(`writeHeartbeatOnce`, TASK-YB-021) 동형:
 *  - GitHub Contents API (GET sha → PUT) 로 memo orphan 브랜치 파일 갱신.
 *  - 인증 = 기존 `MEMO_GITHUB_PAT` (heartbeat/digest-webhook 와 동일 토큰).
 *  - **로컬 git 완전 무관** → 다세션 인덱스 race 0, main 히스토리 무관,
 *    merge/divergence 구조적 0 (KAR-MEMOSYNC 동결 근본의 정확한 회피).
 *  - **단일 writer = prod 봇만** → PUT race 0 (divergence 재발 방지 불변식,
 *    TASK 6동기 「멀티」 행: 다중 writer 금지).
 *
 * heartbeat 와 *다른 브랜치* (`yawnbot-character-state`) — 관심사 분리:
 * heartbeat = liveness 시각 / charstate = 캐릭터 상태 스냅샷.
 *
 * 번들 대상 = KAR-MEMOSYNC part2 가 .gitignore 한 캐릭터 런타임 산출:
 * characters/.active.json, 캐릭터별 relationship.json,
 * memory/mood.json, memory/user.md, memory/self.md,
 * memory/.growth-updated, memory/.user-self-updated, 그리고
 * memory 하위 logs·daily·weekly·monthly 의 .md 요약·로그.
 * image-cache(재생성 가능 바이너리 캐시, 캐릭터 상태 아님) +
 * proposal 파이프라인 JSONL 3종(append-only 운영로그) = scope 제외.
 *
 * skip-if-unchanged: 직전 PUT 한 번들 해시를 기억 → 무변경이면 PUT 생략
 * (heartbeat 의 노이즈 억제 정신 — 단, charstate 는 「변경 시에만」 PUT).
 *
 * 순수부(collectBundle / serializeBundle / bundleHash / planSnapshot)는
 * fs/clock 주입으로 단위 테스트 가능 (실 네트워크·실 GitHub 무관).
 *
 * 복원(pull-down)은 본 모듈 scope 밖 — KAR-MEMOSYNC 측정상 모든 소비
 * 서비스가 missing-file self-heal(CharacterService/MemoryService
 * initialize, Mood/Relationship _load 기본값) 하므로 필수 부팅경로 아님.
 * 복원 경로 추가 = 데드 인프라(code-style dead-interface 금지) → TASK 후속.
 *
 * 환경:
 *  - MEMO_GITHUB_PAT (또는 GITHUB_TOKEN)        — memo write 토큰 (미설정 시 비활성)
 *  - MEMO_REPO_PATH                              — 로컬 memo 클론 경로 (미설정 시 비활성)
 *  - YAWNBOT_CHARSTATE_REPO                      — 기본 'mascari4615/memo'
 *  - YAWNBOT_CHARSTATE_BRANCH                    — 기본 'yawnbot-character-state'
 *  - YAWNBOT_CHARSTATE_PATH                      — 기본 '.character-state/bundle.json'
 *  - YAWNBOT_CHARSTATE_INTERVAL_MIN              — 간격(분, 기본 30, 최소 1)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ensureOrphanBranch } from './github-orphan-branch';

const GITHUB_API = 'https://api.github.com';

const DEFAULT_REPO = 'mascari4615/memo';
const DEFAULT_BRANCH = 'yawnbot-character-state';
const DEFAULT_PATH = '.character-state/bundle.json';
const DEFAULT_INTERVAL_MIN = 30;
const MIN_INTERVAL_MIN = 1;
const DEFAULT_TIMEOUT_MS = 20_000;
const BUNDLE_SCHEMA = 1;

/**
 * 캐릭터 런타임 산출 중 스냅샷 대상 (KAR-MEMOSYNC part2 가 .gitignore 한
 * 것과 정합 — image-cache·proposal JSONL 제외). 모두 `characters/` 하위
 * 상대 경로. glob 이 아니라 결정적 walk(heartbeat 처럼 결정성 우선).
 */

/** characters/<slug>/memory 하위에서 번들에 포함할 파일·디렉토리. */
const MEMORY_FILES = ['mood.json', 'user.md', 'self.md', '.growth-updated', '.user-self-updated'];
const MEMORY_SUBDIRS = ['logs', 'daily', 'weekly', 'monthly'];
/** characters/<slug> 직속에서 포함할 파일. */
const CHAR_ROOT_FILES = ['relationship.json'];
/** characters/ 직속에서 포함할 파일. */
const ACTIVE_FILE = '.active.json';

export interface BundleEntry {
  /** memo 레포 기준 POSIX 상대 경로 (예 'characters/yawn/memory/mood.json'). */
  path: string;
  /** 파일 내용 (UTF-8 텍스트). 본 scope 대상은 전부 텍스트. */
  content: string;
}

export interface CharacterStateBundle {
  schema: number;
  /** 스냅샷 시각 (ISO). */
  ts: string;
  source: 'yawnbot';
  /** path 오름차순 정렬된 엔트리 — 직렬화 결정성. */
  entries: BundleEntry[];
}

export interface SnapshotConfig {
  token: string;
  repo: string;
  branch: string;
  path: string;
  /** 로컬 memo 클론 루트 (characters/ 의 부모). */
  memoRepoPath: string;
}

/**
 * memo 클론의 `characters/` 트리를 결정적으로 walk → 스냅샷 대상 파일을
 * path 오름차순으로 수집. 순수부(fs 주입 가능, 네트워크 무관).
 * 누락 파일은 단순 skip (봇이 아직 안 만든 캐릭터 = 정상).
 */
export function collectBundle(
  memoRepoPath: string,
  deps: { fsImpl?: Pick<typeof fs, 'existsSync' | 'readdirSync' | 'readFileSync' | 'statSync'> },
): BundleEntry[] {
  const f = deps.fsImpl ?? fs;
  const charactersDir = path.join(memoRepoPath, 'characters');
  if (!f.existsSync(charactersDir)) return [];

  const entries: BundleEntry[] = [];
  const add = (absPath: string, relPosix: string): void => {
    if (!f.existsSync(absPath)) return;
    let content: string;
    try {
      content = f.readFileSync(absPath, 'utf-8');
    } catch {
      return; // 읽기 실패(권한·경합) = skip, 다음 tick 에서 재시도
    }
    entries.push({ path: relPosix, content });
  };

  // characters/.active.json
  add(path.join(charactersDir, ACTIVE_FILE), `characters/${ACTIVE_FILE}`);

  // characters/<slug>/...
  let slugs: string[];
  try {
    slugs = f
      .readdirSync(charactersDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    slugs = [];
  }

  for (const slug of slugs) {
    const slugDir = path.join(charactersDir, slug);
    for (const file of CHAR_ROOT_FILES) {
      add(path.join(slugDir, file), `characters/${slug}/${file}`);
    }
    const memoryDir = path.join(slugDir, 'memory');
    if (!f.existsSync(memoryDir)) continue;
    for (const file of MEMORY_FILES) {
      add(path.join(memoryDir, file), `characters/${slug}/memory/${file}`);
    }
    for (const sub of MEMORY_SUBDIRS) {
      const subDir = path.join(memoryDir, sub);
      if (!f.existsSync(subDir)) continue;
      let files: string[];
      try {
        files = f
          .readdirSync(subDir, { withFileTypes: true })
          .filter((d) => d.isFile() && d.name.endsWith('.md'))
          .map((d) => d.name)
          .sort();
      } catch {
        files = [];
      }
      for (const name of files) {
        add(path.join(subDir, name), `characters/${slug}/memory/${sub}/${name}`);
      }
    }
  }

  // 결정성: path 오름차순 (walk 순서 의존 제거)
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return entries;
}

/** 번들 → 결정적 JSON 직렬화 (entries 는 collectBundle 이 이미 정렬). */
export function serializeBundle(bundle: CharacterStateBundle): string {
  return JSON.stringify(bundle, null, 0);
}

/**
 * 콘텐츠 해시 — skip-if-unchanged 판정용. ts 는 제외(시각만 바뀌어도
 * 매번 PUT 되는 노이즈 방지). entries 만 해시.
 */
export function bundleHash(entries: BundleEntry[]): string {
  const h = crypto.createHash('sha256');
  for (const e of entries) {
    h.update(e.path);
    h.update('\0');
    h.update(e.content);
    h.update('\0');
  }
  return h.digest('hex');
}

export interface SnapshotPlan {
  /** 변경 없음 → PUT 생략. */
  skip: boolean;
  /** skip=false 일 때의 직렬화된 페이로드. */
  payload?: string;
  /** 이번 번들 해시 (호출부가 prevHash 로 보관). */
  hash: string;
  /** 수집된 엔트리 수 (로그용). */
  entryCount: number;
}

/**
 * 순수 계획: 현 번들 수집 → 해시 → prevHash 와 비교해 skip 판정.
 * IO 0 (fs 주입). PUT 여부·페이로드를 결정만 한다.
 */
export function planSnapshot(
  cfg: { memoRepoPath: string },
  prevHash: string | null,
  deps: {
    fsImpl?: Pick<typeof fs, 'existsSync' | 'readdirSync' | 'readFileSync' | 'statSync'>;
    now: () => Date;
  },
): SnapshotPlan {
  const entries = collectBundle(cfg.memoRepoPath, { fsImpl: deps.fsImpl });
  const hash = bundleHash(entries);
  if (prevHash !== null && prevHash === hash) {
    return { skip: true, hash, entryCount: entries.length };
  }
  const bundle: CharacterStateBundle = {
    schema: BUNDLE_SCHEMA,
    ts: deps.now().toISOString(),
    source: 'yawnbot',
    entries,
  };
  return { skip: false, payload: serializeBundle(bundle), hash, entryCount: entries.length };
}

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'yawnbot-character-state',
  };
}

/**
 * orphan 브랜치 번들 파일을 1회 갱신 (변경 시에만).
 * 1) planSnapshot 으로 skip 판정 (변경 없으면 prevHash 그대로 반환).
 * 2) Contents API GET(현 sha, branch ref) → 404 = 최초 생성.
 * 3) PUT(base64 페이로드 + sha + branch).
 * 반환 = 이번 번들 해시 (호출부가 다음 tick prevHash 로 보관).
 * 실패는 throw (호출부가 상태 전이로 환산).
 */
export async function writeSnapshotOnce(
  cfg: SnapshotConfig,
  prevHash: string | null,
  deps: {
    fetchImpl: typeof fetch;
    now: () => Date;
    timeoutMs: number;
    fsImpl?: Pick<typeof fs, 'existsSync' | 'readdirSync' | 'readFileSync' | 'statSync'>;
    logger?: Pick<Console, 'log' | 'warn' | 'error'>;
  },
): Promise<string> {
  const { fetchImpl, now, timeoutMs } = deps;
  const logger = deps.logger ?? console;

  const plan = planSnapshot(
    { memoRepoPath: cfg.memoRepoPath },
    prevHash,
    { fsImpl: deps.fsImpl, now },
  );
  if (plan.skip) {
    logger.log(`[CharState] 변경 없음 — PUT 생략 (entries=${plan.entryCount})`);
    return plan.hash;
  }

  const base = `${GITHUB_API}/repos/${cfg.repo}/contents/${cfg.path}`;
  const headers = ghHeaders(cfg.token);

  const withTimeout = async (run: (signal: AbortSignal) => Promise<Response>): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await run(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  };

  // 1) 현 sha 조회 (브랜치 지정). 404 = 최초 생성.
  let sha: string | undefined;
  const getRes = await withTimeout((signal) =>
    fetchImpl(`${base}?ref=${encodeURIComponent(cfg.branch)}`, { method: 'GET', headers, signal }),
  );
  if (getRes.ok) {
    const body = (await getRes.json()) as { sha?: string };
    sha = body.sha;
  } else if (getRes.status === 404) {
    // 파일 404 ≠ 브랜치 404. Contents API 는 브랜치를 생성 못 하므로
    // PUT 직전 orphan 브랜치 실재를 보장 (fresh env/브랜치삭제 self-heal).
    await ensureOrphanBranch(
      { token: cfg.token, repo: cfg.repo, branch: cfg.branch },
      {
        fetchImpl,
        timeoutMs,
        logger,
        label: 'CharState',
        message: `chore(charstate): bootstrap orphan branch ${cfg.branch} (empty tree)`,
      },
    );
  } else {
    throw new Error(`charstate sha 조회 실패 (HTTP ${getRes.status})`);
  }

  // 2) PUT 으로 번들 기록.
  const contentB64 = Buffer.from(plan.payload as string, 'utf-8').toString('base64');
  const putRes = await withTimeout((signal) =>
    fetchImpl(base, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        message: `chore(charstate): yawnbot 캐릭터 런타임 스냅샷 (${plan.entryCount} 파일)`,
        content: contentB64,
        branch: cfg.branch,
        ...(sha ? { sha } : {}),
      }),
    }),
  );
  if (!putRes.ok) {
    throw new Error(`charstate 기록 실패 (HTTP ${putRes.status})`);
  }
  logger.log(`[CharState] 스냅샷 기록 OK (entries=${plan.entryCount})`);
  return plan.hash;
}

export interface SnapshotAlert {
  /** true = unhealthy→healthy 복구, false = healthy→unhealthy 장애. */
  healthy: boolean;
  reason: string;
}

interface TickResult {
  healthy: boolean;
  /** 다음 tick 으로 전달할 해시 (성공 시 갱신, 실패 시 이전 값 유지). */
  hash: string | null;
}

/**
 * 1 tick: 스냅샷 시도 → 성공/실패를 *상태 전이* 로 환산해 alert.
 * prevHealthy=null(첫 tick) 은 실패일 때만 alert (첫 성공=무음).
 * heartbeat.runHeartbeatTick 동형 + 해시 carry.
 */
export async function runSnapshotTick(
  cfg: SnapshotConfig,
  prevHealthy: boolean | null,
  prevHash: string | null,
  deps: {
    fetchImpl: typeof fetch;
    now: () => Date;
    alert?: (event: SnapshotAlert) => void;
    logger: Pick<Console, 'log' | 'warn' | 'error'>;
    timeoutMs: number;
    fsImpl?: Pick<typeof fs, 'existsSync' | 'readdirSync' | 'readFileSync' | 'statSync'>;
  },
): Promise<TickResult> {
  const { fetchImpl, now, alert, logger, timeoutMs } = deps;
  let healthy: boolean;
  let reason: string;
  let nextHash: string | null = prevHash;
  try {
    nextHash = await writeSnapshotOnce(cfg, prevHash, {
      fetchImpl,
      now,
      timeoutMs,
      fsImpl: deps.fsImpl,
      logger,
    });
    healthy = true;
    reason = 'charstate 스냅샷 OK';
  } catch (e: unknown) {
    healthy = false;
    reason = `charstate 스냅샷 실패: ${e instanceof Error ? e.message : String(e)}`;
  }

  if (!healthy) {
    logger.warn(`[CharState] ${reason}`);
  }

  if (prevHealthy !== healthy) {
    if (prevHealthy === null && healthy) {
      // 첫 tick 정상 → alert 없음
    } else if (healthy) {
      alert?.({ healthy: true, reason: `charstate 복구 — ${reason}` });
    } else {
      alert?.({ healthy: false, reason });
    }
  }
  return { healthy, hash: nextHash };
}

export interface SnapshotDeps {
  /** memo write 토큰. 미설정 시 비활성. */
  token: string | undefined;
  /** 로컬 memo 클론 루트. 미설정 시 비활성. */
  memoRepoPath: string | undefined;
  /** `owner/repo`. 기본 'mascari4615/memo'. */
  repo?: string;
  /** orphan 브랜치. 기본 'yawnbot-character-state'. */
  branch?: string;
  /** 번들 파일 경로. 기본 '.character-state/bundle.json'. */
  path?: string;
  /** 스냅샷 간격(분). 기본 30, 최소 1. */
  intervalMin?: number;
  /** fetch 구현 (테스트 주입). 기본 global fetch. */
  fetchImpl?: typeof fetch;
  /** fs 구현 (테스트 주입). 기본 global fs. */
  fsImpl?: Pick<typeof fs, 'existsSync' | 'readdirSync' | 'readFileSync' | 'statSync'>;
  /** 상태 전이 시 호출되는 알림. */
  alert?: (event: SnapshotAlert) => void;
  /** 로그 sink (테스트 주입). 기본 console. */
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
  /** fetch timeout(ms). 기본 20000. */
  timeoutMs?: number;
  /** 시각 소스 (테스트 주입). 기본 () => new Date(). */
  now?: () => Date;
}

export interface SnapshotHandle {
  /** 즉시 1회 tick (테스트·수동 트리거용). */
  tickNow: () => Promise<void>;
  /** interval 해제. */
  stop: () => void;
}

let activeStop: (() => void) | null = null;

/**
 * 캐릭터 스냅샷 시작. token/memoRepoPath 미설정 시 경고 후 no-op
 * (heartbeat 와 동일 graceful 정책 — divergence 동결 해소가 본 모듈
 * 미설정으로 깨지면 안 됨). 즉시 1회 후 interval 등록.
 */
export function startCharacterStateSnapshot(deps: SnapshotDeps): SnapshotHandle | null {
  stopCharacterStateSnapshot();

  const token = deps.token?.trim();
  const memoRepoPath = deps.memoRepoPath?.trim();
  const logger = deps.logger ?? console;
  if (!token) {
    logger.warn('[CharState] MEMO_GITHUB_PAT 미설정 — 캐릭터 스냅샷 비활성');
    return null;
  }
  if (!memoRepoPath) {
    logger.warn('[CharState] MEMO_REPO_PATH 미설정 — 캐릭터 스냅샷 비활성');
    return null;
  }

  const cfg: SnapshotConfig = {
    token,
    memoRepoPath,
    repo: deps.repo?.trim() || DEFAULT_REPO,
    branch: deps.branch?.trim() || DEFAULT_BRANCH,
    path: deps.path?.trim() || DEFAULT_PATH,
  };
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMin = Math.max(
    MIN_INTERVAL_MIN,
    Number.isFinite(deps.intervalMin) && deps.intervalMin !== undefined
      ? Math.floor(deps.intervalMin)
      : DEFAULT_INTERVAL_MIN,
  );
  const intervalMs = intervalMin * 60 * 1000;

  let prevHealthy: boolean | null = null;
  let prevHash: string | null = null;
  const tickNow = async (): Promise<void> => {
    const r = await runSnapshotTick(cfg, prevHealthy, prevHash, {
      fetchImpl,
      now,
      alert: deps.alert,
      logger,
      timeoutMs,
      fsImpl: deps.fsImpl,
    });
    prevHealthy = r.healthy;
    prevHash = r.hash;
  };

  logger.log(
    `[CharState] 캐릭터 런타임 스냅샷 활성 (간격: ${intervalMin}분, ${cfg.repo}@${cfg.branch}:${cfg.path})`,
  );
  void tickNow();
  const timer = setInterval(() => void tickNow(), intervalMs);

  const stop = (): void => {
    clearInterval(timer);
    if (activeStop === stop) activeStop = null;
  };
  activeStop = stop;
  return { tickNow, stop };
}

/** 활성 스냅샷 interval 해제 (graceful shutdown). */
export function stopCharacterStateSnapshot(): void {
  if (activeStop) activeStop();
}
