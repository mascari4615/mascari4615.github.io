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
  /* 아무 포트나 받으면 가끔 **브라우저가 막는 포트**(6000·6665 등)가 걸려서
     `fetch` 가 「bad port」로 죽는다 — 코드와 무관한 실패다. 안전한 대역에서만 고른다. */
  const UNSAFE = new Set([1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697]);
  let port = 0;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = 20000 + Math.floor(Math.random() * 20000);
    if (UNSAFE.has(candidate)) continue;
    const ok = await new Promise<boolean>((resolve) => {
      server = app.listen(candidate, '127.0.0.1', () => resolve(true));
      server.once('error', () => resolve(false));
    });
    if (ok) {
      port = candidate;
      break;
    }
  }
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

  // 사람 브라우저가 스스로 밝히는 이름. 「kl-test」 같은 이름은 이제 사람으로 안 센다.
  const HUMAN_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

  it('흔적 — 도구 열림은 로그인 없이 세고, 같은 사람 새로고침은 안 센다', async () => {
    const headers = { 'Content-Type': 'application/json', 'User-Agent': HUMAN_UA };
    const body = JSON.stringify({ toolId: 'charcount' });
    const first = await fetch(`${baseUrl}/kl/trace/tool`, { method: 'POST', headers, body });
    expect(await first.json()).toEqual({ counted: true, kind: 'human' });
    const second = await fetch(`${baseUrl}/kl/trace/tool`, { method: 'POST', headers, body });
    expect(await second.json()).toEqual({ counted: false, kind: 'human' });

    const stats = await fetch(`${baseUrl}/kl/tools/stats`);
    const data = (await stats.json()) as { tools: Array<{ toolId: string; total: number }>; pulse: { opensTotal: number } };
    expect(data.tools).toEqual([{ toolId: 'charcount', total: 1, recent: 1 }]);
    expect(data.pulse.opensTotal).toBe(1);
  });

  /**
   * 이 수는 첫 화면에 「이번 주에 많이 쓴 도구」로 **공개된다.** 로봇이 만든 순위를 사람에게
   * 보여 주면 자랑이 아니라 거짓말이다. 실제로 우리 점검이 도구를 한 바퀴 돌 때마다 전부
   * +1 이 되어, 도구 130개가 똑같이 48번씩 열린 것으로 찍혀 있었다 (TASK-KL-112).
   */
  it('흔적 — 로봇이 연 것은 도구 사용 수에 안 들어간다', async () => {
    const body = JSON.stringify({ toolId: 'jsonfmt' });
    const 로봇들 = [
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/126.0 Safari/537.36',
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'python-requests/2.31.0',
    ];
    for (const ua of 로봇들) {
      const res = await fetch(`${baseUrl}/kl/trace/tool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': ua },
        body,
      });
      const seen = (await res.json()) as { counted: boolean; kind: string };
      expect(seen.counted, `${ua} 가 사람으로 세어졌다`).toBe(false);
      expect(seen.kind).not.toBe('human');
    }

    const stats = await fetch(`${baseUrl}/kl/tools/stats`);
    const data = (await stats.json()) as { tools: Array<{ toolId: string }> };
    expect(data.tools.some((t) => t.toolId === 'jsonfmt'), '로봇만 연 도구가 순위에 올라왔다').toBe(false);
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
    const anon = await fetch(`${baseUrl}/kl/posts?board=request`);
    const anonBody = (await anon.json()) as { posts: unknown[]; signedIn: boolean; board: string };
    expect(anon.status).toBe(200);
    expect(anonBody.signedIn).toBe(false);
    expect(anonBody.board).toBe('request');

    const denied = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board: 'request', text: '엑셀 변환 도구 만들어 주세요' }),
    });
    expect(denied.status).toBe(401);

    const { cookie } = signIn();
    const posted = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ board: 'request', text: '엑셀 변환 도구 만들어 주세요' }),
    });
    expect(posted.status).toBe(200);
    const listed = await fetch(`${baseUrl}/kl/posts?board=request`);
    const list = (await listed.json()) as { posts: Array<{ text: string; votes: number }> };
    expect(list.posts[0].text).toBe('엑셀 변환 도구 만들어 주세요');
    expect(list.posts[0].votes).toBe(1);
  });

  it('게시판 — 이야기는 제목이 있어야 올라간다', async () => {
    const { cookie } = signIn();
    const headers = { 'Content-Type': 'application/json', Cookie: cookie };

    const noTitle = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ board: 'free', text: '제목 없이 본문만' }),
    });
    expect(noTitle.status).toBe(400);

    const ok = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ board: 'free', title: '첫 글', text: '안녕하세요' }),
    });
    expect(ok.status).toBe(200);
    const listed = await fetch(`${baseUrl}/kl/posts?board=free`);
    const body = (await listed.json()) as { posts: Array<{ title: string; votes: number }> };
    expect(body.posts[0].title).toBe('첫 글');
    expect(body.posts[0].votes).toBe(0);
  });

  it('게시판 — 답글을 달면 그 글이 위로 올라온다', async () => {
    const { cookie } = signIn();
    const headers = { 'Content-Type': 'application/json', Cookie: cookie };
    await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ board: 'free', title: '먼저', text: 'x' }),
    });
    const second = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ board: 'free', title: '나중', text: 'y' }),
    });
    expect(second.status).toBe(200);
    const beforeReply = await fetch(`${baseUrl}/kl/posts?board=free`);
    const afterPost = (await beforeReply.json()) as { posts: Array<{ id: string; title: string }> };
    expect(afterPost.posts.map((p) => p.title)).toEqual(['나중', '먼저']);
    const firstId = afterPost.posts.filter((p) => p.title === '먼저')[0].id;

    const reply = await fetch(`${baseUrl}/kl/posts/${firstId}/replies`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: '반가워요' }),
    });
    expect(reply.status).toBe(200);

    const listed = await fetch(`${baseUrl}/kl/posts?board=free`, { headers: { Cookie: cookie } });
    const listBody = (await listed.json()) as { posts: Array<{ title: string; replies: unknown[] }> };
    expect(listBody.posts.map((p) => p.title)).toEqual(['먼저', '나중']);
    expect(listBody.posts[0].replies).toHaveLength(1);
  });

  it('게시판 — 답글도 로그인해야 달린다', async () => {
    const { cookie } = signIn();
    const created = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ board: 'free', title: '글', text: 'x' }),
    });
    const id = ((await created.json()) as { id: string }).id;
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
          body: JSON.stringify({ board: 'request', text: ' ' }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${baseUrl}/kl/posts`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ board: 'request', text: 'ㄱ'.repeat(500) }),
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
        body: JSON.stringify({ board: 'request', text: `요청 ${i}` }),
      });
      expect(res.status).toBe(200);
    }
    const blocked = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ board: 'request', text: '여섯 번째' }),
    });
    expect(blocked.status).toBe(429);
    expect((await blocked.json()) as { error: string }).toMatchObject({ error: 'daily_limit' });

    // 이야기는 따로 센다 — 요청 상한에 걸렸다고 글도 못 쓰면 안 된다.
    const talk = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ board: 'free', title: '글은 된다', text: '본문' }),
    });
    expect(talk.status).toBe(200);
  });

  it('글판 — 투표는 로그인 필요하고, 두 번 누르면 취소된다', async () => {
    const { cookie } = signIn();
    const posted = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ board: 'request', text: '테스트 요청' }),
    });
    const id = ((await posted.json()) as { id: string }).id;

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
      body: JSON.stringify({ board: 'free', title: '내 글', text: 'x' }),
    });
    const id = ((await posted.json()) as { id: string }).id;

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
      body: JSON.stringify({ board: 'request', text: '테스트 요청' }),
    });
    const id = ((await posted.json()) as { id: string }).id;

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
      const listed = await fetch(`${baseUrl}/kl/posts?board=request`);
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

