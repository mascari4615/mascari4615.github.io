/**
 * orphan 브랜치 자동 부트스트랩 순수부 (TASK-KAR-CHARSTATE follow-up).
 * 실 네트워크 무관 — fetch 전부 주입. 핵심 잠금:
 *  ① ref GET 200 → no-op (false), commit/ref POST 0
 *  ② ref GET 404 → empty-tree orphan commit + refs/heads/<b> 생성 (true)
 *  ③ commit body = {tree: EMPTY_TREE_SHA, parents: []} / ref body = refs/heads/<b>
 *  ④ ref GET non-404 (401 등) → throw
 *  ⑤ commit POST 실패 / sha 없음 → throw
 *  ⑥ ref POST 422 (레이스/이미 존재) → 양성(true, throw X)
 *  ⑦ ref POST 그 외 실패(500) → throw
 *  ⑧ 슬래시 포함 브랜치 = segment 별 encode, 슬래시 보존
 */
import { describe, it, expect, vi } from 'vitest';
import {
  ensureOrphanBranch,
  EMPTY_TREE_SHA,
  type OrphanBranchConfig,
} from './github-orphan-branch';

const CFG: OrphanBranchConfig = {
  token: 'tok_x',
  repo: 'mascari4615/memo',
  branch: 'yawnbot-character-state',
};
const silentLogger = { log: (): void => {}, warn: (): void => {}, error: (): void => {} };

function res(status: number, json?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => json ?? {},
  } as Response;
}

const deps = (fetchImpl: typeof fetch): Parameters<typeof ensureOrphanBranch>[1] => ({
  fetchImpl,
  timeoutMs: 1000,
  userAgent: 'yawnbot-test',
  logger: silentLogger,
});

describe('ensureOrphanBranch', () => {
  it('ref GET 200 → 이미 존재 (false), commit/ref POST 0', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = vi.fn(async (url: string, opts: any) => {
      calls.push({ url, method: opts.method });
      return res(200, { ref: 'refs/heads/yawnbot-character-state' });
    });
    const created = await ensureOrphanBranch(CFG, deps(fetchImpl as unknown as typeof fetch));
    expect(created).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toContain(
      '/repos/mascari4615/memo/git/ref/heads/yawnbot-character-state',
    );
  });

  it('ref GET 404 → empty-tree orphan commit + refs/heads 생성 (true)', async () => {
    const calls: Array<{ url: string; opts: any }> = [];
    const fetchImpl = vi.fn(async (url: string, opts: any) => {
      calls.push({ url, opts });
      if (opts.method === 'GET') return res(404);
      if (url.endsWith('/git/commits')) return res(201, { sha: 'commit_sha_1' });
      if (url.endsWith('/git/refs')) return res(201, {});
      throw new Error(`예상 못 한 호출 ${url}`);
    });
    const created = await ensureOrphanBranch(CFG, deps(fetchImpl as unknown as typeof fetch));
    expect(created).toBe(true);
    expect(calls).toHaveLength(3);

    const commitBody = JSON.parse(calls[1].opts.body);
    expect(calls[1].url).toContain('/git/commits');
    expect(commitBody.tree).toBe(EMPTY_TREE_SHA);
    expect(commitBody.parents).toEqual([]);

    const refBody = JSON.parse(calls[2].opts.body);
    expect(calls[2].url).toContain('/git/refs');
    expect(refBody.ref).toBe('refs/heads/yawnbot-character-state');
    expect(refBody.sha).toBe('commit_sha_1');
  });

  it('ref GET non-404 (401) → throw', async () => {
    const fetchImpl = vi.fn(async () => res(401));
    await expect(
      ensureOrphanBranch(CFG, deps(fetchImpl as unknown as typeof fetch)),
    ).rejects.toThrow(/401/);
  });

  it('commit POST 실패(500) → throw', async () => {
    const fetchImpl = vi.fn(async (url: string, opts: any) =>
      opts.method === 'GET' ? res(404) : res(500),
    );
    await expect(
      ensureOrphanBranch(CFG, deps(fetchImpl as unknown as typeof fetch)),
    ).rejects.toThrow(/commit 실패.*500/);
  });

  it('commit 201 인데 sha 없음 → throw', async () => {
    const fetchImpl = vi.fn(async (url: string, opts: any) =>
      opts.method === 'GET' ? res(404) : res(201, {}),
    );
    await expect(
      ensureOrphanBranch(CFG, deps(fetchImpl as unknown as typeof fetch)),
    ).rejects.toThrow(/commit sha 없음/);
  });

  it('ref POST 422 (이미 존재/레이스) → 양성 true (throw X)', async () => {
    const fetchImpl = vi.fn(async (url: string, opts: any) => {
      if (opts.method === 'GET') return res(404);
      if (url.endsWith('/git/commits')) return res(201, { sha: 's' });
      return res(422, { message: 'Reference already exists' });
    });
    const created = await ensureOrphanBranch(CFG, deps(fetchImpl as unknown as typeof fetch));
    expect(created).toBe(true);
  });

  it('ref POST 그 외 실패(500) → throw', async () => {
    const fetchImpl = vi.fn(async (url: string, opts: any) => {
      if (opts.method === 'GET') return res(404);
      if (url.endsWith('/git/commits')) return res(201, { sha: 's' });
      return res(500);
    });
    await expect(
      ensureOrphanBranch(CFG, deps(fetchImpl as unknown as typeof fetch)),
    ).rejects.toThrow(/ref 생성 실패.*500/);
  });

  it('슬래시 포함 브랜치 = segment 별 encode, 슬래시 보존', async () => {
    const calls: Array<{ url: string; opts: any }> = [];
    const fetchImpl = vi.fn(async (url: string, opts: any) => {
      calls.push({ url, opts });
      if (opts.method === 'GET') return res(404);
      if (url.endsWith('/git/commits')) return res(201, { sha: 's' });
      return res(201, {});
    });
    await ensureOrphanBranch(
      { ...CFG, branch: 'snap/yawn bot' },
      deps(fetchImpl as unknown as typeof fetch),
    );
    // GET ref URL: 슬래시 보존 + 각 segment encode (공백 → %20)
    expect(calls[0].url).toContain('/git/ref/heads/snap/yawn%20bot');
    // ref 생성 body 는 raw refs/heads/<branch>
    expect(JSON.parse(calls[2].opts.body).ref).toBe('refs/heads/snap/yawn bot');
  });
});
