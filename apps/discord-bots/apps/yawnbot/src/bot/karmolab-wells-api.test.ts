/**
 * TASK-KL-153 / KL-190 — 표 우물 라우트 시험.
 *
 * 이 시험이 **자기 파일에 있는 이유**: 라우트가 `karmolab-api.ts` 안에 있을 때, 그 파일을
 * 낡은 사본으로 덮어쓴 커밋이 두 번 라우트를 통째로 지웠다(2026-08-08). 라우트를 옮겼으니
 * 시험도 함께 옮긴다 — 그래야 「지워졌다」를 이 파일 하나가 잡는다.
 *
 * 보는 것은 변환이 아니라(그건 우물별 시험이 본다) **배선**이다: 로그인 없이 되는가 ·
 * 모르는 우물을 부르면 어떻게 되는가 · 캐시가 실제로 바깥을 막는가 · 바깥이 죽었을 때
 * 놀이가 같이 죽지 않는가 · 오늘의 표가 서버와 화면에서 같은가 · 쌓인 날이 없으면
 * 지어내지 않는가.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { registerWellRoutes } from './karmolab-wells-api';
import { WellStore } from '../services/karmolab-wells';
import { SteamLibrary } from '../services/karmolab-steam-library';
import { WellSnapshotStore } from '../services/karmolab-well-snapshots';
import { TasteStore } from '../services/karmolab-taste';
import { KarmolabAccountStore } from '../services/karmolab-accounts';

let server: Server;
let baseUrl: string;
let wells: WellStore;
let snapshots: WellSnapshotStore;
let taste: TasteStore;
let accounts: KarmolabAccountStore;
let tmpDir: string;
/** 바깥 우물이 몇 번 불렸나 — 「캐시가 실제로 막고 있나」를 여기서 센다. */
let wellCalls: number;
let wellFails: boolean;

/**
 * 바깥 흉내. 시험이 진짜 steamspy·jikan·themealdb 로 나가면 안 된다.
 * 주소를 보고 그 집 모양으로 답한다 — 한 가지 모양만 주면 「오늘의 표」가 다른 우물을
 * 고른 날 시험이 통째로 무너진다.
 */