describe('글 하나 — 커뮤니티 상세', () => {
  it('주소로 바로 열리고, 로그인 없이 보이며, 답글이 함께 온다', async () => {
    const { cookie } = signIn();
    const created = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ board: 'free', title: '첫 글', text: '안녕하세요' }),
    });
    const id = ((await created.json()) as { id: string }).id;
    await fetch(`${baseUrl}/kl/posts/${id}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ text: '반가워요' }),
    });

    const anon = await fetch(`${baseUrl}/kl/posts/${id}`);
    expect(anon.status).toBe(200);
    const body = (await anon.json()) as {
      post: { title: string; replies: Array<{ text: string }> };
      signedIn: boolean;
    };
    expect(body.post.title).toBe('첫 글');
    expect(body.post.replies.map((r) => r.text)).toEqual(['반가워요']);
    expect(body.signedIn).toBe(false);
  });

  it('없는 글은 404 — 「서버가 죽음」과 구별되어야 한다', async () => {
    expect((await fetch(`${baseUrl}/kl/posts/없는글`)).status).toBe(404);
  });
});

describe('판·좋아요·조회 — HTTP', () => {
  it('판 목록과 각 판의 글 수를 준다', async () => {
    const res = await fetch(`${baseUrl}/kl/boards`);
    const body = (await res.json()) as { boards: Array<{ id: string; label: string; count: number }> };
    expect(body.boards.map((b) => b.id)).toContain('free');
    expect(body.boards.every((b) => typeof b.count === 'number')).toBe(true);
  });

  it('공지는 주인만 쓴다 — 화면에서 숨기는 것은 잠금이 아니다', async () => {
    const { cookie } = signIn();
    const denied = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ board: 'notice', title: '가짜 공지', text: 'x' }),
    });
    expect(denied.status).toBe(403);
  });

  it('좋아요는 로그인해야 하고 두 번 누르면 취소된다', async () => {
    const { cookie } = signIn();
    const created = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ board: 'free', title: 'a', text: 'x' }),
    });
    const id = ((await created.json()) as { id: string }).id;

    expect((await fetch(`${baseUrl}/kl/posts/${id}/like`, { method: 'POST' })).status).toBe(401);
    const on = await fetch(`${baseUrl}/kl/posts/${id}/like`, { method: 'POST', headers: { Cookie: cookie } });
    expect((await on.json()) as { liked: boolean }).toMatchObject({ liked: true });
    const off = await fetch(`${baseUrl}/kl/posts/${id}/like`, { method: 'POST', headers: { Cookie: cookie } });
    expect((await off.json()) as { liked: boolean }).toMatchObject({ liked: false });
  });

  it('글을 열면 조회수가 오른다', async () => {
    const { cookie } = signIn();
    const created = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ board: 'free', title: 'a', text: 'x' }),
    });
    const id = ((await created.json()) as { id: string }).id;
    // 사람 브라우저 둘. 「probe-1」 같은 이름은 이제 사람으로 안 센다 (TASK-KL-113).
    await fetch(`${baseUrl}/kl/posts/${id}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36',
      },
    });
    const again = await fetch(`${baseUrl}/kl/posts/${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1 Safari/605.1' },
    });
    const body = (await again.json()) as { post: { views: number } };
    expect(body.post.views).toBeGreaterThanOrEqual(2);
  });

  /**
   * 조회수는 글쓴이가 보는 숫자다. 검색봇이 훑고 간 것을 「사람이 읽었다」로 보여 주면
   * 아무도 안 읽었는데 읽혔다고 믿게 만든다 (TASK-KL-113).
   */
  it('로봇이 연 것은 조회수에 안 들어간다', async () => {
    const { cookie } = signIn();
    const created = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ board: 'free', title: '로봇 시험', text: 'x' }),
    });
    const id = ((await created.json()) as { id: string }).id;
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/126.0 Safari/537.36',
      'curl/8.4.0',
    ]) {
      await fetch(`${baseUrl}/kl/posts/${id}`, { headers: { 'User-Agent': ua } });
    }
    const seen = await fetch(`${baseUrl}/kl/posts/${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1 Safari/605.1' },
    });
    const body = (await seen.json()) as { post: { views: number } };
    // 마지막 한 번(사람)만 세어야 한다.
    expect(body.post.views, '로봇이 연 것이 조회수에 들어갔다').toBe(1);
  });

  it('첫 화면용 최근 글을 준다', async () => {
    const { cookie } = signIn();
    await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ board: 'qna', title: '질문 하나', text: 'x' }),
    });
    const res = await fetch(`${baseUrl}/kl/recent`);
    const body = (await res.json()) as { posts: Array<{ title: string; board: string }> };
    expect(body.posts[0].title).toBe('질문 하나');
    expect(body.posts[0].board).toBe('qna');
  });
});

