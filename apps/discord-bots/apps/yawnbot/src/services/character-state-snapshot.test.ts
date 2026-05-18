/**
 * 캐릭터 런타임 스냅샷 순수부 + 스케줄링 회귀 (TASK-KAR-CHARSTATE).
 * heartbeat.test 패턴 미러 — 실 네트워크·실 fs·실 GitHub 무관(전부 주입).
 * 핵심 잠금:
 *  ① collectBundle = characters/ 결정적 walk, path 오름차순, 누락 skip
 *  ② bundleHash = entries 만 (ts 제외 → 시각만 바뀌어도 skip)
 *  ③ planSnapshot = prevHash 동일 → skip / 다르면 payload 생성
 *  ④ writeSnapshotOnce = skip 시 PUT 0 / GET 200→그 sha PUT / GET 404→sha 없이 PUT
 *  ⑤ GET non-2xx(404 외) / PUT 실패 → throw
 *  ⑥ runSnapshotTick = 첫 성공 무음 / 첫 실패 alert / 전이에서만 alert + hash carry
 *  ⑦ token/memoRepoPath 미설정 = no-op (interval 등록 X)
 *  ⑧ startCharacterStateSnapshot = 즉시 1회 + interval, 무변경이면 PUT 0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  collectBundle,
  serializeBundle,
  bundleHash,
  planSnapshot,
  writeSnapshotOnce,
  runSnapshotTick,
  startCharacterStateSnapshot,
  stopCharacterStateSnapshot,
  type SnapshotConfig,
  type CharacterStateBundle,
} from './character-state-snapshot';

const CFG: SnapshotConfig = {
  token: 'tok_x',
  repo: 'mascari4615/memo',
  branch: 'yawnbot-character-state',
  path: '.character-state/bundle.json',
  memoRepoPath: '/memo',
};
const FIXED = new Date('2026-05-18T10:00:00.000Z');
const fixedNow = (): Date => FIXED;
const silentLogger = { log: (): void => {}, warn: (): void => {}, error: (): void => {} };

function res(status: number, json?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => json ?? {},
  } as Response;
}

/**
 * 가짜 fs — 절대 경로(또는 POSIX 정규화) → 파일 내용/디렉토리.
 * path.join 이 win32 면 '\\' 를 쓰므로 정규화 후 조회.
 */
type Dirent = { name: string; isDirectory: () => boolean; isFile: () => boolean };
function makeFs(files: Record<string, string>): {
  existsSync: (p: string) => boolean;
  readFileSync: (p: string) => string;
  readdirSync: (p: string, o?: unknown) => Dirent[];
  statSync: (p: string) => unknown;
} {
  const norm = (p: string): string => p.replace(/\\/g, '/');
  const fileSet = new Set(Object.keys(files).map(norm));
  // 디렉토리 집합 = 각 파일 경로의 모든 조상
  const dirSet = new Set<string>();
  for (const fp of fileSet) {
    const parts = fp.split('/');
    for (let i = 1; i < parts.length; i++) {
      dirSet.add(parts.slice(0, i).join('/'));
    }
  }
  return {
    existsSync: (p: string): boolean => {
      const n = norm(p);
      return fileSet.has(n) || dirSet.has(n);
    },
    readFileSync: (p: string): string => {
      const n = norm(p);
      if (!fileSet.has(n)) throw new Error(`ENOENT ${n}`);
      return files[Object.keys(files).find((k) => norm(k) === n) as string];
    },
    readdirSync: (p: string): Dirent[] => {
      const n = norm(p).replace(/\/$/, '');
      const children = new Map<string, boolean>(); // name → isDir
      for (const fp of fileSet) {
        if (fp.startsWith(n + '/')) {
          const rest = fp.slice(n.length + 1);
          const seg = rest.split('/')[0];
          const isDir = rest.includes('/');
          if (!children.has(seg) || isDir) children.set(seg, isDir);
        }
      }
      return [...children.entries()].map(([name, isDir]) => ({
        name,
        isDirectory: () => isDir,
        isFile: () => !isDir,
      }));
    },
    statSync: (): unknown => ({}),
  };
}

