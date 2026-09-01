/**
 * 한쪽 말만으로 점수가 안 움직이는가 (change.arcade-online 2번, 검증의 점수 조작 줄)
 *
 * - 판을 주인이 돌리므로 주인 말만 믿으면 점수를 마음대로 적을 수 있음
 * - 그래서 전원이 같은 순서를 보고해야 반영. 이 검사가 그 자물쇠
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'http';
import { registerArcadeQueue, resetQueue } from './arcade-queue';
import { registerArcadeReport, resetReports } from './arcade-report';
import { ratingOf, resetRatings } from './arcade-rating';
import { registerArcadeTape, resetTapes } from './arcade-tape';
import { setVerifier } from './arcade-verify';

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
  process.env.ARCADE_RATING_FILE = path.join(os.tmpdir(), 'arcade-report-test.json');
  const app = express();
  registerArcadeQueue(app, fakeWho as never);
  registerArcadeReport(app, fakeWho as never);
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
  resetReports();
  resetTapes();
  /* 기본은 묶음 없음. 옛 검사들이 재검증에 걸리지 않게 */
  setVerifier(null);
});

type Answer = { status: string; code?: string; you?: string; rival?: string };
const stand = async (key: string, game = 'gomoku'): Promise<Answer> =>
  (await (
    await fetch(`${base}/kl/arcade/queue`, {
      method: 'POST',
      headers: as(key),
      body: JSON.stringify({ game, name: key.slice(-1) })
    })
  ).json()) as Answer;

type Report = {
  ok?: boolean;
  applied?: boolean;
  waiting?: number;
  disagreed?: boolean;
  again?: boolean;
  error?: string;
  forged?: boolean;
  verified?: boolean;
};
const report = async (key: string, code: string, ranks: string[], draw = false): Promise<{ status: number; body: Report }> => {
  const res = await fetch(`${base}/kl/arcade/report`, {
    method: 'POST',
    headers: as(key),
    body: JSON.stringify({ code, ranks, draw })
  });
  return { status: res.status, body: (await res.json()) as Report };
};

/** 둘을 붙이고 그 판의 코드와 두 사람 id */
async function match(): Promise<{ code: string; a: string; b: string }> {
  await stand(A);
  const answer = await stand(B);
  return { code: String(answer.code), a: A, b: B };
}

