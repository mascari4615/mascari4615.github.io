/**
 * 패보가 그 판의 사람만 올리고, 한 판에 하나로 남는가 (change.arcade-online 3번)
 *
 * - 링크로 여는 것이라 누가 올렸는지가 곧 그 판이 진짜인지
 * - 판 하나에 링크 하나. 창이 여럿이라 여럿이 보냄
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'http';
import { registerArcadeQueue, resetQueue } from './arcade-queue';
import { registerArcadeTape, resetTapes, cleanTape } from './arcade-tape';
import { resetRatings } from './arcade-rating';

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

const A = 'account-a';
const B = 'account-b';
const C = 'account-c';

beforeAll(async () => {
  process.env.ARCADE_TAPE_FILE = path.join(os.tmpdir(), 'arcade-tapes-test.json');
  process.env.ARCADE_RATING_FILE = path.join(os.tmpdir(), 'arcade-tape-ratings-test.json');
  const app = express();
  registerArcadeQueue(app, fakeWho as never);
  registerArcadeTape(app, fakeWho as never);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  resetQueue();
  resetRatings();
  resetTapes();
});

const stand = (key: string): Promise<{ code?: string }> =>
  fetch(`${base}/kl/arcade/queue`, {
    method: 'POST',
    headers: as(key),
    body: JSON.stringify({ game: 'gomoku', name: key.slice(-1) })
  }).then((r) => r.json() as Promise<{ code?: string }>);

async function match(): Promise<string> {
  await stand(A);
  return String((await stand(B)).code);
}

const TAPE = {
  game: 'gomoku',
  seed: 12345,
  seats: [{ name: '갑', bot: false }, { name: '을', bot: false }],
  opts: { size: 15, renju: true },
  moves: [{ at: 0, seat: 0, action: 112 }, { at: 900, seat: 1, action: 113 }],
  end: 4200
};

const put = (key: string, code: string, tape: unknown): Promise<{ status: number; body: { id?: string; again?: boolean; error?: string } }> =>
  fetch(`${base}/kl/arcade/tape`, {
    method: 'POST',
    headers: as(key),
    body: JSON.stringify({ code, tape })
  }).then(async (r) => ({ status: r.status, body: (await r.json()) as { id?: string; again?: boolean; error?: string } }));

describe('패보', () => {
  it('그 판의 사람이 올리면 링크 id 가 난다', async () => {
    const code = await match();
    const out = await put(A, code, TAPE);
    expect(out.status).toBe(200);
    expect(out.body.id).toMatch(/^[A-Za-z0-9_-]{10}$/);
  });

  it('올린 것을 그대로 읽는다. 보는 것은 아무나', async () => {
    const code = await match();
    const id = (await put(A, code, TAPE)).body.id as string;
    const res = await fetch(`${base}/kl/arcade/tape/${id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tape: typeof TAPE };
    expect(body.tape.seed).toBe(12345);
    expect(body.tape.moves).toHaveLength(2);
    /* 옵션이 빠지면 딴 판이 펴진다 */
    expect(body.tape.opts).toEqual({ size: 15, renju: true });
  });

  it('한 판에 하나. 둘째 창이 보내도 같은 id', async () => {
    const code = await match();
    const first = await put(A, code, TAPE);
    const second = await put(B, code, { ...TAPE, seed: 999 });
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.again).toBe(true);
    const body = (await (await fetch(`${base}/kl/arcade/tape/${first.body.id}`)).json()) as { tape: typeof TAPE };
    expect(body.tape.seed).toBe(12345);
  });

  it('손님은 판 코드로 링크를 찾는다. 패보는 주인만 만든다', async () => {
    const code = await match();
    expect((await fetch(`${base}/kl/arcade/tape/of/${code}`)).status).toBe(404);
    const id = (await put(A, code, TAPE)).body.id as string;
    const found = await fetch(`${base}/kl/arcade/tape/of/${code}`);
    expect(found.status).toBe(200);
    expect(((await found.json()) as { id: string }).id).toBe(id);
  });

  it('그 판의 사람이 아니면 거절', async () => {
    const code = await match();
    expect((await put(C, code, TAPE)).status).toBe(403);
  });

  it('없는 판, 없는 패보는 404', async () => {
    expect((await put(A, 'ZZZZZ', TAPE)).status).toBe(404);
    expect((await fetch(`${base}/kl/arcade/tape/zzzzzzzzzz`)).status).toBe(404);
  });

  it('모양이 아닌 패보는 거절', async () => {
    const code = await match();
    expect((await put(A, code, { ...TAPE, game: 'yacht' })).status).toBe(400);
    expect((await put(A, code, { ...TAPE, seed: 'x' })).status).toBe(400);
    expect((await put(A, code, { ...TAPE, seats: [] })).status).toBe(400);
  });

  it('옵션은 숫자와 참거짓만 남는다. 남이 준 값이라 못 믿는다', () => {
    const t = cleanTape({ ...TAPE, opts: { size: 15, evil: { deep: 1 }, 'bad key': 3, on: true } }, 'gomoku');
    expect(t?.opts).toEqual({ size: 15, on: true });
  });

  it('이름은 길이를 자르고 줄바꿈을 없앤다', () => {
    const t = cleanTape({ ...TAPE, seats: [{ name: '가'.repeat(40) }, { name: '조\n수' }] }, 'gomoku');
    expect(t?.seats[0].name.length).toBeLessThanOrEqual(16);
    expect(t?.seats[1].name).toBe('조 수');
    expect(t?.seats[0].bot).toBe(false);
  });
});