describe('이슈식 갤러리 — 닫기 권한과 알림', () => {
  /** 두 번째 사람 — 갤러리 주인과 글쓴이가 달라야 알림이 뜻을 갖는다. */
  function signInOther(): { cookie: string; handle: string } {
    const account = store.upsertFromDiscord({
      discordId: '99',
      username: 'other',
      displayName: '다른 사람',
      avatarUrl: null,
    });
    const { token } = store.createSession(account.id);
    return { cookie: `kl_session=${encodeURIComponent(token)}`, handle: account.handle };
  }

  it('갤러리를 만든 사람은 자기 갤러리 글을 닫을 수 있다 — 아무도 못 닫으면 열린 글만 쌓인다', async () => {
    const owner = signIn();
    const made = await fetch(`${baseUrl}/kl/boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
      body: JSON.stringify({ id: 'todo', label: '할 일', desc: '해야 할 것' }),
    });
    expect(made.status).toBe(200);

    // 이슈식으로 바꾼다 (만든 사람이므로 통과해야 한다)
    const styled = await fetch(`${baseUrl}/kl/boards/todo`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
      body: JSON.stringify({ issueStyle: true }),
    });
    expect(styled.status).toBe(200);

    const writer = signInOther();
    const posted = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: writer.cookie },
      body: JSON.stringify({ board: 'todo', title: '고쳐 주세요', text: '이게 안 돼요' }),
    });
    const id = ((await posted.json()) as { id: string }).id;

    // 주인이 아니어도, 갤러리를 만든 사람이면 닫을 수 있다
    const closed = await fetch(`${baseUrl}/kl/posts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
      body: JSON.stringify({ status: 'done', statusNote: '고쳤어요' }),
    });
    expect(closed.status).toBe(200);

    // 글쓴이에게 알림이 가 있어야 한다 — 안 가면 요청한 사람은 영영 모른다
    const bell = await fetch(`${baseUrl}/kl/notifications`, { headers: { Cookie: writer.cookie } });
    const inbox = (await bell.json()) as { items: Array<{ title: string; body: string | null }> };
    expect(inbox.items.length).toBeGreaterThan(0);
    expect(inbox.items[0].title).toContain('고쳐 주세요');
    expect(inbox.items[0].body).toBe('고쳤어요');
  });

  it('상관없는 사람은 못 닫는다', async () => {
    const owner = signIn();
    await fetch(`${baseUrl}/kl/boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
      body: JSON.stringify({ id: 'todo2', label: '할 일2', desc: '해야 할 것' }),
    });
    const stranger = signInOther();
    const posted = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: stranger.cookie },
      body: JSON.stringify({ board: 'todo2', title: '글', text: '내용' }),
    });
    const id = ((await posted.json()) as { id: string }).id;

    // 자기 글이어도 상태는 못 바꾼다 — 상태는 갤러리를 맡은 사람의 판단이다
    const denied = await fetch(`${baseUrl}/kl/posts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: stranger.cookie },
      body: JSON.stringify({ status: 'done' }),
    });
    expect(denied.status).toBe(403);
  });
});

