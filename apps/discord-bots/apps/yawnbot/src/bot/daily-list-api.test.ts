/**
 * 전부대기 라우트 시험 (TASK-KL-197).
 *
 * 보는 것은 셈이 아니라(그건 store 시험이 본다) **배선**이다: 로그인 없이 되는가 ·
 * 이상한 몸통을 받아 적지 않는가 · 낸 답이 다음 사람의 비율로 돌아오는가.
 * 라우트가 지워지면 이 파일 하나가 잡는다(그 사고가 이 레포에서 두 번 났다).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { registerDailyListRoutes } from './daily-list-api';
import { DailyListStore, MIN_SAMPLE } from '../services/daily-list-answers';

let server: Server;
let baseUrl: string;
let store: DailyListStore;

beforeEach(async () => {
  store = new DailyListStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'daily-list-api-')), 'state.json'));
  const app = express();
  app.use(express.json());
  registerDailyListRoutes(app, store);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = (body: unknown) =>
  fetch(`${baseUrl}/kl/daily-list/answers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('전부대기 라우트', () => {
  it('로그인 없이 낼 수 있고, 낸 답이 다음 사람의 비율로 돌아온다', async () => {
    for (let i = 0; i < MIN_SAMPLE; i += 1) {
      expect((await post({ topic: 'pokemon', q: 'gen=1', names: ['리자몽'] })).status).toBe(200);
    }
    const res = await fetch(`${baseUrl}/kl/daily-list/shares?topic=pokemon&q=${encodeURIComponent('gen=1')}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { people: number; shares: Record<string, number> | null };
    expect(body.people).toBe(MIN_SAMPLE);
    expect(body.shares?.리자몽).toBe(1);
  });

  it('아직 아무도 안 푼 문제는 비어 있다고 말한다 — 없는 것을 지어내지 않는다', async () => {
    const res = await fetch(`${baseUrl}/kl/daily-list/shares?topic=lol&q=roles%3D%EC%84%9C%ED%8F%AC%ED%84%B0`);
    const body = (await res.json()) as { people: number; shares: null };
    expect(body.people).toBe(0);
    expect(body.shares).toBeNull();
  });

  it('이상한 몸통은 적지 않는다', async () => {
    expect((await post({ topic: 'BAD TOPIC', q: 'x', names: [] })).status).toBe(400);
    expect((await post({ topic: 'pokemon', names: [] })).status).toBe(400);
    expect((await post({ topic: 'pokemon', q: 'gen=1', names: 'not-an-array' })).status).toBe(400);
    expect((await post({ topic: 'pokemon', q: 'gen=1', names: new Array(500).fill('x') })).status).toBe(400);
    expect((await fetch(`${baseUrl}/kl/daily-list/shares?topic=pokemon`)).status).toBe(400);
  });
});
