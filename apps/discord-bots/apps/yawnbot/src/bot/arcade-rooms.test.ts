/**
 * 열린 방 목록이 남의 말을 안 하고, 죽은 방을 안 보여 주는가 (arcade-next ★2)
 *
 * 여기 오르는 값은 **그대로 남에게 보인다**. 방 코드도 놀이 이름도 사람 이름도.
 * 그래서 모양을 안 따지면 남의 말을 우리가 하게 된다(문패 라우트에서 막은 그 자리와 같다).
 * 그리고 죽은 방이 목록에 남으면 아무도 없네보다 나쁜 눌렀는데 아무도 없네가 된다.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { registerArcadeRooms, resetRooms } from './arcade-rooms';

let server: Server;
let base = '';

beforeAll(async () => {
  const app = express();
  registerArcadeRooms(app);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => resetRooms());

const post = (body: unknown): Promise<Response> =>
  fetch(`${base}/kl/arcade/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
const list = async (): Promise<Array<{ code: string; game: string; host: string }>> =>
  ((await (await fetch(`${base}/kl/arcade/rooms`)).json()) as { rooms: Array<{ code: string; game: string; host: string }> }).rooms;

describe('열린 방 목록', () => {
  it('올리면 보인다', async () => {
    expect((await post({ code: '7CCMN', game: 'gomoku', host: '조수' })).status).toBe(200);
    const rooms = await list();
    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toEqual({ code: '7CCMN', game: 'gomoku', host: '조수', seats: 1, playing: false });
  });

  it('같은 방을 다시 올리면 하나다. 알림이 곧 아직 있다다', async () => {
    await post({ code: '7CCMN', game: 'gomoku', host: '조수' });
    await post({ code: '7CCMN', game: 'gomoku', host: '조수' });
    expect(await list()).toHaveLength(1);
  });

  it('닫으면 사라진다', async () => {
    await post({ code: '7CCMN', game: 'gomoku', host: '조수' });
    await fetch(`${base}/kl/arcade/rooms/7CCMN`, { method: 'DELETE' });
    expect(await list()).toHaveLength(0);
  });

  it('모양이 아닌 방 코드, 놀이는 안 받는다. 그대로 남에게 보이는 값이다', async () => {
    for (const bad of [
      { code: '<script>', game: 'gomoku' },
      { code: 'ab', game: 'gomoku' },
      { code: '7CCMN', game: '../../evil' },
      { code: '7CCMN', game: '' },
      { code: '7CCMN' }
    ]) {
      expect((await post(bad)).status).toBe(400);
    }
    expect(await list()).toHaveLength(0);
  });

  it('이름은 길이를 자르고 줄바꿈을 없앤다 (한글, 이모지는 그대로)', async () => {
    await post({ code: 'AAAAA', game: 'gomoku', host: '가'.repeat(40) });
    await post({ code: 'BBBBB', game: 'gomoku', host: '조\n수\t🎮' });
    const rooms = await list();
    const byCode = Object.fromEntries(rooms.map((r) => [r.code, r.host]));
    expect(byCode.AAAAA.length).toBeLessThanOrEqual(16);
    expect(byCode.BBBBB).toBe('조 수 🎮');
  });

  it('이름이 비면 누군가', async () => {
    await post({ code: 'CCCCC', game: 'gomoku', host: '   ' });
    expect((await list())[0].host).toBe('누군가');
  });
});

/**
 * 사람 수와 판 여부 (관전, 2026-09-01)
 *
 * - 이 둘이 없으면 로비도 초대 카드도 방이 열린 첫 순간에 멈춰 있음
 * - 아무 숫자나 받으면 그대로 남에게 보임
 */
describe('방 상태', () => {
  it('안 적으면 혼자, 안 두는 중', async () => {
    await post({ code: '7CCMN', game: 'gomoku', host: '조수' });
    const rooms = await list();
    expect(rooms[0].seats).toBe(1);
    expect(rooms[0].playing).toBe(false);
  });

  it('사람 수와 판 여부가 그대로 올라간다', async () => {
    await post({ code: '7CCMN', game: 'gomoku', host: '조수', seats: 2, playing: true });
    const rooms = await list();
    expect(rooms[0].seats).toBe(2);
    expect(rooms[0].playing).toBe(true);
  });

  it('말이 안 되는 사람 수는 잘린다', async () => {
    await post({ code: '7CCMN', game: 'gomoku', host: '조수', seats: 900 });
    expect((await list())[0].seats).toBe(8);
    await post({ code: '7CCMN', game: 'gomoku', host: '조수', seats: -3 });
    expect((await list())[0].seats).toBe(1);
    await post({ code: '7CCMN', game: 'gomoku', host: '조수', seats: '둘' });
    expect((await list())[0].seats).toBe(1);
  });

  it('판 여부는 참일 때만 참. 아무 값이나 참이 되면 안 됨', async () => {
    await post({ code: '7CCMN', game: 'gomoku', host: '조수', playing: 'yes' });
    expect((await list())[0].playing).toBe(false);
  });
});
