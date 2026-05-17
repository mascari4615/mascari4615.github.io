/**
 * yawnbot outbound heartbeat (TASK-YB-021)
 *
 * 봇이 *스스로* N분 간격으로 외부 monitor (Healthchecks.io 등) 에 ping →
 * grace period 내 ping 이 안 오면 Healthchecks 측이 alert. inbound HTTP /
 * cloudflared 터널 의존을 제거한 push 모델: 터널이 죽어도 봇 프로세스가
 * 살아 egress 가능하면 "alive" 가 잡힌다 (inbound watcher yawnbot-health.yml
 * 의 false negative 보완 — 둘 중 하나만 fail 해도 감지되도록 *공존*).
 *
 * 추가로, 봇은 egress 자체가 막힌 경우(네트워크/DNS 단절로 ping 실패)를
 * inbound watcher 는 볼 수 없으므로 — ping 실패를 ops-report 채널로 직접
 * alert 한다. 단 *상태 전이* (healthy→unhealthy / unhealthy→healthy) 에서만
 * 1회 — 매 tick spam 방지.
 *
 * 환경:
 *  - HEALTHCHECKS_PING_URL            — ping 대상 (미설정 시 heartbeat 비활성)
 *  - YAWNBOT_HEARTBEAT_INTERVAL_MIN   — 간격(분, 기본 5, 최소 1)
 *
 * 순수부(runHeartbeatTick)는 fetch/alert/logger 주입으로 단위 테스트 가능
 * (Discord client·실 네트워크 무관).
 */

export interface HeartbeatDeps {
  /** 미설정 시 비활성. process.env.HEALTHCHECKS_PING_URL 기본. */
  url: string | undefined;
  /** ping 간격(분). 기본 5, 최소 1로 clamp. */
  intervalMin?: number;
  /** 1회 ping fetch (테스트 주입). 기본 global fetch. */
  fetchImpl?: typeof fetch;
  /** 상태 전이 시 호출되는 알림. healthy 여부 + 사유. */
  alert?: (event: HeartbeatAlert) => void;
  /** 로그 sink (테스트 주입). 기본 console. */
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
  /** fetch timeout(ms). 기본 10000. */
  timeoutMs?: number;
}

export interface HeartbeatAlert {
  /** true = unhealthy→healthy 복구, false = healthy→unhealthy 장애. */
  healthy: boolean;
  /** 사람이 읽는 사유 (실패 원인 / 복구 메시지). */
  reason: string;
}

export interface HeartbeatHandle {
  /** 즉시 1회 tick (테스트·수동 트리거용). */
  tickNow: () => Promise<void>;
  /** interval 해제. */
  stop: () => void;
}

const DEFAULT_INTERVAL_MIN = 5;
const MIN_INTERVAL_MIN = 1;
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * heartbeat 1 tick: url 로 GET ping. 성공/실패를 *상태 전이* 로 환산해
 * alert 콜백 호출 (연속 실패/연속 성공은 무음 — Healthchecks 측이 grace
 * 누락 alert 담당, 우리 alert 은 전이 1회만).
 *
 * 클로저 상태(lastHealthy)는 호출부가 보유 — 본 함수는 (현재결과, 직전상태)
 * → (새상태, alert?) 의 순수 변환. 테스트는 결과 시퀀스를 그대로 검증.
 */
export async function runHeartbeatTick(
  url: string,
  prevHealthy: boolean | null,
  deps: {
    fetchImpl: typeof fetch;
    alert?: (event: HeartbeatAlert) => void;
    logger: Pick<Console, 'log' | 'warn' | 'error'>;
    timeoutMs: number;
  },
): Promise<boolean> {
  const { fetchImpl, alert, logger, timeoutMs } = deps;
  let healthy: boolean;
  let reason: string;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: 'GET', signal: controller.signal });
    if (res.ok) {
      healthy = true;
      reason = `ping OK (${res.status})`;
    } else {
      healthy = false;
      reason = `ping non-2xx (${res.status})`;
    }
  } catch (e: unknown) {
    healthy = false;
    reason = `ping 실패: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    clearTimeout(timer);
  }

  if (healthy) {
    logger.log(`[Heartbeat] ${reason}`);
  } else {
    logger.warn(`[Heartbeat] ${reason}`);
  }

  // 상태 전이에서만 alert. prevHealthy=null(첫 tick) 은 실패일 때만 alert
  // (첫 tick 성공은 정상 — 무음).
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
 * heartbeat 시작. url 미설정 시 경고 후 no-op (다른 notifier 와 동일 정책).
 * 즉시 1회 ping 후 interval 등록. 반환 handle 로 수동 tick·stop.
 */
export function startHeartbeat(deps: HeartbeatDeps): HeartbeatHandle | null {
  stopHeartbeat();

  const url = deps.url?.trim();
  const logger = deps.logger ?? console;
  if (!url) {
    logger.warn('[Heartbeat] HEALTHCHECKS_PING_URL 미설정 — outbound heartbeat 비활성');
    return null;
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
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
    prevHealthy = await runHeartbeatTick(url, prevHealthy, {
      fetchImpl,
      alert: deps.alert,
      logger,
      timeoutMs,
    });
  };

  logger.log(`[Heartbeat] outbound heartbeat 활성 (간격: ${intervalMin}분)`);
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
