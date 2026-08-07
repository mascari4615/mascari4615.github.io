/**
 * TASK-KL-098 — 계정 API 를 **실제 HTTP 로** 찔러 본다.
 *
 * 유닛 시험은 저장소가 맞는지만 본다. 여기서 보는 것은 그 위의 배선이다 —
 * 쿠키가 실제로 오가는가, 다른 도메인에서 부를 수 있는가, 로그인 없이 남의 기록을 못 쓰는가.
 * 이 층이 없으면 「함수는 맞는데 브라우저에서는 안 되는」 상태를 배포까지 못 잡는다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { registerKarmolabApi } from './karmolab-api';
import { KarmolabAccountStore } from '../services/karmolab-accounts';

let server: Server;
let baseUrl: string;
let store: KarmolabAccountStore;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kl098-api-'));
  store = new KarmolabAccountStore(path.join(tmpDir, 'state.json'));
  const app = express();
  app.use(express.json());
  registerKarmolabApi(app, store);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** 로그인 왕복(디스코드)을 흉내 낼 수 없으므로 세션을 직접 만들어 쿠키로 쓴다. */
function signIn(): { cookie: string; handle: string } {
  const account = store.upsertFromDiscord({
    discordId: '42',
    username: 'tester',
    displayName: '시험용',
    avatarUrl: null,
  });
  const { token } = store.createSession(account.id);
  return { cookie: `kl_session=${encodeURIComponent(token)}`, handle: account.handle };
}

describe('계정 API — HTTP', () => {
  it('로그인 안 한 사람에게도 200 으로 답한다 — 화면이 오류로 깨지면 안 된다', async () => {
    const res = await fetch(`${baseUrl}/kl/me`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ account: null });
  });

  it('아는 출처에서 부르면 쿠키를 실을 수 있게 답한다', async () => {
    const res = await fetch(`${baseUrl}/kl/me`, { headers: { Origin: 'https://blog.mascari4615.com' } });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://blog.mascari4615.com');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    expect(res.headers.get('vary')).toContain('Origin');
  });

  it('모르는 출처에는 허용 헤더를 안 준다', async () => {
    const res = await fetch(`${baseUrl}/kl/me`, { headers: { Origin: 'https://evil.example.com' } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('로그인 없이는 기록을 못 올린다', async () => {
    const res = await fetch(`${baseUrl}/kl/me/records`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ achievements: ['pet_100'] }),
    });
    expect(res.status).toBe(401);
  });

  it('로그인하면 올리고, 합쳐진 결과가 돌아오고, 다시 물으면 그대로 있다', async () => {
    const { cookie } = signIn();

    const first = await fetch(`${baseUrl}/kl/me/records`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ achievements: ['pet_100'], progress: { pet_strokes: 120 } }),
    });
    expect(first.status).toBe(200);

    // 낡은 기기가 작은 값을 올려도 깎이지 않아야 한다.
    const second = await fetch(`${baseUrl}/kl/me/records`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ achievements: ['first_chat'], progress: { pet_strokes: 3 } }),
    });
    const merged = (await second.json()) as { records: { achievements: string[]; progress: Record<string, number> } };
    expect(merged.records.achievements).toEqual(['first_chat', 'pet_100']);
    expect(merged.records.progress.pet_strokes).toBe(120);

    const me = await fetch(`${baseUrl}/kl/me`, { headers: { Cookie: cookie } });
    const body = (await me.json()) as { account: { handle: string } | null; records: { achievements: string[] } };
    expect(body.account?.handle).toBe('tester');
    expect(body.records.achievements).toEqual(['first_chat', 'pet_100']);
  });

  it('말도 안 되는 값은 걸러진다 — 남이 아무거나 보낼 수 있는 자리다', async () => {
    const { cookie } = signIn();
    const res = await fetch(`${baseUrl}/kl/me/records`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        achievements: [123, null, 'ok'],
        progress: { bad: -5, worse: 'NaN', good: 7 },
        streaks: { s: { current: -1, longest: 3, lastActivityDate: '어제' } },
      }),
    });
    const body = (await res.json()) as {
      records: {
        achievements: string[];
        progress: Record<string, number>;
        streaks: Record<string, { current: number; lastActivityDate: string | null }>;
      };
    };
    expect(body.records.achievements).toEqual(['ok']);
    expect(body.records.progress).toEqual({ good: 7 });
    expect(body.records.streaks.s.current).toBe(0);
    expect(body.records.streaks.s.lastActivityDate).toBeNull();
  });

  it('로그아웃하면 쿠키가 지워지고 그 세션은 더 안 먹는다', async () => {
    const { cookie } = signIn();
    const out = await fetch(`${baseUrl}/kl/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
    const after = await fetch(`${baseUrl}/kl/me`, { headers: { Cookie: cookie } });
    expect(await after.json()).toEqual({ account: null });
  });

  it('공개 프로필은 로그인 없이 열리고, 없는 사람은 404', async () => {
    const { cookie, handle } = signIn();
    await fetch(`${baseUrl}/kl/me/records`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ achievements: ['pet_100'] }),
    });

    const res = await fetch(`${baseUrl}/kl/u/${handle}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profile: { handle: string; achievements: string[] } };
    expect(body.profile.handle).toBe(handle);
    expect(body.profile.achievements).toEqual(['pet_100']);

    expect((await fetch(`${baseUrl}/kl/u/없는사람`)).status).toBe(404);
  });

  it('OAuth 설정이 없으면 로그인 단추가 조용히 죽는 대신 이유를 달고 되돌아온다', async () => {
    const before = process.env.DISCORD_CLIENT_SECRET;
    delete process.env.DISCORD_CLIENT_SECRET;
    try {
      const res = await fetch(`${baseUrl}/kl/auth/discord?return=https://blog.mascari4615.com/karmolab/`, {
        redirect: 'manual',
      });
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('kl_login=unconfigured');
    } finally {
      if (before !== undefined) process.env.DISCORD_CLIENT_SECRET = before;
    }
  });

  it('로그인 후 돌아갈 주소는 아는 곳만 — 아무 데로나 튕겨 보낼 수 없다', async () => {
    process.env.CLIENT_ID = 'test-client';
    process.env.DISCORD_CLIENT_SECRET = 'test-secret';
    try {
      const res = await fetch(`${baseUrl}/kl/auth/discord?return=https://evil.example.com/steal`, {
        redirect: 'manual',
      });
      const location = res.headers.get('location') ?? '';
      expect(location).toContain('discord.com/api/oauth2/authorize');
      // state 는 서버가 들고 있고, 돌아갈 자리는 기본값으로 눌린다.
      expect(location).not.toContain('evil.example.com');
    } finally {
      delete process.env.DISCORD_CLIENT_SECRET;
    }
  });
});