describe('다른 길로 들어오기 — 복구 코드 · 기기 코드', () => {
  it('복구 코드는 만들 때 딱 한 번 보이고, 서버에는 원문이 안 남는다', async () => {
    const { cookie } = signIn();
    const made = await fetch(`${baseUrl}/kl/me/recovery-codes`, { method: 'POST', headers: { Cookie: cookie } });
    const body = (await made.json()) as { codes: string[] };
    expect(body.codes).toHaveLength(8);

    const asked = await fetch(`${baseUrl}/kl/me/recovery-codes`, { headers: { Cookie: cookie } });
    const left = (await asked.json()) as { left: number; codes?: unknown };
    expect(left.left).toBe(8);
    expect(left.codes).toBeUndefined();
  });

  it('복구 코드로 디스코드 없이 들어올 수 있고, 한 장은 한 번만 쓴다', async () => {
    const { cookie } = signIn();
    const made = await fetch(`${baseUrl}/kl/me/recovery-codes`, { method: 'POST', headers: { Cookie: cookie } });
    const { codes } = (await made.json()) as { codes: string[] };

    const first = await fetch(`${baseUrl}/kl/auth/recovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: codes[0] }),
    });
    expect(first.status).toBe(200);
    expect(first.headers.get('set-cookie')).toContain('kl_session=');

    const again = await fetch(`${baseUrl}/kl/auth/recovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: codes[0] }),
    });
    expect(again.status).toBe(401);

    const left = await fetch(`${baseUrl}/kl/me/recovery-codes`, { headers: { Cookie: cookie } });
    expect(((await left.json()) as { left: number }).left).toBe(7);
  });

  it('대소문자·붙임표가 달라도 같은 코드로 본다 — 사람이 옮겨 적는 것이다', async () => {
    const { cookie } = signIn();
    const made = await fetch(`${baseUrl}/kl/me/recovery-codes`, { method: 'POST', headers: { Cookie: cookie } });
    const { codes } = (await made.json()) as { codes: string[] };
    const messy = codes[1].toLowerCase().replace('-', ' ');
    const res = await fetch(`${baseUrl}/kl/auth/recovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: messy }),
    });
    expect(res.status).toBe(200);
  });

  it('아무 코드나 대면 안 들어와진다', async () => {
    const res = await fetch(`${baseUrl}/kl/auth/recovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'AAAA-AAAA' }),
    });
    expect(res.status).toBe(401);
  });

  it('새로 만들면 옛 코드는 못 쓴다', async () => {
    const { cookie } = signIn();
    const first = (await (
      await fetch(`${baseUrl}/kl/me/recovery-codes`, { method: 'POST', headers: { Cookie: cookie } })
    ).json()) as { codes: string[] };
    await fetch(`${baseUrl}/kl/me/recovery-codes`, { method: 'POST', headers: { Cookie: cookie } });
    const res = await fetch(`${baseUrl}/kl/auth/recovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: first.codes[0] }),
    });
    expect(res.status).toBe(401);
  });

  it('기기 코드로 다른 기기에서 들어오고, 한 번 쓰면 사라진다', async () => {
    const { cookie } = signIn();
    const made = await fetch(`${baseUrl}/kl/me/link-code`, { method: 'POST', headers: { Cookie: cookie } });
    const { code } = (await made.json()) as { code: string };
    expect(code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);

    const used = await fetch(`${baseUrl}/kl/auth/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    expect(used.status).toBe(200);
    expect(used.headers.get('set-cookie')).toContain('kl_session=');

    const again = await fetch(`${baseUrl}/kl/auth/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    expect(again.status).toBe(401);
  });

  it('로그인 안 하면 코드를 못 만든다', async () => {
    expect((await fetch(`${baseUrl}/kl/me/recovery-codes`, { method: 'POST' })).status).toBe(401);
    expect((await fetch(`${baseUrl}/kl/me/link-code`, { method: 'POST' })).status).toBe(401);
  });
});

describe('계정 — 이름·내려받기·지우기', () => {
  function signInOther2(): { cookie: string; handle: string } {
    const account = store.upsertFromDiscord({ discordId: '77', username: 'nam', displayName: '남', avatarUrl: null });
    const { token } = store.createSession(account.id);
    return { cookie: `kl_session=${encodeURIComponent(token)}`, handle: account.handle };
  }

  it('보이는 이름을 바꿀 수 있다 — 주소는 그대로 (남이 걸어 둔 링크가 깨지면 안 된다)', async () => {
    const { cookie, handle } = signIn();
    const res = await fetch(`${baseUrl}/kl/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ displayName: '새 이름' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { account: { displayName: string; handle: string } };
    expect(body.account.displayName).toBe('새 이름');
    expect(body.account.handle).toBe(handle);
  });

  it('빈 이름으로는 못 바꾼다', async () => {
    const { cookie } = signIn();
    const res = await fetch(`${baseUrl}/kl/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ displayName: '   ' }),
    });
    expect(res.status).toBe(400);
  });

  it('내 것을 내려받을 수 있고, 그 안에 디스코드 id 가 없다', async () => {
    const { cookie } = signIn();
    await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ board: 'free', title: '내 글', text: '내용' }),
    });
    const res = await fetch(`${baseUrl}/kl/me/export`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw).not.toContain('"42"');
    const body = JSON.parse(raw) as { account: { handle: string }; community: unknown };
    expect(body.account.handle).toBeTruthy();
    expect(body.community).toBeTruthy();
  });

  it('계정을 지우면 로그인이 끊기고, 남긴 글은 남되 누가 썼는지는 지워진다', async () => {
    const { cookie } = signIn();
    const posted = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ board: 'free', title: '남는 글', text: '답글이 달릴 글' }),
    });
    const id = ((await posted.json()) as { id: string }).id;
    const other = signInOther2();
    await fetch(`${baseUrl}/kl/posts/${id}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: other.cookie },
      body: JSON.stringify({ text: '남의 답글' }),
    });

    expect((await fetch(`${baseUrl}/kl/me`, { method: 'DELETE', headers: { Cookie: cookie } })).status).toBe(200);
    expect((await (await fetch(`${baseUrl}/kl/me`, { headers: { Cookie: cookie } })).json()) as unknown).toEqual({
      account: null,
    });

    const detail = await fetch(`${baseUrl}/kl/posts/${id}`);
    const body = (await detail.json()) as { post: { authorHandle: string; replies: Array<{ text: string }> } };
    expect(body.post.authorHandle).toBe('지운 계정');
    expect(body.post.replies[0].text).toBe('남의 답글');
  });

  it('로그인 안 하면 이 자리들은 전부 401 — 남의 것을 못 만진다', async () => {
    expect((await fetch(`${baseUrl}/kl/me/export`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/kl/me/sessions`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/kl/me`, { method: 'DELETE' })).status).toBe(401);
  });
});