const SAMPLE_FILES = {
  '/memo/characters/.active.json': '{"default":"yawn","channels":{}}',
  '/memo/characters/yawn/relationship.json': '{"count":9,"level":2}',
  '/memo/characters/yawn/memory/mood.json': '{"mood":"calm"}',
  '/memo/characters/yawn/memory/user.md': '# mascari4615\n좋아함',
  '/memo/characters/yawn/memory/self.md': '# 욘\n게으름',
  '/memo/characters/yawn/memory/.growth-updated': '2026-05-18',
  '/memo/characters/yawn/memory/logs/2026-05-18.md': '오늘 대화 원본',
  '/memo/characters/yawn/memory/daily/2026-05-17.md': '어제 요약',
  '/memo/characters/alisa/relationship.json': '{"count":3}',
  '/memo/characters/alisa/memory/mood.json': '{"mood":"orderly"}',
  // scope 제외 — 번들에 들어오면 안 됨
  '/memo/characters/yawn/image-cache/abc.png': 'BINARY',
  '/memo/characters/yawn/image-cache/index.json': '{}',
  '/memo/characters/yawn/card.md': '# 정의 (tracked, scope X)',
};

describe('collectBundle — characters/ 결정적 walk', () => {
  it('스냅샷 대상만 path 오름차순 수집, image-cache·card.md 제외', () => {
    const entries = collectBundle('/memo', { fsImpl: makeFs(SAMPLE_FILES) });
    const paths = entries.map((e) => e.path);
    expect(paths).toEqual([
      'characters/.active.json',
      'characters/alisa/memory/mood.json',
      'characters/alisa/relationship.json',
      'characters/yawn/memory/.growth-updated',
      'characters/yawn/memory/daily/2026-05-17.md',
      'characters/yawn/memory/logs/2026-05-18.md',
      'characters/yawn/memory/mood.json',
      'characters/yawn/memory/self.md',
      'characters/yawn/memory/user.md',
      'characters/yawn/relationship.json',
    ]);
    // image-cache·card.md 미포함
    expect(paths.some((p) => p.includes('image-cache'))).toBe(false);
    expect(paths.some((p) => p.endsWith('card.md'))).toBe(false);
    // 내용 보존
    expect(entries.find((e) => e.path === 'characters/yawn/relationship.json')?.content).toBe(
      '{"count":9,"level":2}',
    );
  });

  it('characters/ 부재 → 빈 배열 (graceful)', () => {
    expect(collectBundle('/memo', { fsImpl: makeFs({}) })).toEqual([]);
  });
});

describe('bundleHash / planSnapshot — skip-if-unchanged', () => {
  it('ts 만 달라도 동일 entries → 동일 hash → skip', () => {
    const fsImpl = makeFs(SAMPLE_FILES);
    const a = planSnapshot({ memoRepoPath: '/memo' }, null, { fsImpl, now: () => new Date('2026-05-18T10:00:00Z') });
    expect(a.skip).toBe(false);
    // 같은 hash 를 prev 로 주면 (시각만 다른 now) → skip
    const b = planSnapshot({ memoRepoPath: '/memo' }, a.hash, { fsImpl, now: () => new Date('2026-05-18T11:30:00Z') });
    expect(b.skip).toBe(true);
    expect(b.hash).toBe(a.hash);
    expect(b.payload).toBeUndefined();
  });

  it('내용 변경 → hash 변경 → skip 안 함', () => {
    const a = planSnapshot({ memoRepoPath: '/memo' }, null, { fsImpl: makeFs(SAMPLE_FILES), now: fixedNow });
    const mutated = { ...SAMPLE_FILES, '/memo/characters/yawn/memory/mood.json': '{"mood":"sad"}' };
    const b = planSnapshot({ memoRepoPath: '/memo' }, a.hash, { fsImpl: makeFs(mutated), now: fixedNow });
    expect(b.skip).toBe(false);
    expect(b.hash).not.toBe(a.hash);
  });

  it('payload = 직렬화된 번들 (schema/source/entries)', () => {
    const p = planSnapshot({ memoRepoPath: '/memo' }, null, { fsImpl: makeFs(SAMPLE_FILES), now: fixedNow });
    const parsed = JSON.parse(p.payload as string) as CharacterStateBundle;
    expect(parsed.schema).toBe(1);
    expect(parsed.source).toBe('yawnbot');
    expect(parsed.ts).toBe('2026-05-18T10:00:00.000Z');
    expect(parsed.entries.length).toBe(10);
  });
});

