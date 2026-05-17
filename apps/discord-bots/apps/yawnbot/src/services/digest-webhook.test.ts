/**
 * digest-webhook 순수부 회귀 (KAR-004 — Discord digest 전달 근본).
 * 핵심 잠금: ① isDigestCommit 판별 ② fetchRepoFile 토큰 분기
 * (private memo = 인증 GitHub API / 무토큰 = raw fallback).
 * 송신0 진짜 근본 = memo private 무인증 raw 404 → 본 테스트가 회귀 차단.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isDigestCommit, fetchRepoFile } from './digest-webhook';

afterEach(() => vi.unstubAllGlobals());

describe('isDigestCommit', () => {
  it('chore(digests): + digests/*.md added → 그 경로 반환', () => {
    expect(
      isDigestCommit({
        message: 'chore(digests): 2026-05-17 digest (routine auto)',
        added: ['digests/2026-05-17.md', 'digests/INDEX.md'],
      }),
    ).toBe('digests/2026-05-17.md');
  });

  it('비-digest 커밋 / digests modified-만 → null', () => {
    expect(
      isDigestCommit({ message: 'feat: x', added: ['digests/2026-05-17.md'] }),
    ).toBeNull();
    expect(
      isDigestCommit({
        message: 'chore(digests): note',
        added: [],
        modified: ['digests/INDEX.md'],
      }),
    ).toBeNull(); // added 아니면 X (첫 fire=added 만 매칭)
  });
});

describe('fetchRepoFile — private memo 인증 분기 (송신0 근본 fix)', () => {
  it('토큰 있으면 GitHub API contents + Bearer + raw Accept (private OK)', async () => {
    const calls: any[] = [];
    vi.stubGlobal('fetch', async (url: string, opts: any) => {
      calls.push({ url, opts });
      return { ok: true, text: async () => '본문' } as any;
    });
    const body = await fetchRepoFile('mascari4615/memo', 'abc123', 'digests/2026-05-17.md', {
      MEMO_GITHUB_PAT: 'tok_x',
    } as any);
    expect(body).toBe('본문');
    expect(calls[0].url).toBe(
      'https://api.github.com/repos/mascari4615/memo/contents/digests/2026-05-17.md?ref=abc123',
    );
    expect(calls[0].opts.headers.Authorization).toBe('Bearer tok_x');
    expect(calls[0].opts.headers.Accept).toBe('application/vnd.github.raw');
  });

  it('토큰 없으면 raw.githubusercontent fallback (public 호환)', async () => {
    const calls: any[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      return { ok: true, text: async () => 'pub' } as any;
    });
    await fetchRepoFile('mascari4615/x', 'sha1', 'a.md', {} as any);
    expect(calls[0]).toBe('https://raw.githubusercontent.com/mascari4615/x/sha1/a.md');
  });

  it('!ok = throw (caller graceful return) — private 무토큰 404 가 송신0 근본', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404 }) as any);
    await expect(
      fetchRepoFile('mascari4615/memo', 's', 'd.md', {} as any),
    ).rejects.toThrow(/404.*토큰\(MEMO_GITHUB_PAT\) 필요/);
  });
});
