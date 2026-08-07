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
import { KarmolabTraceStore } from '../services/karmolab-traces';

let server: Server;
let baseUrl: string;
let store: KarmolabAccountStore;
let traces: KarmolabTraceStore;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kl098-api-'));
  store = new KarmolabAccountStore(path.join(tmpDir, 'state.json'));
  traces = new KarmolabTraceStore(path.join(tmpDir, 'traces.json'));
  const app = express();
  app.use(express.json());
  registerKarmolabApi(app, store, traces);
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

  it('흔적 — 도구 열림은 로그인 없이 세고, 같은 사람 새로고침은 안 센다', async () => {
    const headers = { 'Content-Type': 'application/json', 'User-Agent': 'kl-test' };
    const body = JSON.stringify({ toolId: 'charcount' });
    const first = await fetch(`${baseUrl}/kl/trace/tool`, { method: 'POST', headers, body });
    expect(await first.json()).toEqual({ counted: true });
    const second = await fetch(`${baseUrl}/kl/trace/tool`, { method: 'POST', headers, body });
    expect(await second.json()).toEqual({ counted: false });

    const stats = await fetch(`${baseUrl}/kl/tools/stats`);
    const data = (await stats.json()) as { tools: Array<{ toolId: string; total: number }>; pulse: { opensTotal: number } };
    expect(data.tools).toEqual([{ toolId: 'charcount', total: 1, recent: 1 }]);
    expect(data.pulse.opensTotal).toBe(1);
  });

  it('흔적 — 이상한 도구 이름은 400', async () => {
    const res = await fetch(`${baseUrl}/kl/trace/tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolId: '../../secret' }),
    });
    expect(res.status).toBe(400);
  });

  it('글판 — 보는 건 로그인 없이, 쓰는 건 로그인해야', async () => {
    const anon = await fetch(`${baseUrl}/kl/posts?kind=request`);
    const anonBody = (await anon.json()) as { posts: unknown[]; signedIn: boolean; kind: string };
    expect(anon.status).toBe(200);
    expect(anonBody.signedIn).toBe(false);
    expect(anonBody.kind).toBe('request');

    const denied = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'request', text: '엑셀 변환 도구 만들어 주세요' }),
    });
    expect(denied.status).toBe(401);

    const { cookie } = signIn();
    const posted = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ kind: 'request', text: '엑셀 변환 도구 만들어 주세요' }),
    });
    const list = (await posted.json()) as { posts: Array<{ text: string; votes: number }> };
    expect(list.posts[0].text).toBe('엑셀 변환 도구 만들어 주세요');
    expect(list.posts[0].votes).toBe(1);
  });

  it('게시판 — 이야기는 제목이 있어야 올라간다', async () => {
    const { cookie } = signIn();
    const headers = { 'Content-Type': 'application/json', Cookie: cookie };

    const noTitle = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'talk', text: '제목 없이 본문만' }),
    });
    expect(noTitle.status).toBe(400);

    const ok = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'talk', title: '첫 글', text: '안녕하세요' }),
    });
    const body = (await ok.json()) as { posts: Array<{ title: string; votes: number }> };
    expect(body.posts[0].title).toBe('첫 글');
    expect(body.posts[0].votes).toBe(0);
  });

  it('게시판 — 답글을 달면 그 글이 위로 올라온다', async () => {
    const { cookie } = signIn();
    const headers = { 'Content-Type': 'application/json', Cookie: cookie };
    await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'talk', title: '먼저', text: 'x' }),
    });
    const second = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'talk', title: '나중', text: 'y' }),
    });
    const afterPost = (await second.json()) as { posts: Array<{ id: string; title: string }> };
    expect(afterPost.posts.map((p) => p.title)).toEqual(['나중', '먼저']);
    const firstId = afterPost.posts.filter((p) => p.title === '먼저')[0].id;

    const reply = await fetch(`${baseUrl}/kl/posts/${firstId}/replies`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: '반가워요' }),
    });
    expect(reply.status).toBe(200);

    const listed = await fetch(`${baseUrl}/kl/posts?kind=talk`, { headers: { Cookie: cookie } });
    const listBody = (await listed.json()) as { posts: Array<{ title: string; replies: unknown[] }> };
    expect(listBody.posts.map((p) => p.title)).toEqual(['먼저', '나중']);
    expect(listBody.posts[0].replies).toHaveLength(1);
  });

  it('게시판 — 답글도 로그인해야 달린다', async () => {
    const { cookie } = signIn();
    const created = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ kind: 'talk', title: '글', text: 'x' }),
    });
    const id = ((await created.json()) as { posts: Array<{ id: string }> }).posts[0].id;
    const denied = await fetch(`${baseUrl}/kl/posts/${id}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '몰래 답글' }),
    });
    expect(denied.status).toBe(401);
  });

  it('글판 — 빈 글·너무 긴 글은 안 들어간다', async () => {
    const { cookie } = signIn();
    const headers = { 'Content-Type': 'application/json', Cookie: cookie };
    expect(
      (
        await fetch(`${baseUrl}/kl/posts`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ kind: 'request', text: ' ' }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${baseUrl}/kl/posts`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ kind: 'request', text: 'ㄱ'.repeat(500) }),
        })
      ).status,
    ).toBe(400);
  });

  it('글판 — 하루 상한을 넘기면 왜 막혔는지 말해 준다', async () => {
    const { cookie } = signIn();
    const headers = { 'Content-Type': 'application/json', Cookie: cookie };
    for (let i = 0; i < 5; i += 1) {
      const res = await fetch(`${baseUrl}/kl/posts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ kind: 'request', text: `요청 ${i}` }),
      });
      expect(res.status).toBe(200);
    }
    const blocked = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'request', text: '여섯 번째' }),
    });
    expect(blocked.status).toBe(429);
    expect((await blocked.json()) as { error: string }).toMatchObject({ error: 'daily_limit' });

    // 이야기는 따로 센다 — 요청 상한에 걸렸다고 글도 못 쓰면 안 된다.
    const talk = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'talk', title: '글은 된다', text: '본문' }),
    });
    expect(talk.status).toBe(200);
  });

  it('글판 — 투표는 로그인 필요하고, 두 번 누르면 취소된다', async () => {
    const { cookie } = signIn();
    const posted = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ kind: 'request', text: '테스트 요청' }),
    });
    const id = ((await posted.json()) as { posts: Array<{ id: string }> }).posts[0].id;

    expect((await fetch(`${baseUrl}/kl/posts/${id}/vote`, { method: 'POST' })).status).toBe(401);

    const off = await fetch(`${baseUrl}/kl/posts/${id}/vote`, { method: 'POST', headers: { Cookie: cookie } });
    expect((await off.json()) as { voted: boolean }).toMatchObject({ voted: false });
    const on = await fetch(`${baseUrl}/kl/posts/${id}/vote`, { method: 'POST', headers: { Cookie: cookie } });
    expect((await on.json()) as { voted: boolean }).toMatchObject({ voted: true });

    expect(
      (await fetch(`${baseUrl}/kl/posts/없는id/vote`, { method: 'POST', headers: { Cookie: cookie } })).status,
    ).toBe(404);
  });

  it('글판 — 남의 글은 못 지운다', async () => {
    const { cookie } = signIn();
    const posted = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ kind: 'talk', title: '내 글', text: 'x' }),
    });
    const id = ((await posted.json()) as { posts: Array<{ id: string }> }).posts[0].id;

    const other = store.upsertFromDiscord({ discordId: '77', username: 'other', displayName: '남', avatarUrl: null });
    const otherCookie = `kl_session=${encodeURIComponent(store.createSession(other.id).token)}`;
    expect(
      (await fetch(`${baseUrl}/kl/posts/${id}`, { method: 'DELETE', headers: { Cookie: otherCookie } })).status,
    ).toBe(403);

    expect((await fetch(`${baseUrl}/kl/posts/${id}`, { method: 'DELETE', headers: { Cookie: cookie } })).status).toBe(
      200,
    );
  });

  it('글판 — 주인이 아니면 요청 상태를 못 바꾼다', async () => {
    const { cookie } = signIn();
    const posted = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ kind: 'request', text: '테스트 요청' }),
    });
    const id = ((await posted.json()) as { posts: Array<{ id: string }> }).posts[0].id;

    const denied = await fetch(`${baseUrl}/kl/posts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ status: 'planned' }),
    });
    expect(denied.status).toBe(403);

    // 봇이 이미 쓰는 관리자 목록에 이 사람을 넣으면 통과해야 한다.
    const before = process.env.ADMIN_IDS;
    process.env.ADMIN_IDS = '42';
    try {
      const allowed = await fetch(`${baseUrl}/kl/posts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ status: 'planned' }),
      });
      expect(allowed.status).toBe(200);
      const listed = await fetch(`${baseUrl}/kl/posts?kind=request`);
      const body = (await listed.json()) as { posts: Array<{ status: string }> };
      expect(body.posts[0].status).toBe('planned');
    } finally {
      if (before === undefined) delete process.env.ADMIN_IDS;
      else process.env.ADMIN_IDS = before;
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
