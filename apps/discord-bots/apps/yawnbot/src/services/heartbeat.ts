/**
 * yawnbot outbound heartbeat (TASK-YB-021 — 자체 구현, 제3자 의존 0)
 *
 * 봇이 *스스로* N분 간격으로 「나 살아있음 + 시각」을 *노트북 밖* GitHub 에
 * 기록한다. inbound HTTP / cloudflared 터널 의존을 제거한 push 모델:
 * 터널이 죽어도 봇 프로세스가 살아 egress 가능하면 기록이 갱신된다.
 *
 * 「감시 주체 ≠ 감시 대상」 — 기록을 *읽고 신선도를 판정*하는 watcher 는
 * github-hosted runner(노트북 밖) = `yawnbot-health.yml` 의 heartbeat job.
 * 본 모듈은 *sender* (노트북, 봇 안) 만 담당: memo repo 의 orphan 브랜치
 * `yawnbot-heartbeat` 파일을 GitHub Contents API (GET sha → PUT) 로 갱신.
 * 인증 = 기존 `MEMO_GITHUB_PAT` (digest-webhook 이 쓰는 그 토큰·패턴 재사용).
 * 로컬 git 무관 = 다세션 인덱스 race 0, main 히스토리 무관.
 *
 * 추가로, 기록 자체가 막힌 경우(네트워크/DNS/인증 단절로 PUT 실패)는
 * inbound watcher 도 외부 watcher 도 즉시 볼 수 없으므로 — 기록 실패를
 * ops-report 채널로 직접 alert 한다. 단 *상태 전이*(healthy↔unhealthy)
 * 에서만 1회 — 매 tick spam 방지.
 *
 * 환경:
 *  - MEMO_GITHUB_PAT (또는 GITHUB_TOKEN)  — memo repo write 토큰 (미설정 시 비활성)
 *  - YAWNBOT_HEARTBEAT_REPO               — 기본 'mascari4615/memo'
 *  - YAWNBOT_HEARTBEAT_BRANCH             — 기본 'yawnbot-heartbeat'
 *  - YAWNBOT_HEARTBEAT_PATH               — 기본 '.heartbeat/yawnbot.json'
 *  - YAWNBOT_HEARTBEAT_INTERVAL_MIN       — 간격(분, 기본 5, 최소 1)
 *
 * 순수부(writeHeartbeatOnce / runHeartbeatTick)는 fetch/clock 주입으로
 * 단위 테스트 가능 (Discord client·실 네트워크·실 GitHub 무관).
 */

const GITHUB_API = 'https://api.github.com';

export interface HeartbeatConfig {
  token: string;
  repo: string;
  branch: string;
  path: string;
}

export interface HeartbeatDeps {
  /** memo write 토큰. 미설정 시 비활성. */
  token: string | undefined;
  /** `owner/repo`. 기본 'mascari4615/memo'. */
  repo?: string;
  /** orphan 브랜치. 기본 'yawnbot-heartbeat'. */
  branch?: string;
  /** 기록 파일 경로. 기본 '.heartbeat/yawnbot.json'. */
  path?: string;
  /** ping 간격(분). 기본 5, 최소 1. */
  intervalMin?: number;
  /** fetch 구현 (테스트 주입). 기본 global fetch. */
  fetchImpl?: typeof fetch;
  /** 상태 전이 시 호출되는 알림. */
  alert?: (event: HeartbeatAlert) => void;
  /** 로그 sink (테스트 주입). 기본 console. */
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
  /** fetch timeout(ms). 기본 10000. */
  timeoutMs?: number;
  /** 시각 소스 (테스트 주입). 기본 () => new Date(). */
  now?: () => Date;
}

export interface HeartbeatAlert {
  /** true = unhealthy→healthy 복구, false = healthy→unhealthy 장애. */
  healthy: boolean;
  /** 사람이 읽는 사유. */
  reason: string;
}

export interface HeartbeatHandle {
  /** 즉시 1회 tick (테스트·수동 트리거용). */
  tickNow: () => Promise<void>;
  /** interval 해제. */
  stop: () => void;
}

const DEFAULT_REPO = 'mascari4615/memo';
const DEFAULT_BRANCH = 'yawnbot-heartbeat';
const DEFAULT_PATH = '.heartbeat/yawnbot.json';
const DEFAULT_INTERVAL_MIN = 5;
const MIN_INTERVAL_MIN = 1;
const DEFAULT_TIMEOUT_MS = 10_000;

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'yawnbot-heartbeat',
  };
}