describe('결과 보고', () => {
  it('한쪽 말만으로는 점수가 안 움직인다', async () => {
    const { code, a, b } = await match();
    const first = await report(A, code, [a, b]);
    expect(first.body.applied).toBe(false);
    expect(first.body.waiting).toBe(1);
    expect(ratingOf('gomoku', a)).toBe(1500);
  });

  it('양쪽 말이 맞으면 반영된다', async () => {
    const { code, a, b } = await match();
    await report(A, code, [a, b]);
    const second = await report(B, code, [a, b]);
    expect(second.body.applied).toBe(true);
    expect(ratingOf('gomoku', a)).toBeGreaterThan(1500);
    expect(ratingOf('gomoku', b)).toBeLessThan(1500);
  });

  it('말이 어긋나면 아무 점수도 안 움직인다', async () => {
    const { code, a, b } = await match();
    await report(A, code, [a, b]);
    const second = await report(B, code, [b, a]);
    expect(second.body.disagreed).toBe(true);
    expect(ratingOf('gomoku', a)).toBe(1500);
    expect(ratingOf('gomoku', b)).toBe(1500);
  });

  it('같은 판을 다시 보내도 두 번 안 적는다', async () => {
    const { code, a, b } = await match();
    await report(A, code, [a, b]);
    await report(B, code, [a, b]);
    const after = ratingOf('gomoku', a);
    const again = await report(A, code, [a, b]);
    expect(again.body.again).toBe(true);
    expect(ratingOf('gomoku', a)).toBe(after);
  });

  it('그 판의 사람이 아니면 거절', async () => {
    const { code, a, b } = await match();
    expect((await report(C, code, [a, b])).status).toBe(403);
  });

  it('없는 판, 모양이 아닌 값은 거절', async () => {
    expect((await report(A, 'ZZZZZ', [A, B])).status).toBe(404);
    expect((await report(A, '!!', [])).status).toBe(400);
  });

  it('로그인 안 하면 보고도 점수 보기도 못 한다', async () => {
    const { code, a, b } = await match();
    const res = await fetch(`${base}/kl/arcade/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, ranks: [a, b] })
    });
    expect(res.status).toBe(401);
    const mine = await fetch(`${base}/kl/arcade/rating/me?game=gomoku`);
    expect(mine.status).toBe(200);
    expect((await mine.json()) as { signedIn: boolean }).toEqual({ signedIn: false });
  });

  it('그 판에 없던 사람을 순서에 끼우면 거절', async () => {
    const { code, a } = await match();
    expect((await report(A, code, [a, C])).status).toBe(400);
  });

  it('무승부는 양쪽 다 무승부라고 해야 반영', async () => {
    const { code, a, b } = await match();
    await report(A, code, [a, b], true);
    const mismatch = await report(B, code, [a, b], false);
    expect(mismatch.body.disagreed).toBe(true);
    expect(ratingOf('gomoku', a)).toBe(1500);
  });

  it('로그인한 사람은 제 점수를 본다', async () => {
    const res = await fetch(`${base}/kl/arcade/rating/me?game=gomoku`, { headers: as(A) });
    expect(res.status).toBe(200);
    expect((await res.json()) as { rating: number }).toEqual({ signedIn: true, rating: 1500, games: 0, wins: 0 });
  });
});

/**
 * 서버가 그 판을 다시 셈한 것과 어긋나면 점수가 안 움직이는가 (2026-09-01)
 *
 * - 전원 일치는 주인이 커널을 손대면 그대로 통과한다. 나머지는 그 화면을 받아 보기 때문
 * - 그래서 마지막 자물쇠는 서버가 제 손으로 세는 것
 * - **패보가 없으면 통과시켜야 한다.** 안 그러면 못 올린 판마다 점수가 멈춤
 */
describe('서버가 다시 셈하기', () => {
  const putTape = async (key: string, code: string): Promise<Response> =>
    fetch(`${base}/kl/arcade/tape`, {
      method: 'POST',
      headers: as(key),
      body: JSON.stringify({
        code,
        tape: { game: 'gomoku', seed: 7, seats: [{ name: 'a', bot: false }, { name: 'b', bot: false }], opts: {}, moves: [], end: 100 }
      })
    });

  it('패보가 있고 보고가 맞으면 반영되고 잰 것으로 표시된다', async () => {
    const { code, a, b } = await match();
    await putTape(a, code);
    setVerifier(() => ({ ok: true, ranks: [0, 1], scores: [1, 0], finished: true }));
    await report(a, code, [a, b]);
    const said = await report(b, code, [a, b]);
    expect(said.body.applied).toBe(true);
    expect(said.body.verified).toBe(true);
    expect(ratingOf('gomoku', a)).toBeGreaterThan(1500);
  });

  it('둘이 짜고 거꾸로 보고해도 서버가 막는다', async () => {
    const { code, a, b } = await match();
    await putTape(a, code);
    /* 서버가 센 것은 a 가 이긴 판. 그런데 둘 다 b 가 이겼다고 말함 */
    setVerifier(() => ({ ok: true, ranks: [0, 1], scores: [1, 0], finished: true }));
    await report(a, code, [b, a]);
    const said = await report(b, code, [b, a]);
    expect(said.body.applied).toBe(false);
    expect(said.body.forged).toBe(true);
    expect(ratingOf('gomoku', b)).toBe(1500);
  });

  it('패보가 안 올라왔으면 그냥 반영한다. 점수가 멈추면 그게 더 나쁘다', async () => {
    const { code, a, b } = await match();
    setVerifier(() => ({ ok: true, ranks: [0, 1], scores: [1, 0], finished: true }));
    await report(a, code, [b, a]);
    const said = await report(b, code, [b, a]);
    expect(said.body.applied).toBe(true);
    expect(said.body.verified).toBe(false);
  });
});