describe('writeSnapshotOnce — Contents API GET sha → PUT', () => {
  it('skip 시 PUT 0 (fetch 미호출)', async () => {
    const fsImpl = makeFs(SAMPLE_FILES);
    const seed = planSnapshot({ memoRepoPath: '/memo' }, null, { fsImpl, now: fixedNow });
    const fetchImpl = vi.fn();
    const hash = await writeSnapshotOnce(CFG, seed.hash, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: fixedNow,
      timeoutMs: 1000,
      fsImpl,
      logger: silentLogger,
    });
    expect(hash).toBe(seed.hash);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('변경됨 + GET 200 → 그 sha 로 PUT, body=base64 JSON+branch', async () => {
    const calls: Array<{ url: string; opts: any }> = [];
    const fetchImpl = vi.fn(async (url: string, opts: any) => {
      calls.push({ url, opts });
      if (opts.method === 'GET') return res(200, { sha: 'oldsha123' });
      return res(200, { commit: { sha: 'newsha' } });
    });
    const hash = await writeSnapshotOnce(CFG, null, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: fixedNow,
      timeoutMs: 1000,
      fsImpl: makeFs(SAMPLE_FILES),
      logger: silentLogger,
    });
    expect(typeof hash).toBe('string');
    expect(calls[0].url).toContain('contents/.character-state/bundle.json');
    expect(calls[0].url).toContain('ref=yawnbot-character-state');
    expect(calls[0].opts.headers.Authorization).toBe('Bearer tok_x');
    const putBody = JSON.parse(calls[1].opts.body);
    expect(putBody.branch).toBe('yawnbot-character-state');
    expect(putBody.sha).toBe('oldsha123');
    const decoded = JSON.parse(Buffer.from(putBody.content, 'base64').toString('utf-8'));
    expect(decoded.schema).toBe(1);
    expect(decoded.entries.length).toBe(10);
  });

  it('파일 없음(GET 404) → sha 없이 PUT (최초 생성)', async () => {
    const calls: any[] = [];
    const fetchImpl = vi.fn(async (_url: string, opts: any) => {
      calls.push(opts);
      if (opts.method === 'GET') return res(404);
      return res(201);
    });
    await writeSnapshotOnce(CFG, null, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: fixedNow,
      timeoutMs: 1000,
      fsImpl: makeFs(SAMPLE_FILES),
      logger: silentLogger,
    });
    const putBody = JSON.parse(calls[1].body);
    expect(putBody.sha).toBeUndefined();
  });

  it('GET non-2xx(404 외, 예: 401) → throw', async () => {
    const fetchImpl = vi.fn(async () => res(401));
    await expect(
      writeSnapshotOnce(CFG, null, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        now: fixedNow,
        timeoutMs: 1000,
        fsImpl: makeFs(SAMPLE_FILES),
        logger: silentLogger,
      }),
    ).rejects.toThrow(/401/);
  });

  it('PUT 실패(409 sha 충돌 등) → throw', async () => {
    const fetchImpl = vi.fn(async (_u: string, opts: any) =>
      opts.method === 'GET' ? res(200, { sha: 's' }) : res(409),
    );
    await expect(
      writeSnapshotOnce(CFG, null, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        now: fixedNow,
        timeoutMs: 1000,
        fsImpl: makeFs(SAMPLE_FILES),
        logger: silentLogger,
      }),
    ).rejects.toThrow(/409/);
  });
});

