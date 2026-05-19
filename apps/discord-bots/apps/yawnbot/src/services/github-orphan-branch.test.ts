/**
 * orphan 브랜치 부트스트랩 순수 IO 잠금 (TASK-KAR-CHARSTATE follow-up).
 * 실 네트워크 0 — fetch 주입. 핵심:
 *  ① ref GET 200 → 'exists', 추가 호출 0 (스테디 경로 무영향 보장)
 *  ② ref GET 404 → empty-tree orphan root commit + refs/heads/<b> 생성 → 'created'
 *  ③ ref 생성 422(동시 race) → 'exists' (alert 노이즈 방지)
 *  ④ ref GET non-404 / commit POST 실패 / commit sha 누락 → throw
 */
import { describe, it, expect, vi } from 'vitest';
import { ensureOrphanBranch, EMPTY_TREE_SHA } from './github-orphan-branch';

const CFG = { token: 'tok_x', repo: 'mascari4615/memo', branch: 'yawnbot-character-state' };

function res(status: number, json?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => json ?? {},
  } as Response;
}

describe('ensureOrphanBranch', () => {
  it('ref 존재(200) → exists, ref GET 1회만 (commit/refs POST 0)', async () => {
    const calls: Array<{ url: string; opts: any }> = [];
    const fetchImpl = vi.fn(async (url: string, opts: any) => {
      calls.push({ url, opts });
      return res(200, { ref: 'refs/heads/yawnbot-character-state' });
    });
    const r = await ensureOrphanBranch(CFG, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 1000,
    });
    expect(r).toBe('exists');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/git/ref/heads/yawnbot-character-state');
    expect(calls[0].opts.method).toBe('GET');
  });

  it('ref 부재(404) → empty-tree orphan commit + refs/heads 생성 → created', async () => {
    const calls: Array<{ url: string; opts: any }> = [];
    const fetchImpl = vi.fn(async (url: string, opts: any) => {
      calls.push({ url, opts });
      if (url.includes('/git/ref/heads/')) return res(404);
      if (url.endsWith('/git/commits')) return res(201, { sha: 'c0mmitSHA' });
      if (url.endsWith('/git/refs')) return res(201, { ref: 'refs/heads/x' });
      throw new Error(`unexpected ${url}`);
    });
    const r = await ensureOrphanBranch(CFG, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 1000,
    });
    expect(r).toBe('created');
    const commit = JSON.parse(calls[1].opts.body);
    expect(commit.tree).toBe(EMPTY_TREE_SHA);
    expect(commit.tree).toBe('4b825dc642cb6eb9a060e54bf8d69288fbee4904');
    expect(commit.parents).toBeUndefined(); // orphan root commit
    expect(calls[1].opts.method).toBe('POST');
    const ref = JSON.parse(calls[2].opts.body);
    expect(ref).toEqual({
      ref: 'refs/heads/yawnbot-character-state',
      sha: 'c0mmitSHA',
    });
  });

  it('ref 생성 422(동시 race) → exists (방어적 허용)', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/git/ref/heads/')) return res(404);
      if (url.endsWith('/git/commits')) return res(201, { sha: 's' });
      return res(422, { message: 'Reference already exists' });
    });
    const r = await ensureOrphanBranch(CFG, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 1000,
    });
    expect(r).toBe('exists');
  });

  it('ref GET non-404(예 500) → throw', async () => {
    const fetchImpl = vi.fn(async () => res(500));
    await expect(
      ensureOrphanBranch(CFG, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow(/ref 조회 실패.*500/);
  });

  it('commit POST 실패 → throw', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('/git/ref/heads/') ? res(404) : res(403),
    );
    await expect(
      ensureOrphanBranch(CFG, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow(/orphan commit 생성 실패.*403/);
  });

  it('commit 응답 sha 누락 → throw (refs 생성 안 함)', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/git/ref/heads/')) return res(404);
      if (url.endsWith('/git/commits')) return res(201, {}); // sha 없음
      return res(201);
    });
    await expect(
      ensureOrphanBranch(CFG, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow(/sha 없음/);
  });

  it('ref 생성 non-2xx(예 500) → throw', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/git/ref/heads/')) return res(404);
      if (url.endsWith('/git/commits')) return res(201, { sha: 's' });
      return res(500);
    });
    await expect(
      ensureOrphanBranch(CFG, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow(/ref 생성 실패.*500/);
  });
});