/**
 * memo orphan 브랜치 파일을 현재 시각 JSON 으로 1회 갱신.
 * Contents API: GET(현 sha) → PUT(새 내용 + sha + branch).
 * 파일 미존재(404)면 sha 없이 생성. 실패는 throw (호출부가 상태 전이로 환산).
 */
export async function writeHeartbeatOnce(
  cfg: HeartbeatConfig,
  deps: { fetchImpl: typeof fetch; now: () => Date; timeoutMs: number },
): Promise<string> {
  const { fetchImpl, now, timeoutMs } = deps;
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
  } else if (getRes.status !== 404) {
    throw new Error(`heartbeat sha 조회 실패 (HTTP ${getRes.status})`);
  }

  // 2) PUT 으로 시각 기록.
  const ts = now().toISOString();
  const payload = JSON.stringify({ ts, source: 'yawnbot', schema: 1 }, null, 0);
  const contentB64 = Buffer.from(payload, 'utf-8').toString('base64');
  const putRes = await withTimeout((signal) =>
    fetchImpl(base, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        message: `chore(heartbeat): yawnbot alive ${ts}`,
        content: contentB64,
        branch: cfg.branch,
        ...(sha ? { sha } : {}),
      }),
    }),
  );
  if (!putRes.ok) {
    throw new Error(`heartbeat 기록 실패 (HTTP ${putRes.status})`);
  }
  return ts;
}

/**
 * heartbeat 1 tick: 기록 시도 → 성공/실패를 *상태 전이* 로 환산해 alert.
 * prevHealthy=null(첫 tick) 은 실패일 때만 alert (첫 성공은 정상=무음).
 */
export async function runHeartbeatTick(
  cfg: HeartbeatConfig,
  prevHealthy: boolean | null,
  deps: {
    fetchImpl: typeof fetch;
    now: () => Date;
    alert?: (event: HeartbeatAlert) => void;
    logger: Pick<Console, 'log' | 'warn' | 'error'>;
    timeoutMs: number;
  },
): Promise<boolean> {
  const { fetchImpl, now, alert, logger, timeoutMs } = deps;
  let healthy: boolean;
  let reason: string;
  try {
    const ts = await writeHeartbeatOnce(cfg, { fetchImpl, now, timeoutMs });
    healthy = true;
    reason = `heartbeat 기록 OK (${ts})`;
  } catch (e: unknown) {
    healthy = false;
    reason = `heartbeat 기록 실패: ${e instanceof Error ? e.message : String(e)}`;
  }

  if (healthy) {
    logger.log(`[Heartbeat] ${reason}`);
  } else {
    logger.warn(`[Heartbeat] ${reason}`);
  }

  if (prevHealthy !== healthy) {
    if (prevHealthy === null && healthy) {
      // 첫 tick 정상 → alert 없음
    } else if (healthy) {
      alert?.({ healthy: true, reason: `heartbeat 복구 — ${reason}` });
    } else {
      alert?.({ healthy: false, reason });
    }
  }
  return healthy;
}

let activeStop: (() => void) | null = null;

/**
 * heartbeat 시작. token 미설정 시 경고 후 no-op (다른 notifier 와 동일 정책).
 * 즉시 1회 기록 후 interval 등록. 반환 handle 로 수동 tick·stop.
 */
export function startHeartbeat(deps: HeartbeatDeps): HeartbeatHandle | null {
  stopHeartbeat();

  const token = deps.token?.trim();
  const logger = deps.logger ?? console;
  if (!token) {
    logger.warn('[Heartbeat] MEMO_GITHUB_PAT 미설정 — outbound heartbeat 비활성');
    return null;
  }

  const cfg: HeartbeatConfig = {
    token,
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
  const tickNow = async (): Promise<void> => {
    prevHealthy = await runHeartbeatTick(cfg, prevHealthy, {
      fetchImpl,
      now,
      alert: deps.alert,
      logger,
      timeoutMs,
    });
  };

  logger.log(
    `[Heartbeat] outbound heartbeat 활성 (간격: ${intervalMin}분, ${cfg.repo}@${cfg.branch}:${cfg.path})`,
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

/** 활성 heartbeat interval 해제 (graceful shutdown). */
export function stopHeartbeat(): void {
  if (activeStop) activeStop();
}
