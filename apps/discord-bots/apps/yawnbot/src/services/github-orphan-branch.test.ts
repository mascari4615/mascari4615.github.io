/**
 * GitHub orphan 브랜치 자동 부트스트랩 단위 (TASK-KAR-CHARSTATE follow-up).
 * 실 네트워크 0 — fetch/timeout 주입(heartbeat.test 패턴 정합).
 * 핵심 잠금:
 *  ① ref 200 → no-op 'exists', commit/refs POST 0
 *  ② ref 404 → empty-tree orphan 커밋(parents=[]) + refs POST 'created'
 *  ③ ref GET non-404(예 500) → throw (호출부 상태전이로 환산)
 *  ④ refs POST 422 → 경합 흡수 'exists'
 *  ⑤ 커밋 생성 실패 / sha 누락 → throw
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

describe('ensureOrphanBranch', () => {
  it('ref 존재(200) → no-op exists, commit/refs POST 0', async () => {
    const calls: Array<{ url: string; opts: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, opts: RequestInit) => {
      calls.push({ url, opts });
      return res(200, { ref: 'refs/heads/yawnbot-character-state' });
    });
    const r = await ensureOrphanBranch(CFG, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 1000,
      logger: silentLogger,
    });
    expect(r).toBe('exists');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/git/ref/heads/yawnbot-character-state');
    expect(calls[0].opts.headers.Authorization).toBe('Bearer tok_x');
  });

  it('ref 부재(404) → empty-tree orphan 커밋 + ref 생성 → created', async () => {
    const calls: Array<{ url: string; opts: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, opts: RequestInit) => {
      calls.push({ url, opts });
      if (url.includes('/git/ref/heads/')) return res(404);
      if (url.includes('/git/commits')) return res(201, { sha: 'commit_abc' });
      if (url.includes('/git/refs')) return res(201, {});
      return res(500);
    });
    const r = await ensureOrphanBranch(CFG, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 1000,
      logger: silentLogger,
      message: 'custom bootstrap msg',
    });
    expect(r).toBe('created');
    const commit = calls.find((c) => c.url.includes('/git/commits'))!;
    const cb = JSON.parse(commit.opts.body);
    expect(cb).toEqual({ message: 'custom bootstrap msg', tree: EMPTY_TREE_SHA, parents: [] });
    const refPost = calls.find((c) => c.url.includes('/git/refs'))!;
    expect(JSON.parse(refPost.opts.body)).toEqual({
      ref: 'refs/heads/yawnbot-character-state',
      sha: 'commit_abc',
    });
  });

  it('ref GET non-404(500) → throw, 부트스트랩 안 함', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      return res(500);
    });
    await expect(
      ensureOrphanBranch(CFG, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 1000,
        logger: silentLogger,
      }),
    ).rejects.toThrow(/HTTP 500/);
    expect(calls).toHaveLength(1); // ref GET 만
  });

  it('refs POST 422(이미 존재) → 경합 흡수 exists', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/git/ref/heads/')) return res(404);
      if (url.includes('/git/commits')) return res(201, { sha: 'c1' });
      if (url.includes('/git/refs')) return res(422, { message: 'Reference already exists' });
      return res(500);
    });
    const r = await ensureOrphanBranch(CFG, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 1000,
      logger: silentLogger,
    });
    expect(r).toBe('exists');
  });

  it('커밋 생성 실패(HTTP 403) → throw', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/git/ref/heads/')) return res(404);
      if (url.includes('/git/commits')) return res(403);
      return res(500);
    });
    await expect(
      ensureOrphanBranch(CFG, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 1000,
        logger: silentLogger,
      }),
    ).rejects.toThrow(/orphan 커밋 생성 실패 \(HTTP 403\)/);
  });

  it('커밋 응답 sha 누락 → throw', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/git/ref/heads/')) return res(404);
      if (url.includes('/git/commits')) return res(201, {});
      return res(500);
    });
    await expect(
      ensureOrphanBranch(CFG, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 1000,
        logger: silentLogger,
      }),
    ).rejects.toThrow(/sha 없음/);
  });

  it('refs POST non-2xx(404 외, 500) → throw', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/git/ref/heads/')) return res(404);
      if (url.includes('/git/commits')) return res(201, { sha: 'c1' });
      if (url.includes('/git/refs')) return res(500);
      return res(500);
    });
    await expect(
      ensureOrphanBranch(CFG, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 1000,
        logger: silentLogger,
      }),
    ).rejects.toThrow(/orphan 브랜치 ref 생성 실패 \(HTTP 500\)/);
  });
});