function fakeOutside(url: string): Record<string, unknown> {
  if (url.includes('steamspy')) {
    const rows: Record<string, unknown> = {};
    // 열둘로 둔다 — 「오늘의 문제」는 여덟 개 넘는 표에서만 나온다(보기 넷이 표의 절반이면 안 되므로).
    for (let i = 1; i <= 12; i += 1) {
      rows[String(i)] = {
        appid: i,
        name: `게임 ${i}`,
        developer: '만든곳',
        positive: 900,
        negative: 100,
        owners: '1,000,000 .. 2,000,000',
        price: '1999',
        ccu: 1000 * i,
      };
    }
    return rows;
  }
  if (url.includes('jikan')) {
    return {
      data: Array.from({ length: 5 }, (_, i) => ({
        title: `애니 ${url.slice(-1)}-${i}`,
        images: { jpg: { large_image_url: 'https://img.test/a.jpg' } },
        score: 8 + i / 10,
        members: 1000 * (i + 1),
        episodes: 12,
        year: 2020 + i,
        studios: [{ name: '어느 제작사' }],
      })),
    };
  }
  return {
    meals: Array.from({ length: 5 }, (_, i) => ({
      strMeal: `요리 ${url.slice(-1)}-${i}`,
      strMealThumb: 'https://img.test/m.jpg',
      strArea: 'Korean',
      strCategory: 'Beef',
      strIngredient1: '소고기',
      strIngredient2: '간장',
      strIngredient3: '',
    })),
  };
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kl190-wells-'));
  wellCalls = 0;
  wellFails = false;
  wells = new WellStore(async (url: string) => {
    wellCalls += 1;
    if (wellFails) throw new Error('바깥 503');
    return fakeOutside(url);
  });
  // 쌓아 두는 자리도 임시 파일로 — 안 그러면 시험이 운영 원장에 하루치를 적는다.
  snapshots = new WellSnapshotStore(path.join(tmpDir, 'snap.json'));
  taste = new TasteStore(path.join(tmpDir, 'taste.json'));
  accounts = new KarmolabAccountStore(path.join(tmpDir, 'accounts.json'));

  const app = express();
  app.use(express.json());
  registerWellRoutes(
    app,
    wells,
    // 서재는 열쇠가 있어야 켜진다 — 시험은 흉내 열쇠와 흉내 바깥으로 켜 둔다.
    new SteamLibrary('시험열쇠', async (url: string) => {
      if (url.includes('ResolveVanityURL')) return { response: { success: 1, steamid: '765611979' } };
      return {
        response: {
          games: Array.from({ length: 5 }, (_, i) => ({ appid: i + 1, name: `내 게임 ${i}`, playtime_forever: 60 * (i + 1) })),
        },
      };
    }),
    snapshots,
    taste,
    accounts,
  );

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

/**
 * TASK-KL-153 — 바깥에서 길어 온 표.
 *
 * 여기서 보는 것은 변환이 아니라(그건 우물별 시험이 본다) **배선**이다:
 * 로그인 없이 되는가 · 모르는 우물을 부르면 어떻게 되는가 · 캐시가 실제로 바깥을 막는가 ·
 * 바깥이 죽었을 때 놀이가 같이 죽지 않는가 · 오늘의 표가 서버와 화면에서 같은가.
 */
describe('표 우물', () => {
  it('우물 목록은 로그인 없이 보이고, 오늘의 표를 함께 말한다', async () => {
    const res = await fetch(`${baseUrl}/kl/wells`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wells.map((w: { id: string }) => w.id)).toContain('steam-hot');
    expect(body.wells.map((w: { id: string }) => w.id)).toContain('anime-top');
    // 오늘의 표는 반드시 **있는 우물**이어야 한다 — 아니면 눌러도 안 열린다.
    expect(body.wells.map((w: { id: string }) => w.id)).toContain(body.today);
    expect(body.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 아직 안 길어 온 우물은 개수를 지어내지 않는다.
    expect(body.wells[0].items).toBeNull();
    expect(wellCalls).toBe(0); // 목록을 본다고 바깥으로 나가지 않는다
  });

  it('표는 로그인 없이 오고, 놀이가 쓸 모양 그대로다', async () => {
    const res = await fetch(`${baseUrl}/kl/wells/pack?well=steam-hot`);
    expect(res.status).toBe(200);
    const { pack } = await res.json();
    expect(pack.items).toHaveLength(12);
    expect(pack.items[0].img).toContain('/steam/apps/1/header.jpg');
    expect(pack.fields.filter((f: { kind: string }) => f.kind === 'number')).toHaveLength(4);
    expect(pack.stale).toBe(false);
    expect(pack.well).toBe('steam-hot'); // 순위판이 표마다 갈리는 근거
  });

  it('우물이 달라도 같은 모양으로 온다 — 애니·요리', async () => {
    for (const id of ['anime-top', 'meal']) {
      const { pack } = await (await fetch(`${baseUrl}/kl/wells/pack?well=${id}`)).json();
      expect(pack.items.length).toBeGreaterThanOrEqual(4);
      expect(pack.items.every((i: { name: string }) => typeof i.name === 'string')).toBe(true);
      expect(pack.fields.length).toBeGreaterThan(0);
      expect(pack.well).toBe(id);
    }
  });

  it('`today` 로 부르면 오늘의 표가 그대로 온다 — 화면이 날짜를 따로 세지 않는다', async () => {
    const list = await (await fetch(`${baseUrl}/kl/wells`)).json();
    const { pack } = await (await fetch(`${baseUrl}/kl/wells/pack?well=today`)).json();
    expect(pack.well).toBe(list.today);
  });

  it('모르는 우물은 400 이고, 어떤 우물이 있는지 알려 준다', async () => {
    const res = await fetch(`${baseUrl}/kl/wells/pack?well=constructor`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.wells).toContain('steam-hot');
    expect(wellCalls).toBe(0);
  });

  it('두 번 열어도 바깥으로는 한 번만 나간다', async () => {
    await fetch(`${baseUrl}/kl/wells/pack?well=steam-hot`);
    await fetch(`${baseUrl}/kl/wells/pack?well=steam-hot`);
    expect(wellCalls).toBe(1);
    // 한 번 길어 온 우물은 목록에서 개수를 말한다
    const body = await (await fetch(`${baseUrl}/kl/wells`)).json();
    expect(body.wells.find((w: { id: string }) => w.id === 'steam-hot').items).toBe(12);
  });

  it('한 번도 못 길어 왔으면 503 — 없는 표를 지어내지 않는다', async () => {
    wellFails = true;
    const res = await fetch(`${baseUrl}/kl/wells/pack?well=steam-owned`);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('well_unavailable');
  });
});

describe('내 스팀 서재', () => {
  it('별명·주소·숫자 id 로 서재가 표로 온다', async () => {
    const { pack } = await (await fetch(`${baseUrl}/kl/steam/library?who=mascari`)).json();
    expect(pack.items).toHaveLength(5);
    expect(pack.steamId).toBe('765611979');
    expect(pack.fields.map((f: { key: string }) => f.key)).toEqual(['played', 'recent']);
    expect(pack.items[0].img).toContain('/steam/apps/1/header.jpg');
  });

  it('빈 입력은 「못 찾았다」 — 400 이다(고장 아님)', async () => {
    const res = await fetch(`${baseUrl}/kl/steam/library?who=`);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('not_found');
  });
});

describe('시간여행 표 (KL-190 ②)', () => {
  it('열면 그날 한 장이 쌓인다 — 아무도 안 시켜도', async () => {
    expect(snapshots.days('steam-hot')).toHaveLength(0);
    await fetch(`${baseUrl}/kl/wells/pack?well=steam-hot`);
    expect(snapshots.days('steam-hot')).toHaveLength(1);
  });

  it('쌓인 날이 하루뿐이면 아무 말도 안 한다 — 지어내지 않는다', async () => {
    await fetch(`${baseUrl}/kl/wells/pack?well=steam-hot`);
    const body = await (await fetch(`${baseUrl}/kl/wells/movers?well=steam-hot`)).json();
    expect(body.ready).toBe(false);
    expect(body.days).toBe(1);
  });

  it('어제가 있으면 많이 움직인 것을 말한다', async () => {
    await fetch(`${baseUrl}/kl/wells/pack?well=steam-hot`); // 오늘
    // 어제 것을 직접 심는다 — 시험이 하루를 기다릴 수는 없다.
    const today = snapshots.days('steam-hot')[0];
    const yesterday = new Date(new Date(`${today}T00:00:00Z`).getTime() - 86400e3).toISOString().slice(0, 10);
    snapshots.record(
      { title: 't', emoji: '🔥', fields: [], items: [{ name: '게임 1', ccu: 500 }], fetchedAt: '', stale: false, well: 'steam-hot' },
      yesterday,
    );
    const body = await (await fetch(`${baseUrl}/kl/wells/movers?well=steam-hot&field=ccu`)).json();
    expect(body.ready).toBe(true);
    expect(body.since).toBe(yesterday);
    expect(body.rows[0].name).toBe('게임 1');
  });

  it('칸을 안 주면 그 우물의 첫 숫자 칸으로 답한다 — 화면이 칸 이름을 몰라도 되게', async () => {
    await fetch(`${baseUrl}/kl/wells/pack?well=steam-hot`);
    const body = await (await fetch(`${baseUrl}/kl/wells/movers?well=steam-hot`)).json();
    expect(body.field).toBe('ccu');
  });

  it('모르는 우물의 움직임을 물으면 400', async () => {
    expect((await fetch(`${baseUrl}/kl/wells/movers?well=constructor`)).status).toBe(400);
  });

  it('목록이 며칠치 쌓였는지 말한다', async () => {
    await fetch(`${baseUrl}/kl/wells/pack?well=steam-hot`);
    const body = await (await fetch(`${baseUrl}/kl/wells`)).json();
    expect(body.wells.find((w: { id: string }) => w.id === 'steam-hot').days).toBe(1);
  });
});

describe('오늘의 문제 (KL-190 ③)', () => {
  it('우물에서 문제가 나온다 — 보기 넷, 정답 글자는 안 실린다', async () => {
    const body = await (await fetch(`${baseUrl}/kl/wells/quiz?well=steam-hot`)).json();
    expect(body.ready).toBe(true); // 건너뛰면 「문제가 안 나온다」를 초록으로 넘기게 된다
    expect(body.quiz.choices).toHaveLength(4);
    expect(JSON.stringify(body.quiz)).not.toContain('"answer"');
    expect(body.quiz.answerHash).toHaveLength(16);
  });

  it('안 주면 오늘의 우물로 낸다', async () => {
    const list = await (await fetch(`${baseUrl}/kl/wells`)).json();
    const body = await (await fetch(`${baseUrl}/kl/wells/quiz`)).json();
    expect(body.ready ? body.quiz.well : body.well).toBe(list.today);
  });

  it('모르는 우물이면 400', async () => {
    expect((await fetch(`${baseUrl}/kl/wells/quiz?well=constructor`)).status).toBe(400);
  });
});

/** 로그인 왕복을 흉내 낼 수 없으니 세션을 직접 만들어 쿠키로 쓴다. */
function signIn(name = 'tester', id = '42'): { cookie: string; handle: string } {
  const account = accounts.upsertFromDiscord({ discordId: id, username: name, displayName: name, avatarUrl: null });
  const session = accounts.createSession(account.id, 'vitest');
  return { cookie: `kl_session=${session.token}`, handle: account.handle };
}

describe('취향 지문 (KL-190 ④)', () => {
  const beat = (win: string, lose: string, n = 1) => Array.from({ length: n }, () => ({ win, lose }));

  it('로그인 안 했으면 조용히 넘긴다 — 논 사람만 벌 받으면 안 된다', async () => {
    const res = await fetch(`${baseUrl}/kl/taste`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ variant: 'well:steam-hot', matches: beat('A', 'B') }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).signedIn).toBe(false);
  });

  it('한 판을 보내면 내가 좋아한 것이 돌아온다', async () => {
    const me = signIn();
    const res = await fetch(`${baseUrl}/kl/taste`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: me.cookie },
      body: JSON.stringify({ variant: 'well:steam-hot', matches: beat('A', 'B', 3) }),
    });
    const body = await res.json();
    expect(body.signedIn).toBe(true);
    expect(body.favorites[0].name).toBe('A');
    expect(body.favorites[0].rate).toBe(100);
  });

  it('빈 판은 400 — 아무것도 안 고른 판은 지문이 아니다', async () => {
    const me = signIn();
    const res = await fetch(`${baseUrl}/kl/taste`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: me.cookie },
      body: JSON.stringify({ variant: 'well:steam-hot', matches: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('내 지문을 다시 물어볼 수 있다', async () => {
    const me = signIn();
    await fetch(`${baseUrl}/kl/taste`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: me.cookie },
      body: JSON.stringify({ variant: 'well:steam-hot', matches: beat('A', 'B', 3) }),
    });
    const body = await (await fetch(`${baseUrl}/kl/taste/me?variant=well:steam-hot`, { headers: { cookie: me.cookie } })).json();
    expect(body.favorites[0].name).toBe('A');
    // 아직 나 혼자다 — 없는 이웃을 지어내지 않는다
    expect(body.closest).toEqual([]);
  });

  it('표를 안 주면 내가 논 표 목록을 준다', async () => {
    const me = signIn();
    await fetch(`${baseUrl}/kl/taste`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: me.cookie },
      body: JSON.stringify({ variant: 'well:anime-top', matches: beat('A', 'B') }),
    });
    const body = await (await fetch(`${baseUrl}/kl/taste/me`, { headers: { cookie: me.cookie } })).json();
    expect(body.variants).toContain('well:anime-top');
  });
});

