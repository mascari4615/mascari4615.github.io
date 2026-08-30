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
import { registerArcadeQueue, resetQueue, idOf } from './arcade-queue';
import { registerArcadeReport, resetReports } from './arcade-report';
import { ratingOf, resetRatings } from './arcade-rating';

let server: Server;
let base = '';

const A = 'aaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbb';
const C = 'cccccccccccccccccccc';

beforeAll(async () => {
  process.env.ARCADE_RATING_FILE = path.join(os.tmpdir(), 'arcade-report-test.json');
  const app = express();
  registerArcadeQueue(app);
  registerArcadeReport(app);
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
});

type Answer = { status: string; code?: string; you?: string; rival?: string };
const stand = async (key: string, game = 'gomoku'): Promise<Answer> =>
  (await (
    await fetch(`${base}/kl/arcade/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, game, name: key[0] })
    })
  ).json()) as Answer;

type Report = { ok?: boolean; applied?: boolean; waiting?: number; disagreed?: boolean; again?: boolean; error?: string };
const report = async (key: string, code: string, ranks: string[], draw = false): Promise<{ status: number; body: Report }> => {
  const res = await fetch(`${base}/kl/arcade/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, code, ranks, draw })
  });
  return { status: res.status, body: (await res.json()) as Report };
};

/** 둘을 붙이고 그 판의 코드와 두 사람 id */
async function match(): Promise<{ code: string; a: string; b: string }> {
  await stand(A);
  const answer = await stand(B);
  return { code: String(answer.code), a: idOf(A), b: idOf(B) };
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
    expect((await report(A, 'ZZZZZ', [idOf(A), idOf(B)])).status).toBe(404);
    expect((await report('short', 'ZZZZZ', [])).status).toBe(400);
  });

  it('그 판에 없던 사람을 순서에 끼우면 거절', async () => {
    const { code, a } = await match();
    expect((await report(A, code, [a, idOf(C)])).status).toBe(400);
  });

  it('무승부는 양쪽 다 무승부라고 해야 반영', async () => {
    const { code, a, b } = await match();
    await report(A, code, [a, b], true);
    const mismatch = await report(B, code, [a, b], false);
    expect(mismatch.body.disagreed).toBe(true);
    expect(ratingOf('gomoku', a)).toBe(1500);
  });

  it('내 점수를 열쇠로 본다', async () => {
    const res = await fetch(`${base}/kl/arcade/rating/${A}?game=gomoku`);
    expect(res.status).toBe(200);
    expect((await res.json()) as { rating: number }).toEqual({ rating: 1500, games: 0, wins: 0 });
  });
});
