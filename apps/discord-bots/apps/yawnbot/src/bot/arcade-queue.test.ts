/**
 * 등급전 대기열이 둘을 붙이고, 셋째는 안 끼우고, 방이 다르면 안 만나는가 (change.arcade-online 1번)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { registerArcadeQueue, resetQueue, matchRange } from './arcade-queue';
import { resetRatings, applyResult } from './arcade-rating';

let server: Server;
let base = '';
/** 줄에 선 사람을 채널에 부르라고 온 것들 */
const called: Array<{ game: string; name: string; since: number }> = [];


/** 가짜 로그인. `x-test-user` 머리에 적은 이름이 곧 그 사람 */
const fakeWho = (req: { headers: Record<string, unknown> }): { id: string; handle: string } | null => {
  const raw = req.headers['x-test-user'];
  const id = typeof raw === 'string' ? raw.trim() : '';
  return id ? { id, handle: id } : null;
};
/** 그 사람으로 보내는 머리 */
const as = (id: string): Record<string, string> => ({ 'x-test-user': id, 'Content-Type': 'application/json' });

beforeAll(async () => {
  const app = express();
  registerArcadeQueue(app, fakeWho as never, (info) => called.push(info));
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => { resetQueue(); resetRatings(); called.length = 0; });

const A = 'account-a';
const B = 'account-b';
const C = 'account-c';

type Answer = { status: string; code?: string; host?: boolean; room?: string; opponent?: string; others?: number };
const stand = async (key: string, name = key.slice(-1), game = 'gomoku'): Promise<Answer> =>
  (await (
    await fetch(`${base}/kl/arcade/queue`, { method: 'POST', headers: as(key), body: JSON.stringify({ game, name }) })
  ).json()) as Answer;
const look = async (key: string): Promise<Answer> =>
  (await (await fetch(`${base}/kl/arcade/queue/me`, { headers: as(key) })).json()) as Answer;
const leave = (key: string): Promise<Response> =>
  fetch(`${base}/kl/arcade/queue/me`, { method: 'DELETE', headers: as(key) });

describe('등급전 대기열', () => {
  it('혼자면 기다린다. 초심 방', async () => {
    const a = await stand(A);
    expect(a.status).toBe('waiting');
    expect(a.room).toBe('beginner');
    expect(a.others).toBe(0);
  });

  it('둘이면 같은 코드를 받고, 먼저 선 쪽이 주인이다', async () => {
    await stand(A);
    const b = await stand(B);
    expect(b.status).toBe('matched');
    expect(b.host).toBe(false);
    expect(b.opponent).toBe('a');
    const a = await look(A);
    expect(a.status).toBe('matched');
    expect(a.host).toBe(true);
    expect(a.code).toBe(b.code);
    expect(a.code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    expect(a.opponent).toBe('b');
  });

  it('셋째는 안 끼고 다시 대기', async () => {
    await stand(A);
    await stand(B);
    const c = await stand(C);
    expect(c.status).toBe('waiting');
  });

  it('놀이가 다르면 안 만난다', async () => {
    await stand(A, 'a', 'gomoku');
    expect((await stand(B, 'b', 'yut')).status).toBe('waiting');
  });

  it('점수 차가 크면 처음엔 안 만난다. 방 벽이 아니라 폭이다', async () => {
    /* 1500 에서 순위점을 여러 번 얹어 폭 밖으로 보냄 */
    /* 상대를 매번 갈아 끼움. 같은 짝만 12판이면 부스팅 감쇠에 걸려 안 오름 */
    for (let i = 0; i < 12; i++) applyResult('gomoku', [A, 'dummy-rival-' + i]);
    expect((await stand(A)).room).toBe('upper');
    expect((await stand(B)).status).toBe('waiting');
  });

  it('폭은 기다린 만큼 넓어진다. 1분이면 아무나', () => {
    expect(matchRange(0)).toBe(120);
    expect(matchRange(14_000)).toBe(120);
    expect(matchRange(15_000)).toBe(240);
    expect(matchRange(30_000)).toBe(360);
    expect(matchRange(45_000)).toBe(480);
    expect(matchRange(60_000)).toBe(Infinity);
    expect(matchRange(-5)).toBe(120);
  });

  it('폭 안이면 점수가 달라도 만난다', async () => {
    /* 한 번만 얹으면 1520 대. 120 폭 안 */
    applyResult('gomoku', [A, 'dummy-rival']);
    await stand(A);
    expect((await stand(B)).status).toBe('matched');
  });

  it('짝이 난 뒤 다시 알려도 같은 답이다. 두 판에 안 걸린다', async () => {
    await stand(A);
    const first = await stand(B);
    const again = await stand(B);
    expect(again.code).toBe(first.code);
    expect((await stand(C)).status).toBe('waiting');
  });

  it('방마다 몇이 기다리는지 열쇠 없이 본다', async () => {
    const count = (game: string): Promise<Response> => fetch(`${base}/kl/arcade/queue/count/${game}`);
    expect(await (await count('gomoku')).json()).toEqual({ beginner: 0, upper: 0 });
    await stand(A);
    expect(await (await count('gomoku')).json()).toEqual({ beginner: 1, upper: 0 });
    /* 다른 놀이 줄은 안 센다 */
    expect(await (await count('yut')).json()).toEqual({ beginner: 0, upper: 0 });
    expect((await count('BAD')).status).toBe(400);
  });

  it('나가면 줄에서 빠지고, 짝도 풀린다', async () => {
    await stand(A);
    await leave(A);
    expect((await look(A)).status).toBe('none');
    await stand(A);
    await stand(B);
    await leave(B);
    expect((await look(A)).status).toBe('none');
  });

  it('모양이 아닌 놀이는 안 받는다', async () => {
    for (const bad of [{ game: '../x' }, { game: '' }, {}]) {
      const res = await fetch(`${base}/kl/arcade/queue`, {
        method: 'POST',
        headers: as(A),
        body: JSON.stringify(bad)
      });
      expect(res.status).toBe(400);
    }
  });

  it('로그인 안 했으면 줄서기 거절. 등급전은 로그인 필수', async () => {
    const res = await fetch(`${base}/kl/arcade/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'gomoku', name: '나그네' })
    });
    expect(res.status).toBe(401);
    expect((await fetch(`${base}/kl/arcade/queue/me`)).status).toBe(401);
    expect((await fetch(`${base}/kl/arcade/queue/me`, { method: 'DELETE' })).status).toBe(401);
    /* 아무도 안 섰다 */
    expect(await (await fetch(`${base}/kl/arcade/queue/count/gomoku`)).json()).toEqual({ beginner: 0, upper: 0 });
  });
});

/**
 * 줄에 혼자 서면 채널이 부를 수 있게 알린다 (change.arcade-online)
 *
 * - 부를지 말지는 여기서 안 정한다. 그건 arcade-lfg 의 몫
 * - 여기서 지킬 것은 하나. **짝이 난 판은 안 알림**. 이미 붙었는데 부르면 헛걸음
 */
describe('기다린다는 알림', () => {
  it('혼자 서면 알린다. 처음 선 시각이 그대로 실린다', async () => {
    const before = Date.now();
    await stand(A);
    expect(called).toHaveLength(1);
    expect(called[0].game).toBe('gomoku');
    expect(called[0].since).toBeGreaterThanOrEqual(before);
  });

  it('짝이 나면 안 알린다', async () => {
    await stand(A);
    called.length = 0;
    await stand(B);
    expect(called).toHaveLength(0);
  });

  it('다시 알려도 처음 선 시각은 안 밀린다. 5초마다 오는 알림이 기다린 시간을 0으로 되돌리면 안 됨', async () => {
    await stand(A);
    const first = called[0].since;
    await stand(A);
    expect(called[1].since).toBe(first);
  });
});