describe('표 섞기 (KL-190 ⑤)', () => {
  it('두 우물이 반반으로 섞이고, 어디서 왔는지 남는다', async () => {
    const { pack } = await (await fetch(`${baseUrl}/kl/wells/mix?a=steam-hot&b=anime-top`)).json();
    const froms = new Set(pack.items.map((i: { from: string }) => i.from));
    expect(froms.size).toBe(2);
    expect(pack.items.every((i: { img?: string }) => i.img)).toBe(true);
  });

  it('순서가 달라도 같은 표다 — 순위판이 둘로 갈리면 안 된다', async () => {
    const one = await (await fetch(`${baseUrl}/kl/wells/mix?a=steam-hot&b=anime-top`)).json();
    const two = await (await fetch(`${baseUrl}/kl/wells/mix?a=anime-top&b=steam-hot`)).json();
    expect(two.pack.well).toBe(one.pack.well);
  });

  it('숫자 칸은 안 섞는다 — 접속자와 별점을 한 칸에 놓으면 거짓이 된다', async () => {
    const { pack } = await (await fetch(`${baseUrl}/kl/wells/mix?a=steam-hot&b=anime-top`)).json();
    expect(pack.fields.filter((f: { kind: string }) => f.kind === 'number')).toHaveLength(0);
  });

  it('같은 우물 둘이거나 모르는 우물이면 400', async () => {
    expect((await fetch(`${baseUrl}/kl/wells/mix?a=steam-hot&b=steam-hot`)).status).toBe(400);
    expect((await fetch(`${baseUrl}/kl/wells/mix?a=steam-hot&b=constructor`)).status).toBe(400);
  });
});
