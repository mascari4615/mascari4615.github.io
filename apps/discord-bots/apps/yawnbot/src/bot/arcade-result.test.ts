/**
 * 판 결과가 채널로 나가는 자리. 남의 판을 옮기지 않는가 (arcade-next 결과를 채널로)
 *
 * 여기서 지키는 것 셋. 셋 다 안 지키면 중계가 아니라 다른 것이 된다:
 *  ① **공개로 연 방만.** 링크 아는 사람끼리 둔 판을 채널에 옮기면 그건 감시다
 *  ② **같은 판은 한 번만.** 창이 여럿이면 주인, 손님, 구경꾼이 저마다 보낸다
 *  ③ **아무 글자나 안 받는다.** 이름, 놀이, 점수가 그대로 남에게 보인다
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { registerArcadeResult, resetResults } from './arcade-result';

const sent: unknown[] = [];
vi.mock('./local-webhook', () => ({
  sendLocalEvent: (_client: unknown, payload: unknown) => {
    sent.push(payload);
    return Promise.resolve(1);
  }
}));

let server: Server;
let base = '';
const OPEN = new Set(['7CCMN']);

beforeAll(async () => {
  const app = express();
  registerArcadeResult(app, {} as never, (code) => OPEN.has(code));
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  sent.length = 0;
  resetResults();
});

const post = (body: unknown): Promise<Response> =>
  fetch(`${base}/kl/arcade/result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

const won = { code: '7CCMN', game: 'gomoku', seats: [{ name: '조수', score: 1 }, { name: '이슬', score: 0 }] };

describe('판 결과를 채널로', () => {
  it('공개로 연 방이면 한 줄 나간다', async () => {
    expect((await post(won)).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect((sent[0] as { title: string }).title).toBe('조수 이겼다');
    expect((sent[0] as { summary: string }).summary).toContain('7CCMN');
  });

  it('공개로 연 방이 아니면 안 나간다. 중계가 아니라 감시가 된다', async () => {
    expect((await post({ ...won, code: 'ZZZZZ' })).status).toBe(403);
    expect(sent).toHaveLength(0);
  });

  it('같은 판은 한 번만. 창이 여럿이면 저마다 보낸다', async () => {
    await post(won);
    await post(won);
    await post(won);
    expect(sent).toHaveLength(1);
  });

  it('비기면 비겼다고 적는다', async () => {
    await post({ ...won, seats: [{ name: '가', score: 2 }, { name: '나', score: 2 }] });
    expect((sent[0] as { title: string }).title).toBe('비겼다');
  });

  it('모양이 아닌 값은 안 받는다', async () => {
    for (const bad of [{ ...won, code: '<b>' }, { ...won, game: '../x' }, { ...won, seats: [] }]) {
      const res = await post(bad);
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
    expect(sent).toHaveLength(0);
  });

  it('이름은 자르고 점수는 정수로. 그대로 남에게 보이는 값이다', async () => {
    await post({ ...won, seats: [{ name: '가'.repeat(40), score: 3.9 }, { name: '나\n다', score: 'x' }] });
    const f = (sent[0] as { fields: Array<{ name: string; value: string }> }).fields;
    expect(f[0].name.length).toBeLessThanOrEqual(16);
    expect(f.map((x) => x.value)).toContain('3');
    expect(f.some((x) => x.name === '나 다')).toBe(true);
  });
});