describe('갤러리 만들기 — HTTP', () => {
  it('로그인해야 만든다', async () => {
    const res = await fetch(`${baseUrl}/kl/boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: '몰래' }),
    });
    expect(res.status).toBe(401);
  });

  it('이름만 주면 주소를 만들어 준다', async () => {
    const { cookie } = signIn();
    const res = await fetch(`${baseUrl}/kl/boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ label: 'Tool Talk', desc: '도구 이야기' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as { id: string }).toMatchObject({ id: 'tool-talk' });

    const listed = await fetch(`${baseUrl}/kl/boards`);
    const body = (await listed.json()) as { boards: Array<{ id: string; label: string; builtin: boolean }> };
    expect(body.boards.find((b) => b.id === 'tool-talk')).toMatchObject({ label: 'Tool Talk', builtin: false });
  });

  it('한글 이름은 주소를 못 만드니 직접 받아야 한다', async () => {
    const { cookie } = signIn();
    const headers = { 'Content-Type': 'application/json', Cookie: cookie };
    const auto = await fetch(`${baseUrl}/kl/boards`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ label: '도구방' }),
    });
    expect(auto.status).toBe(400);
    expect((await auto.json()) as { error: string }).toMatchObject({ error: 'bad_id' });

    const manual = await fetch(`${baseUrl}/kl/boards`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ label: '도구방', id: 'toolroom' }),
    });
    expect(manual.status).toBe(200);
  });

  it('같은 주소는 두 번 안 만들어진다', async () => {
    const { cookie } = signIn();
    const headers = { 'Content-Type': 'application/json', Cookie: cookie };
    await fetch(`${baseUrl}/kl/boards`, { method: 'POST', headers, body: JSON.stringify({ label: 'dup' }) });
    const again = await fetch(`${baseUrl}/kl/boards`, { method: 'POST', headers, body: JSON.stringify({ label: 'dup' }) });
    expect(again.status).toBe(409);
  });

  it('없는 갤러리의 글 목록은 404 — 조용히 자유 갤러리를 보여 주지 않는다', async () => {
    expect((await fetch(`${baseUrl}/kl/posts?board=nope-nope`)).status).toBe(404);
  });

  it('만든 갤러리에 글을 쓰고, 빈 갤러리만 지운다', async () => {
    const { cookie } = signIn();
    const headers = { 'Content-Type': 'application/json', Cookie: cookie };
    await fetch(`${baseUrl}/kl/boards`, { method: 'POST', headers, body: JSON.stringify({ label: 'mine' }) });

    // 비어 있으면 지워진다
    expect((await fetch(`${baseUrl}/kl/boards/mine`, { method: 'DELETE', headers: { Cookie: cookie } })).status).toBe(200);

    await fetch(`${baseUrl}/kl/boards`, { method: 'POST', headers, body: JSON.stringify({ label: 'mine2' }) });
    await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ board: 'mine2', title: '첫 글', text: 'x' }),
    });
    const blocked = await fetch(`${baseUrl}/kl/boards/mine2`, { method: 'DELETE', headers: { Cookie: cookie } });
    expect(blocked.status).toBe(409);
    expect((await blocked.json()) as { error: string }).toMatchObject({ error: 'not_empty' });
  });

  it('처음부터 있던 갤러리는 아무도 못 지운다', async () => {
    const { cookie } = signIn();
    expect((await fetch(`${baseUrl}/kl/boards/free`, { method: 'DELETE', headers: { Cookie: cookie } })).status).toBe(403);
  });
});

