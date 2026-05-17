/**
 * heartbeat 순수부 + 스케줄링 회귀 (TASK-YB-021 — 자체 구현 피벗).
 * sender = memo orphan 브랜치 Contents API (GET sha → PUT 시각).
 * 핵심 잠금:
 *  ① GET 200 → 그 sha 로 PUT (기존 파일 갱신) / GET 404 → sha 없이 PUT (생성)
 *  ② PUT body = base64(JSON{ts,source,schema}) + branch, 시각 = 주입 clock
 *  ③ GET non-2xx(404 외) / PUT 실패 → tick unhealthy
 *  ④ 첫 tick 성공=무음 / 첫 실패=alert / 전이에서만 alert (연속 무음)
 *  ⑤ token 미설정 = no-op (interval 등록 X)
 *  ⑥ startHeartbeat = 즉시 1회 + interval 간격 tick
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  writeHeartbeatOnce,
  runHeartbeatTick,
  startHeartbeat,
  stopHeartbeat,
  type HeartbeatConfig,
} from './heartbeat';

const CFG: HeartbeatConfig = {
  token: 'tok_x',
  repo: 'mascari4615/memo',
  branch: 'yawnbot-heartbeat',
  path: '.heartbeat/yawnbot.json',
};
const FIXED = new Date('2026-05-17T10:00:00.000Z');
const fixedNow = () => FIXED;
const silentLogger = { log: () => {}, warn: () => {}, error: () => {} };

function res(status: number, json?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => json ?? {},
  } as Response;
}

describe('writeHeartbeatOnce — Contents API GET sha → PUT', () => {
  it('기존 파일(GET 200) → 그 sha 로 PUT, body=base64 JSON+branch', async () => {
    const calls: Array<{ url: string; opts: any }> = [];
    const fetchImpl = vi.fn(async (url: string, opts: any) => {
      calls.push({ url, opts });
      if (opts.method === 'GET') return res(200, { sha: 'oldsha123' });
      return res(200, { commit: { sha: 'newsha' } });
    });
    const ts = await writeHeartbeatOnce(CFG, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: fixedNow,
      timeoutMs: 1000,
    });
    expect(ts).toBe('2026-05-17T10:00:00.000Z');
    // GET 은 branch ref 지정
    expect(calls[0].url).toContain('contents/.heartbeat/yawnbot.json');
    expect(calls[0].url).toContain('ref=yawnbot-heartbeat');
    expect(calls[0].opts.headers.Authorization).toBe('Bearer tok_x');
    // PUT body 검증
    const putBody = JSON.parse(calls[1].opts.body);
    expect(putBody.branch).toBe('yawnbot-heartbeat');
    expect(putBody.sha).toBe('oldsha123');
    const decoded = JSON.parse(Buffer.from(putBody.content, 'base64').toString('utf-8'));
    expect(decoded).toEqual({ ts: '2026-05-17T10:00:00.000Z', source: 'yawnbot', schema: 1 });
  });

  it('파일 없음(GET 404) → sha 없이 PUT (생성)', async () => {
    const calls: any[] = [];
    const fetchImpl = vi.fn(async (_url: string, opts: any) => {
      calls.push(opts);
      if (opts.method === 'GET') return res(404);
      return res(201);
    });
    await writeHeartbeatOnce(CFG, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: fixedNow,
      timeoutMs: 1000,
    });
    const putBody = JSON.parse(calls[1].body);
    expect(putBody.sha).toBeUndefined();
  });

  it('GET non-2xx(404 외, 예: 401) → throw', async () => {
    const fetchImpl = vi.fn(async () => res(401));
    await expect(
      writeHeartbeatOnce(CFG, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        now: fixedNow,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow(/401/);
  });

  it('PUT 실패(409 sha 충돌 등) → throw', async () => {
    const fetchImpl = vi.fn(async (_u: string, opts: any) =>
      opts.method === 'GET' ? res(200, { sha: 's' }) : res(409),
    );
    await expect(
      writeHeartbeatOnce(CFG, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        now: fixedNow,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow(/409/);
  });
});

describe('runHeartbeatTick — 상태 전이 alert', () => {
  const okFetch = () =>
    vi.fn(async (_u: string, opts: any) =>
      opts.method === 'GET' ? res(200, { sha: 's' }) : res(200),
    ) as unknown as typeof fetch;
  const failFetch = () => vi.fn(async () => res(500)) as unknown as typeof fetch;

  it('첫 tick 성공(prev=null) → healthy, alert 없음', async () => {
    const alert = vi.fn();
    const h = await runHeartbeatTick(CFG, null, {
      fetchImpl: okFetch(),
      now: fixedNow,
      alert,
      logger: silentLogger,
      timeoutMs: 1000,
    });
    expect(h).toBe(true);
    expect(alert).not.toHaveBeenCalled();
  });

  it('첫 tick 실패(prev=null) → unhealthy, 장애 alert 1회', async () => {
    const alert = vi.fn();
    const h = await runHeartbeatTick(CFG, null, {
      fetchImpl: failFetch(),
      now: fixedNow,
      alert,
      logger: silentLogger,
      timeoutMs: 1000,
    });
    expect(h).toBe(false);
    expect(alert).toHaveBeenCalledWith({ healthy: false, reason: expect.stringContaining('실패') });
  });

  it('healthy→healthy 연속 = 무음', async () => {
    const alert = vi.fn();
    await runHeartbeatTick(CFG, true, {
      fetchImpl: okFetch(),
      now: fixedNow,
      alert,
      logger: silentLogger,
      timeoutMs: 1000,
    });
    expect(alert).not.toHaveBeenCalled();
  });

  it('healthy→unhealthy = 장애 alert', async () => {
    const alert = vi.fn();
    const h = await runHeartbeatTick(CFG, true, {
      fetchImpl: failFetch(),
      now: fixedNow,
      alert,
      logger: silentLogger,
      timeoutMs: 1000,
    });
    expect(h).toBe(false);
    expect(alert).toHaveBeenCalledWith({ healthy: false, reason: expect.any(String) });
  });

  it('unhealthy→healthy = 복구 alert', async () => {
    const alert = vi.fn();
    const h = await runHeartbeatTick(CFG, false, {
      fetchImpl: okFetch(),
      now: fixedNow,
      alert,
      logger: silentLogger,
      timeoutMs: 1000,
    });
    expect(h).toBe(true);
    expect(alert).toHaveBeenCalledWith({ healthy: true, reason: expect.stringContaining('복구') });
  });

  it('unhealthy→unhealthy 연속 = 무음', async () => {
    const alert = vi.fn();
    await runHeartbeatTick(CFG, false, {
      fetchImpl: failFetch(),
      now: fixedNow,
      alert,
      logger: silentLogger,
      timeoutMs: 1000,
    });
    expect(alert).not.toHaveBeenCalled();
  });
});

describe('startHeartbeat — 스케줄링', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    stopHeartbeat();
    vi.useRealTimers();
  });

  it('token 미설정 → null + interval 등록 X', () => {
    const fetchImpl = vi.fn();
    const handle = startHeartbeat({
      token: undefined,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: silentLogger,
    });
    expect(handle).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('token 공백만 → null', () => {
    expect(startHeartbeat({ token: '  ', logger: silentLogger })).toBeNull();
  });

  it('즉시 1회 + interval 간격마다 tick (GET+PUT = 2 fetch/tick)', async () => {
    const fetchImpl = vi.fn(async (_u: string, opts: any) =>
      opts.method === 'GET' ? res(200, { sha: 's' }) : res(200),
    );
    const handle = startHeartbeat({
      token: 'tok_x',
      intervalMin: 5,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: silentLogger,
    });
    expect(handle).not.toBeNull();
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2)); // 즉시 tick = GET+PUT
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('intervalMin 0 → 최소 1분 clamp', async () => {
    const fetchImpl = vi.fn(async (_u: string, opts: any) =>
      opts.method === 'GET' ? res(200, { sha: 's' }) : res(200),
    );
    startHeartbeat({
      token: 'tok_x',
      intervalMin: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: silentLogger,
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('stopHeartbeat → 이후 tick 중단', async () => {
    const fetchImpl = vi.fn(async (_u: string, opts: any) =>
      opts.method === 'GET' ? res(200, { sha: 's' }) : res(200),
    );
    startHeartbeat({
      token: 'tok_x',
      intervalMin: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: silentLogger,
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    stopHeartbeat();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
