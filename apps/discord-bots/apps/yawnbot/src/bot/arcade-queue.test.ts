/**
 * 등급전 대기열이 둘을 붙이고, 셋째는 안 끼우고, 방이 다르면 안 만나는가 (change.arcade-online 1번)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { registerArcadeQueue, resetQueue } from './arcade-queue';
import { resetRatings, applyResult } from './arcade-rating';

let server: Server;
let base = '';


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
  registerArcadeQueue(app, fakeWho as never);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => { resetQueue(); resetRatings(); });

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

  it('점수 방이 다르면 안 만난다', async () => {
    /* 초심 1500 에서 순위점을 여러 번 얹어 윗방으로 올림 */
    for (let i = 0; i < 12; i++) applyResult('gomoku', [A, 'dummy-rival']);
    expect((await stand(A)).room).toBe('upper');
    expect((await stand(B)).status).toBe('waiting');
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
