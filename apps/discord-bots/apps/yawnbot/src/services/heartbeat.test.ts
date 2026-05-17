/**
 * heartbeat 순수부 + 스케줄링 회귀 (TASK-YB-021).
 * 핵심 잠금:
 *  ① 첫 tick 성공 = 무음 / 첫 tick 실패 = alert
 *  ② healthy→unhealthy / unhealthy→healthy *전이에서만* alert (연속 무음)
 *  ③ non-2xx 도 실패 / timeout(abort) 도 실패
 *  ④ HEALTHCHECKS_PING_URL 미설정 = no-op (interval 등록 X)
 *  ⑤ startHeartbeat = 즉시 1회 + interval 간격 tick
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runHeartbeatTick, startHeartbeat, stopHeartbeat } from './heartbeat';

const silentLogger = { log: () => {}, warn: () => {}, error: () => {} };

function okRes(status = 200) {
  return { ok: status >= 200 && status < 300, status } as Response;
}

describe('runHeartbeatTick — 상태 전이 alert', () => {
  it('첫 tick 성공(prev=null) → healthy 반환, alert 없음', async () => {
    const alert = vi.fn();
    const healthy = await runHeartbeatTick('http://hc', null, {
      fetchImpl: vi.fn().mockResolvedValue(okRes(200)) as unknown as typeof fetch,
      alert,
      logger: silentLogger,
      timeoutMs: 1000,
    });
    expect(healthy).toBe(true);
    expect(alert).not.toHaveBeenCalled();
  });

  it('첫 tick 실패(prev=null) → unhealthy, 장애 alert 1회', async () => {
    const alert = vi.fn();
    const healthy = await runHeartbeatTick('http://hc', null, {
      fetchImpl: vi.fn().mockRejectedValue(new Error('ENOTFOUND')) as unknown as typeof fetch,
      alert,
      logger: silentLogger,
      timeoutMs: 1000,
    });
    expect(healthy).toBe(false);
    expect(alert).toHaveBeenCalledWith({ healthy: false, reason: expect.stringContaining('ENOTFOUND') });
  });

  it('healthy→healthy 연속 = 무음 (전이 아님)', async () => {
    const alert = vi.fn();
    const next = await runHeartbeatTick('http://hc', true, {
      fetchImpl: vi.fn().mockResolvedValue(okRes(200)) as unknown as typeof fetch,
      alert,
      logger: silentLogger,
      timeoutMs: 1000,
    });
    expect(next).toBe(true);
    expect(alert).not.toHaveBeenCalled();
  });

  it('healthy→unhealthy = 장애 alert', async () => {
    const alert = vi.fn();
    const next = await runHeartbeatTick('http://hc', true, {
      fetchImpl: vi.fn().mockResolvedValue(okRes(503)) as unknown as typeof fetch,
      alert,
      logger: silentLogger,
      timeoutMs: 1000,
    });
    expect(next).toBe(false);
    expect(alert).toHaveBeenCalledWith({ healthy: false, reason: expect.stringContaining('503') });
  });

  it('unhealthy→healthy = 복구 alert', async () => {
    const alert = vi.fn();
    const next = await runHeartbeatTick('http://hc', false, {
      fetchImpl: vi.fn().mockResolvedValue(okRes(200)) as unknown as typeof fetch,
      alert,
      logger: silentLogger,
      timeoutMs: 1000,
    });
    expect(next).toBe(true);
    expect(alert).toHaveBeenCalledWith({ healthy: true, reason: expect.stringContaining('복구') });
  });

  it('unhealthy→unhealthy 연속 = 무음', async () => {
    const alert = vi.fn();
    const next = await runHeartbeatTick('http://hc', false, {
      fetchImpl: vi.fn().mockRejectedValue(new Error('timeout')) as unknown as typeof fetch,
      alert,
      logger: silentLogger,
      timeoutMs: 1000,
    });
    expect(next).toBe(false);
    expect(alert).not.toHaveBeenCalled();
  });
});

describe('startHeartbeat — 스케줄링', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    stopHeartbeat();
    vi.useRealTimers();
  });

  it('URL 미설정 → null 반환 + interval 등록 X', () => {
    const fetchImpl = vi.fn();
    const handle = startHeartbeat({
      url: undefined,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: silentLogger,
    });
    expect(handle).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('URL 공백만 → null (trim 후 빈값)', () => {
    const handle = startHeartbeat({ url: '   ', logger: silentLogger });
    expect(handle).toBeNull();
  });

  it('즉시 1회 ping + interval 간격마다 추가 ping', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okRes(200));
    const handle = startHeartbeat({
      url: 'http://hc/uuid',
      intervalMin: 5,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: silentLogger,
    });
    expect(handle).not.toBeNull();
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1)); // 즉시 tick
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenCalledWith('http://hc/uuid', expect.objectContaining({ method: 'GET' }));
  });

  it('intervalMin 0/음수 → 최소 1분 clamp', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okRes(200));
    startHeartbeat({
      url: 'http://hc',
      intervalMin: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: silentLogger,
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(60 * 1000); // 1분
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('stopHeartbeat → 이후 interval tick 중단', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okRes(200));
    startHeartbeat({
      url: 'http://hc',
      intervalMin: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: silentLogger,
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    stopHeartbeat();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // 추가 호출 없음
  });
});