describe('검색 · 활동 · 신고 · 그림 — HTTP', () => {
  it('갤러리를 가리지 않고 찾는다 — 답글에 적힌 말도', async () => {
    const { cookie } = signIn();
    const headers = { 'Content-Type': 'application/json', Cookie: cookie };
    const created = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ board: 'qna', title: '단축키 질문', text: '어떻게 하나요' }),
    });
    const id = ((await created.json()) as { id: string }).id;
    await fetch(`${baseUrl}/kl/posts/${id}/replies`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: '컨트롤 케이 누르세요' }),
    });

    const byTitle = (await (await fetch(`${baseUrl}/kl/search?q=단축키`)).json()) as { posts: unknown[] };
    expect(byTitle.posts).toHaveLength(1);
    const byReply = (await (await fetch(`${baseUrl}/kl/search?q=컨트롤`)).json()) as { posts: unknown[] };
    expect(byReply.posts).toHaveLength(1);
    const none = (await (await fetch(`${baseUrl}/kl/search?q=없는말`)).json()) as { posts: unknown[] };
    expect(none.posts).toHaveLength(0);
  });

  it('빈 검색어는 전부를 쏟아내지 않는다', async () => {
    const body = (await (await fetch(`${baseUrl}/kl/search?q=`)).json()) as { posts: unknown[] };
    expect(body.posts).toHaveLength(0);
  });

  it('사람마다 쓴 글·답글을 모아 준다', async () => {
    const { cookie, handle } = signIn();
    const headers = { 'Content-Type': 'application/json', Cookie: cookie };
    const created = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ board: 'free', title: '내 글', text: 'x' }),
    });
    const id = ((await created.json()) as { id: string }).id;
    await fetch(`${baseUrl}/kl/posts/${id}/replies`, { method: 'POST', headers, body: JSON.stringify({ text: '내 답글' }) });

    const res = await fetch(`${baseUrl}/kl/u/${handle}/activity`);
    const body = (await res.json()) as {
      posts: Array<{ title: string }>;
      replies: Array<{ text: string; postTitle: string }>;
      counts: { posts: number; replies: number };
    };
    expect(body.posts[0].title).toBe('내 글');
    expect(body.replies[0]).toMatchObject({ text: '내 답글', postTitle: '내 글' });
    expect(body.counts).toEqual({ posts: 1, replies: 1 });
    expect((await fetch(`${baseUrl}/kl/u/없는사람/activity`)).status).toBe(404);
  });

  it('신고는 글을 안 지운다 — 주인 목록에만 올린다', async () => {
    const { cookie } = signIn();
    const headers = { 'Content-Type': 'application/json', Cookie: cookie };
    const created = await fetch(`${baseUrl}/kl/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ board: 'free', title: '신고 대상', text: 'x' }),
    });
    const id = ((await created.json()) as { id: string }).id;

    expect(
      (await fetch(`${baseUrl}/kl/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status,
    ).toBe(401);

    const reported = await fetch(`${baseUrl}/kl/reports`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ postId: id, reason: '광고' }),
    });
    expect(reported.status).toBe(200);
    // 글은 그대로 있어야 한다
    expect((await fetch(`${baseUrl}/kl/posts/${id}`)).status).toBe(200);
    // 주인이 아니면 목록을 못 본다
    expect((await fetch(`${baseUrl}/kl/reports`, { headers: { Cookie: cookie } })).status).toBe(403);

    const before = process.env.ADMIN_IDS;
    process.env.ADMIN_IDS = '42';
    try {
      const list = (await (await fetch(`${baseUrl}/kl/reports`, { headers: { Cookie: cookie } })).json()) as {
        reports: Array<{ id: string; reason: string }>;
      };
      expect(list.reports[0].reason).toBe('광고');
      const resolved = await fetch(`${baseUrl}/kl/reports/${list.reports[0].id}/resolve`, {
        method: 'POST',
        headers: { Cookie: cookie },
      });
      expect(resolved.status).toBe(200);
    } finally {
      if (before === undefined) delete process.env.ADMIN_IDS;
      else process.env.ADMIN_IDS = before;
    }
  });

  it('그림이 아닌 것은 안 받는다 — 확장자가 아니라 바이트로 본다', async () => {
    const { cookie } = signIn();
    const headers = { 'Content-Type': 'application/json', Cookie: cookie };
    const notImage = Buffer.from('<script>alert(1)</script>').toString('base64');
    const res = await fetch(`${baseUrl}/kl/uploads`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: `data:image/png;base64,${notImage}` }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'not_image' });
  });

  it('진짜 그림은 저장되고 다시 받아진다', async () => {
    const { cookie } = signIn();
    // 1×1 투명 PNG
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const res = await fetch(`${baseUrl}/kl/uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ data: png }),
    });
    expect(res.status).toBe(200);
    const saved = (await res.json()) as { url: string; mime: string };
    expect(saved.mime).toBe('image/png');
    const fetched = await fetch(`${baseUrl}${saved.url}`);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get('content-type')).toBe('image/png');
  });

  it('이상한 그림 이름으로는 아무것도 못 읽는다', async () => {
    expect((await fetch(`${baseUrl}/kl/img/..%2F..%2Fpackage.json`)).status).toBe(404);
  });
});