describe('runSnapshotTick — 상태 전이 alert + hash carry', () => {
  const okFetch = (): typeof fetch =>
    vi.fn(async (_u: string, opts: any) =>
      opts.method === 'GET' ? res(200, { sha: 's' }) : res(200),
    ) as unknown as typeof fetch;
  const failFetch = (): typeof fetch => vi.fn(async () => res(500)) as unknown as typeof fetch;

  it('첫 tick 성공(prev=null) → healthy, alert 없음, hash 갱신', async () => {
    const alert = vi.fn();
    const r = await runSnapshotTick(CFG, null, null, {
      fetchImpl: okFetch(),
      now: fixedNow,
      alert,
      logger: silentLogger,
      timeoutMs: 1000,
      fsImpl: makeFs(SAMPLE_FILES),
    });
    expect(r.healthy).toBe(true);
    expect(typeof r.hash).toBe('string');
    expect(alert).not.toHaveBeenCalled();
  });

  it('첫 tick 실패(prev=null) → unhealthy, 장애 alert 1회, hash 미갱신', async () => {
    const alert = vi.fn();
    const r = await runSnapshotTick(CFG, null, 'prevH', {
      fetchImpl: failFetch(),
      now: fixedNow,
      alert,
      logger: silentLogger,
      timeoutMs: 1000,
      fsImpl: makeFs(SAMPLE_FILES),
    });
    expect(r.healthy).toBe(false);
    expect(r.hash).toBe('prevH');
    expect(alert).toHaveBeenCalledWith({ healthy: false, reason: expect.stringContaining('실패') });
  });

  it('healthy→healthy 연속 = 무음', async () => {
    const alert = vi.fn();
    await runSnapshotTick(CFG, true, null, {
      fetchImpl: okFetch(),
      now: fixedNow,
      alert,
      logger: silentLogger,
      timeoutMs: 1000,
      fsImpl: makeFs(SAMPLE_FILES),
    });
    expect(alert).not.toHaveBeenCalled();
  });

  it('unhealthy→healthy = 복구 alert', async () => {
    const alert = vi.fn();
    const r = await runSnapshotTick(CFG, false, null, {
      fetchImpl: okFetch(),
      now: fixedNow,
      alert,
      logger: silentLogger,
      timeoutMs: 1000,
      fsImpl: makeFs(SAMPLE_FILES),
    });
    expect(r.healthy).toBe(true);
    expect(alert).toHaveBeenCalledWith({ healthy: true, reason: expect.stringContaining('복구') });
  });
});

describe('startCharacterStateSnapshot — 스케줄링', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    stopCharacterStateSnapshot();
    vi.useRealTimers();
  });

  it('token 미설정 → null + interval 등록 X', () => {
    const fetchImpl = vi.fn();
    const handle = startCharacterStateSnapshot({
      token: undefined,
      memoRepoPath: '/memo',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: silentLogger,
    });
    expect(handle).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('memoRepoPath 미설정 → null', () => {
    expect(
      startCharacterStateSnapshot({ token: 'tok_x', memoRepoPath: '  ', logger: silentLogger }),
    ).toBeNull();
  });

  it('즉시 1회 + interval 간격마다 tick (GET+PUT = 2 fetch/tick)', async () => {
    const fetchImpl = vi.fn(async (_u: string, opts: any) =>
      opts.method === 'GET' ? res(200, { sha: 's' }) : res(200),
    );
    const handle = startCharacterStateSnapshot({
      token: 'tok_x',
      memoRepoPath: '/memo',
      intervalMin: 30,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      fsImpl: makeFs(SAMPLE_FILES),
      logger: silentLogger,
    });
    expect(handle).not.toBeNull();
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2)); // 즉시 tick GET+PUT
    // 무변경 → 다음 tick 은 skip (PUT 0, fetch 호출 0 추가)
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('intervalMin 0 → 최소 1분 clamp', async () => {
    const fetchImpl = vi.fn(async (_u: string, opts: any) =>
      opts.method === 'GET' ? res(200, { sha: 's' }) : res(200),
    );
    startCharacterStateSnapshot({
      token: 'tok_x',
      memoRepoPath: '/memo',
      intervalMin: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      fsImpl: makeFs(SAMPLE_FILES),
      logger: silentLogger,
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(60 * 1000); // 1분 후 tick (무변경 skip)
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('stopCharacterStateSnapshot → 이후 tick 중단', async () => {
    const fetchImpl = vi.fn(async (_u: string, opts: any) =>
      opts.method === 'GET' ? res(200, { sha: 's' }) : res(200),
    );
    startCharacterStateSnapshot({
      token: 'tok_x',
      memoRepoPath: '/memo',
      intervalMin: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      fsImpl: makeFs(SAMPLE_FILES),
      logger: silentLogger,
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    stopCharacterStateSnapshot();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('serializeBundle — 결정성', () => {
  it('동일 입력 → 동일 출력', () => {
    const b: CharacterStateBundle = {
      schema: 1,
      ts: '2026-05-18T10:00:00.000Z',
      source: 'yawnbot',
      entries: [{ path: 'characters/.active.json', content: '{}' }],
    };
    expect(serializeBundle(b)).toBe(serializeBundle(b));
  });
});
