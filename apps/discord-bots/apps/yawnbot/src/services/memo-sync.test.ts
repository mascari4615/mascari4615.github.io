/**
 * memo-sync 순수부 + 스케줄링/freshness 회귀 (TASK-KAR-MEMOSYNC part4).
 * heartbeat.test 패턴 미러. 핵심 잠금:
 *  ① planMemoSync: fetch → local==FETCH_HEAD 면 skip / 다르면 proceed
 *  ② syncMemoOnce: skip 이면 reset 호출 X / 변경이면 reset --hard 호출
 *  ③ runMemoSyncTick 상태 전이 alert (첫 성공 무음/첫 실패 alert/전이만)
 *  ④ startMemoSync: token/memoRepoPath 미설정 = null + interval 등록 X
 *  ⑤ startMemoSync: 즉시 1회 + interval 간격 tick + stop 후 중단
 *  ⑥ ensureFresh: 최근 sync 면 skip / 오래됐으면 1회 sync (best-effort)
 *  ⑦ in-flight 직렬화: 동시 tickNow/ensureFresh = reset 중복 호출 0
 *  ⑧ getActiveMemoSyncHandle: 활성 핸들 노출 / stop 후 null
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  planMemoSync,
  syncMemoOnce,
  runMemoSyncTick,
  startMemoSync,
  stopMemoSync,
  getActiveMemoSyncHandle,
  type MemoSyncConfig,
  type GitRunner,
} from './memo-sync';

const CFG: MemoSyncConfig = {
  token: 'tok_x',
  memoRepoPath: '/tmp/memo',
  repoSlug: 'Mascari4615/memo',
  branch: 'main',
};
const silentLogger = { log: () => {}, warn: () => {}, error: () => {} };

/** 결정적 fake git — SHA 시퀀스·실패 주입. */
function fakeGit(opts: {
  head: string;
  fetchHead: string;
  fetchErr?: Error;
  resetErr?: Error;
  spy?: { fetch?: () => void; reset?: () => void };
}): GitRunner {
  return {
    async fetch() {
      opts.spy?.fetch?.();
      if (opts.fetchErr) throw opts.fetchErr;
    },
    async headSha() {
      return opts.head;
    },
    async fetchHeadSha() {
      return opts.fetchHead;
    },
    async resetHard() {
      opts.spy?.reset?.();
      if (opts.resetErr) throw opts.resetErr;
    },
  };
}

describe('planMemoSync — fetch → skip 판정', () => {
  it('local == FETCH_HEAD → skip true (이미 최신)', async () => {
    const git = fakeGit({ head: 'abc1234567', fetchHead: 'abc1234567' });
    const plan = await planMemoSync(CFG, git);
    expect(plan.skip).toBe(true);
    expect(plan.localSha).toBe('abc1234');
    expect(plan.remoteSha).toBe('abc1234');
  });

  it('local != FETCH_HEAD → skip false (동기 필요)', async () => {
    const git = fakeGit({ head: 'aaaaaaa0000', fetchHead: 'bbbbbbb1111' });
    const plan = await planMemoSync(CFG, git);
    expect(plan.skip).toBe(false);
    expect(plan.localSha).toBe('aaaaaaa');
    expect(plan.remoteSha).toBe('bbbbbbb');
  });

  it('fetch 실패 → throw (호출부가 상태 전이로 환산)', async () => {
    const git = fakeGit({
      head: 'x',
      fetchHead: 'y',
      fetchErr: new Error('인증 실패'),
    });
    await expect(planMemoSync(CFG, git)).rejects.toThrow(/인증 실패/);
  });

  it('빈 local SHA → skip false (방어: empty == empty 가 skip 으로 새지 않음)', async () => {
    const git = fakeGit({ head: '', fetchHead: '' });
    const plan = await planMemoSync(CFG, git);
    expect(plan.skip).toBe(false);
  });
});

