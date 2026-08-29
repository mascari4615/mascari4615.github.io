/**
 * 방 문패가 남의 말을 안 하는가 (TASK-KL-264 D1)
 *
 * 주소에 적힌 것이 그대로 카드 문구가 된다. 그래서 **아무 글자나 받으면 안 된다.**
 * 자랑 카드에서 같은 자리를 이미 한 번 막았다(숫자만 받게). 여기서도 같은 규율이다:
 * 방 코드는 사이트가 만드는 모양만, 놀이 id 는 우리가 아는 것만.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { registerArcadeRoomCard } from './arcade-room-card';

/* 이 저장소의 다른 라우트 검사와 같은 방식. 진짜로 띄워 놓고 진짜로 부른다. */
let server: Server;
let base = '';

beforeAll(async () => {
  const app = express();
  registerArcadeRoomCard(app);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const get = async (p: string): Promise<{ status: number; text: string }> => {
  const res = await fetch(base + p);
  return { status: res.status, text: await res.text() };
};

describe('오락실 방 문패', () => {
  it('제대로 된 방 코드는 카드를 준다', async () => {
    const res = await get('/kl/r/7CCMN');
    expect(res.status).toBe(200);
    expect(res.text).toContain('7CCMN');
    expect(res.text).toContain('og:image');
    /* 그림은 **앱 폴더 쪽** 주소다. 화면 주소(`/...`)로 적으면 404 라 카드가 빈 그림이
       된다. 문패 자체는 200 이라 화면상 표가 안 나므로 여기서 못 박는다(실주소로 확인함). */
    expect(res.text).toContain('/apps/karmolab/img/og/');
    /* 들어가는 문이 있어야 한다. 그림만 뜨면 자랑이 유입이 안 된다. */
    expect(res.text).toContain('/t/arcade/?r=7CCMN');
  });

  it('작은 글자는 큰 글자로 봐 준다', async () => {
    const res = await get('/kl/r/abcde');
    expect(res.status).toBe(200);
    expect(res.text).toContain('ABCDE');
  });

  it('이상한 방 코드는 404', async () => {
    for (const bad of ['a', '<script>', '../../etc', 'A'.repeat(40)]) {
      const res = await get(`/kl/r/${encodeURIComponent(bad)}`);
      expect(res.status).toBe(404);
    }
  });

  it('모르는 놀이 id 는 그림을 안 바꾼다. 남이 준 글자로 주소를 짓지 않는다', async () => {
    const res = await get('/kl/r/7CCMN?g=' + encodeURIComponent('../../evil'));
    expect(res.status).toBe(200);
    expect(res.text).toContain('/apps/karmolab/img/og/arcade.jpg');
    expect(res.text).not.toContain('evil');
  });

  it('아는 놀이면 그 놀이 그림과 이름이 실린다', async () => {
    const res = await get('/kl/r/7CCMN?g=gomoku');
    expect(res.status).toBe(200);
    /* 말 묶음을 못 읽는 곳(파일 없는 환경)에서는 이름 없이 코드만. 그래도 카드는 선다. */
    expect(res.text).toMatch(/arcade-gomoku\.jpg|arcade\.jpg/);
  });
});
