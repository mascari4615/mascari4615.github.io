/**
 * 등급전 대기열이 둘을 붙이고, 셋째는 안 끼우고, 방이 다르면 안 만나는가 (change.arcade-online 1번)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { registerArcadeQueue, resetQueue, idOf } from './arcade-queue';
import { resetRatings, applyResult } from './arcade-rating';

let server: Server;
let base = '';

beforeAll(async () => {
  const app = express();
  registerArcadeQueue(app);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => { resetQueue(); resetRatings(); });

const A = 'aaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbb';
const C = 'cccccccccccccccccccc';

type Answer = { status: string; code?: string; host?: boolean; room?: string; opponent?: string; others?: number };
const stand = async (key: string, name = key[0], game = 'gomoku'): Promise<Answer> =>
  (await (
    await fetch(`${base}/kl/arcade/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, game, name })
    })
  ).json()) as Answer;
const look = async (key: string): Promise<Answer> =>
  (await (await fetch(`${base}/kl/arcade/queue/${key}`)).json()) as Answer;
const leave = (key: string): Promise<Response> => fetch(`${base}/kl/arcade/queue/${key}`, { method: 'DELETE' });

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
    for (let i = 0; i < 12; i++) applyResult('gomoku', [idOf(A), 'dummy-rival']);
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

  it('나가면 줄에서 빠지고, 짝도 풀린다', async () => {
    await stand(A);
    await leave(A);
    expect((await look(A)).status).toBe('none');
    await stand(A);
    await stand(B);
    await leave(B);
    expect((await look(A)).status).toBe('none');
  });

  it('모양이 아닌 열쇠와 놀이는 안 받는다', async () => {
    for (const bad of [{ key: 'short', game: 'gomoku' }, { key: A, game: '../x' }, { key: '<' + A, game: 'gomoku' }, {}]) {
      const res = await fetch(`${base}/kl/arcade/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bad)
      });
      expect(res.status).toBe(400);
    }
  });

  it('열쇠는 상대에게 안 간다. id 는 열쇠의 해시다', () => {
    expect(idOf(A)).not.toContain('aaaa');
    expect(idOf(A)).toHaveLength(12);
    expect(idOf(A)).toBe(idOf(A));
  });
});
