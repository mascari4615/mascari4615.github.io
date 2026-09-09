import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readBrowserSession, saveBrowserSession, createBrowserResetSource, discoverBrowserPosts } from './codex-reset-browser';
import type { Page } from 'playwright-core';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true }); });
function file() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-browser-test-')); dirs.push(dir); return path.join(dir, 'session.json'); }

describe('브라우저 인증과 실패 경계', () => {
  it('인증 없으면 브라우저 실행 전에 로그인 필요', async () => {
    await expect(createBrowserResetSource('thsottiaux', file())()).rejects.toMatchObject({ code: 'login-required' });
  });
  it.each(['invalid', '{}', '{"cookies":[],"origins":[]}'])('손상되거나 로그아웃된 인증은 보존: %s', data => {
    const target = file(); fs.writeFileSync(target, data);
    expect(() => readBrowserSession(target)).toThrow('X 로그인 필요');
    expect(fs.readFileSync(target, 'utf8')).toBe(data);
  });
  it('저장 시 X 외 도메인 상태 제외, 임시 파일 교체', () => {
    const target = file();
    const cookie = (domain: string) => ({ name: 'auth_token', value: 'synthetic-test-only', domain, path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' as const });
    saveBrowserSession({ cookies: [cookie('.x.com'), cookie('.other.test')], origins: [{ origin: 'https://x.com', localStorage: [] }, { origin: 'https://other.test', localStorage: [] }] }, target);
    const stored = readBrowserSession(target);
    expect(stored.cookies.map(c => c.domain)).toEqual(['.x.com']);
    expect(stored.origins.map(o => o.origin)).toEqual(['https://x.com']);
    expect(fs.existsSync(`${target}.tmp`)).toBe(false);
  });
  it('로그인 화면을 빈 타임라인 성공으로 취급하지 않음', async () => {
    const page = { goto: vi.fn(), waitForFunction: vi.fn(), url: () => 'https://x.com/i/flow/login' };
    await expect(discoverBrowserPosts(page as unknown as Page, 'thsottiaux')).rejects.toMatchObject({ code: 'login-required' });
  });
  it('작성자와 위치 잘못된 입력은 외부 접근 전 차단', async () => {
    await expect(createBrowserResetSource('../other', file())()).rejects.toThrow('형식');
    await expect(createBrowserResetSource('thsottiaux', file())('bad')).rejects.toThrow('형식');
  });
});
