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
  it('chore(digests): + 일자파일 added → 그 경로 (INDEX.md 오선택 X)', () => {
    expect(
      isDigestCommit({
        message: 'chore(digests): 2026-05-17 digest (routine auto)',
        added: ['digests/INDEX.md', 'digests/2026-05-17.md'],
      }),
    ).toBe('digests/2026-05-17.md');
  });

  it('같은날 재실행/수동트리거 = modified-only 도 매칭 (2차 갭 fix)', () => {
    expect(
      isDigestCommit({
        message: 'chore(digests): 2026-05-17 digest (routine auto)',
        added: [],
        modified: ['digests/2026-05-17.md', 'digests/INDEX.md'],
      }),
    ).toBe('digests/2026-05-17.md');
  });

  it('비-digest 메시지 / INDEX·README 만 → null', () => {
    expect(
      isDigestCommit({ message: 'feat: x', added: ['digests/2026-05-17.md'] }),
    ).toBeNull();
    expect(
      isDigestCommit({
        message: 'chore(digests): note',
        added: [],
        modified: ['digests/INDEX.md', 'digests/README.md'],
      }),
    ).toBeNull(); // 일자패턴 아님 = 오선택 차단
  });
});

describe('fetchRepoFile — private memo 인증 분기 (송신0 근본 fix)', () => {
  it('토큰 있으면 GitHub API contents + Bearer + raw Accept (private OK)', async () => {
    const calls: Array<{ url: string; opts: RequestInit }> = [];
    vi.stubGlobal('fetch', async (url: string, opts: RequestInit) => {
      calls.push({ url, opts });
      return { ok: true, text: async () => '본문' } as unknown as Response;
    });
    const body = await fetchRepoFile('mascari4615/memo', 'abc123', 'digests/2026-05-17.md', {
      MEMO_GITHUB_PAT: 'tok_x',
    } as unknown as NodeJS.ProcessEnv);
    expect(body).toBe('본문');
    expect(calls[0].url).toBe(
      'https://api.github.com/repos/mascari4615/memo/contents/digests/2026-05-17.md?ref=abc123',
    );
    expect((calls[0].opts.headers as Record<string, string>).Authorization).toBe('Bearer tok_x');
    expect((calls[0].opts.headers as Record<string, string>).Accept).toBe('application/vnd.github.raw');
  });

  it('토큰 없으면 raw.githubusercontent fallback (public 호환)', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      return { ok: true, text: async () => 'pub' } as unknown as Response;
    });
    await fetchRepoFile('mascari4615/x', 'sha1', 'a.md', {} as unknown as NodeJS.ProcessEnv);
    expect(calls[0]).toBe('https://raw.githubusercontent.com/mascari4615/x/sha1/a.md');
  });

  it('!ok = throw (caller graceful return) — private 무토큰 404 가 송신0 근본', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404 }) as unknown as Response);
    await expect(
      fetchRepoFile('mascari4615/memo', 's', 'd.md', {} as unknown as NodeJS.ProcessEnv),
    ).rejects.toThrow(/404.*토큰\(MEMO_GITHUB_PAT\) 필요/);
  });
});