describe('syncMemoOnce — skip 이면 reset X / 변경이면 reset --hard', () => {
  it('skip → resetHard 호출 0', async () => {
    let resetCalls = 0;
    const git = fakeGit({
      head: 'same123456',
      fetchHead: 'same123456',
      spy: { reset: () => resetCalls++ },
    });
    const reason = await syncMemoOnce(CFG, git, silentLogger);
    expect(resetCalls).toBe(0);
    expect(reason).toContain('최신');
  });

  it('변경 → resetHard 1회', async () => {
    let resetCalls = 0;
    let fetchCalls = 0;
    const git = fakeGit({
      head: 'old1111111',
      fetchHead: 'new2222222',
      spy: { reset: () => resetCalls++, fetch: () => fetchCalls++ },
    });
    const reason = await syncMemoOnce(CFG, git, silentLogger);
    expect(fetchCalls).toBe(1);
    expect(resetCalls).toBe(1);
    expect(reason).toContain('old1111');
    expect(reason).toContain('new2222');
  });

  it('reset 실패 → throw', async () => {
    const git = fakeGit({
      head: 'old1111111',
      fetchHead: 'new2222222',
      resetErr: new Error('인덱스 잠금'),
    });
    await expect(syncMemoOnce(CFG, git, silentLogger)).rejects.toThrow(
      /인덱스 잠금/,
    );
  });
});

describe('runMemoSyncTick — 상태 전이 alert', () => {
  const ok = () => fakeGit({ head: 'a000000', fetchHead: 'b111111' });
  const fail = () =>
    fakeGit({ head: 'x', fetchHead: 'y', fetchErr: new Error('네트워크') });

  it('첫 tick 성공(prev=null) → healthy, alert 없음', async () => {
    const alert = vi.fn();
    const r = await runMemoSyncTick(CFG, null, {
      git: ok(),
      alert,
      logger: silentLogger,
    });
    expect(r.healthy).toBe(true);
    expect(alert).not.toHaveBeenCalled();
  });

  it('첫 tick 실패(prev=null) → unhealthy, 장애 alert 1회', async () => {
    const alert = vi.fn();
    const r = await runMemoSyncTick(CFG, null, {
      git: fail(),
      alert,
      logger: silentLogger,
    });
    expect(r.healthy).toBe(false);
    expect(alert).toHaveBeenCalledWith({
      healthy: false,
      reason: expect.stringContaining('실패'),
    });
  });

  it('healthy→healthy 연속 = 무음', async () => {
    const alert = vi.fn();
    await runMemoSyncTick(CFG, true, { git: ok(), alert, logger: silentLogger });
    expect(alert).not.toHaveBeenCalled();
  });

  it('healthy→unhealthy = 장애 alert', async () => {
    const alert = vi.fn();
    const r = await runMemoSyncTick(CFG, true, {
      git: fail(),
      alert,
      logger: silentLogger,
    });
    expect(r.healthy).toBe(false);
    expect(alert).toHaveBeenCalledWith({
      healthy: false,
      reason: expect.any(String),
    });
  });

  it('unhealthy→healthy = 복구 alert', async () => {
    const alert = vi.fn();
    const r = await runMemoSyncTick(CFG, false, {
      git: ok(),
      alert,
      logger: silentLogger,
    });
    expect(r.healthy).toBe(true);
    expect(alert).toHaveBeenCalledWith({
      healthy: true,
      reason: expect.stringContaining('복구'),
    });
  });

  it('unhealthy→unhealthy 연속 = 무음', async () => {
    const alert = vi.fn();
    await runMemoSyncTick(CFG, false, {
      git: fail(),
      alert,
      logger: silentLogger,
    });
    expect(alert).not.toHaveBeenCalled();
  });
});

describe('startMemoSync — 스케줄링 + ensureFresh', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    stopMemoSync();
    vi.useRealTimers();
  });

  it('token 미설정 → null + 핸들 등록 X', () => {
    const handle = startMemoSync({
      token: undefined,
      memoRepoPath: '/tmp/memo',
      logger: silentLogger,
    });
    expect(handle).toBeNull();
    expect(getActiveMemoSyncHandle()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('memoRepoPath 미설정 → null', () => {
    expect(
      startMemoSync({
        token: 'tok',
        memoRepoPath: '  ',
        logger: silentLogger,
      }),
    ).toBeNull();
  });

  it('즉시 1회 + interval 간격마다 sync (fetch 호출 카운트)', async () => {
    let fetchCalls = 0;
    const git = fakeGit({
      head: 'a000000',
      fetchHead: 'a000000',
      spy: { fetch: () => fetchCalls++ },
    });
    const handle = startMemoSync({
      token: 'tok',
      memoRepoPath: '/tmp/memo',
      intervalMin: 10,
      git,
      logger: silentLogger,
    });
    expect(handle).not.toBeNull();
    await vi.waitFor(() => expect(fetchCalls).toBe(1)); // 즉시 tick
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(fetchCalls).toBe(2);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(fetchCalls).toBe(3);
  });

  it('intervalMin 0 → 최소 1분 clamp', async () => {
    let fetchCalls = 0;
    const git = fakeGit({
      head: 'a',
      fetchHead: 'a',
      spy: { fetch: () => fetchCalls++ },
    });
    startMemoSync({
      token: 'tok',
      memoRepoPath: '/tmp/memo',
      intervalMin: 0,
      git,
      logger: silentLogger,
    });
    await vi.waitFor(() => expect(fetchCalls).toBe(1));
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(fetchCalls).toBe(2);
  });

  it('stopMemoSync → 이후 tick 중단 + 핸들 null', async () => {
    let fetchCalls = 0;
    const git = fakeGit({
      head: 'a',
      fetchHead: 'a',
      spy: { fetch: () => fetchCalls++ },
    });
    startMemoSync({
      token: 'tok',
      memoRepoPath: '/tmp/memo',
      intervalMin: 1,
      git,
      logger: silentLogger,
    });
    await vi.waitFor(() => expect(fetchCalls).toBe(1));
    stopMemoSync();
    expect(getActiveMemoSyncHandle()).toBeNull();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(fetchCalls).toBe(1);
  });

  it('ensureFresh: 최근 sync 면 skip / 오래되면 1회 추가 sync', async () => {
    let fetchCalls = 0;
    const git = fakeGit({
      head: 'a',
      fetchHead: 'a',
      spy: { fetch: () => fetchCalls++ },
    });
    const handle = startMemoSync({
      token: 'tok',
      memoRepoPath: '/tmp/memo',
      intervalMin: 60, // 긴 interval — ensureFresh 단독 검증
      git,
      logger: silentLogger,
    })!;
    await vi.waitFor(() => expect(fetchCalls).toBe(1)); // 즉시 tick → lastSync 갱신
    // 막 sync 했으니 maxAge=5분이면 skip
    await handle.ensureFresh(5 * 60 * 1000);
    expect(fetchCalls).toBe(1);
    // 6분 경과 → maxAge=5분 초과 → 1회 추가 sync
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    await handle.ensureFresh(5 * 60 * 1000);
    expect(fetchCalls).toBe(2);
  });

  it('동시 tickNow + ensureFresh = reset 중복 0 (in-flight 직렬화)', async () => {
    let resetCalls = 0;
    let releaseFetch: () => void = () => {};
    const git: GitRunner = {
      fetch: () =>
        new Promise<void>((resolve) => {
          releaseFetch = resolve;
        }),
      headSha: async () => 'old1111',
      fetchHeadSha: async () => 'new2222',
      resetHard: async () => {
        resetCalls++;
      },
    };
    const handle = startMemoSync({
      token: 'tok',
      memoRepoPath: '/tmp/memo',
      intervalMin: 60,
      git,
      logger: silentLogger,
    })!;
    // 즉시 tick 이 fetch 에서 블록 중. 그 사이 ensureFresh 동시 호출.
    const p1 = handle.ensureFresh(0); // maxAge 0 = 무조건 sync 시도
    const p2 = handle.tickNow();
    releaseFetch(); // fetch 해제 → 진행
    await Promise.all([p1, p2]);
    // 셋(즉시 tick + ensureFresh + tickNow) 이 같은 in-flight 공유 → reset 1회
    expect(resetCalls).toBe(1);
  });
});
